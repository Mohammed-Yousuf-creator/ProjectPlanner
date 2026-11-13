import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr

from app.schemas.event import EventRead, EventTrackRead
from app.schemas.organization import OrganizationRead


class ParticipantRegistrationRead(BaseModel):
    membership_id: uuid.UUID
    event_id: uuid.UUID
    event_name: str
    event_description: Optional[str] = None
    event_type: str
    event_format: str
    event_status: str
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    city: Optional[str] = None
    country: Optional[str] = None
    organization_name: str
    registration_status: str
    registered_at: datetime
    checked_in_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ParticipantUserInfo(BaseModel):
    user_id: uuid.UUID
    username: str
    email: EmailStr
    display_name: str
    avatar_url: Optional[str] = None
    headline: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ParticipantSummary(BaseModel):
    total_active_registrations: int
    upcoming_events_count: int
    ongoing_events_count: int
    completed_events_count: int
    waitlisted_events_count: int


class ParticipantEventItem(BaseModel):
    membership_id: uuid.UUID
    event_id: uuid.UUID
    event_name: str
    event_slug: str
    event_type: str
    event_format: str
    event_status: str
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    city: Optional[str] = None
    country: Optional[str] = None
    organization_name: str
    registration_status: str
    registered_at: datetime
    checked_in_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ParticipantDashboardResponse(BaseModel):
    user: ParticipantUserInfo
    summary: ParticipantSummary
    upcoming_events: List[ParticipantEventItem]
    ongoing_events: List[ParticipantEventItem]
    completed_events: List[ParticipantEventItem]
    waitlisted_events: List[ParticipantEventItem]


class ParticipantRegisteredEventDetail(BaseModel):
    event: EventRead
    organization: OrganizationRead
    registration_status: str
    registered_at: datetime
    checked_in_at: Optional[datetime] = None
    registration_data: Optional[Dict[str, Any]] = None
    tracks: List[EventTrackRead] = []

    model_config = ConfigDict(from_attributes=True)

