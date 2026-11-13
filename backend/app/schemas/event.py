import uuid
from datetime import datetime
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class EventCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    slug: Optional[str] = Field(
        default=None,
        min_length=2,
        max_length=100,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
    )
    short_description: Optional[str] = Field(default=None, max_length=500)
    description: Optional[str] = None
    event_type: str = Field(min_length=2, max_length=50)
    format: Literal["online", "offline", "hybrid"]
    timezone: str = Field(default="UTC", max_length=100)
    visibility: Literal["public", "private", "unlisted"] = "public"
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    registration_opens_at: Optional[datetime] = None
    registration_closes_at: Optional[datetime] = None
    submission_deadline_at: Optional[datetime] = None
    venue_name: Optional[str] = Field(default=None, max_length=200)
    address: Optional[str] = None
    city: Optional[str] = Field(default=None, max_length=100)
    country: Optional[str] = Field(default=None, max_length=100)
    min_team_size: int = Field(default=1, ge=1)
    max_team_size: int = Field(default=4, ge=1)

    @model_validator(mode="after")
    def validate_dates_and_team_sizes(self) -> "EventCreate":
        if self.max_team_size < self.min_team_size:
            raise ValueError("max_team_size must be greater than or equal to min_team_size")
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("Event ends_at must be strictly after starts_at")
        if (
            self.registration_opens_at
            and self.registration_closes_at
            and self.registration_closes_at <= self.registration_opens_at
        ):
            raise ValueError("registration_closes_at must be after registration_opens_at")
        return self


class EventUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    slug: Optional[str] = Field(
        default=None,
        min_length=2,
        max_length=100,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
    )
    short_description: Optional[str] = Field(default=None, max_length=500)
    description: Optional[str] = None
    event_type: Optional[str] = Field(default=None, min_length=2, max_length=50)
    format: Optional[Literal["online", "offline", "hybrid"]] = None
    visibility: Optional[Literal["public", "private", "unlisted"]] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    registration_opens_at: Optional[datetime] = None
    registration_closes_at: Optional[datetime] = None
    submission_deadline_at: Optional[datetime] = None
    timezone: Optional[str] = Field(default=None, max_length=100)
    venue_name: Optional[str] = Field(default=None, max_length=200)
    address: Optional[str] = None
    city: Optional[str] = Field(default=None, max_length=100)
    country: Optional[str] = Field(default=None, max_length=100)
    min_team_size: Optional[int] = Field(default=None, ge=1)
    max_team_size: Optional[int] = Field(default=None, ge=1)


class EventRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    created_by_user_id: uuid.UUID
    name: str
    slug: str
    short_description: Optional[str] = None
    description: Optional[str] = None
    event_type: str
    format: str
    status: str
    visibility: str
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    registration_opens_at: Optional[datetime] = None
    registration_closes_at: Optional[datetime] = None
    submission_deadline_at: Optional[datetime] = None
    timezone: str
    venue_name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    min_team_size: int
    max_team_size: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EventMembershipCreate(BaseModel):
    event_id: uuid.UUID
    role: Literal["participant", "judge", "mentor"] = "participant"
    registration_data: Optional[Dict[str, Any]] = None


class EventMembershipRead(BaseModel):
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


class EventTrackCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: Optional[str] = None


class EventTrackUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    description: Optional[str] = None


class EventTrackRead(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    description: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
