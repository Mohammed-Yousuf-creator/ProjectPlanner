import uuid
from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.judging import (
    EvaluationRead,
    EvaluationSaveRequest,
    JudgeCreate,
    JudgeRead,
    JudgingCriteriaCreate,
    JudgingCriteriaRead,
    JudgingCriteriaUpdate,
)
from app.services.judging_service import (
    add_event_judge,
    create_draft_evaluation,
    create_judging_criteria,
    delete_judging_criteria,
    finalize_evaluation,
    get_my_evaluation,
    list_event_judges,
    list_judging_criteria,
    remove_event_judge,
    save_draft_evaluation,
    update_judging_criteria,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Judge Management Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/events/{event_id}/judges",
    response_model=JudgeRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add an event judge",
)
def add_event_judge_endpoint(
    event_id: uuid.UUID,
    data: JudgeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JudgeRead:
    """Allow an authorized organization owner/admin to add an existing user as a judge."""
    return add_event_judge(db, event_id, current_user, data)


@router.get(
    "/events/{event_id}/judges",
    response_model=List[JudgeRead],
    summary="List event judges",
)
def list_event_judges_endpoint(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[JudgeRead]:
    """Return event judges for authorized event organizers."""
    return list_event_judges(db, event_id, current_user)


@router.delete(
    "/events/{event_id}/judges/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove judging access",
)
def remove_event_judge_endpoint(
    event_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Remove judging access by marking judge membership as withdrawn."""
    remove_event_judge(db, event_id, user_id, current_user)


# ---------------------------------------------------------------------------
# Judging Criteria Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/events/{event_id}/judging-criteria",
    response_model=JudgingCriteriaRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a judging criterion",
)
def create_judging_criteria_endpoint(
    event_id: uuid.UUID,
    data: JudgingCriteriaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JudgingCriteriaRead:
    """Create a new judging criterion for an event."""
    return create_judging_criteria(db, event_id, current_user, data)


@router.get(
    "/events/{event_id}/judging-criteria",
    response_model=List[JudgingCriteriaRead],
    summary="List judging criteria",
)
def list_judging_criteria_endpoint(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[JudgingCriteriaRead]:
    """List judging criteria for organizers, judges, or participants."""
    return list_judging_criteria(db, event_id, current_user)


@router.patch(
    "/judging-criteria/{criterion_id}",
    response_model=JudgingCriteriaRead,
    summary="Update a judging criterion",
)
def update_judging_criteria_endpoint(
    criterion_id: uuid.UUID,
    data: JudgingCriteriaUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JudgingCriteriaRead:
    """Update a judging criterion. Blocked if evaluations have already begun."""
    return update_judging_criteria(db, criterion_id, current_user, data)


@router.delete(
    "/judging-criteria/{criterion_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a judging criterion",
)
def delete_judging_criteria_endpoint(
    criterion_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete a judging criterion. Blocked if evaluations have already begun."""
    delete_judging_criteria(db, criterion_id, current_user)


# ---------------------------------------------------------------------------
# Evaluation Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/submissions/{submission_id}/evaluations",
    response_model=EvaluationRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create draft evaluation",
)
def create_draft_evaluation_endpoint(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EvaluationRead:
    """Create a draft evaluation for an approved judge without conflicts."""
    return create_draft_evaluation(db, submission_id, current_user)


@router.get(
    "/submissions/{submission_id}/evaluations/me",
    response_model=EvaluationRead,
    summary="Get own evaluation for submission",
)
def get_my_evaluation_endpoint(
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EvaluationRead:
    """Return the authenticated judge's own evaluation."""
    return get_my_evaluation(db, submission_id, current_user)


@router.put(
    "/evaluations/{evaluation_id}",
    response_model=EvaluationRead,
    summary="Save or update draft evaluation",
)
def save_draft_evaluation_endpoint(
    evaluation_id: uuid.UUID,
    data: EvaluationSaveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EvaluationRead:
    """Save or update scores for a draft evaluation."""
    return save_draft_evaluation(db, evaluation_id, current_user, data)


@router.post(
    "/evaluations/{evaluation_id}/submit",
    response_model=EvaluationRead,
    summary="Finalize and submit evaluation",
)
def finalize_evaluation_endpoint(
    evaluation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EvaluationRead:
    """Finalize an evaluation. Submitted evaluations are immutable."""
    return finalize_evaluation(db, evaluation_id, current_user)

