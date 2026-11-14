"""Platform assistant: conversations, history, and prompt assembly.

Two design decisions worth knowing:

**Grounding over open-ended chat.** The assistant is a guide to *this* platform,
not a general chatbot. Every prompt carries a compact fact sheet built from the
user's real state (their events, teams, deadlines) plus the platform's own rules,
and the system instruction tells the model to answer from those facts. That is
what stops it inventing endpoints, dates, and policies.

**Honest degradation.** With no `GEMINI_API_KEY` the assistant still works: a
deterministic keyword responder answers from the same fact sheet and the message
is tagged `source="fallback"`, which the UI surfaces. Nothing pretends to be a
model when it is not.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional, Sequence

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.models.ai import AiConversation, AiMessage
from app.models.event import Event, EventMembership
from app.models.team import Team, TeamMember
from app.models.user import User
from app.schemas.ai import (
    ChatConversationRead,
    ChatConversationSummaryRead,
    ChatMessageRead,
    ChatSendRequest,
    ChatSendResponse,
)
from app.services import gemini_client
from app.services.gemini_client import GeminiError

MAX_HISTORY_TURNS = 20
MAX_CONVERSATIONS_PER_USER = 50

SYSTEM_INSTRUCTION = """You are the in-app assistant for a hackathon and event \
management platform. You help participants, organizers, judges, mentors and \
sponsors use the platform.

Rules you must follow:
1. Answer ONLY from the PLATFORM FACTS and USER CONTEXT given to you. If the \
answer is not in there, say you are not sure and tell the user where in the app \
to look, rather than inventing a feature, endpoint, date or policy.
2. Be concise. Two or three short paragraphs at most. Use plain sentences, never \
markdown tables or headings, because replies render in a narrow chat panel.
3. Be concrete: name the page or button the user should use (for example \
"Team workspace → Submission").
4. Never invent deadlines. If a date is not in the facts, say it is on the event \
page.
5. If the user is frustrated or asks something outside the platform, be brief \
and steer back to what you can help with."""

PLATFORM_FACTS = """PLATFORM FACTS

Roles
- Participants register for events, form teams, build a project and submit it.
- Organizers create an organization, then events under it; they manage \
registrations, tracks, schedule, judging criteria, announcements and check-ins.
- Judges evaluate submitted projects against the organizer's criteria.
- Mentors are assigned to participant help requests.
- Sponsors and organizers negotiate sponsorship deals through listings, \
packages and proposals.

Key flows
- Register for an event: Events → open the event → Register. Registration only \
works inside the event's registration window.
- Form a team: from the event page, create a team (you become owner) or join one \
with a join code. A join code is shareable; the owner can regenerate it.
- Join code: Team workspace → Members → join code. It is a short code the owner \
shares; anyone in the event with it can join.
- Submit a project: Team workspace → Submission. You can edit a draft freely; \
submitting is final and creates a numbered version. Later changes require a new \
version.
- Judging: judges grade each submitted project per criterion. Scores roll up into \
the event leaderboard.
- Mentor help: from the event page, ask for a mentor with a topic and priority. \
Organizers assign an approved mentor.
- Sponsorship: organizers publish listings; sponsors send proposals; both sides \
negotiate in the proposal thread, then an accepted proposal becomes a deal with \
deliverables.
- Notifications: the bell in the header. Clicking one takes you to the relevant \
page.

Rules people ask about
- A team owner cannot leave without transferring ownership first.
- A submitted project version is immutable; make a new version instead.
- Team size limits are set per event (min and max).
- Only active team members can see a team's files, chat and drafts."""


def _get_owned_conversation(
    db: Session, conversation_id: uuid.UUID, current_user: User
) -> AiConversation:
    conversation = db.get(AiConversation, conversation_id)
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        )
    if conversation.user_id != current_user.id:
        # 404 rather than 403 so conversation ids are not confirmed to others.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        )
    return conversation


def build_user_context(db: Session, current_user: User, event_id: Optional[uuid.UUID]) -> str:
    """Compact fact sheet about the caller's current situation.

    Deliberately small: it is prompt tokens on every turn, and a wall of text
    makes the model worse at picking out the relevant line.
    """
    lines: List[str] = []
    name = current_user.profile.display_name if current_user.profile else current_user.username
    lines.append(f"User: {name} (@{current_user.username})")

    # Teams the user is actively on, with the event they belong to.
    memberships = (
        db.query(TeamMember, Team, Event)
        .join(Team, Team.id == TeamMember.team_id)
        .join(Event, Event.id == Team.event_id)
        .filter(
            TeamMember.user_id == current_user.id,
            TeamMember.status == "active",
            Team.status != "disbanded",
        )
        .limit(10)
        .all()
    )
    if memberships:
        lines.append("Teams the user is on:")
        for member, team, event in memberships:
            lines.append(
                f"- {team.name} ({member.role}) in event '{event.name}' "
                f"(status {event.status}, team status {team.status})"
            )
    else:
        lines.append("Teams the user is on: none yet")

    if event_id:
        event = db.get(Event, event_id)
        if event:
            lines.append(f"\nEvent currently open in the app: '{event.name}'")
            lines.append(f"- status: {event.status}, format: {event.format}")
            if event.starts_at:
                lines.append(f"- starts: {event.starts_at.isoformat()}")
            if event.ends_at:
                lines.append(f"- ends: {event.ends_at.isoformat()}")
            if event.submission_deadline_at:
                lines.append(
                    f"- submission deadline: {event.submission_deadline_at.isoformat()}"
                )
            if event.registration_closes_at:
                lines.append(
                    f"- registration closes: {event.registration_closes_at.isoformat()}"
                )
            lines.append(
                f"- team size: {event.min_team_size}-{event.max_team_size} people"
            )

    # Upcoming registrations give the model something concrete to point at.
    upcoming = (
        db.query(Event)
        .join(EventMembership, EventMembership.event_id == Event.id)
        .filter(
            EventMembership.user_id == current_user.id,
            EventMembership.status.in_(["registered", "approved"]),
            Event.status.in_(["published", "registration_open", "in_progress"]),
        )
        .limit(5)
        .all()
    )
    if upcoming:
        lines.append("\nEvents the user is registered for:")
        for event in upcoming:
            lines.append(f"- {event.name} ({event.status})")

    return "\n".join(lines)


def _fallback_reply(
    db: Session, current_user: User, question: str, event_id: Optional[uuid.UUID]
) -> str:
    """Deterministic answer used when no API key is configured.

    Keyword routing over the same platform facts the model would receive. It is
    intentionally narrow — better to say "here is where to look" than to guess.
    """
    text = question.lower()

    def has(*words: str) -> bool:
        return any(word in text for word in words)

    if has("join code", "join a team", "joining", "how do i join"):
        return (
            "To join a team, open the event page and choose Join team, then paste the "
            "join code the team owner shared. Owners find their code in Team workspace "
            "→ Members. If the code is rejected, it may have been regenerated — ask "
            "the owner for the current one."
        )
    if has("form a team", "create a team", "start a team", "make a team"):
        return (
            "Open the event page and choose Create team. You become the owner, and you "
            "can invite people by email or share the join code. Teams must respect the "
            "event's minimum and maximum team size."
        )
    if has("submit", "submission", "deadline", "upload project", "version"):
        return (
            "Submissions live in Team workspace → Submission. You can edit a draft as "
            "much as you like; submitting is final and creates a numbered version. Any "
            "later change needs a new version. The exact deadline is on the event page."
        )
    if has("judge", "judging", "score", "criteria", "leaderboard"):
        return (
            "Judges score each submitted project against the organizer's criteria, and "
            "the weighted total feeds the event leaderboard. As a judge, open Judge "
            "workspace from the dashboard to see the events you have access to."
        )
    if has("mentor", "help", "stuck"):
        return (
            "You can ask for a mentor from the event page: give a topic and a priority, "
            "and an organizer assigns an approved mentor. Track your requests under "
            "My mentor requests."
        )
    if has("sponsor", "sponsorship", "proposal", "deal"):
        return (
            "Sponsorship runs through the marketplace: organizers publish listings, "
            "sponsors send proposals, both sides negotiate in the proposal thread, and "
            "an accepted proposal becomes a deal with deliverables."
        )
    if has("notification", "notify"):
        return (
            "Notifications appear under the bell in the header. Selecting one opens the "
            "related page: proposals, deals, mentor requests and announcements all link "
            "to their own screens."
        )
    if has("event", "register", "registration", "sign up"):
        return (
            "Browse events from Events, open one, and choose Register. Registration "
            "only succeeds inside the event's registration window; if the button is "
            "disabled, the window has not opened or has already closed."
        )

    # Nothing matched: point at the most likely destination instead of guessing.
    if event_id:
        return (
            "I could not match that to a specific answer. The most useful places to "
            "look are the event page for dates and registration, and Team workspace for "
            "chat, tasks and submissions. Ask me about teams, submissions, judging, "
            "mentors or sponsorship and I can be more specific."
        )
    return (
        "I could not match that to a specific answer. Try asking about forming a team, "
        "submitting a project, judging, mentor requests or sponsorship. For anything "
        "account-related, your dashboard lists everything you are part of."
    )


def _build_prompt(context: str, history: Sequence[AiMessage], question: str) -> str:
    """Compose the grounded prompt for one turn."""
    parts = [PLATFORM_FACTS, "\nUSER CONTEXT\n" + context]
    if history:
        parts.append("\nRECENT CONVERSATION")
        for message in history:
            speaker = "User" if message.role == "user" else "Assistant"
            parts.append(f"{speaker}: {message.content}")
    parts.append(f"\nUser: {question}")
    parts.append("Assistant:")
    return "\n".join(parts)


def list_conversations(
    db: Session, current_user: User, limit: int = 30
) -> List[ChatConversationSummaryRead]:
    """Sidebar list: newest first, with a preview of the last turn."""
    conversations = (
        db.execute(
            select(AiConversation)
            .where(AiConversation.user_id == current_user.id)
            .order_by(AiConversation.updated_at.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )
    if not conversations:
        return []

    ids = [c.id for c in conversations]
    # One aggregate query for counts, one for the newest message per thread.
    counts = dict(
        db.execute(
            select(AiMessage.conversation_id, func.count(AiMessage.id))
            .where(AiMessage.conversation_id.in_(ids))
            .group_by(AiMessage.conversation_id)
        ).all()
    )

    previews = {}
    for conversation_id, content, created_at in (
        db.execute(
            select(AiMessage.conversation_id, AiMessage.content, AiMessage.created_at)
            .where(AiMessage.conversation_id.in_(ids))
            .order_by(AiMessage.created_at.desc())
        ).all()
    ):
        if conversation_id not in previews:
            previews[conversation_id] = content

    return [
        ChatConversationSummaryRead(
            id=c.id,
            title=c.title,
            event_id=c.event_id,
            message_count=counts.get(c.id, 0),
            last_message_preview=(previews.get(c.id) or "")[:160] or None,
            updated_at=c.updated_at,
        )
        for c in conversations
    ]


def get_conversation(
    db: Session, conversation_id: uuid.UUID, current_user: User
) -> ChatConversationRead:
    conversation = (
        db.execute(
            select(AiConversation)
            .options(selectinload(AiConversation.messages))
            .where(AiConversation.id == conversation_id)
        )
        .scalars()
        .first()
    )
    if not conversation or conversation.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        )
    return ChatConversationRead.model_validate(conversation)


def create_conversation(
    db: Session, current_user: User, event_id: Optional[uuid.UUID] = None
) -> ChatConversationRead:
    """Start an empty thread, pruning the oldest if the user has too many."""
    total = (
        db.execute(
            select(func.count(AiConversation.id)).where(
                AiConversation.user_id == current_user.id
            )
        ).scalar_one()
    )
    if total >= MAX_CONVERSATIONS_PER_USER:
        oldest = (
            db.execute(
                select(AiConversation)
                .where(AiConversation.user_id == current_user.id)
                .order_by(AiConversation.updated_at.asc())
                .limit(1)
            )
            .scalars()
            .first()
        )
        if oldest:
            db.delete(oldest)

    conversation = AiConversation(
        user_id=current_user.id,
        event_id=event_id,
        title="New chat",
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return ChatConversationRead.model_validate(conversation)


def delete_conversation(db: Session, conversation_id: uuid.UUID, current_user: User) -> None:
    conversation = _get_owned_conversation(db, conversation_id, current_user)
    db.delete(conversation)
    db.commit()


def _title_from(question: str) -> str:
    """First line, trimmed to something that fits a sidebar row."""
    cleaned = " ".join(question.strip().split())
    if len(cleaned) <= 60:
        return cleaned or "New chat"
    return cleaned[:57].rstrip() + "…"


def send_message(
    db: Session,
    current_user: User,
    request: ChatSendRequest,
    conversation_id: Optional[uuid.UUID] = None,
) -> ChatSendResponse:
    """Append a user turn, generate a reply, persist both.

    The user message is persisted *before* the model call so a failed generation
    never loses what the user typed — they can retry and the question is still in
    the thread.
    """
    if conversation_id:
        conversation = _get_owned_conversation(db, conversation_id, current_user)
    else:
        created = create_conversation(db, current_user, request.event_id)
        conversation = db.get(AiConversation, created.id)
        assert conversation is not None

    question = request.message.strip()
    if not question:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Message cannot be empty",
        )

    user_message = AiMessage(
        conversation_id=conversation.id,
        role="user",
        content=question,
        source="fallback",
    )
    db.add(user_message)
    if conversation.title == "New chat":
        conversation.title = _title_from(question)
    conversation.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user_message)

    # Prior turns, oldest→newest, excluding the one just added.
    history = (
        db.execute(
            select(AiMessage)
            .where(
                AiMessage.conversation_id == conversation.id,
                AiMessage.id != user_message.id,
            )
            .order_by(AiMessage.created_at.desc())
            .limit(MAX_HISTORY_TURNS)
        )
        .scalars()
        .all()
    )
    history.reverse()

    context = build_user_context(db, current_user, request.event_id or conversation.event_id)

    answer: str
    source: str
    note: Optional[str] = None

    if gemini_client.is_available():
        try:
            answer = gemini_client.generate_content(
                _build_prompt(context, history, question),
                system_instruction=SYSTEM_INSTRUCTION,
                temperature=0.3,
                max_output_tokens=900,
            )
            source = "gemini"
        except GeminiError as exc:
            # Do not lose the conversation: fall back and say so plainly.
            answer = _fallback_reply(db, current_user, question, request.event_id)
            source = "fallback"
            note = (
                "The AI service is unavailable right now, so this is an offline "
                f"answer. ({exc})"
            )
    else:
        answer = _fallback_reply(db, current_user, question, request.event_id)
        source = "fallback"
        note = (
            "AI is not configured on this server (no GEMINI_API_KEY), so this is a "
            "scripted answer from the platform guide."
        )

    assistant_message = AiMessage(
        conversation_id=conversation.id,
        role="assistant",
        content=answer,
        source=source,
    )
    db.add(assistant_message)
    conversation.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(assistant_message)

    return ChatSendResponse(
        conversation_id=conversation.id,
        user_message=ChatMessageRead.model_validate(user_message),
        assistant_message=ChatMessageRead.model_validate(assistant_message),
        ai_generated=source == "gemini",
        note=note,
    )


def ai_status() -> dict:
    """Capability probe for the frontend."""
    enabled = gemini_client.is_available()
    return {
        "ai_enabled": enabled,
        "model": settings.GEMINI_MODEL if enabled else None,
        "features": {
            "chat": True,
            "submission_summary": True,
            "team_matching": True,
            "event_overview": True,
        },
    }
