import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.team_task import (
    TeamTaskAssigneesUpdateRequest,
    TeamTaskCreateRequest,
    TeamTaskRead,
    TeamTaskUpdateRequest,
)
from app.services.team_task_service import (
    create_task,
    delete_task,
    get_task_details,
    list_tasks,
    update_task,
    update_task_assignees,
)

router = APIRouter()


@router.post(
    "/teams/{team_id}/tasks",
    response_model=TeamTaskRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a team task",
)
def create_team_task(
    team_id: uuid.UUID,
    data: TeamTaskCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TeamTaskRead:
    """Create a new task in the team board. Active team members only."""
    return create_task(db, team_id, current_user, data)


@router.get(
    "/teams/{team_id}/tasks",
    response_model=List[TeamTaskRead],
    status_code=status.HTTP_200_OK,
    summary="List team tasks",
)
def get_team_tasks(
    team_id: uuid.UUID,
    status_filter: Optional[str] = Query(default=None, alias="status"),
    priority_filter: Optional[str] = Query(default=None, alias="priority"),
    assignee_id: Optional[uuid.UUID] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[TeamTaskRead]:
    """Return team tasks with optional filtering by status, priority, or assignee."""
    return list_tasks(
        db,
        team_id,
        current_user,
        status_filter=status_filter,
        priority_filter=priority_filter,
        assignee_id=assignee_id,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/teams/{team_id}/tasks/{task_id}",
    response_model=TeamTaskRead,
    status_code=status.HTTP_200_OK,
    summary="Get task details",
)
def get_single_task(
    team_id: uuid.UUID,
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TeamTaskRead:
    """Return task details and assigned members."""
    return get_task_details(db, team_id, task_id, current_user)


@router.patch(
    "/teams/{team_id}/tasks/{task_id}",
    response_model=TeamTaskRead,
    status_code=status.HTTP_200_OK,
    summary="Update a task",
)
def patch_task(
    team_id: uuid.UUID,
    task_id: uuid.UUID,
    data: TeamTaskUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TeamTaskRead:
    """Update task status or details with permission checks."""
    return update_task(db, team_id, task_id, current_user, data)


@router.delete(
    "/teams/{team_id}/tasks/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a task",
)
def delete_single_task(
    team_id: uuid.UUID,
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Soft-delete a task. Only creator, owner, or lead can delete."""
    delete_task(db, team_id, task_id, current_user)


@router.put(
    "/teams/{team_id}/tasks/{task_id}/assignees",
    response_model=TeamTaskRead,
    status_code=status.HTTP_200_OK,
    summary="Replace task assignees",
)
def replace_task_assignees(
    team_id: uuid.UUID,
    task_id: uuid.UUID,
    data: TeamTaskAssigneesUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TeamTaskRead:
    """Replace task assignees list transactionally. Creator, owner, or lead only."""
    return update_task_assignees(db, team_id, task_id, current_user, data)

