import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.mentor_request import (
    MentorRequestAssign,
    MentorRequestCreate,
    MentorRequestRead,
    MentorRequestStatusUpdate,
)
from app.services.mentor_request_service import (
    assign_mentor,
    cancel_mentor_request,
    create_mentor_request,
    list_event_mentor_requests,
    list_my_mentor_requests,
    update_mentor_request_status,
)

router = APIRouter()


@router.post(
    "/events/{event_id}/mentor-requests",
    response_model=MentorRequestRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create mentor request",
)
def create_mentor_request_endpoint(
    event_id: uuid.UUID,
    data: MentorRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MentorRequestRead:
    """Allow an eligible event participant to request mentor assistance."""
    return create_mentor_request(db, event_id, current_user, data)


@router.get(
    "/participants/me/mentor-requests",
    response_model=List[MentorRequestRead],
    summary="Get my mentor requests",
)
def list_my_mentor_requests_endpoint(
    event_id: Optional[uuid.UUID] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[MentorRequestRead]:
    """Return mentor requests created by the authenticated participant."""
    return list_my_mentor_requests(db, current_user, event_id=event_id)


@router.get(
    "/events/{event_id}/mentor-requests",
    response_model=List[MentorRequestRead],
    summary="List event mentor requests",
)
def list_event_mentor_requests_endpoint(
    event_id: uuid.UUID,
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[MentorRequestRead]:
    """List mentor requests for organizers (all) or approved mentors (unassigned + assigned)."""
    return list_event_mentor_requests(
        db,
        event_id,
        current_user,
        status_filter=status,
        priority_filter=priority,
        page=page,
        page_size=page_size,
    )


@router.patch(
    "/mentor-requests/{request_id}/assign",
    response_model=MentorRequestRead,
    summary="Assign mentor to request",
)
def assign_mentor_endpoint(
    request_id: uuid.UUID,
    data: MentorRequestAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MentorRequestRead:
    """Assign an approved event mentor to a request. Organizer only."""
    return assign_mentor(db, request_id, data.mentor_user_id, current_user)


@router.patch(
    "/mentor-requests/{request_id}/status",
    response_model=MentorRequestRead,
    summary="Update mentor request status",
)
def update_mentor_request_status_endpoint(
    request_id: uuid.UUID,
    data: MentorRequestStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MentorRequestRead:
    """Update mentor request status. Assigned mentor or organizer only."""
    return update_mentor_request_status(db, request_id, current_user, data)


@router.post(
    "/mentor-requests/{request_id}/cancel",
    response_model=MentorRequestRead,
    summary="Cancel mentor request",
)
def cancel_mentor_request_endpoint(
    request_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MentorRequestRead:
    """Cancel a pending mentor request. Requester only."""
    return cancel_mentor_request(db, request_id, current_user)

