import uuid
from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.announcement import (
    AnnouncementCreate,
    AnnouncementRead,
    AnnouncementUpdate,
)
from app.services.announcement_service import (
    create_announcement,
    list_announcements,
    publish_announcement,
    update_draft_announcement,
    withdraw_announcement,
)

router = APIRouter()


@router.post(
    "/events/{event_id}/announcements",
    response_model=AnnouncementRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create draft announcement",
)
def create_announcement_endpoint(
    event_id: uuid.UUID,
    data: AnnouncementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AnnouncementRead:
    """Create a draft announcement. Organizer only."""
    return create_announcement(db, event_id, current_user, data)


@router.get(
    "/events/{event_id}/announcements",
    response_model=List[AnnouncementRead],
    summary="List announcements visible to user",
)
def list_announcements_endpoint(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[AnnouncementRead]:
    """Return announcements visible to the authenticated user based on role/audience."""
    return list_announcements(db, event_id, current_user)


@router.patch(
    "/announcements/{announcement_id}",
    response_model=AnnouncementRead,
    summary="Edit draft announcement",
)
def update_draft_announcement_endpoint(
    announcement_id: uuid.UUID,
    data: AnnouncementUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AnnouncementRead:
    """Allow edits to draft announcements only. Organizer only."""
    return update_draft_announcement(db, announcement_id, current_user, data)


@router.post(
    "/announcements/{announcement_id}/publish",
    response_model=AnnouncementRead,
    summary="Publish announcement and dispatch notifications",
)
def publish_announcement_endpoint(
    announcement_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AnnouncementRead:
    """Publish a draft announcement and generate in-app notifications for eligible recipients."""
    return publish_announcement(db, announcement_id, current_user)


@router.post(
    "/announcements/{announcement_id}/withdraw",
    response_model=AnnouncementRead,
    summary="Withdraw published announcement",
)
def withdraw_announcement_endpoint(
    announcement_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AnnouncementRead:
    """Withdraw a published announcement while preserving delivered notification history."""
    return withdraw_announcement(db, announcement_id, current_user)

