import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.event import Event
    from app.models.project import ProjectSubmission
    from app.models.user import User


class JudgingCriteria(Base):
    __tablename__ = "judging_criteria"

    __table_args__ = (
        UniqueConstraint("event_id", "name", name="uq_judging_criteria_event_name"),
        CheckConstraint("max_score > 0", name="ck_judging_criteria_max_score"),
        CheckConstraint("weight > 0", name="ck_judging_criteria_weight"),
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
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    max_score: Mapped[float] = mapped_column(
        Numeric(8, 2, asdecimal=False), nullable=False
    )
    weight: Mapped[float] = mapped_column(
        Numeric(8, 2, asdecimal=False), nullable=False
    )
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
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
    event: Mapped["Event"] = relationship("Event", back_populates="judging_criteria")
    scores: Mapped[List["EvaluationScore"]] = relationship(
        "EvaluationScore",
        back_populates="criterion",
        cascade="all, delete-orphan",
    )


class Evaluation(Base):
    __tablename__ = "evaluations"

    __table_args__ = (
        UniqueConstraint(
            "submission_id", "judge_user_id", name="uq_evaluations_submission_judge"
        ),
        CheckConstraint(
            "status IN ('draft', 'submitted')",
            name="ck_evaluations_status",
        ),
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
    judge_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="draft"
    )
    overall_feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(
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
    submission: Mapped["ProjectSubmission"] = relationship(
        "ProjectSubmission", back_populates="evaluations"
    )
    judge_user: Mapped["User"] = relationship(
        "User", foreign_keys=[judge_user_id]
    )
    scores: Mapped[List["EvaluationScore"]] = relationship(
        "EvaluationScore",
        back_populates="evaluation",
        cascade="all, delete-orphan",
    )


class EvaluationScore(Base):
    __tablename__ = "evaluation_scores"

    __table_args__ = (
        UniqueConstraint(
            "evaluation_id", "criteria_id", name="uq_evaluation_scores_eval_criteria"
        ),
        CheckConstraint("score >= 0", name="ck_evaluation_scores_score_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    evaluation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("evaluations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    criteria_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("judging_criteria.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    score: Mapped[float] = mapped_column(
        Numeric(8, 2, asdecimal=False), nullable=False
    )
    feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    evaluation: Mapped["Evaluation"] = relationship(
        "Evaluation", back_populates="scores"
    )
    criterion: Mapped["JudgingCriteria"] = relationship(
        "JudgingCriteria", back_populates="scores"
    )

