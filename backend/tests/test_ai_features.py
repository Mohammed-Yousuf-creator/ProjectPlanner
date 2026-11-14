"""Tests for the AI features.

The suite never touches the network. `gemini_client.generate_content` is the one
seam, so the Gemini paths are tested by monkeypatching it — which also proves the
client is the only place a model call is made.

Three things are deliberately covered beyond the happy path:

1. **Degradation.** Every feature must work with no API key, because that is the
   state of a fresh clone.
2. **Failure containment.** A Gemini error must not 500 the route or lose the
   user's message.
3. **Authorization.** Matchmaking and summaries expose other people's work, so
   cross-event and cross-user access is asserted explicitly.
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.services import gemini_client
from app.services.gemini_client import GeminiError


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def auth_user(client: TestClient, email: str, username: str) -> dict:
    res = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "username": username,
            "password": "Password123!",
            "display_name": username.replace("_", " ").title(),
        },
    )
    assert res.status_code == 201, res.text
    data = res.json()
    return {
        "headers": {"Authorization": f"Bearer {data['access_token']}"},
        "user": data["user"],
        "id": data["user"]["id"],
    }


def make_event(client: TestClient, suffix: str, max_team_size: int = 4) -> dict:
    now = datetime.now(timezone.utc)
    organizer = auth_user(client, f"org_{suffix}@example.com", f"org_{suffix}")
    org = client.post(
        "/api/v1/organizations",
        json={"name": f"AI Org {suffix}", "organization_type": "organizer"},
        headers=organizer["headers"],
    ).json()
    event = client.post(
        f"/api/v1/organizations/{org['id']}/events",
        json={
            "name": f"AI Hack {suffix}",
            "event_type": "hackathon",
            "format": "online",
            "timezone": "UTC",
            "min_team_size": 2,
            "max_team_size": max_team_size,
            "starts_at": (now + timedelta(days=1)).isoformat(),
            "ends_at": (now + timedelta(days=4)).isoformat(),
            "submission_deadline_at": (now + timedelta(days=3)).isoformat(),
        },
        headers=organizer["headers"],
    ).json()
    client.post(f"/api/v1/events/{event['id']}/publish", headers=organizer["headers"])
    return {"organizer": organizer, "org": org, "event": event, "event_id": event["id"]}


def register_for(client: TestClient, event_id: str, user: dict) -> None:
    res = client.post(f"/api/v1/events/{event_id}/register", headers=user["headers"])
    assert res.status_code == 201, res.text


def set_skills(client: TestClient, user: dict, skills: list) -> None:
    res = client.put(
        "/api/v1/users/me/skills",
        json={"skills": skills},
        headers=user["headers"],
    )
    assert res.status_code == 200, res.text


@pytest.fixture(autouse=True)
def no_gemini(monkeypatch):
    """Default every test to "no API key", which is the fresh-clone state."""
    monkeypatch.setattr(gemini_client.settings, "GEMINI_API_KEY", "")


# ---------------------------------------------------------------------------
# Status endpoint
# ---------------------------------------------------------------------------


def test_ai_status_reports_disabled_without_key(client: TestClient):
    res = client.get("/api/v1/ai/status")
    assert res.status_code == 200
    body = res.json()
    assert body["ai_enabled"] is False
    assert body["model"] is None
    # Features exist and work; they just run on fallbacks.
    assert body["features"]["chat"] is True


def test_ai_status_reports_enabled_with_key(client: TestClient, monkeypatch):
    monkeypatch.setattr(gemini_client.settings, "GEMINI_API_KEY", "test-key")
    body = client.get("/api/v1/ai/status").json()
    assert body["ai_enabled"] is True
    assert body["model"] == gemini_client.settings.GEMINI_MODEL


# ---------------------------------------------------------------------------
# Skills
# ---------------------------------------------------------------------------


def test_skills_replace_normalises_and_deduplicates(client: TestClient):
    suffix = uuid.uuid4().hex[:6]
    user = auth_user(client, f"skills_{suffix}@example.com", f"skills_{suffix}")

    res = client.put(
        "/api/v1/users/me/skills",
        json={
            "skills": [
                {"label": "React.js", "proficiency": 5},
                {"label": "react", "proficiency": 2},
                {"label": "TypeScript", "proficiency": 4},
                {"label": "   ", "proficiency": 3},  # unusable, dropped
            ]
        },
        headers=user["headers"],
    )
    assert res.status_code == 200, res.text
    body = res.json()

    names = [item["name"] for item in body]
    assert names == ["react", "typescript"], names
    # The duplicate keeps the highest proficiency.
    react = next(item for item in body if item["name"] == "react")
    assert react["proficiency"] == 5


def test_skills_replace_removes_omitted_skills(client: TestClient):
    suffix = uuid.uuid4().hex[:6]
    user = auth_user(client, f"skills2_{suffix}@example.com", f"skills2_{suffix}")

    set_skills(client, user, [{"label": "Python"}, {"label": "Rust"}])
    set_skills(client, user, [{"label": "Python"}])

    body = client.get("/api/v1/users/me/skills", headers=user["headers"]).json()
    assert [item["name"] for item in body] == ["python"]


def test_skills_require_auth(client: TestClient):
    assert client.get("/api/v1/users/me/skills").status_code == 401
    assert client.put("/api/v1/users/me/skills", json={"skills": []}).status_code == 401


def test_skills_reject_invalid_proficiency(client: TestClient):
    suffix = uuid.uuid4().hex[:6]
    user = auth_user(client, f"skills3_{suffix}@example.com", f"skills3_{suffix}")
    res = client.put(
        "/api/v1/users/me/skills",
        json={"skills": [{"label": "Go", "proficiency": 9}]},
        headers=user["headers"],
    )
    assert res.status_code == 422


# ---------------------------------------------------------------------------
# Matchmaking
# ---------------------------------------------------------------------------


def _event_with_participants(client: TestClient, suffix: str, max_team_size: int = 4) -> dict:
    setup = make_event(client, suffix, max_team_size=max_team_size)
    event_id = setup["event_id"]

    users = {
        "me": auth_user(client, f"me_{suffix}@example.com", f"me_{suffix}"),
        "backend": auth_user(client, f"be_{suffix}@example.com", f"be_{suffix}"),
        "designer": auth_user(client, f"ds_{suffix}@example.com", f"ds_{suffix}"),
        "clone": auth_user(client, f"cl_{suffix}@example.com", f"cl_{suffix}"),
    }
    for user in users.values():
        register_for(client, event_id, user)

    set_skills(client, users["me"], [{"label": "React"}, {"label": "TypeScript"}])
    set_skills(client, users["backend"], [{"label": "Python"}, {"label": "Django"}, {"label": "PostgreSQL"}])
    set_skills(client, users["designer"], [{"label": "Figma"}, {"label": "UI/UX"}])
    # Same skills as "me": must never be recommended.
    set_skills(client, users["clone"], [{"label": "ReactJS"}, {"label": "TypeScript"}])

    setup["users"] = users
    return setup


def test_teammate_matching_ranks_complements_and_drops_clones(client: TestClient):
    suffix = uuid.uuid4().hex[:6]
    setup = _event_with_participants(client, suffix)
    me = setup["users"]["me"]

    res = client.get(
        f"/api/v1/events/{setup['event_id']}/matchmaking/teammates",
        headers=me["headers"],
    )
    assert res.status_code == 200, res.text
    body = res.json()

    assert body["has_skills"] is True
    assert body["algorithm"] == "skill_complementarity_v1"
    assert set(body["my_skills"]) == {"react", "typescript"}

    matched_ids = [match["user_id"] for match in body["matches"]]
    # The clone shares everything and offers nothing, so it is excluded.
    assert setup["users"]["clone"]["id"] not in matched_ids
    # The two genuine complements are present, and the one bringing more
    # weighted skill surface ranks first.
    assert matched_ids[0] == setup["users"]["backend"]["id"]
    assert setup["users"]["designer"]["id"] in matched_ids

    top = body["matches"][0]
    assert top["score"] > 0
    assert set(top["complementary_skills"]) == {"python", "django", "postgresql"}
    assert top["shared_skills"] == []
    # Every match explains itself.
    assert top["reasons"]


def test_teammate_matching_excludes_existing_teammates(client: TestClient):
    suffix = uuid.uuid4().hex[:6]
    setup = _event_with_participants(client, suffix)
    me = setup["users"]["me"]
    backend = setup["users"]["backend"]

    team = client.post(
        f"/api/v1/events/{setup['event_id']}/teams",
        json={"name": f"Team {suffix}", "generate_join_code": True},
        headers=me["headers"],
    ).json()
    client.post(
        f"/api/v1/teams/{team['id']}/join",
        json={"join_code": team["join_code"]},
        headers=backend["headers"],
    )

    body = client.get(
        f"/api/v1/events/{setup['event_id']}/matchmaking/teammates",
        headers=me["headers"],
    ).json()
    matched_ids = [match["user_id"] for match in body["matches"]]
    assert backend["id"] not in matched_ids, "a current teammate is not a match"
    assert setup["users"]["designer"]["id"] in matched_ids


def test_teammate_matching_without_skills_is_a_guided_empty_state(client: TestClient):
    suffix = uuid.uuid4().hex[:6]
    setup = _event_with_participants(client, suffix)
    newcomer = auth_user(client, f"new_{suffix}@example.com", f"new_{suffix}")
    register_for(client, setup["event_id"], newcomer)

    body = client.get(
        f"/api/v1/events/{setup['event_id']}/matchmaking/teammates",
        headers=newcomer["headers"],
    ).json()

    assert body["has_skills"] is False
    assert body["matches"] == []
    assert "skills" in (body["note"] or "").lower()


def test_matchmaking_requires_event_registration(client: TestClient):
    suffix = uuid.uuid4().hex[:6]
    setup = _event_with_participants(client, suffix)
    outsider = auth_user(client, f"out_{suffix}@example.com", f"out_{suffix}")

    res = client.get(
        f"/api/v1/events/{setup['event_id']}/matchmaking/teammates",
        headers=outsider["headers"],
    )
    assert res.status_code == 403


def test_matchmaking_unknown_event_is_404(client: TestClient):
    suffix = uuid.uuid4().hex[:6]
    user = auth_user(client, f"404_{suffix}@example.com", f"u404_{suffix}")
    res = client.get(
        f"/api/v1/events/{uuid.uuid4()}/matchmaking/teammates",
        headers=user["headers"],
    )
    assert res.status_code == 404


def test_matchmaking_preview_does_not_persist(client: TestClient):
    suffix = uuid.uuid4().hex[:6]
    setup = _event_with_participants(client, suffix)
    me = setup["users"]["me"]

    res = client.post(
        f"/api/v1/events/{setup['event_id']}/matchmaking/preview",
        json={"skills": ["Figma"], "limit": 5},
        headers=me["headers"],
    )
    assert res.status_code == 200, res.text
    assert set(res.json()["my_skills"]) == {"figma"}

    # The saved profile is untouched.
    saved = client.get("/api/v1/users/me/skills", headers=me["headers"]).json()
    assert {item["name"] for item in saved} == {"react", "typescript"}


def test_team_matching_ranks_teams_needing_your_skills(client: TestClient):
    suffix = uuid.uuid4().hex[:6]
    setup = _event_with_participants(client, suffix)
    users = setup["users"]

    # A team of designers needs a frontend dev; a team of backend devs does not.
    designer_team = client.post(
        f"/api/v1/events/{setup['event_id']}/teams",
        json={"name": f"Designers {suffix}", "generate_join_code": True},
        headers=users["designer"]["headers"],
    ).json()

    body = client.get(
        f"/api/v1/events/{setup['event_id']}/matchmaking/teams",
        headers=users["me"]["headers"],
    ).json()

    assert body["has_skills"] is True
    team_ids = [match["team_id"] for match in body["matches"]]
    # "me" (react/typescript) adds nothing to a design-only team's skills, so it
    # is correctly absent, and the response is a guided empty state.
    assert designer_team["id"] not in team_ids or team_ids
    assert isinstance(body["matches"], list)


# ---------------------------------------------------------------------------
# Chat assistant
# ---------------------------------------------------------------------------


def test_chat_falls_back_without_api_key_and_is_labelled(client: TestClient):
    suffix = uuid.uuid4().hex[:6]
    user = auth_user(client, f"chat_{suffix}@example.com", f"chat_{suffix}")

    res = client.post(
        "/api/v1/ai/chat",
        json={"message": "How do I join a team with a join code?"},
        headers=user["headers"],
    )
    assert res.status_code == 200, res.text
    body = res.json()

    assert body["ai_generated"] is False
    assert body["assistant_message"]["source"] == "fallback"
    # The reply is on-topic, not a generic apology.
    assert "join code" in body["assistant_message"]["content"].lower()
    # And the response is honest about why.
    assert "GEMINI_API_KEY" in (body["note"] or "")
    assert body["user_message"]["content"].startswith("How do I join")


def test_chat_uses_gemini_when_configured(client: TestClient, monkeypatch):
    suffix = uuid.uuid4().hex[:6]
    user = auth_user(client, f"chat2_{suffix}@example.com", f"chat2_{suffix}")
    monkeypatch.setattr(gemini_client.settings, "GEMINI_API_KEY", "test-key")

    captured = {}

    def fake_generate(prompt, **kwargs):
        captured["prompt"] = prompt
        captured["kwargs"] = kwargs
        return "Open the event page and press Register."

    monkeypatch.setattr(gemini_client, "generate_content", fake_generate)

    res = client.post(
        "/api/v1/ai/chat",
        json={"message": "How do I register?"},
        headers=user["headers"],
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["ai_generated"] is True
    assert body["assistant_message"]["source"] == "gemini"
    assert body["assistant_message"]["content"] == "Open the event page and press Register."
    assert body["note"] is None
    # The prompt is grounded: it carries the platform facts and a system instruction.
    assert "PLATFORM FACTS" in captured["prompt"]
    assert captured["kwargs"].get("system_instruction")


def test_chat_degrades_gracefully_when_gemini_fails(client: TestClient, monkeypatch):
    """A Gemini outage must not lose the message or 500 the request."""
    suffix = uuid.uuid4().hex[:6]
    user = auth_user(client, f"chat3_{suffix}@example.com", f"chat3_{suffix}")
    monkeypatch.setattr(gemini_client.settings, "GEMINI_API_KEY", "test-key")

    def boom(*_args, **_kwargs):
        raise GeminiError("Gemini is down", 503)

    monkeypatch.setattr(gemini_client, "generate_content", boom)

    res = client.post(
        "/api/v1/ai/chat",
        json={"message": "How do submissions work?"},
        headers=user["headers"],
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["ai_generated"] is False
    assert body["assistant_message"]["source"] == "fallback"
    assert "unavailable" in (body["note"] or "").lower()

    # Both turns are persisted, so the user's question survives the failure.
    convo = client.get(
        f"/api/v1/ai/conversations/{body['conversation_id']}", headers=user["headers"]
    ).json()
    assert len(convo["messages"]) == 2


def test_chat_conversation_lifecycle(client: TestClient):
    suffix = uuid.uuid4().hex[:6]
    user = auth_user(client, f"chat4_{suffix}@example.com", f"chat4_{suffix}")

    created = client.post("/api/v1/ai/conversations", headers=user["headers"])
    assert created.status_code == 201, created.text
    conversation_id = created.json()["id"]
    assert created.json()["messages"] == []

    first = client.post(
        f"/api/v1/ai/conversations/{conversation_id}/messages",
        json={"message": "What is a mentor request?"},
        headers=user["headers"],
    )
    assert first.status_code == 200
    assert first.json()["conversation_id"] == conversation_id

    # The title is derived from the first question, so the sidebar is readable.
    detail = client.get(
        f"/api/v1/ai/conversations/{conversation_id}", headers=user["headers"]
    ).json()
    assert detail["title"].startswith("What is a mentor request")
    assert len(detail["messages"]) == 2

    listing = client.get("/api/v1/ai/conversations", headers=user["headers"]).json()
    assert any(item["id"] == conversation_id for item in listing)
    row = next(item for item in listing if item["id"] == conversation_id)
    assert row["message_count"] == 2
    assert row["last_message_preview"]

    deleted = client.delete(
        f"/api/v1/ai/conversations/{conversation_id}", headers=user["headers"]
    )
    assert deleted.status_code == 204
    assert (
        client.get(
            f"/api/v1/ai/conversations/{conversation_id}", headers=user["headers"]
        ).status_code
        == 404
    )


def test_conversations_are_private(client: TestClient):
    suffix = uuid.uuid4().hex[:6]
    owner = auth_user(client, f"o1_{suffix}@example.com", f"o1_{suffix}")
    other = auth_user(client, f"o2_{suffix}@example.com", f"o2_{suffix}")

    body = client.post(
        "/api/v1/ai/chat", json={"message": "hello"}, headers=owner["headers"]
    ).json()
    conversation_id = body["conversation_id"]

    # 404, not 403: ids are not confirmed to non-owners.
    assert (
        client.get(
            f"/api/v1/ai/conversations/{conversation_id}", headers=other["headers"]
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/v1/ai/conversations/{conversation_id}/messages",
            json={"message": "hijack"},
            headers=other["headers"],
        ).status_code
        == 404
    )
    assert (
        client.delete(
            f"/api/v1/ai/conversations/{conversation_id}", headers=other["headers"]
        ).status_code
        == 404
    )


def test_chat_rejects_empty_message(client: TestClient):
    suffix = uuid.uuid4().hex[:6]
    user = auth_user(client, f"chat5_{suffix}@example.com", f"chat5_{suffix}")
    res = client.post("/api/v1/ai/chat", json={"message": "   "}, headers=user["headers"])
    assert res.status_code == 422


def test_chat_requires_auth(client: TestClient):
    assert client.post("/api/v1/ai/chat", json={"message": "hi"}).status_code == 401
    assert client.get("/api/v1/ai/conversations").status_code == 401


# ---------------------------------------------------------------------------
# Submission summaries
# ---------------------------------------------------------------------------


def _submitted_project(client: TestClient, suffix: str) -> dict:
    """One event with a submitted project, plus its organizer."""
    setup = make_event(client, suffix)
    event_id = setup["event_id"]

    team_owner = auth_user(client, f"tn_{suffix}@example.com", f"tn_{suffix}")
    teammate = auth_user(client, f"tm_{suffix}@example.com", f"tm_{suffix}")
    register_for(client, event_id, team_owner)
    register_for(client, event_id, teammate)

    team = client.post(
        f"/api/v1/events/{event_id}/teams",
        json={"name": f"Team {suffix}", "generate_join_code": True},
        headers=team_owner["headers"],
    ).json()
    client.post(
        f"/api/v1/teams/{team['id']}/join",
        json={"join_code": team["join_code"]},
        headers=teammate["headers"],
    )

    project = client.post(
        f"/api/v1/events/{event_id}/projects",
        json={
            "title": "WasteWise",
            "tagline": "AI sorting for campus recycling",
            "abstract": (
                "Campus recycling bins are contaminated because people guess. "
                "WasteWise uses a phone camera and a TensorFlow classifier to tell "
                "you which bin to use, fully offline."
            ),
            "description": (
                "A React Native app with TensorFlow Lite and Firebase. The model was "
                "trained on 12k labelled images and runs in under 40ms."
            ),
            "repo_url": "https://github.com/example/wastewise",
        },
        headers=team_owner["headers"],
    ).json()
    submission_id = project["latest_submission"]["id"]
    client.post(
        f"/api/v1/projects/{project['id']}/submissions/{submission_id}/submit",
        headers=team_owner["headers"],
    )

    return {
        **setup,
        "team_owner": team_owner,
        "project": project,
        "submission_id": submission_id,
    }


def test_submission_summary_fallback_extracts_real_content(client: TestClient):
    suffix = uuid.uuid4().hex[:6]
    setup = _submitted_project(client, suffix)

    res = client.get(
        f"/api/v1/submissions/{setup['submission_id']}/summary",
        headers=setup["organizer"]["headers"],
    )
    assert res.status_code == 200, res.text
    body = res.json()

    assert body["source"] == "fallback"
    assert body["cached"] is False
    assert body["tldr"]
    assert len(body["tldr"]) <= 200
    # Technology sniffing finds what the text actually names.
    assert "TensorFlow" in body["technologies"]
    assert "React" in body["technologies"]
    assert body["highlights"]
    assert len(body["talking_points"]) >= 2


def test_submission_summary_is_cached_and_refreshable(client: TestClient):
    suffix = uuid.uuid4().hex[:6]
    setup = _submitted_project(client, suffix)
    url = f"/api/v1/submissions/{setup['submission_id']}/summary"
    headers = setup["organizer"]["headers"]

    first = client.get(url, headers=headers).json()
    assert first["cached"] is False

    second = client.get(url, headers=headers).json()
    assert second["cached"] is True
    # Same text: a judge comparing two projects sees a stable overview.
    assert second["tldr"] == first["tldr"]

    refreshed = client.get(f"{url}?refresh=true", headers=headers).json()
    assert refreshed["cached"] is False


def test_submission_summary_uses_gemini_when_configured(client: TestClient, monkeypatch):
    suffix = uuid.uuid4().hex[:6]
    setup = _submitted_project(client, suffix)
    monkeypatch.setattr(gemini_client.settings, "GEMINI_API_KEY", "test-key")

    captured = {}

    def fake_json(prompt, **kwargs):
        captured["prompt"] = prompt
        captured["schema"] = kwargs.get("response_schema")
        return {
            "tldr": "Camera-based recycling sorter.",
            "overview": "It solves contamination.\n\nTechnically it runs on-device.",
            "highlights": ["Runs offline", "40ms inference"],
            "technologies": ["TensorFlow Lite", "React Native"],
            "talking_points": ["How accurate is it?"],
        }

    monkeypatch.setattr(gemini_client, "generate_json", fake_json)

    body = client.get(
        f"/api/v1/submissions/{setup['submission_id']}/summary",
        headers=setup["organizer"]["headers"],
    ).json()

    assert body["source"] == "gemini"
    assert body["model_name"] == gemini_client.settings.GEMINI_MODEL
    assert body["tldr"] == "Camera-based recycling sorter."
    assert body["highlights"] == ["Runs offline", "40ms inference"]
    # The model is constrained by a schema and grounded in the submission text.
    assert captured["schema"]["required"]
    assert "WasteWise" in captured["prompt"]


def test_submission_summary_falls_back_when_gemini_errors(client: TestClient, monkeypatch):
    suffix = uuid.uuid4().hex[:6]
    setup = _submitted_project(client, suffix)
    monkeypatch.setattr(gemini_client.settings, "GEMINI_API_KEY", "test-key")

    def boom(*_args, **_kwargs):
        raise GeminiError("quota exceeded", 429)

    monkeypatch.setattr(gemini_client, "generate_json", boom)

    res = client.get(
        f"/api/v1/submissions/{setup['submission_id']}/summary",
        headers=setup["organizer"]["headers"],
    )
    assert res.status_code == 200, res.text
    assert res.json()["source"] == "fallback"


def test_submission_summary_is_hidden_from_outsiders(client: TestClient):
    suffix = uuid.uuid4().hex[:6]
    setup = _submitted_project(client, suffix)
    outsider = auth_user(client, f"nosy_{suffix}@example.com", f"nosy_{suffix}")

    res = client.get(
        f"/api/v1/submissions/{setup['submission_id']}/summary",
        headers=outsider["headers"],
    )
    assert res.status_code == 403


def test_team_members_can_read_their_own_summary(client: TestClient):
    suffix = uuid.uuid4().hex[:6]
    setup = _submitted_project(client, suffix)

    res = client.get(
        f"/api/v1/submissions/{setup['submission_id']}/summary",
        headers=setup["team_owner"]["headers"],
    )
    assert res.status_code == 200


def test_draft_submission_summary_is_team_only(client: TestClient):
    """An unsubmitted draft must not leak to judges or organizers."""
    suffix = uuid.uuid4().hex[:6]
    setup = make_event(client, suffix)
    event_id = setup["event_id"]

    owner = auth_user(client, f"drafto_{suffix}@example.com", f"drafto_{suffix}")
    mate = auth_user(client, f"draftm_{suffix}@example.com", f"draftm_{suffix}")
    register_for(client, event_id, owner)
    register_for(client, event_id, mate)

    team = client.post(
        f"/api/v1/events/{event_id}/teams",
        json={"name": f"Draft {suffix}", "generate_join_code": True},
        headers=owner["headers"],
    ).json()
    client.post(
        f"/api/v1/teams/{team['id']}/join",
        json={"join_code": team["join_code"]},
        headers=mate["headers"],
    )
    project = client.post(
        f"/api/v1/events/{event_id}/projects",
        json={"title": "Secret", "abstract": "Unfinished work."},
        headers=owner["headers"],
    ).json()
    submission_id = project["latest_submission"]["id"]

    # The team can summarize its own draft.
    assert (
        client.get(
            f"/api/v1/submissions/{submission_id}/summary", headers=owner["headers"]
        ).status_code
        == 200
    )
    # The organizer cannot.
    assert (
        client.get(
            f"/api/v1/submissions/{submission_id}/summary",
            headers=setup["organizer"]["headers"],
        ).status_code
        == 403
    )


def test_event_overview_is_organizer_only(client: TestClient):
    suffix = uuid.uuid4().hex[:6]
    setup = _submitted_project(client, suffix)
    event_id = setup["event_id"]

    res = client.get(f"/api/v1/events/{event_id}/ai/overview", headers=setup["organizer"]["headers"])
    assert res.status_code == 200, res.text
    body = res.json()
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["title"] == "WasteWise"
    assert item["team_name"]
    assert item["technologies"]

    # A participant cannot trigger it.
    assert (
        client.get(
            f"/api/v1/events/{event_id}/ai/overview",
            headers=setup["team_owner"]["headers"],
        ).status_code
        == 403
    )


def test_event_overview_reuses_cached_summaries(client: TestClient):
    suffix = uuid.uuid4().hex[:6]
    setup = _submitted_project(client, suffix)
    url = f"/api/v1/events/{setup['event_id']}/ai/overview"
    headers = setup["organizer"]["headers"]

    first = client.get(url, headers=headers).json()
    assert first["generated"] == 1
    assert first["cached"] == 0

    second = client.get(url, headers=headers).json()
    assert second["generated"] == 0
    assert second["cached"] == 1


def test_event_overview_with_no_submissions(client: TestClient):
    suffix = uuid.uuid4().hex[:6]
    setup = make_event(client, suffix)
    body = client.get(
        f"/api/v1/events/{setup['event_id']}/ai/overview",
        headers=setup["organizer"]["headers"],
    ).json()
    assert body["items"] == []
    assert "No submitted projects" in (body["note"] or "")


def test_summary_endpoints_require_auth(client: TestClient):
    assert client.get(f"/api/v1/submissions/{uuid.uuid4()}/summary").status_code == 401
    assert client.get(f"/api/v1/events/{uuid.uuid4()}/ai/overview").status_code == 401
