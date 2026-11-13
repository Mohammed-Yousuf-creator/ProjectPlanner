import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.event import Event
    from app.models.stored_file import StoredFile
    from app.models.team_message import TeamMessage
    from app.models.team_task import TeamTask
    from app.models.user import User


class Team(Base):
    __tablename__ = "teams"

    __table_args__ = (
        UniqueConstraint("event_id", "name", name="uq_teams_event_name"),
        CheckConstraint(
            "status IN ('forming', 'active', 'submitted', 'disbanded')",
            name="ck_teams_status",
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
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="forming"
    )
    join_code_hash: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

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
    event: Mapped["Event"] = relationship("Event", back_populates="teams")
    created_by_user: Mapped["User"] = relationship(
        "User", foreign_keys=[created_by_user_id]
    )
    members: Mapped[List["TeamMember"]] = relationship(
        "TeamMember",
        back_populates="team",
        cascade="all, delete-orphan",
    )
    invitations: Mapped[List["TeamInvitation"]] = relationship(
        "TeamInvitation",
        back_populates="team",
        cascade="all, delete-orphan",
    )
    tasks: Mapped[List["TeamTask"]] = relationship(
        "TeamTask",
        back_populates="team",
        cascade="all, delete-orphan",
    )
    messages: Mapped[List["TeamMessage"]] = relationship(
        "TeamMessage",
        back_populates="team",
        cascade="all, delete-orphan",
    )
    files: Mapped[List["StoredFile"]] = relationship(
        "StoredFile",
        back_populates="team",
        cascade="all, delete-orphan",
    )


class TeamMember(Base):
    __tablename__ = "team_members"

    __table_args__ = (
        UniqueConstraint("team_id", "user_id", name="uq_team_members_team_user"),
        CheckConstraint(
            "role IN ('owner', 'lead', 'member')",
            name="ck_team_members_role",
        ),
        CheckConstraint(
            "status IN ('active', 'left')",
            name="ck_team_members_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    team_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(
        String(50), nullable=False, default="member"
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="active"
    )
    joined_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    left_at: Mapped[Optional[datetime]] = mapped_column(
        UTCDateTime, nullable=True
    )

    # Relationships
    team: Mapped["Team"] = relationship("Team", back_populates="members")
    user: Mapped["User"] = relationship(
        "User", back_populates="team_memberships"
    )


class TeamInvitation(Base):
    __tablename__ = "team_invitations"

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'accepted', 'rejected', 'expired', 'cancelled')",
            name="ck_team_invitations_status",
        ),
        CheckConstraint(
            "(invitee_user_id IS NOT NULL AND invitee_email IS NULL) OR "
            "(invitee_user_id IS NULL AND invitee_email IS NOT NULL)",
            name="ck_team_invitations_target",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    team_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
    )
    invited_by_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    invitee_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
    )
    invitee_email: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    invitation_code_hash: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending"
    )
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    responded_at: Mapped[Optional[datetime]] = mapped_column(
        UTCDateTime, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    team: Mapped["Team"] = relationship("Team", back_populates="invitations")
    invited_by_user: Mapped["User"] = relationship(
        "User", foreign_keys=[invited_by_user_id]
    )
    invitee_user: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[invitee_user_id]
    )

