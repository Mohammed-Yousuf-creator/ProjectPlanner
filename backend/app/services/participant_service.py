import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.event import Event, EventMembership, EventTrack
from app.models.organization import Organization
from app.models.user import User
from app.schemas.event import EventRead, EventTrackRead
from app.schemas.organization import OrganizationRead
from app.schemas.participant import (
    ParticipantDashboardResponse,
    ParticipantEventItem,
    ParticipantRegisteredEventDetail,
    ParticipantRegistrationRead,
    ParticipantSummary,
    ParticipantUserInfo,
)


def list_my_registrations(
    db: Session, current_user: User
) -> List[ParticipantRegistrationRead]:
    """Return active registrations belonging to the authenticated user."""
    query = (
        select(EventMembership)
        .options(
            joinedload(EventMembership.event).joinedload(Event.organization)
        )
        .where(
            EventMembership.user_id == current_user.id,
            EventMembership.role == "participant",
            EventMembership.status.in_(["registered", "approved", "waitlisted"]),
        )
        .order_by(EventMembership.registered_at.desc())
    )

    memberships = db.execute(query).scalars().all()

    results: List[ParticipantRegistrationRead] = []
    for m in memberships:
        event = m.event
        org_name = event.organization.name if event.organization else ""
        results.append(
            ParticipantRegistrationRead(
                membership_id=m.id,
                event_id=event.id,
                event_name=event.name,
                event_description=event.description,
                event_type=event.event_type,
                event_format=event.format,
                event_status=event.status,
                starts_at=event.starts_at,
                ends_at=event.ends_at,
                city=event.city,
                country=event.country,
                organization_name=org_name,
                registration_status=m.status,
                registered_at=m.registered_at,
                checked_in_at=m.checked_in_at,
            )
        )
    return results


def get_participant_dashboard(
    db: Session, current_user: User
) -> ParticipantDashboardResponse:
    """Return structured participant dashboard containing user info, counts, and categorized events."""
    display_name = (
        current_user.profile.display_name
        if current_user.profile
        else current_user.username
    )
    avatar_url = current_user.profile.avatar_url if current_user.profile else None
    headline = current_user.profile.headline if current_user.profile else None

    user_info = ParticipantUserInfo(
        user_id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        display_name=display_name,
        avatar_url=avatar_url,
        headline=headline,
    )

    query = (
        select(EventMembership)
        .options(
            joinedload(EventMembership.event).joinedload(Event.organization)
        )
        .where(
            EventMembership.user_id == current_user.id,
            EventMembership.role == "participant",
            EventMembership.status.in_(["registered", "approved", "waitlisted"]),
        )
    )

    memberships = db.execute(query).scalars().all()

    now = datetime.now(timezone.utc)

    upcoming_events: List[ParticipantEventItem] = []
    ongoing_events: List[ParticipantEventItem] = []
    completed_events: List[ParticipantEventItem] = []
    waitlisted_events: List[ParticipantEventItem] = []

    for m in memberships:
        event = m.event
        org_name = event.organization.name if event.organization else ""
        item = ParticipantEventItem(
            membership_id=m.id,
            event_id=event.id,
            event_name=event.name,
            event_slug=event.slug,
            event_type=event.event_type,
            event_format=event.format,
            event_status=event.status,
            starts_at=event.starts_at,
            ends_at=event.ends_at,
            city=event.city,
            country=event.country,
            organization_name=org_name,
            registration_status=m.status,
            registered_at=m.registered_at,
            checked_in_at=m.checked_in_at,
        )

        if m.status == "waitlisted":
            waitlisted_events.append(item)
        elif event.status == "completed" or (event.ends_at and now > event.ends_at):
            completed_events.append(item)
        elif (
            (event.starts_at and now >= event.starts_at and (not event.ends_at or now <= event.ends_at))
            or event.status == "in_progress"
        ):
            ongoing_events.append(item)
        else:
            upcoming_events.append(item)

    summary = ParticipantSummary(
        total_active_registrations=(
            len(upcoming_events)
            + len(ongoing_events)
            + len(completed_events)
            + len(waitlisted_events)
        ),
        upcoming_events_count=len(upcoming_events),
        ongoing_events_count=len(ongoing_events),
        completed_events_count=len(completed_events),
        waitlisted_events_count=len(waitlisted_events),
    )

    return ParticipantDashboardResponse(
        user=user_info,
        summary=summary,
        upcoming_events=upcoming_events,
        ongoing_events=ongoing_events,
        completed_events=completed_events,
        waitlisted_events=waitlisted_events,
    )


def get_registered_event_detail(
    db: Session, event_id: uuid.UUID, current_user: User
) -> ParticipantRegisteredEventDetail:
    """Return detailed information about an event the user is actively registered for."""
    query = (
        select(EventMembership)
        .options(
            joinedload(EventMembership.event).joinedload(Event.organization),
            joinedload(EventMembership.event).selectinload(Event.tracks),
        )
        .where(
            EventMembership.event_id == event_id,
            EventMembership.user_id == current_user.id,
        )
    )

    membership = db.execute(query).scalar_one_or_none()

    if not membership or membership.status in ("withdrawn", "rejected"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have an active registration for this event",
        )

    event = membership.event
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    tracks = [EventTrackRead.model_validate(t) for t in (event.tracks or [])]

    return ParticipantRegisteredEventDetail(
        event=EventRead.model_validate(event),
        organization=OrganizationRead.model_validate(event.organization),
        registration_status=membership.status,
        registered_at=membership.registered_at,
        checked_in_at=membership.checked_in_at,
        registration_data=membership.registration_data,
        tracks=tracks,
    )

