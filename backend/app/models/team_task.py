import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.team import Team
    from app.models.user import User


class TeamTask(Base):
    __tablename__ = "team_tasks"

    __table_args__ = (
        CheckConstraint(
            "status IN ('todo', 'in_progress', 'review', 'done')",
            name="ck_team_tasks_status",
        ),
        CheckConstraint(
            "priority IN ('low', 'medium', 'high', 'urgent')",
            name="ck_team_tasks_priority",
        ),
        Index("ix_team_tasks_team_status", "team_id", "status"),
        Index("ix_team_tasks_team_position", "team_id", "position"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    team_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="todo"
    )
    priority: Mapped[str] = mapped_column(
        String(50), nullable=False, default="medium"
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    due_at: Mapped[Optional[datetime]] = mapped_column(
        UTCDateTime, nullable=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_at: Mapped[Optional[datetime]] = mapped_column(
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
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        UTCDateTime, nullable=True, index=True
    )

    # Relationships
    team: Mapped["Team"] = relationship("Team", back_populates="tasks")
    created_by_user: Mapped["User"] = relationship(
        "User", foreign_keys=[created_by_user_id]
    )
    assignees: Mapped[List["TeamTaskAssignee"]] = relationship(
        "TeamTaskAssignee",
        back_populates="task",
        cascade="all, delete-orphan",
    )


class TeamTaskAssignee(Base):
    __tablename__ = "team_task_assignees"

    task_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("team_tasks.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    assigned_by_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    assigned_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    task: Mapped["TeamTask"] = relationship("TeamTask", back_populates="assignees")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    assigned_by_user: Mapped["User"] = relationship(
        "User", foreign_keys=[assigned_by_user_id]
    )

