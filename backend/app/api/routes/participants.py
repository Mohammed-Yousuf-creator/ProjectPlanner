import uuid
from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.participant import (
    ParticipantDashboardResponse,
    ParticipantRegisteredEventDetail,
    ParticipantRegistrationRead,
)
from app.schemas.team import TeamInvitationDetailRead
from app.services.participant_service import (
    get_participant_dashboard,
    get_registered_event_detail,
    list_my_registrations,
)
from app.services.team_service import list_my_team_invitations

router = APIRouter()


@router.get(
    "/me/registrations",
    response_model=List[ParticipantRegistrationRead],
    status_code=status.HTTP_200_OK,
    summary="Get my event registrations",
)
def get_my_registrations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[ParticipantRegistrationRead]:
    """Return active registrations belonging to the authenticated user."""
    return list_my_registrations(db, current_user)


@router.get(
    "/me/dashboard",
    response_model=ParticipantDashboardResponse,
    status_code=status.HTTP_200_OK,
    summary="Participant dashboard",
)
def get_dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ParticipantDashboardResponse:
    """Return participant dashboard containing profile, summary metrics, and categorized events."""
    return get_participant_dashboard(db, current_user)


@router.get(
    "/me/events/{event_id}",
    response_model=ParticipantRegisteredEventDetail,
    status_code=status.HTTP_200_OK,
    summary="Get registered event details",
)
def get_my_event_detail(
    event_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ParticipantRegisteredEventDetail:
    """Return detailed information about an event the authenticated user is registered for."""
    return get_registered_event_detail(db, event_id, current_user)


@router.get(
    "/me/team-invitations",
    response_model=List[TeamInvitationDetailRead],
    status_code=status.HTTP_200_OK,
    summary="Get pending team invitations",
)
def get_my_team_invitations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[TeamInvitationDetailRead]:
    """Return pending team invitations for the authenticated participant."""
    return list_my_team_invitations(db, current_user)


