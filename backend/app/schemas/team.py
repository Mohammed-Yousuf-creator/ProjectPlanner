import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class TeamCreate(BaseModel):
    event_id: uuid.UUID
    name: str = Field(min_length=2, max_length=150)
    description: Optional[str] = None


class TeamRead(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    description: Optional[str] = None
    created_by_user_id: uuid.UUID
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TeamMemberRead(BaseModel):
    id: uuid.UUID
    team_id: uuid.UUID
    user_id: uuid.UUID
    role: str
    status: str
    joined_at: datetime
    left_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class TeamInvitationCreate(BaseModel):
    team_id: uuid.UUID
    invitee_user_id: Optional[uuid.UUID] = None
    invitee_email: Optional[EmailStr] = None

    @model_validator(mode="after")
    def validate_single_invitee_target(self) -> "TeamInvitationCreate":
        if not ((self.invitee_user_id is not None and self.invitee_email is None) or
                (self.invitee_user_id is None and self.invitee_email is not None)):
            raise ValueError(
                "Exactly one of invitee_user_id or invitee_email must be provided."
            )
        return self


class TeamInvitationRead(BaseModel):
    id: uuid.UUID
    team_id: uuid.UUID
    invited_by_user_id: uuid.UUID
    invitee_user_id: Optional[uuid.UUID] = None
    invitee_email: Optional[str] = None
    status: str
    expires_at: datetime
    responded_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TeamInvitationRespond(BaseModel):
    action: Literal["accept", "reject"]

