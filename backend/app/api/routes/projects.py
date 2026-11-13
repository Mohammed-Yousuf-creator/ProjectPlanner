import uuid
from typing import List

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.project import (
    ProjectCreate,
    ProjectDetailRead,
    ProjectPublicRead,
)
from app.services.project_service import (
    create_project,
    get_team_project,
    list_event_projects,
)

router = APIRouter()


@router.post(
    "/events/{event_id}/projects",
    response_model=ProjectDetailRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a project and initial draft submission",
)
def create_event_project_endpoint(
    event_id: uuid.UUID,
    data: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectDetailRead:
    """Create a project and its first draft submission in one database transaction."""
    return create_project(db, event_id, current_user, data)


@router.get(
    "/teams/{team_id}/project",
    response_model=ProjectDetailRead,
    summary="Get team project and submission history",
)
def get_team_project_endpoint(
    team_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectDetailRead:
    """Return team project, latest submission, and submission history for active team members."""
    return get_team_project(db, team_id, current_user)


@router.get(
    "/events/{event_id}/projects",
    response_model=List[ProjectPublicRead],
    summary="List submitted projects in an event",
)
def list_event_projects_endpoint(
    event_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[ProjectPublicRead]:
    """List submitted projects in an event for participants, judges, or organizers."""
    return list_event_projects(db, event_id, current_user, page=page, page_size=page_size)

