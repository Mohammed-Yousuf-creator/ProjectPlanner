import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.team import Team
    from app.models.user import User


class Event(Base):
    __tablename__ = "events"

    __table_args__ = (
        UniqueConstraint("organization_id", "slug", name="uq_events_org_slug"),
        CheckConstraint(
            "format IN ('online', 'offline', 'hybrid')",
            name="ck_events_format",
        ),
        CheckConstraint(
            "status IN ('draft', 'published', 'registration_open', 'in_progress', 'completed', 'cancelled')",
            name="ck_events_status",
        ),
        CheckConstraint(
            "visibility IN ('public', 'private', 'unlisted')",
            name="ck_events_visibility",
        ),
        CheckConstraint("min_team_size >= 1", name="ck_events_min_team_size"),
        CheckConstraint(
            "max_team_size >= min_team_size", name="ck_events_max_team_size"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    short_description: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    format: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="draft"
    )
    visibility: Mapped[str] = mapped_column(
        String(50), nullable=False, default="public"
    )

    starts_at: Mapped[Optional[datetime]] = mapped_column(
        UTCDateTime, nullable=True
    )
    ends_at: Mapped[Optional[datetime]] = mapped_column(
        UTCDateTime, nullable=True
    )
    registration_opens_at: Mapped[Optional[datetime]] = mapped_column(
        UTCDateTime, nullable=True
    )
    registration_closes_at: Mapped[Optional[datetime]] = mapped_column(
        UTCDateTime, nullable=True
    )
    submission_deadline_at: Mapped[Optional[datetime]] = mapped_column(
        UTCDateTime, nullable=True
    )

    timezone: Mapped[str] = mapped_column(String(100), nullable=False)
    venue_name: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    min_team_size: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1
    )
    max_team_size: Mapped[int] = mapped_column(
        Integer, nullable=False, default=4
    )

    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    organization: Mapped["Organization"] = relationship(
        "Organization", back_populates="events"
    )
    created_by_user: Mapped["User"] = relationship(
        "User", foreign_keys=[created_by_user_id]
    )
    memberships: Mapped[List["EventMembership"]] = relationship(
        "EventMembership",
        back_populates="event",
        cascade="all, delete-orphan",
    )
    tracks: Mapped[List["EventTrack"]] = relationship(
        "EventTrack",
        back_populates="event",
        cascade="all, delete-orphan",
    )
    teams: Mapped[List["Team"]] = relationship(
        "Team",
        back_populates="event",
        cascade="all, delete-orphan",
    )


class EventMembership(Base):
    __tablename__ = "event_memberships"

    __table_args__ = (
        UniqueConstraint(
            "event_id", "user_id", name="uq_event_memberships_event_user"
        ),
        CheckConstraint(
            "role IN ('participant', 'judge', 'mentor')",
            name="ck_event_memberships_role",
        ),
        CheckConstraint(
            "status IN ('registered', 'approved', 'waitlisted', 'rejected', 'withdrawn')",
            name="ck_event_memberships_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="registered"
    )
    registration_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSON, nullable=True
    )
    registered_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    checked_in_at: Mapped[Optional[datetime]] = mapped_column(
        UTCDateTime, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    event: Mapped["Event"] = relationship("Event", back_populates="memberships")
    user: Mapped["User"] = relationship(
        "User", back_populates="event_memberships"
    )


class EventTrack(Base):
    __tablename__ = "event_tracks"

    __table_args__ = (
        UniqueConstraint("event_id", "name", name="uq_event_tracks_event_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    event: Mapped["Event"] = relationship("Event", back_populates="tracks")

