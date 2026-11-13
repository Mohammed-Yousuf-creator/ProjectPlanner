import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class AnnouncementCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1)
    audience_type: str = Field(..., min_length=1, max_length=50)
    target_team_id: Optional[uuid.UUID] = None


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    body: Optional[str] = Field(None, min_length=1)
    audience_type: Optional[str] = Field(None, min_length=1, max_length=50)
    target_team_id: Optional[uuid.UUID] = None


class AnnouncementRead(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    author_user_id: uuid.UUID
    title: str
    body: str
    audience_type: str
    target_team_id: Optional[uuid.UUID] = None
    status: str
    published_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

