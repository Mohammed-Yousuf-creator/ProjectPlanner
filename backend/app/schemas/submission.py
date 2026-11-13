import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ProjectSubmissionCreate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    tagline: Optional[str] = Field(None, max_length=255)
    abstract: Optional[str] = None
    description: Optional[str] = None
    repo_url: Optional[str] = None
    demo_url: Optional[str] = None
    presentation_url: Optional[str] = None


class ProjectSubmissionUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    tagline: Optional[str] = Field(None, max_length=255)
    abstract: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None
    repo_url: Optional[str] = None
    demo_url: Optional[str] = None
    presentation_url: Optional[str] = None


class ProjectSubmissionRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    version_number: int
    submitted_by_user_id: uuid.UUID
    title: str
    tagline: Optional[str] = None
    abstract: str
    description: Optional[str] = None
    repo_url: Optional[str] = None
    demo_url: Optional[str] = None
    presentation_url: Optional[str] = None
    status: str
    submitted_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

