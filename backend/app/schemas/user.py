import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserProfileRead(BaseModel):
    display_name: str
    headline: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    github_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    website_url: Optional[str] = None
    profile_visibility: str = "public"
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserProfileUpdate(BaseModel):
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    headline: Optional[str] = Field(default=None, max_length=255)
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    city: Optional[str] = Field(default=None, max_length=100)
    country: Optional[str] = Field(default=None, max_length=100)
    github_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    website_url: Optional[str] = None
    profile_visibility: Optional[str] = Field(default=None, pattern="^(public|private)$")


class UserRead(BaseModel):
    id: uuid.UUID
    email: EmailStr
    username: str
    account_status: str
    email_verified_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserMeResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    username: str
    account_status: str
    email_verified_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    profile: Optional[UserProfileRead] = None

    model_config = ConfigDict(from_attributes=True)

