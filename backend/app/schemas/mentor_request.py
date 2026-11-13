import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class MentorRequestCreate(BaseModel):
    topic: str = Field(..., min_length=1, max_length=200)
    description: str = Field(..., min_length=1)
    priority: str = Field("normal", pattern="^(low|normal|high)$")
    team_id: Optional[uuid.UUID] = None


class MentorRequestAssign(BaseModel):
    mentor_user_id: uuid.UUID


class MentorRequestStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(pending|assigned|in_progress|resolved|rejected|cancelled)$")
    resolution_note: Optional[str] = None


class MentorRequestRead(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    requested_by_user_id: uuid.UUID
    team_id: Optional[uuid.UUID] = None
    team_name: Optional[str] = None
    assigned_mentor_user_id: Optional[uuid.UUID] = None
    mentor_name: Optional[str] = None
    topic: str
    description: str
    priority: str
    status: str
    resolution_note: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

