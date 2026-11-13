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


class Announcement(Base):
    __tablename__ = "announcements"

    __table_args__ = (
        CheckConstraint(
            "audience_type IN ('all', 'participants', 'judges', 'mentors', 'team')",
            name="ck_announcements_audience_type",
        ),
        CheckConstraint(
            "status IN ('draft', 'published', 'withdrawn')",
            name="ck_announcements_status",
        ),
        CheckConstraint(
            "(audience_type = 'team' AND target_team_id IS NOT NULL) OR "
            "(audience_type != 'team' AND target_team_id IS NULL)",
            name="ck_announcements_audience_team",
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
    author_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    audience_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_team_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="draft"
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(
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
    event: Mapped["Event"] = relationship(
        "Event", back_populates="announcements"
    )
    author_user: Mapped["User"] = relationship(
        "User", foreign_keys=[author_user_id]
    )
    target_team: Mapped[Optional["Team"]] = relationship("Team")

