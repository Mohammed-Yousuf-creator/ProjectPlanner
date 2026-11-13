import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.models.event import Event, EventMembership
from app.models.user import User, UserProfile
from app.schemas.checkin import CheckInAttendeeRead, CheckInSummaryRead
from app.services.organization_service import require_org_member


def list_event_checkins(
    db: Session,
    event_id: uuid.UUID,
    current_user: User,
    search: Optional[str] = None,
    checked_in: Optional[bool] = None,
    page: int = 1,
    page_size: int = 20,
) -> List[CheckInAttendeeRead]:
    """Return event attendees and their check-in status with search and filtering. Organizer only."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    require_org_member(db, event.organization_id, current_user, ["owner", "admin"])

    query = (
        select(EventMembership)
        .join(User, EventMembership.user_id == User.id)
        .outerjoin(UserProfile, User.id == UserProfile.user_id)
        .options(joinedload(EventMembership.user).joinedload(User.profile))
        .where(
            EventMembership.event_id == event_id,
            EventMembership.role == "participant",
            EventMembership.status.in_(["registered", "approved"]),
        )
    )

    if checked_in is True:
        query = query.where(EventMembership.checked_in_at.is_not(None))
    elif checked_in is False:
        query = query.where(EventMembership.checked_in_at.is_(None))

    if search:
        search_term = f"%{search.strip().lower()}%"
        query = query.where(
            or_(
                func.lower(User.username).like(search_term),
                func.lower(User.email).like(search_term),
                func.lower(UserProfile.display_name).like(search_term),
            )
        )

    query = query.order_by(EventMembership.registered_at.asc())
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    memberships = db.execute(query).scalars().all()
    results: List[CheckInAttendeeRead] = []
    for m in memberships:
        user = m.user
        display_name = user.profile.display_name if user.profile else None
        results.append(
            CheckInAttendeeRead(
                user_id=user.id,
                username=user.username,
                email=user.email,
                display_name=display_name,
                status=m.status,
                registered_at=m.registered_at,
                checked_in_at=m.checked_in_at,
            )
        )
    return results


def get_checkin_summary(
    db: Session,
    event_id: uuid.UUID,
    current_user: User,
) -> CheckInSummaryRead:
    """Return attendance metrics. Excludes withdrawn and rejected registrations."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    require_org_member(db, event.organization_id, current_user, ["owner", "admin"])

    base_query = select(EventMembership).where(
        EventMembership.event_id == event_id,
        EventMembership.role == "participant",
        EventMembership.status.in_(["registered", "approved"]),
    )

    total_eligible = (
        db.execute(
            select(func.count(EventMembership.id)).where(
                EventMembership.event_id == event_id,
                EventMembership.role == "participant",
                EventMembership.status.in_(["registered", "approved"]),
            )
        ).scalar_one()
        or 0
    )

    total_checked_in = (
        db.execute(
            select(func.count(EventMembership.id)).where(
                EventMembership.event_id == event_id,
                EventMembership.role == "participant",
                EventMembership.status.in_(["registered", "approved"]),
                EventMembership.checked_in_at.is_not(None),
            )
        ).scalar_one()
        or 0
    )

    total_not_checked_in = total_eligible - total_checked_in
    attendance_pct = (
        round((total_checked_in / total_eligible) * 100, 2)
        if total_eligible > 0
        else 0.0
    )

    return CheckInSummaryRead(
        total_eligible_registrations=total_eligible,
        total_checked_in=total_checked_in,
        total_not_checked_in=total_not_checked_in,
        attendance_percentage=attendance_pct,
    )


def check_in_participant_op(
    db: Session,
    event_id: uuid.UUID,
    participant_user_id: uuid.UUID,
    current_user: User,
) -> CheckInAttendeeRead:
    """Check in a participant. Prevents duplicate check-ins. Organizer only."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    require_org_member(db, event.organization_id, current_user, ["owner", "admin"])

    membership = (
        db.query(EventMembership)
        .options(joinedload(EventMembership.user).joinedload(User.profile))
        .filter(
            EventMembership.event_id == event_id,
            EventMembership.user_id == participant_user_id,
            EventMembership.role == "participant",
        )
        .first()
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Participant registration not found for this event.",
        )

    if membership.status not in ("registered", "approved"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot check in participant with status '{membership.status}'. Only registered or approved participants can be checked in.",
        )

    if membership.checked_in_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Participant is already checked in.",
        )

    now = datetime.now(timezone.utc)
    membership.checked_in_at = now
    membership.updated_at = now
    db.commit()
    db.refresh(membership)

    user = membership.user
    display_name = user.profile.display_name if user.profile else None
    return CheckInAttendeeRead(
        user_id=user.id,
        username=user.username,
        email=user.email,
        display_name=display_name,
        status=membership.status,
        registered_at=membership.registered_at,
        checked_in_at=membership.checked_in_at,
    )


def undo_check_in_participant(
    db: Session,
    event_id: uuid.UUID,
    participant_user_id: uuid.UUID,
    current_user: User,
) -> None:
    """Undo an accidental check-in by clearing checked_in_at. Organizer only."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    require_org_member(db, event.organization_id, current_user, ["owner", "admin"])

    membership = (
        db.query(EventMembership)
        .filter(
            EventMembership.event_id == event_id,
            EventMembership.user_id == participant_user_id,
            EventMembership.role == "participant",
        )
        .first()
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Participant registration not found for this event.",
        )

    membership.checked_in_at = None
    membership.updated_at = datetime.now(timezone.utc)
    db.commit()

