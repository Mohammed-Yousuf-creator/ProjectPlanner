import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.event import Event, EventMembership
from app.models.event_schedule import EventScheduleItem
from app.models.user import User
from app.schemas.event_schedule import (
    EventScheduleItemCreate,
    EventScheduleItemRead,
    EventScheduleItemUpdate,
)
from app.services.organization_service import get_member_in_org, require_org_member
from app.services.project_service import validate_http_url


def create_schedule_item(
    db: Session,
    event_id: uuid.UUID,
    current_user: User,
    data: EventScheduleItemCreate,
) -> EventScheduleItemRead:
    """Create a new schedule item for an event. Organizer only."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    require_org_member(db, event.organization_id, current_user, ["owner", "admin"])

    if data.starts_at >= data.ends_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start time must be before end time.",
        )

    validate_http_url(data.meeting_url, "Meeting URL")

    item = EventScheduleItem(
        event_id=event_id,
        title=data.title.strip(),
        description=data.description.strip() if data.description else None,
        item_type=data.item_type.strip(),
        starts_at=data.starts_at,
        ends_at=data.ends_at,
        venue=data.venue.strip() if data.venue else None,
        meeting_url=data.meeting_url.strip() if data.meeting_url else None,
        status="scheduled",
        created_by_user_id=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return EventScheduleItemRead.model_validate(item)


def list_event_schedule(
    db: Session,
    event_id: uuid.UUID,
    current_user: Optional[User] = None,
    include_cancelled: bool = False,
) -> List[EventScheduleItemRead]:
    """Return chronological schedule items. Excludes cancelled items by default."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    is_organizer = False
    is_member = False

    if current_user:
        org_mem = get_member_in_org(db, event.organization_id, current_user.id)
        if org_mem and org_mem.status == "active" and org_mem.role in ("owner", "admin"):
            is_organizer = True

        if not is_organizer:
            ev_mem = (
                db.query(EventMembership)
                .filter(
                    EventMembership.event_id == event_id,
                    EventMembership.user_id == current_user.id,
                    EventMembership.status.in_(["registered", "approved"]),
                )
                .first()
            )
            if ev_mem:
                is_member = True

    # Public access check
    if not (is_organizer or is_member):
        if event.visibility != "public" or event.status == "draft":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to view this event's schedule.",
            )

    query = select(EventScheduleItem).where(EventScheduleItem.event_id == event_id)
    if not (include_cancelled and is_organizer):
        query = query.where(EventScheduleItem.status != "cancelled")

    query = query.order_by(EventScheduleItem.starts_at.asc())
    items = db.execute(query).scalars().all()
    return [EventScheduleItemRead.model_validate(it) for it in items]


def update_schedule_item(
    db: Session,
    item_id: uuid.UUID,
    current_user: User,
    data: EventScheduleItemUpdate,
) -> EventScheduleItemRead:
    """Update a schedule item. Organizer only."""
    item = db.get(EventScheduleItem, item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule item not found",
        )

    event = item.event
    require_org_member(db, event.organization_id, current_user, ["owner", "admin"])

    new_start = data.starts_at if data.starts_at is not None else item.starts_at
    new_end = data.ends_at if data.ends_at is not None else item.ends_at
    if new_start >= new_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start time must be before end time.",
        )

    if data.meeting_url is not None:
        validate_http_url(data.meeting_url, "Meeting URL")
        item.meeting_url = data.meeting_url.strip() if data.meeting_url else None

    if data.title is not None:
        title_val = data.title.strip()
        if not title_val:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Title cannot be empty.",
            )
        item.title = title_val

    if data.description is not None:
        item.description = data.description.strip() if data.description else None
    if data.item_type is not None:
        item.item_type = data.item_type.strip()
    if data.venue is not None:
        item.venue = data.venue.strip() if data.venue else None
    if data.starts_at is not None:
        item.starts_at = data.starts_at
    if data.ends_at is not None:
        item.ends_at = data.ends_at
    if data.status is not None:
        if data.status not in ("scheduled", "cancelled"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid schedule status. Allowed: 'scheduled', 'cancelled'",
            )
        item.status = data.status

    item.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return EventScheduleItemRead.model_validate(item)


def delete_schedule_item(
    db: Session,
    item_id: uuid.UUID,
    current_user: User,
) -> None:
    """Soft-delete a schedule item by setting status to cancelled."""
    item = db.get(EventScheduleItem, item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule item not found",
        )

    require_org_member(db, item.event.organization_id, current_user, ["owner", "admin"])
    item.status = "cancelled"
    item.updated_at = datetime.now(timezone.utc)
    db.commit()

