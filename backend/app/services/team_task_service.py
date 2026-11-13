import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.core.websocket_manager import ws_manager
from app.models.team import Team, TeamMember
from app.models.team_task import TeamTask, TeamTaskAssignee
from app.models.user import User
from app.schemas.team_task import (
    TeamTaskAssigneeRead,
    TeamTaskAssigneesUpdateRequest,
    TeamTaskCreateRequest,
    TeamTaskRead,
    TeamTaskUpdateRequest,
)


def get_active_team_member(
    db: Session, team_id: uuid.UUID, user_id: uuid.UUID
) -> TeamMember:
    """Verify that the team exists, is not disbanded, and user is an active member."""
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found.",
        )
    if team.status == "disbanded":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Team is disbanded.",
        )

    membership = (
        db.query(TeamMember)
        .filter(
            TeamMember.team_id == team_id,
            TeamMember.user_id == user_id,
            TeamMember.status == "active",
        )
        .first()
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only active team members can perform this action.",
        )
    return membership


def serialize_task(task: TeamTask) -> TeamTaskRead:
    """Serialize TeamTask and assignees with user profile display information."""
    assignee_reads: List[TeamTaskAssigneeRead] = []
    for a in task.assignees:
        profile = a.user.profile if a.user else None
        display_name = profile.display_name if profile else (a.user.username if a.user else "Unknown")
        assignee_reads.append(
            TeamTaskAssigneeRead(
                user_id=a.user_id,
                username=a.user.username if a.user else "",
                display_name=display_name,
                avatar_url=profile.avatar_url if profile else None,
                assigned_by_user_id=a.assigned_by_user_id,
                assigned_at=a.assigned_at,
            )
        )
    return TeamTaskRead(
        id=task.id,
        team_id=task.team_id,
        title=task.title,
        description=task.description,
        status=task.status,
        priority=task.priority,
        created_by_user_id=task.created_by_user_id,
        due_at=task.due_at,
        position=task.position,
        completed_at=task.completed_at,
        created_at=task.created_at,
        updated_at=task.updated_at,
        assignees=assignee_reads,
    )


def create_task(
    db: Session, team_id: uuid.UUID, current_user: User, data: TeamTaskCreateRequest
) -> TeamTaskRead:
    """Create a new task in the team board."""
    get_active_team_member(db, team_id, current_user.id)

    now = datetime.now(timezone.utc)
    completed_at = now if data.status == "done" else None

    task = TeamTask(
        team_id=team_id,
        title=data.title.strip(),
        description=data.description.strip() if data.description else None,
        priority=data.priority,
        status=data.status,
        due_at=data.due_at,
        position=data.position if data.position is not None else 0,
        created_by_user_id=current_user.id,
        completed_at=completed_at,
        created_at=now,
        updated_at=now,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    task_read = serialize_task(task)
    ws_manager.broadcast_sync(
        team_id=team_id,
        event_type="task.created",
        data=task_read.model_dump(mode="json"),
    )
    return task_read


def list_tasks(
    db: Session,
    team_id: uuid.UUID,
    current_user: User,
    status_filter: Optional[str] = None,
    priority_filter: Optional[str] = None,
    assignee_id: Optional[uuid.UUID] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[TeamTaskRead]:
    """Return non-deleted tasks for the team, ordered by position and creation timestamp."""
    get_active_team_member(db, team_id, current_user.id)

    query = (
        db.query(TeamTask)
        .options(
            selectinload(TeamTask.assignees).selectinload(TeamTaskAssignee.user).selectinload(User.profile)
        )
        .filter(
            TeamTask.team_id == team_id,
            TeamTask.deleted_at.is_(None),
        )
    )

    if status_filter:
        query = query.filter(TeamTask.status == status_filter)
    if priority_filter:
        query = query.filter(TeamTask.priority == priority_filter)
    if assignee_id:
        query = query.join(TeamTaskAssignee, TeamTaskAssignee.task_id == TeamTask.id).filter(
            TeamTaskAssignee.user_id == assignee_id
        )

    tasks = (
        query.order_by(TeamTask.position.asc(), TeamTask.created_at.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return [serialize_task(t) for t in tasks]


def get_task_details(
    db: Session, team_id: uuid.UUID, task_id: uuid.UUID, current_user: User
) -> TeamTaskRead:
    """Return a task and its assignees."""
    get_active_team_member(db, team_id, current_user.id)

    task = (
        db.query(TeamTask)
        .options(
            selectinload(TeamTask.assignees).selectinload(TeamTaskAssignee.user).selectinload(User.profile)
        )
        .filter(
            TeamTask.id == task_id,
            TeamTask.team_id == team_id,
            TeamTask.deleted_at.is_(None),
        )
        .first()
    )
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found.",
        )

    return serialize_task(task)


def update_task(
    db: Session,
    team_id: uuid.UUID,
    task_id: uuid.UUID,
    current_user: User,
    data: TeamTaskUpdateRequest,
) -> TeamTaskRead:
    """Update task status or details with permission enforcement."""
    member = get_active_team_member(db, team_id, current_user.id)

    task = (
        db.query(TeamTask)
        .options(
            selectinload(TeamTask.assignees).selectinload(TeamTaskAssignee.user).selectinload(User.profile)
        )
        .filter(
            TeamTask.id == task_id,
            TeamTask.team_id == team_id,
            TeamTask.deleted_at.is_(None),
        )
        .first()
    )
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found.",
        )

    is_privileged = (
        member.role in ("owner", "lead") or task.created_by_user_id == current_user.id
    )

    # Check if user is attempting to modify details without privileged permissions
    details_modified = any(
        getattr(data, field) is not None
        for field in ("title", "description", "priority", "due_at", "position")
    )

    if details_modified and not is_privileged:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the task creator, team owner, or team lead can update task details and priority.",
        )

    now = datetime.now(timezone.utc)

    if data.title is not None:
        task.title = data.title.strip()
    if data.description is not None:
        task.description = data.description.strip() if data.description else None
    if data.priority is not None:
        task.priority = data.priority
    if data.due_at is not None:
        task.due_at = data.due_at
    if data.position is not None:
        task.position = data.position

    # Status transitions and completed_at tracking
    if data.status is not None and data.status != task.status:
        old_status = task.status
        task.status = data.status
        if data.status == "done":
            task.completed_at = now
        elif old_status == "done":
            task.completed_at = None

    task.updated_at = now
    db.commit()
    db.refresh(task)

    task_read = serialize_task(task)
    ws_manager.broadcast_sync(
        team_id=team_id,
        event_type="task.updated",
        data=task_read.model_dump(mode="json"),
    )
    return task_read


def delete_task(
    db: Session, team_id: uuid.UUID, task_id: uuid.UUID, current_user: User
) -> None:
    """Soft-delete a task. Only creator, owner, or lead can delete."""
    member = get_active_team_member(db, team_id, current_user.id)

    task = (
        db.query(TeamTask)
        .filter(
            TeamTask.id == task_id,
            TeamTask.team_id == team_id,
            TeamTask.deleted_at.is_(None),
        )
        .first()
    )
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found.",
        )

    is_privileged = (
        member.role in ("owner", "lead") or task.created_by_user_id == current_user.id
    )
    if not is_privileged:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the task creator, team owner, or team lead can delete this task.",
        )

    now = datetime.now(timezone.utc)
    task.deleted_at = now
    task.updated_at = now
    db.commit()

    ws_manager.broadcast_sync(
        team_id=team_id,
        event_type="task.deleted",
        data={"id": str(task_id), "team_id": str(team_id)},
    )


def update_task_assignees(
    db: Session,
    team_id: uuid.UUID,
    task_id: uuid.UUID,
    current_user: User,
    data: TeamTaskAssigneesUpdateRequest,
) -> TeamTaskRead:
    """Replace task assignments transactionally. Only creator, owner, or lead can modify assignments."""
    member = get_active_team_member(db, team_id, current_user.id)

    task = (
        db.query(TeamTask)
        .filter(
            TeamTask.id == task_id,
            TeamTask.team_id == team_id,
            TeamTask.deleted_at.is_(None),
        )
        .first()
    )
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found.",
        )

    is_privileged = (
        member.role in ("owner", "lead") or task.created_by_user_id == current_user.id
    )
    if not is_privileged:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the task creator, team owner, or team lead can update assignees.",
        )

    # Check duplicate user IDs
    if len(data.user_ids) != len(set(data.user_ids)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Duplicate assignees are not allowed.",
        )

    now = datetime.now(timezone.utc)

    # Validate that every user in data.user_ids is an active member of this team
    if data.user_ids:
        active_team_members = (
            db.query(TeamMember.user_id)
            .filter(
                TeamMember.team_id == team_id,
                TeamMember.status == "active",
                TeamMember.user_id.in_(data.user_ids),
            )
            .all()
        )
        active_ids = {row[0] for row in active_team_members}
        for uid in data.user_ids:
            if uid not in active_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"User '{uid}' is not an active member of this team.",
                )

    # Transactional replacement
    db.query(TeamTaskAssignee).filter(TeamTaskAssignee.task_id == task_id).delete(
        synchronize_session=False
    )

    for uid in data.user_ids:
        assignee = TeamTaskAssignee(
            task_id=task_id,
            user_id=uid,
            assigned_by_user_id=current_user.id,
            assigned_at=now,
        )
        db.add(assignee)

    task.updated_at = now
    db.commit()

    # Re-fetch task with assignees loaded
    refreshed_task = (
        db.query(TeamTask)
        .options(
            selectinload(TeamTask.assignees).selectinload(TeamTaskAssignee.user).selectinload(User.profile)
        )
        .filter(TeamTask.id == task_id)
        .first()
    )
    task_read = serialize_task(refreshed_task)

    ws_manager.broadcast_sync(
        team_id=team_id,
        event_type="task.assignees.updated",
        data=task_read.model_dump(mode="json"),
    )
    return task_read

