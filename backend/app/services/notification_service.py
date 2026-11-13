import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import NotificationRead


def create_notification(
    db: Session,
    user_id: uuid.UUID,
    notification_type: str,
    title: str,
    body: str,
    event_id: Optional[uuid.UUID] = None,
    data: Optional[Dict[str, Any]] = None,
) -> Notification:
    """Create an in-app notification with deduplication prevention."""
    # Deduplication check for operations with unique entities
    if data:
        check_query = select(Notification).where(
            Notification.user_id == user_id,
            Notification.notification_type == notification_type,
        )
        if event_id:
            check_query = check_query.where(Notification.event_id == event_id)

        # Inspect if identical notification already sent
        existing_notifications = db.execute(check_query).scalars().all()
        for existing in existing_notifications:
            if existing.data == data:
                return existing

    notification = Notification(
        id=uuid.uuid4(),
        user_id=user_id,
        event_id=event_id,
        notification_type=notification_type,
        title=title,
        body=body,
        data=data,
        read_at=None,
        created_at=datetime.now(timezone.utc),
    )
    db.add(notification)
    return notification


def list_user_notifications(
    db: Session,
    current_user: User,
    unread_only: bool = False,
    page: int = 1,
    page_size: int = 20,
) -> List[NotificationRead]:
    """Return paginated notifications for the authenticated user, newest first."""
    query = select(Notification).where(Notification.user_id == current_user.id)
    if unread_only:
        query = query.where(Notification.read_at.is_(None))

    query = query.order_by(Notification.created_at.desc())
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    notifications = db.execute(query).scalars().all()
    return [NotificationRead.model_validate(n) for n in notifications]


def get_unread_count(db: Session, current_user: User) -> int:
    """Return count of unread notifications for the authenticated user."""
    query = select(func.count(Notification.id)).where(
        Notification.user_id == current_user.id,
        Notification.read_at.is_(None),
    )
    return db.execute(query).scalar_one() or 0


def mark_notification_read(
    db: Session,
    notification_id: uuid.UUID,
    current_user: User,
) -> NotificationRead:
    """Mark a specific notification as read by its recipient."""
    notification = db.get(Notification, notification_id)
    if not notification or notification.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )

    if notification.read_at is None:
        notification.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(notification)

    return NotificationRead.model_validate(notification)


def mark_all_read(db: Session, current_user: User) -> int:
    """Mark all unread notifications belonging to the authenticated user as read."""
    now = datetime.now(timezone.utc)
    stmt = (
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.read_at.is_(None),
        )
        .values(read_at=now)
    )
    result = db.execute(stmt)
    db.commit()
    return result.rowcount

