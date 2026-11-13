import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.submission import ProjectSubmissionRead


class ProjectCreate(BaseModel):
    track_id: Optional[uuid.UUID] = None
    title: str = Field(..., min_length=1, max_length=255)
    tagline: Optional[str] = Field(None, max_length=255)
    abstract: str = Field(..., min_length=1)
    description: Optional[str] = None
    repo_url: Optional[str] = None
    demo_url: Optional[str] = None
    presentation_url: Optional[str] = None


class ProjectRead(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    team_id: uuid.UUID
    track_id: Optional[uuid.UUID] = None
    created_by_user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProjectDetailRead(ProjectRead):
    track_name: Optional[str] = None
    team_name: Optional[str] = None
    submissions: List[ProjectSubmissionRead] = []
    latest_submission: Optional[ProjectSubmissionRead] = None


class ProjectPublicRead(BaseModel):
    project_id: uuid.UUID
    event_id: uuid.UUID
    team_id: uuid.UUID
    team_name: str
    track_id: Optional[uuid.UUID] = None
    track_name: Optional[str] = None
    latest_submission: ProjectSubmissionRead
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

