import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.user import User


class UserSkill(Base):
    """One skill a user can be matched on.

    `name` stores the **normalised** form (see
    `app.services.skill_matching.normalize_skill`) so that "React.js" and
    "react js" cannot create two rows for the same skill. `label` keeps the
    text the user actually typed, so the UI can show it back verbatim.

    Proficiency is an optional 1-5 self-rating. It refines ordering inside an
    equal-skill match but never overrides coverage: a team missing a designer
    should still prefer a level-2 designer over a level-5 duplicate.
    """

    __tablename__ = "user_skills"

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_user_skills_user_name"),
        CheckConstraint(
            "proficiency BETWEEN 1 AND 5",
            name="ck_user_skills_proficiency",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Normalised key used by the matcher.
    name: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    # Original casing/wording for display.
    label: Mapped[str] = mapped_column(String(80), nullable=False)
    proficiency: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    user: Mapped["User"] = relationship("User", back_populates="skills")


class AiConversation(Base):
    """A chat thread with the platform assistant.

    Scoped to a user (not an event) because the assistant is a general guide;
    `event_id` is an optional context anchor so answers can be specific to the
    event the user was looking at when they opened the panel.
    """

    __tablename__ = "ai_conversations"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("events.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="New chat")
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    messages: Mapped[List["AiMessage"]] = relationship(
        "AiMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="AiMessage.created_at",
    )


class AiMessage(Base):
    """One turn in an assistant conversation.

    `role` is `user` or `assistant`. Assistant turns record whether they came
    from Gemini (`source == "gemini"`) or from the offline fallback
    (`source == "fallback"`), so the UI can be honest about degraded answers
    instead of passing canned text off as a model response.
    """

    __tablename__ = "ai_messages"

    __table_args__ = (
        CheckConstraint(
            "role IN ('user', 'assistant')",
            name="ck_ai_messages_role",
        ),
        CheckConstraint(
            "source IN ('gemini', 'fallback')",
            name="ck_ai_messages_source",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("ai_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="gemini")
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    conversation: Mapped["AiConversation"] = relationship(
        "AiConversation", back_populates="messages"
    )


class SubmissionSummary(Base):
    """A cached AI overview of one project submission.

    Generated content is expensive and deterministic enough to cache, so each
    submission version keeps exactly one summary row (unique on
    `submission_id`). Regenerating overwrites it rather than appending, which
    keeps the judge view stable instead of showing a new "take" on every visit.
    """

    __tablename__ = "submission_summaries"

    __table_args__ = (
        UniqueConstraint("submission_id", name="uq_submission_summaries_submission"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    submission_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("project_submissions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Short one-liner for cards and lists.
    tldr: Mapped[str] = mapped_column(Text, nullable=False)
    # Longer prose overview.
    overview: Mapped[str] = mapped_column(Text, nullable=False)
    # JSON arrays, stored as text to stay portable across SQLite/Postgres.
    highlights: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    technologies: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    talking_points: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="gemini")
    model_name: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
