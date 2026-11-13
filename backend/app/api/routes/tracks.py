import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.event import EventTrackRead, EventTrackUpdate
from app.services.event_service import delete_track, update_track

router = APIRouter()


@router.patch(
    "/{track_id}",
    response_model=EventTrackRead,
    status_code=status.HTTP_200_OK,
    summary="Update track",
)
def update_track_endpoint(
    track_id: uuid.UUID,
    data: EventTrackUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EventTrackRead:
    """Update a track's name or description. Only organization owners and admins can update tracks."""
    return update_track(db, track_id, current_user, data)


@router.delete(
    "/{track_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete track",
)
def delete_track_endpoint(
    track_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a track. Only organization owners and admins can delete tracks."""
    delete_track(db, track_id, current_user)
    return {"message": "Track deleted successfully"}

