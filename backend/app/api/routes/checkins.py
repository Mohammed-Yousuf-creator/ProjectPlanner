import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.checkin import CheckInAttendeeRead, CheckInSummaryRead
from app.schemas.registration import EventRegistrationResponse
from app.services.checkin_service import (
    get_checkin_summary,
    list_event_checkins,
    undo_check_in_participant,
)
from app.services.registration_service import check_in_participant

router = APIRouter()


@router.get(
    "/events/{event_id}/check-ins",
    response_model=List[CheckInAttendeeRead],
    summary="List event attendees and check-in status",
)
def list_event_checkins_endpoint(
    event_id: uuid.UUID,
    search: Optional[str] = None,
    checked_in: Optional[bool] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[CheckInAttendeeRead]:
    """Return attendee check-in status with search and filtering. Organizer only."""
    return list_event_checkins(
        db,
        event_id,
        current_user,
        search=search,
        checked_in=checked_in,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/events/{event_id}/check-ins/summary",
    response_model=CheckInSummaryRead,
    summary="Get check-in attendance summary",
)
def get_checkin_summary_endpoint(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CheckInSummaryRead:
    """Return attendance metrics excluding withdrawn and rejected registrations. Organizer only."""
    return get_checkin_summary(db, event_id, current_user)


@router.post(
    "/events/{event_id}/participants/{user_id}/check-in",
    response_model=EventRegistrationResponse,
    status_code=status.HTTP_200_OK,
    summary="Check in participant",
)
def check_in_participant_endpoint(
    event_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EventRegistrationResponse:
    """Allow authorized organizers to mark a registered or approved participant as checked in."""
    membership = check_in_participant(
        db=db,
        event_id=event_id,
        participant_user_id=user_id,
        current_user=current_user,
    )
    return EventRegistrationResponse.model_validate(membership)


@router.delete(
    "/events/{event_id}/participants/{user_id}/check-in",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Undo participant check-in",
)
def undo_check_in_participant_endpoint(
    event_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Allow authorized organizers to undo an accidental check-in."""
    undo_check_in_participant(db, event_id, user_id, current_user)

