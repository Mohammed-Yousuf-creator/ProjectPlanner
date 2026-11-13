import uuid
from datetime import datetime
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr


class EventRegisterRequest(BaseModel):
    registration_data: Optional[Dict[str, Any]] = None


class EventRegistrationResponse(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    user_id: uuid.UUID
    role: str
    status: str
    registration_data: Optional[Dict[str, Any]] = None
    registered_at: datetime
    checked_in_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ParticipantStatusUpdateRequest(BaseModel):
    status: Literal["approved", "waitlisted", "rejected"]


class OrganizerParticipantRead(BaseModel):
    membership_id: uuid.UUID
    user_id: uuid.UUID
    username: str
    display_name: str
    email: EmailStr
    role: str
    status: str
    registered_at: datetime
    checked_in_at: Optional[datetime] = None
    registration_data: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(from_attributes=True)

