import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import TYPE_CHECKING, Any, List, Optional

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    JSON,
    Numeric,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.event import Event
    from app.models.organization import Organization
    from app.models.user import User


class SponsorshipListing(Base):
    __tablename__ = "sponsorship_listings"

    __table_args__ = (
        CheckConstraint(
            "listing_type IN ('seeking_sponsors', 'offering_sponsorship')",
            name="ck_sponsorship_listings_type",
        ),
        CheckConstraint(
            "status IN ('draft', 'published', 'closed')",
            name="ck_sponsorship_listings_status",
        ),
        CheckConstraint(
            "min_budget IS NULL OR min_budget >= 0",
            name="ck_sponsorship_listings_min_budget",
        ),
        CheckConstraint(
            "max_budget IS NULL OR max_budget >= 0",
            name="ck_sponsorship_listings_max_budget",
        ),
        CheckConstraint(
            "min_budget IS NULL OR max_budget IS NULL OR max_budget >= min_budget",
            name="ck_sponsorship_listings_budget_range",
        ),
        Index("ix_sponsorship_listings_owner", "owner_organization_id"),
        Index("ix_sponsorship_listings_status", "status"),
        Index("ix_sponsorship_listings_type", "listing_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    owner_organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("events.id", ondelete="SET NULL"),
        nullable=True,
    )
    listing_type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    audience_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    benefits: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    min_budget: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    max_budget: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft")
    expires_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime, nullable=True)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    owner_organization: Mapped["Organization"] = relationship("Organization")
    event: Mapped[Optional["Event"]] = relationship("Event")
    created_by_user: Mapped["User"] = relationship("User")
    packages: Mapped[List["SponsorshipPackage"]] = relationship(
        "SponsorshipPackage",
        back_populates="listing",
        cascade="all, delete-orphan",
        order_by="SponsorshipPackage.price.asc()",
    )
    proposals: Mapped[List["SponsorshipProposal"]] = relationship(
        "SponsorshipProposal",
        back_populates="listing",
        cascade="all, delete-orphan",
    )


class SponsorshipPackage(Base):
    __tablename__ = "sponsorship_packages"

    __table_args__ = (
        CheckConstraint("price >= 0", name="ck_sponsorship_packages_price"),
        CheckConstraint(
            "available_slots IS NULL OR available_slots > 0",
            name="ck_sponsorship_packages_slots",
        ),
        Index("ix_sponsorship_packages_listing", "listing_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    listing_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sponsorship_listings.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    benefits: Mapped[Any] = mapped_column(JSON, nullable=False)
    available_slots: Mapped[Optional[int]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    listing: Mapped["SponsorshipListing"] = relationship(
        "SponsorshipListing", back_populates="packages"
    )
    proposals: Mapped[List["SponsorshipProposal"]] = relationship(
        "SponsorshipProposal", back_populates="package"
    )


class SponsorshipProposal(Base):
    __tablename__ = "sponsorship_proposals"

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'negotiating', 'accepted', 'rejected', 'withdrawn', 'expired')",
            name="ck_sponsorship_proposals_status",
        ),
        CheckConstraint(
            "proposed_amount IS NULL OR proposed_amount >= 0",
            name="ck_sponsorship_proposals_amount",
        ),
        Index("ix_sponsorship_proposals_listing", "listing_id"),
        Index("ix_sponsorship_proposals_proposer_org", "proposer_organization_id"),
        Index("ix_sponsorship_proposals_status", "status"),
        Index(
            "ix_sponsorship_proposals_active_lookup",
            "listing_id",
            "proposer_organization_id",
            "target_event_id",
            "status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    listing_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sponsorship_listings.id", ondelete="CASCADE"),
        nullable=False,
    )
    proposer_organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    target_event_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
    )
    package_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sponsorship_packages.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    proposed_amount: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 2), nullable=True
    )
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    proposed_benefits: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    responded_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    listing: Mapped["SponsorshipListing"] = relationship(
        "SponsorshipListing", back_populates="proposals"
    )
    proposer_organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[proposer_organization_id]
    )
    target_event: Mapped["Event"] = relationship("Event", foreign_keys=[target_event_id])
    package: Mapped[Optional["SponsorshipPackage"]] = relationship(
        "SponsorshipPackage", back_populates="proposals"
    )
    created_by_user: Mapped["User"] = relationship("User")
    negotiation_messages: Mapped[List["SponsorshipNegotiationMessage"]] = relationship(
        "SponsorshipNegotiationMessage",
        back_populates="proposal",
        cascade="all, delete-orphan",
        order_by="SponsorshipNegotiationMessage.created_at.asc()",
    )
    deal: Mapped[Optional["SponsorshipDeal"]] = relationship(
        "SponsorshipDeal", back_populates="proposal", uselist=False
    )


class SponsorshipNegotiationMessage(Base):
    __tablename__ = "sponsorship_negotiation_messages"

    __table_args__ = (
        CheckConstraint(
            "message_type IN ('message', 'counter_offer')",
            name="ck_sponsorship_negotiation_messages_type",
        ),
        CheckConstraint(
            "counter_amount IS NULL OR counter_amount >= 0",
            name="ck_sponsorship_negotiation_messages_amount",
        ),
        Index("ix_sponsorship_negotiation_messages_proposal", "proposal_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    proposal_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sponsorship_proposals.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    message_type: Mapped[str] = mapped_column(String(50), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    counter_amount: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 2), nullable=True
    )
    currency: Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    counter_package_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sponsorship_packages.id", ondelete="SET NULL"),
        nullable=True,
    )
    counter_benefits: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    proposal: Mapped["SponsorshipProposal"] = relationship(
        "SponsorshipProposal", back_populates="negotiation_messages"
    )
    author_organization: Mapped["Organization"] = relationship("Organization")
    author_user: Mapped["User"] = relationship("User")
    counter_package: Mapped[Optional["SponsorshipPackage"]] = relationship(
        "SponsorshipPackage"
    )


class SponsorshipDeal(Base):
    __tablename__ = "sponsorship_deals"

    __table_args__ = (
        CheckConstraint("agreed_amount >= 0", name="ck_sponsorship_deals_agreed_amount"),
        CheckConstraint(
            "status IN ('active', 'completed', 'cancelled')",
            name="ck_sponsorship_deals_status",
        ),
        CheckConstraint(
            "starts_at IS NULL OR ends_at IS NULL OR ends_at >= starts_at",
            name="ck_sponsorship_deals_timing",
        ),
        Index("ix_sponsorship_deals_sponsor_org", "sponsor_organization_id"),
        Index("ix_sponsorship_deals_organizer_org", "organizer_organization_id"),
        Index("ix_sponsorship_deals_event", "event_id"),
        Index("ix_sponsorship_deals_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    proposal_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sponsorship_proposals.id", ondelete="RESTRICT"),
        unique=True,
        nullable=False,
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("events.id", ondelete="RESTRICT"),
        nullable=False,
    )
    sponsor_organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
    )
    organizer_organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
    )
    agreed_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    agreed_terms: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    starts_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime, nullable=True)
    ends_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    proposal: Mapped["SponsorshipProposal"] = relationship(
        "SponsorshipProposal", back_populates="deal"
    )
    event: Mapped["Event"] = relationship("Event")
    sponsor_organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[sponsor_organization_id]
    )
    organizer_organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organizer_organization_id]
    )
    deliverables: Mapped[List["SponsorshipDeliverable"]] = relationship(
        "SponsorshipDeliverable",
        back_populates="deal",
        cascade="all, delete-orphan",
        order_by="SponsorshipDeliverable.created_at.asc()",
    )


class SponsorshipDeliverable(Base):
    __tablename__ = "sponsorship_deliverables"

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'in_progress', 'completed', 'rejected', 'cancelled')",
            name="ck_sponsorship_deliverables_status",
        ),
        Index("ix_sponsorship_deliverables_deal", "deal_id"),
        Index("ix_sponsorship_deliverables_responsible_org", "responsible_organization_id"),
        Index("ix_sponsorship_deliverables_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    deal_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sponsorship_deals.id", ondelete="CASCADE"),
        nullable=False,
    )
    responsible_organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    due_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    evidence_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    deal: Mapped["SponsorshipDeal"] = relationship(
        "SponsorshipDeal", back_populates="deliverables"
    )
    responsible_organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[responsible_organization_id]
    )
    created_by_user: Mapped["User"] = relationship("User")

