import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.ai import (
    AiStatusRead,
    ChatConversationRead,
    ChatConversationSummaryRead,
    ChatSendRequest,
    ChatSendResponse,
    EventOverviewResponse,
    SkillMatchRequest,
    SkillMatchRead,
    SkillRead,
    SkillReplace,
    SubmissionSummaryRead,
    TeamMatchResponse,
    TeammateMatchResponse,
)
from app.services import ai_chat_service, skill_service, submission_summary_service

router = APIRouter()


# ---------------------------------------------------------------------------
# Capability probe
# ---------------------------------------------------------------------------


@router.get(
    "/ai/status",
    response_model=AiStatusRead,
    summary="Report which AI features are live",
)
def get_ai_status() -> AiStatusRead:
    """Unauthenticated on purpose: the landing page and login screen use this to
    decide whether to advertise AI features at all.
    """
    return AiStatusRead(**ai_chat_service.ai_status())


# ---------------------------------------------------------------------------
# Skills
# ---------------------------------------------------------------------------


@router.get(
    "/users/me/skills",
    response_model=List[SkillRead],
    summary="List my skills",
)
def list_my_skills(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[SkillRead]:
    return skill_service.list_user_skills(db, current_user.id)


@router.put(
    "/users/me/skills",
    response_model=List[SkillRead],
    summary="Replace my skills",
)
def replace_my_skills(
    data: SkillReplace,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[SkillRead]:
    """Whole-set replacement, so removing a chip in the UI removes it here."""
    return skill_service.replace_user_skills(db, current_user, data)


@router.get(
    "/users/{user_id}/skills",
    response_model=List[SkillRead],
    summary="List another user's skills",
)
def list_member_skills(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[SkillRead]:
    """Skills are public profile data, but require authentication so they cannot
    be scraped anonymously.
    """
    return skill_service.list_user_skills(db, user_id)


# ---------------------------------------------------------------------------
# Matchmaking
# ---------------------------------------------------------------------------


@router.get(
    "/events/{event_id}/matchmaking/teammates",
    response_model=TeammateMatchResponse,
    summary="Suggest teammates whose skills complement mine",
)
def match_teammates_endpoint(
    event_id: uuid.UUID,
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeammateMatchResponse:
    """Deterministic ranking — see `skill_matching.py` for the algorithm."""
    return skill_service.match_teammates(
        db, event_id, current_user, limit=limit
    )


@router.get(
    "/events/{event_id}/matchmaking/teams",
    response_model=TeamMatchResponse,
    summary="Rank open teams by how much I would add to them",
)
def match_teams_endpoint(
    event_id: uuid.UUID,
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeamMatchResponse:
    return skill_service.match_teams(db, event_id, current_user, limit=limit)


@router.post(
    "/events/{event_id}/matchmaking/preview",
    response_model=TeammateMatchResponse,
    summary="Preview matches for a pasted skill list",
)
def preview_matches_endpoint(
    event_id: uuid.UUID,
    data: SkillMatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeammateMatchResponse:
    """Answers "what if I added Rust?" without saving anything to the profile."""
    return skill_service.match_teammates(
        db,
        event_id,
        current_user,
        limit=data.limit,
        override_skills=data.skills,
    )


# ---------------------------------------------------------------------------
# Chat assistant
# ---------------------------------------------------------------------------


@router.get(
    "/ai/conversations",
    response_model=List[ChatConversationSummaryRead],
    summary="List my assistant conversations",
)
def list_conversations_endpoint(
    limit: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[ChatConversationSummaryRead]:
    return ai_chat_service.list_conversations(db, current_user, limit=limit)


@router.post(
    "/ai/conversations",
    response_model=ChatConversationRead,
    status_code=status.HTTP_201_CREATED,
    summary="Start a conversation",
)
def create_conversation_endpoint(
    event_id: Optional[uuid.UUID] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatConversationRead:
    return ai_chat_service.create_conversation(db, current_user, event_id)


@router.get(
    "/ai/conversations/{conversation_id}",
    response_model=ChatConversationRead,
    summary="Read a conversation",
)
def get_conversation_endpoint(
    conversation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatConversationRead:
    return ai_chat_service.get_conversation(db, conversation_id, current_user)


@router.delete(
    "/ai/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a conversation",
)
def delete_conversation_endpoint(
    conversation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    ai_chat_service.delete_conversation(db, conversation_id, current_user)


@router.post(
    "/ai/conversations/{conversation_id}/messages",
    response_model=ChatSendResponse,
    summary="Send a message and get a reply",
)
def send_message_endpoint(
    conversation_id: uuid.UUID,
    data: ChatSendRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatSendResponse:
    return ai_chat_service.send_message(
        db, current_user, data, conversation_id=conversation_id
    )


@router.post(
    "/ai/chat",
    response_model=ChatSendResponse,
    summary="One-shot chat (creates a conversation if needed)",
)
def chat_endpoint(
    data: ChatSendRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatSendResponse:
    """Convenience for the floating widget: no conversation id required."""
    return ai_chat_service.send_message(db, current_user, data)


# ---------------------------------------------------------------------------
# Submission summaries
# ---------------------------------------------------------------------------


@router.get(
    "/submissions/{submission_id}/summary",
    response_model=SubmissionSummaryRead,
    summary="AI overview of a submission",
)
def get_submission_summary_endpoint(
    submission_id: uuid.UUID,
    refresh: bool = Query(False, description="Regenerate instead of using the cache"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SubmissionSummaryRead:
    return submission_summary_service.get_summary(
        db, submission_id, current_user, refresh=refresh
    )


@router.get(
    "/events/{event_id}/ai/overview",
    response_model=EventOverviewResponse,
    summary="AI digest of every submitted project in an event",
)
def get_event_overview_endpoint(
    event_id: uuid.UUID,
    refresh: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EventOverviewResponse:
    return submission_summary_service.generate_event_overview(
        db, event_id, current_user, refresh=refresh
    )
