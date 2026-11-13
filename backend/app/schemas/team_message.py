import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.stored_file import StoredFileRead


class TeamMessageSenderInfo(BaseModel):
    user_id: uuid.UUID
    username: str
    display_name: str
    avatar_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class TeamMessageCreateRequest(BaseModel):
    body: Optional[str] = None
    attachment_ids: Optional[List[uuid.UUID]] = None


class TeamMessageUpdateRequest(BaseModel):
    body: str = Field(min_length=1)


class TeamMessageRead(BaseModel):
    id: uuid.UUID
    team_id: uuid.UUID
    sender: TeamMessageSenderInfo
    body: Optional[str] = None
    attachments: List[StoredFileRead] = []
    created_at: datetime
    edited_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

