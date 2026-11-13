import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_optional_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.event import (
    EventRead,
    EventTrackCreate,
    EventTrackRead,
    EventUpdate,
)
from app.services.event_service import (
    cancel_event,
    create_track,
    get_event_details,
    get_event_tracks,
    list_public_events,
    publish_event,
    update_event,
)

router = APIRouter()


@router.get(
    "",
    response_model=List[EventRead],
    status_code=status.HTTP_200_OK,
    summary="Public event discovery",
)
def discover_events(
    event_type: Optional[str] = Query(default=None, description="Filter by event type"),
    format: Optional[str] = Query(default=None, description="Filter by format (online, offline, hybrid)"),
    city: Optional[str] = Query(default=None, description="Filter by city"),
    limit: int = Query(default=20, ge=1, le=100, description="Page limit"),
    offset: int = Query(default=0, ge=0, description="Page offset"),
    db: Session = Depends(get_db),
) -> List[EventRead]:
    """Return publicly visible published events with filtering and pagination."""
    return list_public_events(
        db=db,
        event_type=event_type,
        event_format=format,
        city=city,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{event_id}",
    response_model=EventRead,
    status_code=status.HTTP_200_OK,
    summary="Get event details",
)
def get_event(
    event_id: uuid.UUID,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
) -> EventRead:
    """Return event details. Public visitors can access published public events; drafts and private events require organization membership."""
    return get_event_details(db, event_id, current_user)


@router.patch(
    "/{event_id}",
    response_model=EventRead,
    status_code=status.HTTP_200_OK,
    summary="Update event",
)
def update_event_endpoint(
    event_id: uuid.UUID,
    data: EventUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EventRead:
    """Update event information. Only organization owners and admins can update events."""
    return update_event(db, event_id, current_user, data)


@router.post(
    "/{event_id}/publish",
    response_model=EventRead,
    status_code=status.HTTP_200_OK,
    summary="Publish event",
)
def publish_event_endpoint(
    event_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EventRead:
    """Publish a draft event. Only organization owners and admins can publish."""
    return publish_event(db, event_id, current_user)


@router.post(
    "/{event_id}/cancel",
    response_model=EventRead,
    status_code=status.HTTP_200_OK,
    summary="Cancel event",
)
def cancel_event_endpoint(
    event_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EventRead:
    """Cancel an event. Only authorized organization members can cancel."""
    return cancel_event(db, event_id, current_user)


# ---------------- Event Tracks ----------------


@router.post(
    "/{event_id}/tracks",
    response_model=EventTrackRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create event track",
)
def create_event_track(
    event_id: uuid.UUID,
    data: EventTrackCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EventTrackRead:
    """Create a track for an event. Only organization owners/admins can create tracks."""
    return create_track(db, event_id, current_user, data)


@router.get(
    "/{event_id}/tracks",
    response_model=List[EventTrackRead],
    status_code=status.HTTP_200_OK,
    summary="List event tracks",
)
def list_event_tracks(
    event_id: uuid.UUID,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
) -> List[EventTrackRead]:
    """Return tracks for an event respecting event visibility permissions."""
    return get_event_tracks(db, event_id, current_user)

