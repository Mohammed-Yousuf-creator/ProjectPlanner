import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ---------------------------------------------------------------------------
# Sponsorship Package Schemas
# ---------------------------------------------------------------------------

class SponsorshipPackageCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    price: Decimal = Field(..., ge=0)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    benefits: Any = Field(...)
    available_slots: Optional[int] = Field(default=None, gt=0)

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        v = v.strip().upper()
        if len(v) != 3 or not v.isalpha():
            raise ValueError("Currency must be a valid 3-letter currency code")
        return v


class SponsorshipPackageUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = None
    price: Optional[Decimal] = Field(default=None, ge=0)
    currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    benefits: Optional[Any] = None
    available_slots: Optional[int] = Field(default=None, gt=0)

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip().upper()
            if len(v) != 3 or not v.isalpha():
                raise ValueError("Currency must be a valid 3-letter currency code")
        return v


class SponsorshipPackageRead(BaseModel):
    id: uuid.UUID
    listing_id: uuid.UUID
    name: str
    description: Optional[str] = None
    price: Decimal
    currency: str
    benefits: Any
    available_slots: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Sponsorship Listing Schemas
# ---------------------------------------------------------------------------

class SponsorshipListingCreate(BaseModel):
    event_id: Optional[uuid.UUID] = None
    listing_type: str = Field(
        ..., pattern="^(seeking_sponsors|offering_sponsorship)$"
    )
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field(..., min_length=1)
    audience_description: Optional[str] = None
    benefits: Optional[Any] = None
    min_budget: Optional[Decimal] = Field(default=None, ge=0)
    max_budget: Optional[Decimal] = Field(default=None, ge=0)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    expires_at: Optional[datetime] = None

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        v = v.strip().upper()
        if len(v) != 3 or not v.isalpha():
            raise ValueError("Currency must be a valid 3-letter currency code")
        return v


class SponsorshipListingUpdate(BaseModel):
    event_id: Optional[uuid.UUID] = None
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, min_length=1)
    audience_description: Optional[str] = None
    benefits: Optional[Any] = None
    min_budget: Optional[Decimal] = Field(default=None, ge=0)
    max_budget: Optional[Decimal] = Field(default=None, ge=0)
    currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    expires_at: Optional[datetime] = None

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip().upper()
            if len(v) != 3 or not v.isalpha():
                raise ValueError("Currency must be a valid 3-letter currency code")
        return v


class SponsorshipListingRead(BaseModel):
    id: uuid.UUID
    owner_organization_id: uuid.UUID
    event_id: Optional[uuid.UUID] = None
    listing_type: str
    title: str
    description: str
    audience_description: Optional[str] = None
    benefits: Optional[Any] = None
    min_budget: Optional[Decimal] = None
    max_budget: Optional[Decimal] = None
    currency: str
    status: str
    expires_at: Optional[datetime] = None
    created_by_user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    owner_organization_name: Optional[str] = None
    event_name: Optional[str] = None
    event_title: Optional[str] = None
    packages: List[SponsorshipPackageRead] = []

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Sponsor Discovery Schemas
# ---------------------------------------------------------------------------

class SponsorDiscoveryRead(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    website_url: Optional[str] = None
    logo_url: Optional[str] = None
    published_listings_count: int = 0
    public_listings: List[SponsorshipListingRead] = []


# ---------------------------------------------------------------------------
# Sponsorship Negotiation Message Schemas
# ---------------------------------------------------------------------------

class SponsorshipNegotiationMessageCreate(BaseModel):
    message_type: str = Field(..., pattern="^(message|counter_offer)$")
    message: str = Field(..., min_length=1)
    counter_amount: Optional[Decimal] = Field(default=None, ge=0)
    currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    counter_package_id: Optional[uuid.UUID] = None
    counter_benefits: Optional[Any] = None

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip().upper()
            if len(v) != 3 or not v.isalpha():
                raise ValueError("Currency must be a valid 3-letter currency code")
        return v


class SponsorshipNegotiationMessageRead(BaseModel):
    id: uuid.UUID
    proposal_id: uuid.UUID
    author_organization_id: uuid.UUID
    author_organization_name: Optional[str] = None
    author_user_id: uuid.UUID
    author_user_name: Optional[str] = None
    message_type: str
    message: str
    counter_amount: Optional[Decimal] = None
    currency: Optional[str] = None
    counter_package_id: Optional[uuid.UUID] = None
    counter_benefits: Optional[Any] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Sponsorship Proposal Schemas
# ---------------------------------------------------------------------------

class SponsorshipProposalCreate(BaseModel):
    target_event_id: uuid.UUID
    package_id: Optional[uuid.UUID] = None
    proposed_amount: Optional[Decimal] = Field(default=None, ge=0)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    proposed_benefits: Optional[Any] = None
    message: str = Field(..., min_length=1)
    proposer_organization_id: Optional[uuid.UUID] = None

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        v = v.strip().upper()
        if len(v) != 3 or not v.isalpha():
            raise ValueError("Currency must be a valid 3-letter currency code")
        return v


class SponsorshipProposalRead(BaseModel):
    id: uuid.UUID
    listing_id: uuid.UUID
    proposer_organization_id: uuid.UUID
    proposer_organization_name: Optional[str] = None
    listing_owner_organization_id: Optional[uuid.UUID] = None
    listing_owner_organization_name: Optional[str] = None
    target_event_id: uuid.UUID
    target_event_name: Optional[str] = None
    target_event_title: Optional[str] = None
    package_id: Optional[uuid.UUID] = None
    package_name: Optional[str] = None
    created_by_user_id: uuid.UUID
    proposed_amount: Optional[Decimal] = None
    currency: str
    proposed_benefits: Optional[Any] = None
    message: str
    status: str
    responded_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    listing_title: Optional[str] = None
    listing: Optional[SponsorshipListingRead] = None
    negotiation_messages: List[SponsorshipNegotiationMessageRead] = []

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Sponsorship Deliverable Schemas
# ---------------------------------------------------------------------------

class SponsorshipDeliverableCreate(BaseModel):
    responsible_organization_id: uuid.UUID
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    due_at: Optional[datetime] = None


class SponsorshipDeliverableUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    due_at: Optional[datetime] = None
    evidence_url: Optional[str] = None
    status: Optional[str] = Field(
        default=None,
        pattern="^(pending|in_progress|completed|rejected|cancelled)$",
    )


class SponsorshipDeliverableRead(BaseModel):
    id: uuid.UUID
    deal_id: uuid.UUID
    responsible_organization_id: uuid.UUID
    responsible_organization_name: Optional[str] = None
    title: str
    description: Optional[str] = None
    due_at: Optional[datetime] = None
    status: str
    evidence_url: Optional[str] = None
    created_by_user_id: uuid.UUID
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Sponsorship Deal Schemas
# ---------------------------------------------------------------------------

class SponsorshipDealStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(active|completed|cancelled)$")


class SponsorshipDealRead(BaseModel):
    id: uuid.UUID
    proposal_id: uuid.UUID
    event_id: uuid.UUID
    event_name: Optional[str] = None
    event_title: Optional[str] = None
    sponsor_organization_id: uuid.UUID
    sponsor_organization_name: Optional[str] = None
    organizer_organization_id: uuid.UUID
    organizer_organization_name: Optional[str] = None
    agreed_amount: Decimal
    currency: str
    agreed_terms: Optional[Any] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    status: str
    deliverables_count: int = 0
    completed_deliverables_count: int = 0
    created_at: datetime
    updated_at: datetime
    deliverables: List[SponsorshipDeliverableRead] = []

    model_config = ConfigDict(from_attributes=True)
