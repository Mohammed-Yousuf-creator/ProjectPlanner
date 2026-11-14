"""AI overviews of project submissions.

Summaries are cached one-per-submission (`submission_summaries` is unique on
`submission_id`). Two reasons:

* Judging is a read-heavy activity — a panel refreshing a project page should not
  trigger a paid model call per view.
* Stability. A judge comparing two projects deserves the same overview for the
  same version every time they look, not a fresh "take" per visit.

Generation is always explicit (`?refresh=true` or the first request), and the
`source` field records whether the text came from Gemini or the deterministic
fallback, which the UI labels.
"""

from __future__ import annotations

import json
import uuid
from typing import Dict, List, Optional, Sequence

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.ai import SubmissionSummary
from app.models.event import Event, EventMembership
from app.models.organization import OrganizationMember
from app.models.project import Project, ProjectSubmission
from app.models.team import Team, TeamMember
from app.models.user import User
from app.schemas.ai import (
    EventOverviewResponse,
    ProjectOverviewItem,
    SubmissionSummaryRead,
)
from app.services import gemini_client
from app.services.gemini_client import GeminiError

# Gemini's response schema for one summary. Constraining the shape means the
# model cannot return prose we would have to parse heuristically.
SUMMARY_SCHEMA: Dict[str, object] = {
    "type": "object",
    "properties": {
        "tldr": {
            "type": "string",
            "description": "One sentence, under 140 characters, saying what was built.",
        },
        "overview": {
            "type": "string",
            "description": "Two short paragraphs describing the problem, the solution and what is notable.",
        },
        "highlights": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Three to five concrete standout points.",
        },
        "technologies": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Technologies explicitly named or clearly implied by the submission.",
        },
        "talking_points": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Two or three questions a judge should ask about this submission.",
        },
    },
    "required": ["tldr", "overview", "highlights", "technologies", "talking_points"],
}

SUMMARY_SYSTEM_INSTRUCTION = """You summarise hackathon project submissions for judges.

Rules:
1. Use ONLY the submission text provided. Never invent features, users, metrics \
or technologies that the text does not mention.
2. `tldr` is one plain sentence a judge can read in a list.
3. `overview` is two short paragraphs: what problem it solves, then what is \
technically notable.
4. `highlights` are concrete and checkable, not marketing adjectives.
5. `technologies` only lists what is actually named or unmistakably implied.
6. `talking_points` are sharp questions a judge would ask in a demo.
7. If the submission is thin or vague, say so plainly rather than padding it."""


def _submission_text(submission: ProjectSubmission, team_name: str, event_name: str) -> str:
    """Assemble the source text. Every field is optional except the abstract."""
    parts = [
        f"Event: {event_name}",
        f"Team: {team_name}",
        f"Submission title: {submission.title}",
        f"Version: {submission.version_number}",
    ]
    if submission.tagline:
        parts.append(f"Tagline: {submission.tagline}")
    parts.append(f"Abstract:\n{submission.abstract}")
    if submission.description:
        parts.append(f"Description:\n{submission.description}")
    links = []
    if submission.repo_url:
        links.append(f"Repository: {submission.repo_url}")
    if submission.demo_url:
        links.append(f"Demo: {submission.demo_url}")
    if submission.presentation_url:
        links.append(f"Presentation: {submission.presentation_url}")
    if links:
        parts.append("\n".join(links))
    return "\n\n".join(parts)


def _fallback_summary(submission: ProjectSubmission) -> Dict[str, object]:
    """Deterministic summary used when Gemini is unavailable.

    Extractive rather than generative: it quotes the submission's own words so
    it can never misrepresent the work. Judges still get a scannable shape.
    """
    abstract = " ".join((submission.abstract or "").split())
    sentences = [
        chunk.strip()
        for chunk in abstract.replace("\n", " ").split(". ")
        if chunk.strip()
    ]
    tldr = (sentences[0] if sentences else submission.title).strip()
    if len(tldr) > 140:
        tldr = tldr[:137].rstrip() + "…"
    if not tldr.endswith("."):
        tldr += "."

    overview_parts: List[str] = []
    if len(sentences) > 1:
        overview_parts.append(". ".join(sentences[1:3]).rstrip(".") + ".")
    if submission.description:
        description = " ".join(submission.description.split())
        overview_parts.append(description[:600])
    if not overview_parts:
        overview_parts.append(
            "The submission is brief: the abstract does not go into detail about the "
            "approach or the implementation."
        )

    highlights: List[str] = []
    if submission.repo_url:
        highlights.append(f"Source code linked: {submission.repo_url}")
    if submission.demo_url:
        highlights.append(f"Live demo linked: {submission.demo_url}")
    if submission.presentation_url:
        highlights.append("Presentation deck provided")
    if not highlights:
        highlights.append("No supporting links were provided with the submission.")

    # Cheap technology sniffing so the fallback still gives a judge a starting
    # point. Matching whole words avoids "go" firing inside "good".
    vocabulary = {
        "python": "Python",
        "django": "Django",
        "flask": "Flask",
        "fastapi": "FastAPI",
        "react": "React",
        "vue": "Vue",
        "angular": "Angular",
        "node": "Node.js",
        "typescript": "TypeScript",
        "javascript": "JavaScript",
        "postgres": "PostgreSQL",
        "postgresql": "PostgreSQL",
        "mysql": "MySQL",
        "mongodb": "MongoDB",
        "sqlite": "SQLite",
        "redis": "Redis",
        "docker": "Docker",
        "kubernetes": "Kubernetes",
        "aws": "AWS",
        "gcp": "Google Cloud",
        "azure": "Azure",
        "tensorflow": "TensorFlow",
        "pytorch": "PyTorch",
        "opencv": "OpenCV",
        "tailwind": "Tailwind CSS",
        "gemini": "Gemini",
        "openai": "OpenAI",
        "llm": "LLM",
    }
    haystack = " ".join(
        filter(
            None,
            [submission.abstract, submission.description, submission.tagline],
        )
    ).lower()
    words = set(haystack.replace(",", " ").replace(".", " ").split())
    technologies = sorted(
        {label for key, label in vocabulary.items() if key in words}
    )

    return {
        "tldr": tldr,
        "overview": "\n\n".join(overview_parts),
        "highlights": highlights,
        "technologies": technologies,
        "talking_points": [
            "What was the hardest technical problem, and how was it solved?",
            "How far is this from something a real user could use today?",
            "What would the team build next with another week?",
        ],
    }


def _load_submission(
    db: Session, submission_id: uuid.UUID
) -> tuple[ProjectSubmission, Project, Team, Event]:
    submission = db.get(ProjectSubmission, submission_id)
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found"
        )
    project = db.get(Project, submission.project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    team = db.get(Team, project.team_id)
    event = db.get(Event, project.event_id)
    if not team or not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project context missing"
        )
    return submission, project, team, event


def _can_view(
    db: Session, event: Event, project: Project, current_user: User
) -> bool:
    """Organizers, judges, mentors and the owning team may read a summary.

    Draft versions are private to the team: summarizing an unpublished draft
    would leak unreleased work to judges.
    """
    org_member = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == event.organization_id,
            OrganizationMember.user_id == current_user.id,
            OrganizationMember.status == "active",
        )
        .first()
    )
    if org_member and org_member.role in ("owner", "admin"):
        return True

    # Judges and mentors hold an EventMembership, not an organization role.
    event_role = (
        db.query(EventMembership)
        .filter(
            EventMembership.event_id == event.id,
            EventMembership.user_id == current_user.id,
            EventMembership.role.in_(["judge", "mentor"]),
            EventMembership.status == "approved",
        )
        .first()
    )
    if event_role:
        return True

    team_member = (
        db.query(TeamMember)
        .filter(
            TeamMember.team_id == project.team_id,
            TeamMember.user_id == current_user.id,
            TeamMember.status == "active",
        )
        .first()
    )
    return team_member is not None


def _serialize(summary: SubmissionSummary, cached: bool) -> SubmissionSummaryRead:
    def load_list(raw: str) -> List[str]:
        try:
            value = json.loads(raw)
            return [str(item) for item in value] if isinstance(value, list) else []
        except (ValueError, TypeError):
            return []

    return SubmissionSummaryRead(
        submission_id=summary.submission_id,
        tldr=summary.tldr,
        overview=summary.overview,
        highlights=load_list(summary.highlights),
        technologies=load_list(summary.technologies),
        talking_points=load_list(summary.talking_points),
        source=summary.source,
        model_name=summary.model_name,
        created_at=summary.created_at,
        cached=cached,
    )


def get_summary(
    db: Session,
    submission_id: uuid.UUID,
    current_user: User,
    *,
    refresh: bool = False,
) -> SubmissionSummaryRead:
    """Return a cached summary, generating one on first use or when refreshing."""
    submission, project, team, event = _load_submission(db, submission_id)

    if not _can_view(db, event, project, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this submission.",
        )

    if submission.status == "draft":
        is_owner = (
            db.query(TeamMember)
            .filter(
                TeamMember.team_id == project.team_id,
                TeamMember.user_id == current_user.id,
                TeamMember.status == "active",
            )
            .first()
        )
        if not is_owner:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This submission is still a draft.",
            )

    existing = (
        db.execute(
            select(SubmissionSummary).where(
                SubmissionSummary.submission_id == submission_id
            )
        )
        .scalars()
        .first()
    )
    if existing and not refresh:
        return _serialize(existing, cached=True)

    payload: Dict[str, object]
    source = "fallback"
    model_name: Optional[str] = None

    if gemini_client.is_available():
        try:
            payload = gemini_client.generate_json(
                "Summarise this hackathon submission for a judge.\n\n"
                + _submission_text(submission, team.name, event.name),
                system_instruction=SUMMARY_SYSTEM_INSTRUCTION,
                response_schema=SUMMARY_SCHEMA,
                temperature=0.2,
                max_output_tokens=1200,
            )
            source = "gemini"
            model_name = settings.GEMINI_MODEL
        except GeminiError:
            payload = _fallback_summary(submission)
    else:
        payload = _fallback_summary(submission)

    def as_text(value: object) -> str:
        if isinstance(value, str):
            return value
        if isinstance(value, list):
            return " ".join(str(item) for item in value)
        return ""

    def as_json_list(value: object) -> str:
        if isinstance(value, list):
            return json.dumps([str(item) for item in value][:8])
        if isinstance(value, str) and value:
            return json.dumps([value])
        return "[]"

    tldr = as_text(payload.get("tldr")).strip() or submission.title
    overview = as_text(payload.get("overview")).strip() or as_text(payload.get("summary"))

    if existing:
        existing.tldr = tldr[:500]
        existing.overview = overview
        existing.highlights = as_json_list(payload.get("highlights"))
        existing.technologies = as_json_list(payload.get("technologies"))
        existing.talking_points = as_json_list(payload.get("talking_points"))
        existing.source = source
        existing.model_name = model_name
        summary_row = existing
    else:
        summary_row = SubmissionSummary(
            submission_id=submission.id,
            tldr=tldr[:500],
            overview=overview,
            highlights=as_json_list(payload.get("highlights")),
            technologies=as_json_list(payload.get("technologies")),
            talking_points=as_json_list(payload.get("talking_points")),
            source=source,
            model_name=model_name,
        )
        db.add(summary_row)

    db.commit()
    db.refresh(summary_row)
    return _serialize(summary_row, cached=False)


def generate_event_overview(
    db: Session, event_id: uuid.UUID, current_user: User, *, refresh: bool = False
) -> EventOverviewResponse:
    """Summarize every submitted project in an event, reusing cached rows.

    Organizer-only: this is a judging aid and it calls the model once per new
    submission, so it must not be triggerable by anyone browsing.
    """
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Event not found"
        )

    org_member = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == event.organization_id,
            OrganizationMember.user_id == current_user.id,
            OrganizationMember.status == "active",
        )
        .first()
    )
    if not (org_member and org_member.role in ("owner", "admin")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only event organizers can generate an overview.",
        )

    submissions = (
        db.query(ProjectSubmission, Project, Team)
        .join(Project, Project.id == ProjectSubmission.project_id)
        .join(Team, Team.id == Project.team_id)
        .filter(
            Project.event_id == event_id,
            ProjectSubmission.status == "submitted",
        )
        .order_by(ProjectSubmission.submitted_at.desc())
        .all()
    )

    if not submissions:
        return EventOverviewResponse(
            event_id=event_id,
            generated=0,
            cached=0,
            skipped=0,
            items=[],
            note="No submitted projects in this event yet.",
        )

    generated = 0
    cached = 0
    skipped = 0
    items: List[ProjectOverviewItem] = []

    for submission, project, team in submissions:
        try:
            summary = get_summary(
                db, submission.id, current_user, refresh=refresh
            )
        except HTTPException:
            skipped += 1
            continue

        if summary.cached:
            cached += 1
        else:
            generated += 1

        items.append(
            ProjectOverviewItem(
                submission_id=submission.id,
                project_id=project.id,
                team_name=team.name,
                title=submission.title,
                tldr=summary.tldr,
                technologies=summary.technologies,
            )
        )

    return EventOverviewResponse(
        event_id=event_id,
        generated=generated,
        cached=cached,
        skipped=skipped,
        items=items,
        note=None
        if gemini_client.is_available()
        else "AI is not configured; these are extractive summaries of each abstract.",
    )
