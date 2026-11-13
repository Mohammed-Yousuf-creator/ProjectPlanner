import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.models.event import Event, EventMembership
from app.models.judging import Evaluation, EvaluationScore, JudgingCriteria
from app.models.project import Project, ProjectSubmission
from app.models.team import TeamMember
from app.models.user import User, UserProfile
from app.schemas.judging import (
    EvaluationRead,
    EvaluationSaveRequest,
    EvaluationScoreRead,
    JudgeCreate,
    JudgeRead,
    JudgingCriteriaCreate,
    JudgingCriteriaRead,
    JudgingCriteriaUpdate,
)
from app.services.organization_service import get_member_in_org, require_org_member


# ---------------------------------------------------------------------------
# Judge Management
# ---------------------------------------------------------------------------

def add_event_judge(
    db: Session, event_id: uuid.UUID, current_user: User, data: JudgeCreate
) -> JudgeRead:
    """Allow an authorized organization owner/admin to add an existing user as a judge."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    require_org_member(db, event.organization_id, current_user, ["owner", "admin"])

    target_user = (
        db.query(User)
        .options(joinedload(User.profile))
        .filter(User.email == data.email.lower().strip())
        .first()
    )
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User with given email not found",
        )

    existing_membership = (
        db.query(EventMembership)
        .filter(
            EventMembership.event_id == event_id,
            EventMembership.user_id == target_user.id,
        )
        .first()
    )

    now = datetime.now(timezone.utc)
    if existing_membership:
        if existing_membership.role == "participant":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user cannot simultaneously be a participant and judge for the same event.",
            )
        if existing_membership.role == "judge":
            if existing_membership.status == "approved":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="User is already an approved judge for this event.",
                )
            if existing_membership.status == "withdrawn":
                existing_membership.status = "approved"
                existing_membership.updated_at = now
                db.commit()
                db.refresh(existing_membership)
                display_name = target_user.profile.display_name if target_user.profile else None
                return JudgeRead(
                    id=existing_membership.id,
                    user_id=target_user.id,
                    email=target_user.email,
                    username=target_user.username,
                    display_name=display_name,
                    full_name=display_name,
                    role=existing_membership.role,
                    status=existing_membership.status,
                    registered_at=existing_membership.registered_at,
                )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User already has an event membership with role '{existing_membership.role}'.",
        )

    new_membership = EventMembership(
        event_id=event_id,
        user_id=target_user.id,
        role="judge",
        status="approved",
        registered_at=now,
    )
    db.add(new_membership)
    db.commit()
    db.refresh(new_membership)

    display_name = target_user.profile.display_name if target_user.profile else None
    return JudgeRead(
        id=new_membership.id,
        user_id=target_user.id,
        email=target_user.email,
        username=target_user.username,
        display_name=display_name,
        full_name=display_name,
        role=new_membership.role,
        status=new_membership.status,
        registered_at=new_membership.registered_at,
    )


def list_event_judges(
    db: Session, event_id: uuid.UUID, current_user: User
) -> List[JudgeRead]:
    """Return event judges for authorized event organizers."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    require_org_member(db, event.organization_id, current_user, ["owner", "admin"])

    memberships = (
        db.query(EventMembership)
        .options(
            joinedload(EventMembership.user).joinedload(User.profile)
        )
        .filter(
            EventMembership.event_id == event_id,
            EventMembership.role == "judge",
        )
        .order_by(EventMembership.registered_at.asc())
        .all()
    )

    results: List[JudgeRead] = []
    for m in memberships:
        user = m.user
        display_name = user.profile.display_name if user.profile else None
        results.append(
            JudgeRead(
                id=m.id,
                user_id=user.id,
                email=user.email,
                username=user.username,
                display_name=display_name,
                full_name=display_name,
                role=m.role,
                status=m.status,
                registered_at=m.registered_at,
            )
        )
    return results


def remove_event_judge(
    db: Session, event_id: uuid.UUID, judge_user_id: uuid.UUID, current_user: User
) -> None:
    """Remove judging access by changing membership status to withdrawn."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    require_org_member(db, event.organization_id, current_user, ["owner", "admin"])

    membership = (
        db.query(EventMembership)
        .filter(
            EventMembership.event_id == event_id,
            EventMembership.user_id == judge_user_id,
            EventMembership.role == "judge",
        )
        .first()
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Judge membership not found for this user in this event.",
        )

    membership.status = "withdrawn"
    membership.updated_at = datetime.now(timezone.utc)
    db.commit()


# ---------------------------------------------------------------------------
# Judging Criteria Management
# ---------------------------------------------------------------------------

def create_judging_criteria(
    db: Session,
    event_id: uuid.UUID,
    current_user: User,
    data: JudgingCriteriaCreate,
) -> JudgingCriteriaRead:
    """Create a new judging criterion for an event."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    require_org_member(db, event.organization_id, current_user, ["owner", "admin"])

    if data.max_score <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="max_score must be greater than zero.",
        )
    if data.weight <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="weight must be greater than zero.",
        )

    existing = (
        db.query(JudgingCriteria)
        .filter(
            JudgingCriteria.event_id == event_id,
            JudgingCriteria.name == data.name.strip(),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Judging criterion with this name already exists in this event.",
        )

    criterion = JudgingCriteria(
        event_id=event_id,
        name=data.name.strip(),
        description=data.description.strip() if data.description else None,
        max_score=data.max_score,
        weight=data.weight,
        sort_order=data.sort_order,
        is_active=True,
    )
    db.add(criterion)
    db.commit()
    db.refresh(criterion)
    return JudgingCriteriaRead.model_validate(criterion)


def list_judging_criteria(
    db: Session, event_id: uuid.UUID, current_user: User
) -> List[JudgingCriteriaRead]:
    """List judging criteria. Organizers see all; participants and judges see active only."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    is_organizer = False
    org_mem = get_member_in_org(db, event.organization_id, current_user.id)
    if org_mem and org_mem.status == "active" and org_mem.role in ("owner", "admin"):
        is_organizer = True

    is_judge = False
    judge_mem = (
        db.query(EventMembership)
        .filter(
            EventMembership.event_id == event_id,
            EventMembership.user_id == current_user.id,
            EventMembership.role == "judge",
            EventMembership.status == "approved",
        )
        .first()
    )
    if judge_mem:
        is_judge = True

    is_participant = False
    part_mem = (
        db.query(EventMembership)
        .filter(
            EventMembership.event_id == event_id,
            EventMembership.user_id == current_user.id,
            EventMembership.role == "participant",
            EventMembership.status.in_(["registered", "approved"]),
        )
        .first()
    )
    if part_mem:
        is_participant = True

    if not (is_organizer or is_judge or is_participant):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view judging criteria for this event.",
        )

    query = db.query(JudgingCriteria).filter(JudgingCriteria.event_id == event_id)
    if not is_organizer:
        query = query.filter(JudgingCriteria.is_active == True)

    criteria = query.order_by(
        JudgingCriteria.sort_order.asc(), JudgingCriteria.created_at.asc()
    ).all()
    return [JudgingCriteriaRead.model_validate(c) for c in criteria]


def update_judging_criteria(
    db: Session,
    criterion_id: uuid.UUID,
    current_user: User,
    data: JudgingCriteriaUpdate,
) -> JudgingCriteriaRead:
    """Update a judging criterion. Locked if evaluations exist for the event."""
    criterion = db.get(JudgingCriteria, criterion_id)
    if not criterion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Judging criterion not found",
        )

    event = criterion.event
    require_org_member(db, event.organization_id, current_user, ["owner", "admin"])

    # Prevent criterion modification once evaluation records exist for that event
    has_evaluations = (
        db.query(Evaluation)
        .join(ProjectSubmission, Evaluation.submission_id == ProjectSubmission.id)
        .join(Project, ProjectSubmission.project_id == Project.id)
        .filter(Project.event_id == event.id)
        .first()
        is not None
    )
    if has_evaluations:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify judging criteria once evaluations have begun for this event.",
        )

    if data.max_score is not None and data.max_score <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="max_score must be greater than zero.",
        )
    if data.weight is not None and data.weight <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="weight must be greater than zero.",
        )

    if data.name is not None:
        name_val = data.name.strip()
        existing = (
            db.query(JudgingCriteria)
            .filter(
                JudgingCriteria.event_id == event.id,
                JudgingCriteria.name == name_val,
                JudgingCriteria.id != criterion.id,
            )
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Judging criterion with this name already exists in this event.",
            )
        criterion.name = name_val

    if data.description is not None:
        criterion.description = data.description.strip() if data.description else None
    if data.max_score is not None:
        criterion.max_score = data.max_score
    if data.weight is not None:
        criterion.weight = data.weight
    if data.sort_order is not None:
        criterion.sort_order = data.sort_order
    if data.is_active is not None:
        criterion.is_active = data.is_active

    criterion.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(criterion)
    return JudgingCriteriaRead.model_validate(criterion)


def delete_judging_criteria(
    db: Session, criterion_id: uuid.UUID, current_user: User
) -> None:
    """Delete a judging criterion. Locked if evaluations exist for the event."""
    criterion = db.get(JudgingCriteria, criterion_id)
    if not criterion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Judging criterion not found",
        )

    event = criterion.event
    require_org_member(db, event.organization_id, current_user, ["owner", "admin"])

    has_evaluations = (
        db.query(Evaluation)
        .join(ProjectSubmission, Evaluation.submission_id == ProjectSubmission.id)
        .join(Project, ProjectSubmission.project_id == Project.id)
        .filter(Project.event_id == event.id)
        .first()
        is not None
    )
    if has_evaluations:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete judging criteria once evaluations have begun for this event.",
        )

    db.delete(criterion)
    db.commit()


# ---------------------------------------------------------------------------
# Evaluation System
# ---------------------------------------------------------------------------

def create_draft_evaluation(
    db: Session, submission_id: uuid.UUID, current_user: User
) -> EvaluationRead:
    """Create a draft evaluation for the authenticated approved judge."""
    submission = db.get(ProjectSubmission, submission_id)
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found",
        )

    project = submission.project
    event = project.event

    # Verify approved judge membership for the submission's event
    judge_membership = (
        db.query(EventMembership)
        .filter(
            EventMembership.event_id == event.id,
            EventMembership.user_id == current_user.id,
            EventMembership.role == "judge",
            EventMembership.status == "approved",
        )
        .first()
    )
    if not judge_membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only approved judges can evaluate submissions for this event.",
        )

    # Conflict of interest: Judge must not evaluate a project of a team they belong(ed) to
    conflict = (
        db.query(TeamMember)
        .filter(
            TeamMember.team_id == project.team_id,
            TeamMember.user_id == current_user.id,
        )
        .first()
    )
    if conflict:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Conflict of interest: Judge cannot evaluate their own team's project.",
        )

    # Submission must be submitted (cannot evaluate drafts)
    if submission.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot evaluate a draft submission.",
        )

    # Submission must be the latest submitted version of its project
    newer_submitted = (
        db.query(ProjectSubmission)
        .filter(
            ProjectSubmission.project_id == project.id,
            ProjectSubmission.status == "submitted",
            ProjectSubmission.version_number > submission.version_number,
        )
        .first()
    )
    if newer_submitted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot evaluate a superseded submission version.",
        )

    # Enforce one evaluation per judge per submission
    existing_evaluation = (
        db.query(Evaluation)
        .filter(
            Evaluation.submission_id == submission_id,
            Evaluation.judge_user_id == current_user.id,
        )
        .first()
    )
    if existing_evaluation:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Evaluation already exists for this submission.",
        )

    evaluation = Evaluation(
        submission_id=submission_id,
        judge_user_id=current_user.id,
        status="draft",
        overall_feedback=None,
    )
    db.add(evaluation)
    db.commit()
    db.refresh(evaluation)

    return EvaluationRead(
        id=evaluation.id,
        submission_id=evaluation.submission_id,
        judge_user_id=evaluation.judge_user_id,
        status=evaluation.status,
        overall_feedback=evaluation.overall_feedback,
        submitted_at=evaluation.submitted_at,
        created_at=evaluation.created_at,
        updated_at=evaluation.updated_at,
        scores=[],
    )


def get_my_evaluation(
    db: Session, submission_id: uuid.UUID, current_user: User
) -> EvaluationRead:
    """Return the authenticated judge's own evaluation."""
    submission = db.get(ProjectSubmission, submission_id)
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found",
        )

    evaluation = (
        db.query(Evaluation)
        .options(
            joinedload(Evaluation.scores).joinedload(EvaluationScore.criterion)
        )
        .filter(
            Evaluation.submission_id == submission_id,
            Evaluation.judge_user_id == current_user.id,
        )
        .first()
    )
    if not evaluation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluation not found for current user on this submission.",
        )

    score_reads = [
        EvaluationScoreRead(
            id=s.id,
            criteria_id=s.criteria_id,
            criterion_name=s.criterion.name if s.criterion else None,
            score=s.score,
            feedback=s.feedback,
        )
        for s in evaluation.scores
    ]

    return EvaluationRead(
        id=evaluation.id,
        submission_id=evaluation.submission_id,
        judge_user_id=evaluation.judge_user_id,
        status=evaluation.status,
        overall_feedback=evaluation.overall_feedback,
        submitted_at=evaluation.submitted_at,
        created_at=evaluation.created_at,
        updated_at=evaluation.updated_at,
        scores=score_reads,
    )


def save_draft_evaluation(
    db: Session,
    evaluation_id: uuid.UUID,
    current_user: User,
    data: EvaluationSaveRequest,
) -> EvaluationRead:
    """Save or update a draft evaluation and its scores transactionally."""
    evaluation = (
        db.query(Evaluation)
        .options(
            joinedload(Evaluation.submission)
            .joinedload(ProjectSubmission.project)
        )
        .filter(Evaluation.id == evaluation_id)
        .first()
    )
    if not evaluation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluation not found",
        )

    # Only judge who owns the evaluation can update it
    if evaluation.judge_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own evaluation.",
        )

    # Withdrawn judge cannot modify evaluations
    event_id = evaluation.submission.project.event_id
    judge_membership = (
        db.query(EventMembership)
        .filter(
            EventMembership.event_id == event_id,
            EventMembership.user_id == current_user.id,
            EventMembership.role == "judge",
            EventMembership.status == "approved",
        )
        .first()
    )
    if not judge_membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Withdrawn judge cannot modify evaluations.",
        )

    # Evaluation must still be in draft status
    if evaluation.status == "submitted":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot modify a submitted evaluation.",
        )

    # Reject duplicate criteria IDs in scores list
    criteria_ids = [s.criteria_id for s in data.scores]
    if len(criteria_ids) != len(set(criteria_ids)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Duplicate criteria IDs in scores list.",
        )

    # Validate each criterion and score range
    for s in data.scores:
        crit = db.get(JudgingCriteria, s.criteria_id)
        if not crit or crit.event_id != event_id or not crit.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Criterion {s.criteria_id} is invalid or inactive for this event.",
            )
        if s.score < 0 or s.score > crit.max_score:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Score for '{crit.name}' must be between 0 and {crit.max_score}.",
            )

    # Replace scores transactionally
    db.query(EvaluationScore).filter(
        EvaluationScore.evaluation_id == evaluation_id
    ).delete()

    for s in data.scores:
        db.add(
            EvaluationScore(
                evaluation_id=evaluation_id,
                criteria_id=s.criteria_id,
                score=s.score,
                feedback=s.feedback.strip() if s.feedback else None,
            )
        )

    evaluation.overall_feedback = (
        data.overall_feedback.strip() if data.overall_feedback else None
    )
    evaluation.updated_at = datetime.now(timezone.utc)
    db.commit()

    # Re-fetch with criteria info
    refreshed = (
        db.query(Evaluation)
        .options(
            joinedload(Evaluation.scores).joinedload(EvaluationScore.criterion)
        )
        .filter(Evaluation.id == evaluation_id)
        .first()
    )

    score_reads = [
        EvaluationScoreRead(
            id=sc.id,
            criteria_id=sc.criteria_id,
            criterion_name=sc.criterion.name if sc.criterion else None,
            score=sc.score,
            feedback=sc.feedback,
        )
        for sc in refreshed.scores
    ]

    return EvaluationRead(
        id=refreshed.id,
        submission_id=refreshed.submission_id,
        judge_user_id=refreshed.judge_user_id,
        status=refreshed.status,
        overall_feedback=refreshed.overall_feedback,
        submitted_at=refreshed.submitted_at,
        created_at=refreshed.created_at,
        updated_at=refreshed.updated_at,
        scores=score_reads,
    )


def finalize_evaluation(
    db: Session, evaluation_id: uuid.UUID, current_user: User
) -> EvaluationRead:
    """Finalize an evaluation. All active criteria must be scored."""
    evaluation = (
        db.query(Evaluation)
        .options(
            joinedload(Evaluation.submission)
            .joinedload(ProjectSubmission.project),
            joinedload(Evaluation.scores).joinedload(EvaluationScore.criterion),
        )
        .filter(Evaluation.id == evaluation_id)
        .first()
    )
    if not evaluation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluation not found",
        )

    # Only owning judge can submit
    if evaluation.judge_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only submit your own evaluation.",
        )

    # Judge must still be approved
    event_id = evaluation.submission.project.event_id
    judge_membership = (
        db.query(EventMembership)
        .filter(
            EventMembership.event_id == event_id,
            EventMembership.user_id == current_user.id,
            EventMembership.role == "judge",
            EventMembership.status == "approved",
        )
        .first()
    )
    if not judge_membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Withdrawn judge cannot submit evaluations.",
        )

    # Must still be draft
    if evaluation.status == "submitted":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Evaluation is already submitted.",
        )

    # Every active judging criterion must have exactly one score
    active_criteria = (
        db.query(JudgingCriteria)
        .filter(
            JudgingCriteria.event_id == event_id,
            JudgingCriteria.is_active == True,
        )
        .all()
    )

    active_map = {c.id: c for c in active_criteria}
    scored_map = {s.criteria_id: s for s in evaluation.scores}

    if set(active_map.keys()) != set(scored_map.keys()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="All active judging criteria must be scored before submitting evaluation.",
        )

    # Validate all scores are within range
    for crit_id, score_obj in scored_map.items():
        crit = active_map[crit_id]
        if score_obj.score < 0 or score_obj.score > crit.max_score:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Score for '{crit.name}' must be between 0 and {crit.max_score}.",
            )

    now = datetime.now(timezone.utc)
    evaluation.status = "submitted"
    evaluation.submitted_at = now
    evaluation.updated_at = now
    db.commit()

    score_reads = [
        EvaluationScoreRead(
            id=s.id,
            criteria_id=s.criteria_id,
            criterion_name=s.criterion.name if s.criterion else None,
            score=s.score,
            feedback=s.feedback,
        )
        for s in evaluation.scores
    ]

    return EvaluationRead(
        id=evaluation.id,
        submission_id=evaluation.submission_id,
        judge_user_id=evaluation.judge_user_id,
        status=evaluation.status,
        overall_feedback=evaluation.overall_feedback,
        submitted_at=evaluation.submitted_at,
        created_at=evaluation.created_at,
        updated_at=evaluation.updated_at,
        scores=score_reads,
    )
