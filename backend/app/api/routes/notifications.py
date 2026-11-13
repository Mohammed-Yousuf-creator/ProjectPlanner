import uuid
from typing import Dict, List

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.notification import (
    NotificationRead,
    NotificationUnreadCountResponse,
)
from app.services.notification_service import (
    get_unread_count,
    list_user_notifications,
    mark_all_read,
    mark_notification_read,
)

router = APIRouter()


@router.get(
    "/notifications/me",
    response_model=List[NotificationRead],
    summary="Get my notifications",
)
def get_my_notifications_endpoint(
    unread_only: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[NotificationRead]:
    """Return notifications for the authenticated user, newest first."""
    return list_user_notifications(
        db, current_user, unread_only=unread_only, page=page, page_size=page_size
    )


@router.get(
    "/notifications/me/unread-count",
    response_model=NotificationUnreadCountResponse,
    summary="Get unread notification count",
)
def get_unread_count_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationUnreadCountResponse:
    """Return count of unread notifications for the authenticated user."""
    count = get_unread_count(db, current_user)
    return NotificationUnreadCountResponse(unread_count=count)


@router.patch(
    "/notifications/{notification_id}/read",
    response_model=NotificationRead,
    summary="Mark notification as read",
)
def mark_read_endpoint(
    notification_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationRead:
    """Mark a notification as read. Recipient only."""
    return mark_notification_read(db, notification_id, current_user)


@router.post(
    "/notifications/me/read-all",
    summary="Mark all notifications as read",
)
def mark_all_read_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, int]:
    """Mark all unread notifications as read."""
    count = mark_all_read(db, current_user)
    return {"updated_count": count}

