import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    BigInteger,
    ForeignKey,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.team import Team
    from app.models.team_message import TeamMessageAttachment
    from app.models.user import User


class StoredFile(Base):
    __tablename__ = "stored_files"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    team_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    uploaded_by_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    storage_provider: Mapped[str] = mapped_column(
        String(50), nullable=False, default="local"
    )
    storage_key: Mapped[str] = mapped_column(
        Text, unique=True, nullable=False, index=True
    )
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    checksum_sha256: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        UTCDateTime, nullable=True, index=True
    )

    # Relationships
    team: Mapped["Team"] = relationship("Team", back_populates="files")
    uploaded_by_user: Mapped["User"] = relationship(
        "User", foreign_keys=[uploaded_by_user_id]
    )
    attachment: Mapped[Optional["TeamMessageAttachment"]] = relationship(
        "TeamMessageAttachment",
        back_populates="file",
        uselist=False,
    )

