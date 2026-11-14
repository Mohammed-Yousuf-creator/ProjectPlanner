"""Google Gemini client.

One narrow seam around `generateContent` so the rest of the app never touches
HTTP directly. Everything here is deliberately boring:

* **No key means no AI.** `is_available()` returns False and callers fall back
  to deterministic behaviour. Nothing raises because a key is missing.
* **Every failure is a `GeminiError`, never an unhandled exception.** Routes turn
  that into a 503 with a usable message instead of a 500.
* **Structured output is schema-forced.** When a `response_schema` is supplied we
  set `responseMimeType: application/json` plus the schema, so the model cannot
  return prose we then have to salvage with regexes.

The endpoint shape is the public REST API:

    POST {GEMINI_API_BASE}/models/{model}:generateContent
    x-goog-api-key: <key>
    {"contents":[{"role":"user","parts":[{"text": ...}]}],
     "systemInstruction":{"parts":[{"text": ...}]},
     "generationConfig":{"temperature":..., "responseMimeType":..., "responseSchema":...}}

Docs: https://ai.google.dev/api/generate-content
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class GeminiError(RuntimeError):
    """Raised for any failure talking to Gemini.

    `status_code` is the upstream HTTP status when there was one, so callers can
    distinguish "our key is wrong" (401/403) from "the model is overloaded"
    (429/5xx) when building the user-facing message.
    """

    def __init__(self, message: str, status_code: Optional[int] = None) -> None:
        super().__init__(message)
        self.status_code = status_code


def is_available() -> bool:
    """True when a Gemini key is configured."""
    return settings.ai_enabled


def _endpoint() -> str:
    return f"{settings.GEMINI_API_BASE.rstrip('/')}/models/{settings.GEMINI_MODEL}:generateContent"


def _build_payload(
    prompt: str,
    *,
    system_instruction: Optional[str],
    history: Optional[List[Dict[str, str]]],
    temperature: float,
    max_output_tokens: Optional[int],
    response_schema: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Assemble the generateContent body.

    `history` is the prior conversation as `[{"role": "user"|"model", "text": ...}]`.
    Gemini requires the turn list to start with a user turn, so leading model
    turns are dropped rather than sent and rejected.
    """
    contents: List[Dict[str, Any]] = []

    for turn in history or []:
        role = "model" if turn.get("role") == "model" else "user"
        text = (turn.get("text") or "").strip()
        if not text:
            continue
        if not contents and role == "model":
            continue
        contents.append({"role": role, "parts": [{"text": text}]})

    contents.append({"role": "user", "parts": [{"text": prompt}]})

    generation_config: Dict[str, Any] = {
        "temperature": temperature,
        "maxOutputTokens": max_output_tokens or settings.GEMINI_MAX_OUTPUT_TOKENS,
    }
    if response_schema is not None:
        generation_config["responseMimeType"] = "application/json"
        generation_config["responseSchema"] = response_schema

    payload: Dict[str, Any] = {
        "contents": contents,
        "generationConfig": generation_config,
    }
    if system_instruction:
        payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}
    return payload


def _extract_text(body: Dict[str, Any]) -> str:
    """Pull the first text part out of a candidate.

    Gemini can return several candidates and several parts; we only ever ask for
    one candidate, and thoughts are excluded, so the first text part is the
    answer. A blocked prompt returns no candidates at all, which is a distinct
    error worth surfacing honestly.
    """
    candidates = body.get("candidates") or []
    if not candidates:
        feedback = body.get("promptFeedback") or {}
        blocked = feedback.get("blockReason")
        if blocked:
            raise GeminiError(f"The request was blocked by Gemini safety filters ({blocked}).", 400)
        raise GeminiError("Gemini returned no candidates.", 502)

    parts = (candidates[0].get("content") or {}).get("parts") or []
    texts = [part.get("text") for part in parts if part.get("text")]
    if not texts:
        finish_reason = candidates[0].get("finishReason")
        raise GeminiError(
            f"Gemini returned an empty response (finishReason={finish_reason}).", 502
        )
    return "".join(texts).strip()


def generate_content(
    prompt: str,
    *,
    system_instruction: Optional[str] = None,
    history: Optional[List[Dict[str, str]]] = None,
    temperature: float = 0.4,
    max_output_tokens: Optional[int] = None,
    response_schema: Optional[Dict[str, Any]] = None,
) -> str:
    """Single-shot text generation. Returns the model's text (or JSON text).

    Raises `GeminiError` for a missing key, transport failure, HTTP error, or an
    unusable response.
    """
    if not is_available():
        raise GeminiError("GEMINI_API_KEY is not configured.", None)

    payload = _build_payload(
        prompt,
        system_instruction=system_instruction,
        history=history,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
        response_schema=response_schema,
    )

    try:
        response = httpx.post(
            _endpoint(),
            headers={
                "x-goog-api-key": settings.GEMINI_API_KEY.strip(),
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=settings.GEMINI_TIMEOUT_SECONDS,
        )
    except httpx.TimeoutException as exc:
        raise GeminiError("Gemini timed out. Please try again.", 504) from exc
    except httpx.HTTPError as exc:
        raise GeminiError(f"Could not reach Gemini: {exc}", 502) from exc

    if response.status_code >= 400:
        detail = ""
        try:
            error = response.json().get("error") or {}
            detail = error.get("message") or ""
        except (ValueError, AttributeError):
            detail = response.text[:300]

        if response.status_code in (401, 403):
            message = "Gemini rejected the API key. Check GEMINI_API_KEY."
        elif response.status_code == 429:
            message = "Gemini rate limit reached. Please try again shortly."
        else:
            message = f"Gemini request failed ({response.status_code})."
        if detail:
            message = f"{message} {detail[:200]}"
        logger.warning("Gemini HTTP %s: %s", response.status_code, detail[:300])
        raise GeminiError(message, response.status_code)

    try:
        body = response.json()
    except ValueError as exc:
        raise GeminiError("Gemini returned a non-JSON response.", 502) from exc

    return _extract_text(body)


def generate_json(
    prompt: str,
    *,
    system_instruction: Optional[str] = None,
    response_schema: Optional[Dict[str, Any]] = None,
    temperature: float = 0.2,
    max_output_tokens: Optional[int] = None,
) -> Dict[str, Any]:
    """Generate and parse a JSON object.

    The schema constrains the model, but JSON parsing is still defensive: a
    malformed reply becomes a `GeminiError` rather than a crash inside a route.
    """
    raw = generate_content(
        prompt,
        system_instruction=system_instruction,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
        response_schema=response_schema,
    )
    # Models occasionally wrap JSON in a fenced block even when asked not to.
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
        if cleaned.rstrip().endswith("```"):
            cleaned = cleaned.rstrip()[:-3]
        cleaned = cleaned.strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise GeminiError("Gemini returned malformed JSON.", 502) from exc

    if not isinstance(parsed, dict):
        raise GeminiError("Gemini returned a non-object JSON payload.", 502)
    return parsed
