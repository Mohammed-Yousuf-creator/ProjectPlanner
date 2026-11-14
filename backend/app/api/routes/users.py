from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.event import EventRead
from app.schemas.user import UserMeResponse
from app.services.judging_service import list_my_judging_events
from app.services.mentor_request_service import list_my_mentoring_events

router = APIRouter()


@router.get(
    "/me",
    response_model=UserMeResponse,
    status_code=status.HTTP_200_OK,
    summary="Get current user profile",
)
def get_current_user_profile(
    current_user: User = Depends(get_current_user),
) -> UserMeResponse:
    """Retrieve the currently authenticated user and their profile."""
    return UserMeResponse.model_validate(current_user)


@router.get(
    "/me/judging-events",
    response_model=List[EventRead],
    status_code=status.HTTP_200_OK,
    summary="List events the current user judges",
)
def get_my_judging_events(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[EventRead]:
    """Events where the current user holds approved judging access.

    Gives judges a discovery surface without requiring a direct link from an
    organizer. Unpaginated: a user judges a handful of events.
    """
    events = list_my_judging_events(db, current_user)
    return [EventRead.model_validate(event) for event in events]


@router.get(
    "/me/mentoring-events",
    response_model=List[EventRead],
    status_code=status.HTTP_200_OK,
    summary="List events the current user mentors",
)
def get_my_mentoring_events(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[EventRead]:
    """Distinct events where a mentor request is assigned to the current user."""
    events = list_my_mentoring_events(db, current_user)
    return [EventRead.model_validate(event) for event in events]
