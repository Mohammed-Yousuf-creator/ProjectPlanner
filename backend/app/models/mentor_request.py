import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.event import Event
    from app.models.team import Team
    from app.models.user import User


class MentorRequest(Base):
    __tablename__ = "mentor_requests"

    __table_args__ = (
        CheckConstraint(
            "priority IN ('low', 'normal', 'high')",
            name="ck_mentor_requests_priority",
        ),
        CheckConstraint(
            "status IN ('pending', 'assigned', 'in_progress', 'resolved', 'rejected', 'cancelled')",
            name="ck_mentor_requests_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    requested_by_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    team_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    assigned_mentor_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    topic: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[str] = mapped_column(
        String(50), nullable=False, default="normal"
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending", index=True
    )
    resolution_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(
        UTCDateTime, nullable=True
    )

    # Relationships
    event: Mapped["Event"] = relationship(
        "Event", back_populates="mentor_requests"
    )
    requested_by_user: Mapped["User"] = relationship(
        "User", foreign_keys=[requested_by_user_id]
    )
    team: Mapped[Optional["Team"]] = relationship("Team")
    assigned_mentor_user: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[assigned_mentor_user_id]
    )

