import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.registration import (
    EventRegisterRequest,
    EventRegistrationResponse,
    OrganizerParticipantRead,
    ParticipantStatusUpdateRequest,
)
from app.services.registration_service import (
    check_in_participant,
    list_event_participants,
    register_for_event,
    update_participant_status,
    withdraw_registration,
)

router = APIRouter()


@router.post(
    "/events/{event_id}/register",
    response_model=EventRegistrationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register for event",
)
def register_event(
    event_id: uuid.UUID,
    data: Optional[EventRegisterRequest] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EventRegistrationResponse:
    """Allow an authenticated user to register for an event or reactivate a withdrawn registration."""
    membership = register_for_event(db, event_id, current_user, data)
    return EventRegistrationResponse.model_validate(membership)


@router.post(
    "/events/{event_id}/withdraw",
    response_model=EventRegistrationResponse,
    status_code=status.HTTP_200_OK,
    summary="Withdraw event registration",
)
def withdraw_event(
    event_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EventRegistrationResponse:
    """Allow an authenticated participant to withdraw their registration."""
    membership = withdraw_registration(db, event_id, current_user)
    return EventRegistrationResponse.model_validate(membership)


@router.get(
    "/events/{event_id}/participants",
    response_model=List[OrganizerParticipantRead],
    status_code=status.HTTP_200_OK,
    summary="List event participants (Organizer)",
)
def get_participants(
    event_id: uuid.UUID,
    status: Optional[str] = Query(default=None, description="Filter by status (registered, approved, waitlisted, rejected, withdrawn)"),
    search: Optional[str] = Query(default=None, description="Search by username or email"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[OrganizerParticipantRead]:
    """Allow authorized organization owners and admins to view event registrations."""
    return list_event_participants(
        db=db,
        event_id=event_id,
        current_user=current_user,
        status_filter=status,
        search=search,
        limit=limit,
        offset=offset,
    )


@router.patch(
    "/events/{event_id}/participants/{user_id}",
    response_model=EventRegistrationResponse,
    status_code=status.HTTP_200_OK,
    summary="Update participant status (Organizer)",
)
def update_participant(
    event_id: uuid.UUID,
    user_id: uuid.UUID,
    data: ParticipantStatusUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EventRegistrationResponse:
    """Allow authorized organization owners and admins to update participant registration status."""
    membership = update_participant_status(
        db=db,
        event_id=event_id,
        participant_user_id=user_id,
        current_user=current_user,
        new_status=data.status,
    )
    return EventRegistrationResponse.model_validate(membership)


@router.post(
    "/events/{event_id}/participants/{user_id}/check-in",
    response_model=EventRegistrationResponse,
    status_code=status.HTTP_200_OK,
    summary="Check in participant (Organizer)",
)
def check_in(
    event_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EventRegistrationResponse:
    """Allow authorized organizers to mark a registered or approved participant as checked in."""
    membership = check_in_participant(
        db=db,
        event_id=event_id,
        participant_user_id=user_id,
        current_user=current_user,
    )
    return EventRegistrationResponse.model_validate(membership)

