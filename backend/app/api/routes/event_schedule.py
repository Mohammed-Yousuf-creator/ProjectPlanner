import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_optional_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.event_schedule import (
    EventScheduleItemCreate,
    EventScheduleItemRead,
    EventScheduleItemUpdate,
)
from app.services.event_schedule_service import (
    create_schedule_item,
    delete_schedule_item,
    list_event_schedule,
    update_schedule_item,
)

router = APIRouter()


@router.post(
    "/events/{event_id}/schedule",
    response_model=EventScheduleItemRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create schedule item",
)
def create_schedule_item_endpoint(
    event_id: uuid.UUID,
    data: EventScheduleItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EventScheduleItemRead:
    """Create a schedule item. Organizer only."""
    return create_schedule_item(db, event_id, current_user, data)


@router.get(
    "/events/{event_id}/schedule",
    response_model=List[EventScheduleItemRead],
    summary="Get event schedule",
)
def list_event_schedule_endpoint(
    event_id: uuid.UUID,
    include_cancelled: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
) -> List[EventScheduleItemRead]:
    """Return chronological schedule items for members, public visitors (if public), or organizers."""
    return list_event_schedule(
        db, event_id, current_user, include_cancelled=include_cancelled
    )


@router.patch(
    "/schedule/{item_id}",
    response_model=EventScheduleItemRead,
    summary="Update schedule item",
)
def update_schedule_item_endpoint(
    item_id: uuid.UUID,
    data: EventScheduleItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EventScheduleItemRead:
    """Update a schedule item. Organizer only."""
    return update_schedule_item(db, item_id, current_user, data)


@router.delete(
    "/schedule/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cancel schedule item",
)
def delete_schedule_item_endpoint(
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Soft-delete a schedule item by setting status to cancelled."""
    delete_schedule_item(db, item_id, current_user)

