import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.event import Event, EventMembership
from app.models.user import User, UserProfile
from app.schemas.registration import (
    EventRegisterRequest,
    OrganizerParticipantRead,
)
from app.services.organization_service import require_org_member


def register_for_event(
    db: Session,
    event_id: uuid.UUID,
    current_user: User,
    data: Optional[EventRegisterRequest] = None,
) -> EventMembership:
    """Register the authenticated user for an event or reactivate a previously withdrawn registration."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    # Only allow registration for events that are publicly visible
    if event.visibility != "public":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is not available for private events",
        )

    # Status checks: allow published and registration_open
    if event.status == "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot register for draft events",
        )
    if event.status == "cancelled":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot register for cancelled events",
        )
    if event.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot register for completed events",
        )
    if event.status not in ("published", "registration_open"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot register for event with status '{event.status}'",
        )

    now = datetime.now(timezone.utc)

    # Date checks using UTC
    if event.registration_opens_at and now < event.registration_opens_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration has not opened yet",
        )
    if event.registration_closes_at and now > event.registration_closes_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration is closed",
        )
    if event.starts_at and now > event.starts_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration is closed because the event has already started",
        )

    # Check for existing registration
    existing = db.execute(
        select(EventMembership).where(
            EventMembership.event_id == event_id,
            EventMembership.user_id == current_user.id,
        )
    ).scalar_one_or_none()

    reg_data = data.registration_data if data else None

    if existing:
        if existing.status in ("registered", "approved", "waitlisted"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You are already registered for this event",
            )
        elif existing.status == "rejected":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your registration was previously rejected. Please contact event organizers.",
            )
        elif existing.status == "withdrawn":
            # Reactivate the existing membership record without creating a new row
            existing.status = "registered"
            existing.role = "participant"
            existing.registered_at = now
            existing.updated_at = now
            if reg_data is not None:
                existing.registration_data = reg_data
            db.commit()
            db.refresh(existing)
            return existing
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot register with current status '{existing.status}'",
            )

    # Create new membership
    membership = EventMembership(
        id=uuid.uuid4(),
        event_id=event_id,
        user_id=current_user.id,
        role="participant",
        status="registered",
        registration_data=reg_data,
        registered_at=now,
        created_at=now,
        updated_at=now,
    )

    db.add(membership)
    db.commit()
    db.refresh(membership)
    return membership


def withdraw_registration(
    db: Session, event_id: uuid.UUID, current_user: User
) -> EventMembership:
    """Withdraw the authenticated user's registration for an event."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    membership = db.execute(
        select(EventMembership).where(
            EventMembership.event_id == event_id,
            EventMembership.user_id == current_user.id,
        )
    ).scalar_one_or_none()

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registration not found for this event",
        )

    if membership.status == "withdrawn":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration is already withdrawn",
        )

    if membership.status == "rejected":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot withdraw a rejected registration",
        )

    membership.status = "withdrawn"
    membership.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(membership)
    return membership


def list_event_participants(
    db: Session,
    event_id: uuid.UUID,
    current_user: User,
    status_filter: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
) -> List[OrganizerParticipantRead]:
    """Allow authorized organizers to view event registrations with filtering and search."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    # Verify organizer permissions (owner or admin of event's organization)
    require_org_member(
        db, event.organization_id, current_user, allowed_roles=["owner", "admin"]
    )

    query = (
        select(EventMembership)
        .options(
            joinedload(EventMembership.user).selectinload(User.profile)
        )
        .where(
            EventMembership.event_id == event_id,
            EventMembership.role == "participant",
        )
    )

    if status_filter:
        query = query.where(EventMembership.status == status_filter.strip().lower())

    if search:
        search_term = f"%{search.strip().lower()}%"
        query = query.join(EventMembership.user).where(
            or_(
                func.lower(User.username).like(search_term),
                func.lower(User.email).like(search_term),
            )
        )

    query = query.order_by(EventMembership.registered_at.desc())
    query = query.limit(limit).offset(offset)

    memberships = db.execute(query).scalars().all()

    results: List[OrganizerParticipantRead] = []
    for m in memberships:
        user = m.user
        display_name = user.profile.display_name if user.profile else user.username
        results.append(
            OrganizerParticipantRead(
                membership_id=m.id,
                user_id=m.user_id,
                username=user.username,
                display_name=display_name,
                email=user.email,
                role=m.role,
                status=m.status,
                registered_at=m.registered_at,
                checked_in_at=m.checked_in_at,
                registration_data=m.registration_data,
            )
        )
    return results


def update_participant_status(
    db: Session,
    event_id: uuid.UUID,
    participant_user_id: uuid.UUID,
    current_user: User,
    new_status: str,
) -> EventMembership:
    """Allow authorized organizers to update participant registration status."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    require_org_member(
        db, event.organization_id, current_user, allowed_roles=["owner", "admin"]
    )

    membership = db.execute(
        select(EventMembership).where(
            EventMembership.event_id == event_id,
            EventMembership.user_id == participant_user_id,
            EventMembership.role == "participant",
        )
    ).scalar_one_or_none()

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Participant registration not found",
        )

    if membership.status == "withdrawn":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot update status of a withdrawn registration",
        )

    membership.status = new_status
    membership.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(membership)
    return membership


def check_in_participant(
    db: Session,
    event_id: uuid.UUID,
    participant_user_id: uuid.UUID,
    current_user: User,
) -> EventMembership:
    """Allow authorized organizers to mark a registered or approved participant as checked in."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    require_org_member(
        db, event.organization_id, current_user, allowed_roles=["owner", "admin"]
    )

    membership = db.execute(
        select(EventMembership).where(
            EventMembership.event_id == event_id,
            EventMembership.user_id == participant_user_id,
            EventMembership.role == "participant",
        )
    ).scalar_one_or_none()

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Participant registration not found",
        )

    # Reject check-ins for rejected, withdrawn, or waitlisted memberships
    if membership.status not in ("registered", "approved"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot check in participant with status '{membership.status}'. Only registered or approved participants can be checked in.",
        )

    now = datetime.now(timezone.utc)
    membership.checked_in_at = now
    membership.updated_at = now
    db.commit()
    db.refresh(membership)
    return membership

