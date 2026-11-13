import uuid
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

TaskPriority = Literal["low", "medium", "high", "urgent"]
TaskStatus = Literal["todo", "in_progress", "review", "done"]


class TeamTaskAssigneeRead(BaseModel):
    user_id: uuid.UUID
    username: str
    display_name: str
    avatar_url: Optional[str] = None
    assigned_by_user_id: uuid.UUID
    assigned_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TeamTaskCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    priority: TaskPriority = "medium"
    due_at: Optional[datetime] = None
    status: TaskStatus = "todo"
    position: Optional[int] = 0


class TeamTaskUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    due_at: Optional[datetime] = None
    position: Optional[int] = None


class TeamTaskAssigneesUpdateRequest(BaseModel):
    user_ids: List[uuid.UUID]


class TeamTaskRead(BaseModel):
    id: uuid.UUID
    team_id: uuid.UUID
    title: str
    description: Optional[str] = None
    status: str
    priority: str
    created_by_user_id: uuid.UUID
    due_at: Optional[datetime] = None
    position: int
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    assignees: List[TeamTaskAssigneeRead] = []

    model_config = ConfigDict(from_attributes=True)

