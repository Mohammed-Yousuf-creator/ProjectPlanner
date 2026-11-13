import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class EventScheduleItemCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    item_type: str = Field(..., min_length=1, max_length=50)
    starts_at: datetime
    ends_at: datetime
    venue: Optional[str] = Field(None, max_length=200)
    meeting_url: Optional[str] = None


class EventScheduleItemUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    item_type: Optional[str] = Field(None, min_length=1, max_length=50)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    venue: Optional[str] = Field(None, max_length=200)
    meeting_url: Optional[str] = None
    status: Optional[str] = None


class EventScheduleItemRead(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    title: str
    description: Optional[str] = None
    item_type: str
    starts_at: datetime
    ends_at: datetime
    venue: Optional[str] = None
    meeting_url: Optional[str] = None
    status: str
    created_by_user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

