import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    slug: Optional[str] = Field(
        default=None,
        min_length=2,
        max_length=100,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
    )
    organization_type: Literal["organizer", "sponsor", "both", "other"]
    description: Optional[str] = None
    website_url: Optional[str] = None
    logo_url: Optional[str] = None
    contact_email: Optional[EmailStr] = None


class OrganizationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    slug: Optional[str] = Field(
        default=None,
        min_length=2,
        max_length=100,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
    )
    organization_type: Optional[Literal["organizer", "sponsor", "both", "other"]] = None
    description: Optional[str] = None
    website_url: Optional[str] = None
    logo_url: Optional[str] = None
    contact_email: Optional[EmailStr] = None


class OrganizationRead(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    organization_type: str
    description: Optional[str] = None
    website_url: Optional[str] = None
    logo_url: Optional[str] = None
    contact_email: Optional[str] = None
    created_by_user_id: uuid.UUID
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class OrganizationMemberRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    user_id: uuid.UUID
    role: str
    status: str
    joined_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class OrganizationMemberDetailRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    user_id: uuid.UUID
    role: str
    status: str
    joined_at: Optional[datetime] = None
    created_at: datetime
    email: EmailStr
    username: str
    display_name: str

    model_config = ConfigDict(from_attributes=True)


class OrganizationWithMyRoleRead(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    organization_type: str
    description: Optional[str] = None
    website_url: Optional[str] = None
    logo_url: Optional[str] = None
    contact_email: Optional[str] = None
    created_by_user_id: uuid.UUID
    status: str
    created_at: datetime
    updated_at: datetime
    my_role: str
    my_status: str
    my_joined_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class OrganizationInviteRequest(BaseModel):
    email: EmailStr
    role: Literal["admin", "member"] = "member"
