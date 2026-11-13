import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.event import Event, EventTrack
from app.models.organization import Organization
from app.models.user import User
from app.schemas.event import (
    EventCreate,
    EventTrackCreate,
    EventTrackUpdate,
    EventUpdate,
)
from app.services.organization_service import (
    get_member_in_org,
    require_org_member,
    slugify,
)


def create_event(
    db: Session, org_id: uuid.UUID, current_user: User, data: EventCreate
) -> Event:
    """Create a new draft event under an organization."""
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    # Only owners/admins can create events
    require_org_member(db, org_id, current_user, allowed_roles=["owner", "admin"])

    # Organization must be of type 'organizer' or 'both'
    if org.organization_type not in ("organizer", "both"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization cannot create events. Organization type must be 'organizer' or 'both'",
        )

    slug = data.slug.strip() if data.slug else slugify(data.name)
    if not slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not generate a valid slug from event name",
        )

    # Check unique constraint on (organization_id, slug)
    existing = db.execute(
        select(Event).where(
            Event.organization_id == org_id,
            Event.slug == slug,
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An event with slug '{slug}' already exists in this organization",
        )

    # Additional date validations
    if data.starts_at and data.ends_at and data.ends_at <= data.starts_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Event end date must be strictly after start date",
        )
    if (
        data.registration_opens_at
        and data.registration_closes_at
        and data.registration_closes_at <= data.registration_opens_at
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration close date must be after registration open date",
        )
    if data.submission_deadline_at and data.ends_at and data.submission_deadline_at > data.ends_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submission deadline cannot be after the event end date",
        )

    event_id = uuid.uuid4()
    event = Event(
        id=event_id,
        organization_id=org_id,
        created_by_user_id=current_user.id,
        name=data.name.strip(),
        slug=slug,
        short_description=data.short_description.strip() if data.short_description else None,
        description=data.description.strip() if data.description else None,
        event_type=data.event_type.strip(),
        format=data.format,
        status="draft",  # New events always start as draft
        visibility=data.visibility,
        starts_at=data.starts_at,
        ends_at=data.ends_at,
        registration_opens_at=data.registration_opens_at,
        registration_closes_at=data.registration_closes_at,
        submission_deadline_at=data.submission_deadline_at,
        timezone=data.timezone.strip(),
        venue_name=data.venue_name.strip() if data.venue_name else None,
        address=data.address.strip() if data.address else None,
        city=data.city.strip() if data.city else None,
        country=data.country.strip() if data.country else None,
        min_team_size=data.min_team_size,
        max_team_size=data.max_team_size,
    )

    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def get_organization_events(
    db: Session, org_id: uuid.UUID, current_user: User
) -> List[Event]:
    """Return all events for an organization. Active organization members can see all events including drafts."""
    require_org_member(db, org_id, current_user)

    events = db.execute(
        select(Event)
        .where(Event.organization_id == org_id)
        .order_by(Event.created_at.desc())
    ).scalars().all()
    return list(events)


def get_event_details(
    db: Session, event_id: uuid.UUID, current_user: Optional[User]
) -> Event:
    """Return event details checking public visibility or organization membership."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    # Public published events can be viewed by anyone
    if event.status == "published" and event.visibility == "public":
        return event

    # For drafts, cancelled, or private events, check if current_user is an active member
    if current_user is not None:
        membership = get_member_in_org(db, event.organization_id, current_user.id)
        if membership and membership.status == "active":
            return event

    # Otherwise access is denied to unrelated users
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Event not found or not accessible",
    )


def update_event(
    db: Session, event_id: uuid.UUID, current_user: User, data: EventUpdate
) -> Event:
    """Update event information. Only organization owners and admins can update."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    require_org_member(
        db, event.organization_id, current_user, allowed_roles=["owner", "admin"]
    )

    update_dict = data.model_dump(exclude_unset=True)

    # Validate slug uniqueness if updated
    if "slug" in update_dict and update_dict["slug"]:
        new_slug = update_dict["slug"].strip()
        if new_slug != event.slug:
            existing = db.execute(
                select(Event).where(
                    Event.organization_id == event.organization_id,
                    Event.slug == new_slug,
                )
            ).scalar_one_or_none()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"An event with slug '{new_slug}' already exists in this organization",
                )
            event.slug = new_slug

    # Validate team sizes
    min_size = update_dict.get("min_team_size", event.min_team_size)
    max_size = update_dict.get("max_team_size", event.max_team_size)
    if min_size < 1 or max_size < min_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid team size range: max_team_size must be >= min_team_size >= 1",
        )

    # Validate dates
    starts_at = update_dict.get("starts_at", event.starts_at)
    ends_at = update_dict.get("ends_at", event.ends_at)
    if starts_at and ends_at and ends_at <= starts_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Event end date must be strictly after start date",
        )

    reg_open = update_dict.get("registration_opens_at", event.registration_opens_at)
    reg_close = update_dict.get("registration_closes_at", event.registration_closes_at)
    if reg_open and reg_close and reg_close <= reg_open:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration close date must be after registration open date",
        )

    sub_deadline = update_dict.get("submission_deadline_at", event.submission_deadline_at)
    if sub_deadline and ends_at and sub_deadline > ends_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submission deadline cannot be after event end date",
        )

    for field, value in update_dict.items():
        if field == "slug":
            continue
        if isinstance(value, str):
            setattr(event, field, value.strip())
        else:
            setattr(event, field, value)

    event.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(event)
    return event


def publish_event(
    db: Session, event_id: uuid.UUID, current_user: User
) -> Event:
    """Publish an event. Only organization owners and admins can publish drafts."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    require_org_member(
        db, event.organization_id, current_user, allowed_roles=["owner", "admin"]
    )

    if event.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot publish event in '{event.status}' status. Only draft events can be published",
        )

    # Validate essential event information
    missing_fields = []
    if not event.starts_at:
        missing_fields.append("starts_at")
    if not event.ends_at:
        missing_fields.append("ends_at")
    if not event.timezone:
        missing_fields.append("timezone")
    if not event.format:
        missing_fields.append("format")

    if event.format in ("offline", "hybrid"):
        if not (event.venue_name or event.address or event.city):
            missing_fields.append("venue_name, address, or city (required for offline/hybrid events)")

    if missing_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot publish event. Missing required information: {', '.join(missing_fields)}",
        )

    event.status = "published"
    event.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(event)
    return event


def cancel_event(
    db: Session, event_id: uuid.UUID, current_user: User
) -> Event:
    """Cancel an event. Only organization owners and admins can cancel."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    require_org_member(
        db, event.organization_id, current_user, allowed_roles=["owner", "admin"]
    )

    if event.status == "cancelled":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Event is already cancelled",
        )

    event.status = "cancelled"
    event.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(event)
    return event


def list_public_events(
    db: Session,
    event_type: Optional[str] = None,
    event_format: Optional[str] = None,
    city: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
) -> List[Event]:
    """Return publicly visible published events using efficient SQL filtering and pagination."""
    query = (
        select(Event)
        .where(
            Event.status == "published",
            Event.visibility == "public",
        )
    )

    if event_type:
        query = query.where(Event.event_type == event_type.strip())
    if event_format:
        query = query.where(Event.format == event_format.strip().lower())
    if city:
        query = query.where(func.lower(Event.city) == city.strip().lower())

    query = query.order_by(Event.starts_at.asc(), Event.created_at.desc())
    query = query.limit(limit).offset(offset)

    events = db.execute(query).scalars().all()
    return list(events)


# ---------------- Tracks Management ----------------


def create_track(
    db: Session, event_id: uuid.UUID, current_user: User, data: EventTrackCreate
) -> EventTrack:
    """Create a track for an event."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    require_org_member(
        db, event.organization_id, current_user, allowed_roles=["owner", "admin"]
    )

    name = data.name.strip()
    existing = db.execute(
        select(EventTrack).where(
            EventTrack.event_id == event_id,
            EventTrack.name == name,
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Track with name '{name}' already exists in this event",
        )

    track = EventTrack(
        id=uuid.uuid4(),
        event_id=event_id,
        name=name,
        description=data.description.strip() if data.description else None,
    )
    db.add(track)
    db.commit()
    db.refresh(track)
    return track


def get_event_tracks(
    db: Session, event_id: uuid.UUID, current_user: Optional[User]
) -> List[EventTrack]:
    """Return tracks for an event if the caller has permission to view the event."""
    # Enforce event visibility permissions
    get_event_details(db, event_id, current_user)

    tracks = db.execute(
        select(EventTrack)
        .where(EventTrack.event_id == event_id)
        .order_by(EventTrack.name.asc())
    ).scalars().all()
    return list(tracks)


def update_track(
    db: Session, track_id: uuid.UUID, current_user: User, data: EventTrackUpdate
) -> EventTrack:
    """Update track name or description."""
    track = db.get(EventTrack, track_id)
    if not track:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Track not found",
        )

    event = db.get(Event, track.event_id)
    require_org_member(
        db, event.organization_id, current_user, allowed_roles=["owner", "admin"]
    )

    update_dict = data.model_dump(exclude_unset=True)

    if "name" in update_dict and update_dict["name"] is not None:
        new_name = update_dict["name"].strip()
        if new_name != track.name:
            existing = db.execute(
                select(EventTrack).where(
                    EventTrack.event_id == track.event_id,
                    EventTrack.name == new_name,
                )
            ).scalar_one_or_none()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Track with name '{new_name}' already exists in this event",
                )
            track.name = new_name

    if "description" in update_dict:
        track.description = update_dict["description"].strip() if update_dict["description"] else None

    db.commit()
    db.refresh(track)
    return track


def delete_track(
    db: Session, track_id: uuid.UUID, current_user: User
) -> None:
    """Delete a track."""
    track = db.get(EventTrack, track_id)
    if not track:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Track not found",
        )

    event = db.get(Event, track.event_id)
    require_org_member(
        db, event.organization_id, current_user, allowed_roles=["owner", "admin"]
    )

    db.delete(track)
    db.commit()

