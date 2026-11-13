import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    ForeignKey,
    Index,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.stored_file import StoredFile
    from app.models.team import Team
    from app.models.user import User


class TeamMessage(Base):
    __tablename__ = "team_messages"

    __table_args__ = (
        Index("ix_team_messages_team_created", "team_id", "created_at"),
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
    sender_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    edited_at: Mapped[Optional[datetime]] = mapped_column(
        UTCDateTime, nullable=True
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        UTCDateTime, nullable=True, index=True
    )

    # Relationships
    team: Mapped["Team"] = relationship("Team", back_populates="messages")
    sender: Mapped["User"] = relationship(
        "User", foreign_keys=[sender_user_id]
    )
    attachments: Mapped[List["TeamMessageAttachment"]] = relationship(
        "TeamMessageAttachment",
        back_populates="message",
        cascade="all, delete-orphan",
    )


class TeamMessageAttachment(Base):
    __tablename__ = "team_message_attachments"

    __table_args__ = (
        UniqueConstraint("file_id", name="uq_team_message_attachments_file_id"),
        UniqueConstraint(
            "message_id", "file_id", name="uq_team_message_attachments_msg_file"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    message_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("team_messages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("stored_files.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    message: Mapped["TeamMessage"] = relationship(
        "TeamMessage", back_populates="attachments"
    )
    file: Mapped["StoredFile"] = relationship(
        "StoredFile", back_populates="attachment"
    )

