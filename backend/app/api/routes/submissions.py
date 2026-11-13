import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.submission import (
    ProjectSubmissionCreate,
    ProjectSubmissionRead,
    ProjectSubmissionUpdate,
)
from app.services.submission_service import (
    create_next_submission_version,
    edit_draft_submission,
    finalize_submission,
    get_project_submissions,
)

router = APIRouter()


@router.patch(
    "/projects/{project_id}/submissions/{submission_id}",
    response_model=ProjectSubmissionRead,
    summary="Edit a draft submission",
)
def edit_draft_submission_endpoint(
    project_id: uuid.UUID,
    submission_id: uuid.UUID,
    data: ProjectSubmissionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectSubmissionRead:
    """Edit a draft submission. Submitted versions return HTTP 409."""
    return edit_draft_submission(db, project_id, submission_id, current_user, data)


@router.post(
    "/projects/{project_id}/submissions",
    response_model=ProjectSubmissionRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create next submission version",
)
def create_next_submission_version_endpoint(
    project_id: uuid.UUID,
    data: Optional[ProjectSubmissionCreate] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectSubmissionRead:
    """Create the next submission version. Requires previous version to be submitted."""
    return create_next_submission_version(db, project_id, current_user, data)


@router.get(
    "/projects/{project_id}/submissions",
    response_model=List[ProjectSubmissionRead],
    summary="Get project submission history",
)
def get_project_submissions_endpoint(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[ProjectSubmissionRead]:
    """Return the project's submission history. Judges see submitted versions only."""
    return get_project_submissions(db, project_id, current_user)


@router.post(
    "/projects/{project_id}/submissions/{submission_id}/submit",
    response_model=ProjectSubmissionRead,
    summary="Finalize and submit a project submission",
)
def finalize_submission_endpoint(
    project_id: uuid.UUID,
    submission_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectSubmissionRead:
    """Finalize a draft submission before deadline, locking it from further edits."""
    return finalize_submission(db, project_id, submission_id, current_user)

