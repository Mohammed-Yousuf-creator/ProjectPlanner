import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.event import Event
from app.models.organization import Organization, OrganizationMember
from app.models.sponsorship import (
    SponsorshipDeal,
    SponsorshipDeliverable,
    SponsorshipListing,
    SponsorshipNegotiationMessage,
    SponsorshipPackage,
    SponsorshipProposal,
)
from app.models.user import User
from app.schemas.sponsorship import (
    SponsorDiscoveryRead,
    SponsorshipDealRead,
    SponsorshipDeliverableCreate,
    SponsorshipDeliverableRead,
    SponsorshipDeliverableUpdate,
    SponsorshipListingCreate,
    SponsorshipListingRead,
    SponsorshipListingUpdate,
    SponsorshipNegotiationMessageCreate,
    SponsorshipPackageCreate,
    SponsorshipPackageRead,
    SponsorshipPackageUpdate,
    SponsorshipProposalCreate,
    SponsorshipProposalRead,
)
from app.services.notification_service import create_notification


# ---------------------------------------------------------------------------
# Organization Authorization Helpers
# ---------------------------------------------------------------------------

def require_org_member(
    db: Session,
    org_id: uuid.UUID,
    user: User,
    allowed_roles: Optional[List[str]] = None,
) -> OrganizationMember:
    """Ensure user is an active member of organization with allowed roles."""
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    membership = db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user.id,
        )
    ).scalar_one_or_none()

    if not membership or membership.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not an active member of this organization",
        )

    if allowed_roles and membership.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient organization privileges",
        )

    return membership


def notify_org_admins(
    db: Session,
    org_id: uuid.UUID,
    notification_type: str,
    title: str,
    body: str,
    event_id: Optional[uuid.UUID] = None,
    data: Optional[Dict[str, Any]] = None,
    exclude_user_id: Optional[uuid.UUID] = None,
):
    """Dispatch in-app notifications to active owners and admins of an organization."""
    members = db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.status == "active",
            OrganizationMember.role.in_(["owner", "admin"]),
        )
    ).scalars().all()

    for m in members:
        if exclude_user_id and m.user_id == exclude_user_id:
            continue
        create_notification(
            db=db,
            user_id=m.user_id,
            notification_type=notification_type,
            title=title,
            body=body,
            event_id=event_id,
            data=data,
        )


# ---------------------------------------------------------------------------
# Sponsorship Listings Service
# ---------------------------------------------------------------------------

def create_sponsorship_listing(
    db: Session,
    org_id: uuid.UUID,
    data: SponsorshipListingCreate,
    current_user: User,
) -> SponsorshipListing:
    require_org_member(db, org_id, current_user, ["owner", "admin"])
    org = db.get(Organization, org_id)
    if not org or org.status != "active":
        raise HTTPException(status_code=400, detail="Organization is not active")

    # Validate listing_type compatibility
    if data.listing_type == "seeking_sponsors":
        if org.organization_type not in ("organizer", "both"):
            raise HTTPException(
                status_code=400,
                detail="Organization must be of type 'organizer' or 'both' to seek sponsors",
            )
        if not data.event_id:
            raise HTTPException(
                status_code=400,
                detail="event_id is required for 'seeking_sponsors' listings",
            )
        event = db.get(Event, data.event_id)
        if not event or event.organization_id != org_id:
            raise HTTPException(
                status_code=400,
                detail="Event does not belong to this organization",
            )
    elif data.listing_type == "offering_sponsorship":
        if org.organization_type not in ("sponsor", "both"):
            raise HTTPException(
                status_code=400,
                detail="Organization must be of type 'sponsor' or 'both' to offer sponsorship",
            )
        if data.event_id:
            event = db.get(Event, data.event_id)
            if not event or event.organization_id != org_id:
                raise HTTPException(
                    status_code=400,
                    detail="Event does not belong to this organization",
                )

    # Validate budgets
    if data.min_budget is not None and data.min_budget < 0:
        raise HTTPException(status_code=400, detail="min_budget must be non-negative")
    if data.max_budget is not None and data.max_budget < 0:
        raise HTTPException(status_code=400, detail="max_budget must be non-negative")
    if (
        data.min_budget is not None
        and data.max_budget is not None
        and data.max_budget < data.min_budget
    ):
        raise HTTPException(
            status_code=400, detail="max_budget cannot be less than min_budget"
        )

    listing = SponsorshipListing(
        id=uuid.uuid4(),
        owner_organization_id=org_id,
        event_id=data.event_id,
        listing_type=data.listing_type,
        title=data.title,
        description=data.description,
        audience_description=data.audience_description,
        benefits=data.benefits,
        min_budget=data.min_budget,
        max_budget=data.max_budget,
        currency=data.currency.upper(),
        status="draft",
        expires_at=data.expires_at,
        created_by_user_id=current_user.id,
    )
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return listing


def list_org_sponsorship_listings(
    db: Session,
    org_id: uuid.UUID,
    current_user: User,
) -> List[SponsorshipListing]:
    require_org_member(db, org_id, current_user)
    return (
        db.query(SponsorshipListing)
        .options(
            selectinload(SponsorshipListing.packages),
            selectinload(SponsorshipListing.event),
            selectinload(SponsorshipListing.owner_organization),
        )
        .filter(SponsorshipListing.owner_organization_id == org_id)
        .order_by(SponsorshipListing.created_at.desc())
        .all()
    )


def update_sponsorship_listing(
    db: Session,
    listing_id: uuid.UUID,
    data: SponsorshipListingUpdate,
    current_user: User,
) -> SponsorshipListing:
    listing = db.get(SponsorshipListing, listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Sponsorship listing not found")

    require_org_member(db, listing.owner_organization_id, current_user, ["owner", "admin"])

    if listing.status != "draft":
        raise HTTPException(
            status_code=400, detail="Only draft listings can be updated"
        )

    # Event ownership check if event_id updated
    if data.event_id is not None:
        event = db.get(Event, data.event_id)
        if not event or event.organization_id != listing.owner_organization_id:
            raise HTTPException(
                status_code=400,
                detail="Event does not belong to this organization",
            )
        listing.event_id = data.event_id

    # Budget checks
    min_b = data.min_budget if data.min_budget is not None else listing.min_budget
    max_b = data.max_budget if data.max_budget is not None else listing.max_budget
    if min_b is not None and min_b < 0:
        raise HTTPException(status_code=400, detail="min_budget must be non-negative")
    if max_b is not None and max_b < 0:
        raise HTTPException(status_code=400, detail="max_budget must be non-negative")
    if min_b is not None and max_b is not None and max_b < min_b:
        raise HTTPException(
            status_code=400, detail="max_budget cannot be less than min_budget"
        )

    if data.title is not None:
        listing.title = data.title
    if data.description is not None:
        listing.description = data.description
    if data.audience_description is not None:
        listing.audience_description = data.audience_description
    if data.benefits is not None:
        listing.benefits = data.benefits
    if data.min_budget is not None:
        listing.min_budget = data.min_budget
    if data.max_budget is not None:
        listing.max_budget = data.max_budget
    if data.currency is not None:
        listing.currency = data.currency.upper()
    if data.expires_at is not None:
        listing.expires_at = data.expires_at

    listing.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(listing)
    return listing


def publish_sponsorship_listing(
    db: Session,
    listing_id: uuid.UUID,
    current_user: User,
) -> SponsorshipListing:
    listing = db.get(SponsorshipListing, listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Sponsorship listing not found")

    require_org_member(db, listing.owner_organization_id, current_user, ["owner", "admin"])

    if listing.status == "closed":
        raise HTTPException(status_code=400, detail="Cannot publish a closed listing")

    now = datetime.now(timezone.utc)
    if listing.expires_at and listing.expires_at <= now:
        raise HTTPException(
            status_code=400, detail="Cannot publish an expired listing"
        )

    # Validate requirements
    if listing.listing_type == "seeking_sponsors":
        if not listing.event_id:
            raise HTTPException(
                status_code=400,
                detail="A valid event is required to publish a 'seeking_sponsors' listing",
            )
        event = db.get(Event, listing.event_id)
        if not event or event.organization_id != listing.owner_organization_id:
            raise HTTPException(
                status_code=400,
                detail="Associated event does not belong to this organization",
            )
    elif listing.listing_type == "offering_sponsorship":
        org = db.get(Organization, listing.owner_organization_id)
        if not org or org.organization_type not in ("sponsor", "both"):
            raise HTTPException(
                status_code=400,
                detail="Listing owner organization must be a sponsor to offer sponsorship",
            )

    listing.status = "published"
    listing.updated_at = now
    db.commit()
    db.refresh(listing)
    return listing


def close_sponsorship_listing(
    db: Session,
    listing_id: uuid.UUID,
    current_user: User,
) -> SponsorshipListing:
    listing = db.get(SponsorshipListing, listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Sponsorship listing not found")

    require_org_member(db, listing.owner_organization_id, current_user, ["owner", "admin"])

    listing.status = "closed"
    listing.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(listing)
    return listing


def get_public_sponsorship_listing(
    db: Session,
    listing_id: uuid.UUID,
    current_user: Optional[User] = None,
) -> SponsorshipListing:
    listing = (
        db.query(SponsorshipListing)
        .options(
            selectinload(SponsorshipListing.packages),
            selectinload(SponsorshipListing.event),
            selectinload(SponsorshipListing.owner_organization),
        )
        .filter(SponsorshipListing.id == listing_id)
        .first()
    )
    if not listing:
        raise HTTPException(status_code=404, detail="Sponsorship listing not found")

    now = datetime.now(timezone.utc)
    is_published_and_valid = (
        listing.status == "published"
        and (listing.expires_at is None or listing.expires_at > now)
    )

    if not is_published_and_valid:
        # Check if caller is active member of owner org
        if current_user:
            member = db.execute(
                select(OrganizationMember).where(
                    OrganizationMember.organization_id == listing.owner_organization_id,
                    OrganizationMember.user_id == current_user.id,
                    OrganizationMember.status == "active",
                )
            ).scalar_one_or_none()
            if member:
                return listing
        raise HTTPException(status_code=404, detail="Sponsorship listing not found")

    return listing


# ---------------------------------------------------------------------------
# Sponsor Discovery Service
# ---------------------------------------------------------------------------

def discover_sponsors(
    db: Session,
    query: Optional[str] = None,
    currency: Optional[str] = None,
    min_budget: Optional[Decimal] = None,
    max_budget: Optional[Decimal] = None,
    limit: int = 20,
    offset: int = 0,
) -> List[SponsorDiscoveryRead]:
    now = datetime.now(timezone.utc)

    # Base query: published, unexpired offering_sponsorship listings
    listings_q = (
        select(SponsorshipListing)
        .where(
            SponsorshipListing.listing_type == "offering_sponsorship",
            SponsorshipListing.status == "published",
            or_(
                SponsorshipListing.expires_at.is_(None),
                SponsorshipListing.expires_at > now,
            ),
        )
    )

    if currency:
        listings_q = listings_q.where(SponsorshipListing.currency == currency.upper())
    if min_budget is not None:
        listings_q = listings_q.where(
            or_(
                SponsorshipListing.max_budget.is_(None),
                SponsorshipListing.max_budget >= min_budget,
            )
        )
    if max_budget is not None:
        listings_q = listings_q.where(
            or_(
                SponsorshipListing.min_budget.is_(None),
                SponsorshipListing.min_budget <= max_budget,
            )
        )

    valid_listings = (
        db.execute(
            listings_q.options(
                selectinload(SponsorshipListing.packages),
                selectinload(SponsorshipListing.event),
                selectinload(SponsorshipListing.owner_organization),
            )
        )
        .scalars()
        .all()
    )

    # Group listings by owner organization
    org_listings_map: Dict[uuid.UUID, List[SponsorshipListing]] = {}
    for lst in valid_listings:
        org_listings_map.setdefault(lst.owner_organization_id, []).append(lst)

    if not org_listings_map:
        return []

    # Query matching organizations
    orgs_q = select(Organization).where(
        Organization.id.in_(list(org_listings_map.keys())),
        Organization.status == "active",
        Organization.organization_type.in_(["sponsor", "both"]),
    )

    if query:
        term = f"%{query.strip()}%"
        orgs_q = orgs_q.where(
            or_(
                Organization.name.ilike(term),
                Organization.description.ilike(term),
            )
        )

    orgs = db.execute(
        orgs_q.order_by(Organization.name.asc()).offset(offset).limit(limit)
    ).scalars().all()

    results: List[SponsorDiscoveryRead] = []
    for org in orgs:
        lsts = org_listings_map.get(org.id, [])
        listing_reads = [
            SponsorshipListingRead(
                id=l.id,
                owner_organization_id=l.owner_organization_id,
                event_id=l.event_id,
                listing_type=l.listing_type,
                title=l.title,
                description=l.description,
                audience_description=l.audience_description,
                benefits=l.benefits,
                min_budget=l.min_budget,
                max_budget=l.max_budget,
                currency=l.currency,
                status=l.status,
                expires_at=l.expires_at,
                created_by_user_id=l.created_by_user_id,
                created_at=l.created_at,
                updated_at=l.updated_at,
                owner_organization_name=org.name,
                event_name=l.event.name if l.event else None,
                event_title=l.event.name if l.event else None,
                packages=[
                    SponsorshipPackageRead.model_validate(p) for p in l.packages
                ],
            )
            for l in lsts
        ]
        results.append(
            SponsorDiscoveryRead(
                id=org.id,
                name=org.name,
                description=org.description,
                website_url=org.website_url,
                logo_url=org.logo_url,
                published_listings_count=len(lsts),
                public_listings=listing_reads,
            )
        )

    return results


def discover_sponsorship_listings(
    db: Session,
    listing_type: Optional[str] = None,
    event_type: Optional[str] = None,
    city: Optional[str] = None,
    org_name: Optional[str] = None,
    min_budget: Optional[Decimal] = None,
    max_budget: Optional[Decimal] = None,
    currency: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
) -> List[SponsorshipListingRead]:
    now = datetime.now(timezone.utc)
    query = (
        db.query(SponsorshipListing)
        .join(Organization, SponsorshipListing.owner_organization_id == Organization.id)
        .outerjoin(Event, SponsorshipListing.event_id == Event.id)
        .options(
            selectinload(SponsorshipListing.packages),
            selectinload(SponsorshipListing.event),
            selectinload(SponsorshipListing.owner_organization),
        )
        .filter(
            SponsorshipListing.status == "published",
            or_(
                SponsorshipListing.expires_at.is_(None),
                SponsorshipListing.expires_at > now,
            ),
        )
    )

    if listing_type:
        query = query.filter(SponsorshipListing.listing_type == listing_type)
    if currency:
        query = query.filter(SponsorshipListing.currency == currency.upper())
    if event_type:
        query = query.filter(Event.event_type == event_type)
    if city:
        query = query.filter(Event.city.ilike(f"%{city.strip()}%"))
    if org_name:
        query = query.filter(Organization.name.ilike(f"%{org_name.strip()}%"))
    if min_budget is not None:
        query = query.filter(
            or_(
                SponsorshipListing.max_budget.is_(None),
                SponsorshipListing.max_budget >= min_budget,
            )
        )
    if max_budget is not None:
        query = query.filter(
            or_(
                SponsorshipListing.min_budget.is_(None),
                SponsorshipListing.min_budget <= max_budget,
            )
        )

    listings = (
        query.order_by(SponsorshipListing.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return [
        SponsorshipListingRead(
            id=l.id,
            owner_organization_id=l.owner_organization_id,
            event_id=l.event_id,
            listing_type=l.listing_type,
            title=l.title,
            description=l.description,
            audience_description=l.audience_description,
            benefits=l.benefits,
            min_budget=l.min_budget,
            max_budget=l.max_budget,
            currency=l.currency,
            status=l.status,
            expires_at=l.expires_at,
            created_by_user_id=l.created_by_user_id,
            created_at=l.created_at,
            updated_at=l.updated_at,
            owner_organization_name=l.owner_organization.name if l.owner_organization else None,
            event_name=l.event.name if l.event else None,
            event_title=l.event.name if l.event else None,
            packages=[SponsorshipPackageRead.model_validate(p) for p in l.packages],
        )
        for l in listings
    ]


# ---------------------------------------------------------------------------
# Sponsorship Package Service
# ---------------------------------------------------------------------------

def create_sponsorship_package(
    db: Session,
    listing_id: uuid.UUID,
    data: SponsorshipPackageCreate,
    current_user: User,
) -> SponsorshipPackage:
    listing = db.get(SponsorshipListing, listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Sponsorship listing not found")

    require_org_member(db, listing.owner_organization_id, current_user, ["owner", "admin"])

    if listing.status == "closed":
        raise HTTPException(
            status_code=400, detail="Cannot add packages to a closed listing"
        )

    pkg = SponsorshipPackage(
        id=uuid.uuid4(),
        listing_id=listing_id,
        name=data.name,
        description=data.description,
        price=data.price,
        currency=data.currency.upper(),
        benefits=data.benefits,
        available_slots=data.available_slots,
    )
    db.add(pkg)
    db.commit()
    db.refresh(pkg)
    return pkg


def list_sponsorship_packages(
    db: Session,
    listing_id: uuid.UUID,
    current_user: Optional[User] = None,
) -> List[SponsorshipPackage]:
    listing = db.get(SponsorshipListing, listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Sponsorship listing not found")

    now = datetime.now(timezone.utc)
    is_public = (
        listing.status == "published"
        and (listing.expires_at is None or listing.expires_at > now)
    )

    if not is_public:
        if current_user:
            require_org_member(db, listing.owner_organization_id, current_user)
        else:
            raise HTTPException(status_code=404, detail="Sponsorship listing not found")

    return (
        db.query(SponsorshipPackage)
        .filter(SponsorshipPackage.listing_id == listing_id)
        .order_by(SponsorshipPackage.price.asc())
        .all()
    )


def update_sponsorship_package(
    db: Session,
    package_id: uuid.UUID,
    data: SponsorshipPackageUpdate,
    current_user: User,
) -> SponsorshipPackage:
    pkg = (
        db.query(SponsorshipPackage)
        .options(joinedload(SponsorshipPackage.listing))
        .filter(SponsorshipPackage.id == package_id)
        .first()
    )
    if not pkg:
        raise HTTPException(status_code=404, detail="Sponsorship package not found")

    require_org_member(db, pkg.listing.owner_organization_id, current_user, ["owner", "admin"])

    # Check if proposals reference this package
    has_proposals = (
        db.query(SponsorshipProposal)
        .filter(SponsorshipProposal.package_id == package_id)
        .first()
        is not None
    )

    if has_proposals:
        # Check if commercial terms are changing
        price_changing = data.price is not None and data.price != pkg.price
        currency_changing = (
            data.currency is not None and data.currency.upper() != pkg.currency
        )
        benefits_changing = (
            data.benefits is not None and data.benefits != pkg.benefits
        )
        if price_changing or currency_changing or benefits_changing:
            raise HTTPException(
                status_code=400,
                detail="Cannot modify commercial terms of a package referenced by proposals. Create a new package instead.",
            )

    if data.name is not None:
        pkg.name = data.name
    if data.description is not None:
        pkg.description = data.description
    if data.price is not None:
        pkg.price = data.price
    if data.currency is not None:
        pkg.currency = data.currency.upper()
    if data.benefits is not None:
        pkg.benefits = data.benefits
    if data.available_slots is not None:
        pkg.available_slots = data.available_slots

    pkg.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(pkg)
    return pkg


def delete_sponsorship_package(
    db: Session,
    package_id: uuid.UUID,
    current_user: User,
):
    pkg = (
        db.query(SponsorshipPackage)
        .options(joinedload(SponsorshipPackage.listing))
        .filter(SponsorshipPackage.id == package_id)
        .first()
    )
    if not pkg:
        raise HTTPException(status_code=404, detail="Sponsorship package not found")

    require_org_member(db, pkg.listing.owner_organization_id, current_user, ["owner", "admin"])

    # Check proposal references
    has_proposals = (
        db.query(SponsorshipProposal)
        .filter(SponsorshipProposal.package_id == package_id)
        .first()
        is not None
    )
    if has_proposals:
        raise HTTPException(
            status_code=400,
            detail="Package is referenced by proposals and cannot be deleted",
        )

    db.delete(pkg)
    db.commit()


# ---------------------------------------------------------------------------
# Sponsorship Proposals Service
# ---------------------------------------------------------------------------

def create_sponsorship_proposal(
    db: Session,
    listing_id: uuid.UUID,
    data: SponsorshipProposalCreate,
    current_user: User,
) -> SponsorshipProposal:
    listing = (
        db.query(SponsorshipListing)
        .options(
            joinedload(SponsorshipListing.owner_organization),
            joinedload(SponsorshipListing.packages),
        )
        .filter(SponsorshipListing.id == listing_id)
        .first()
    )
    if not listing:
        raise HTTPException(status_code=404, detail="Sponsorship listing not found")

    now = datetime.now(timezone.utc)
    if listing.status != "published" or (
        listing.expires_at and listing.expires_at <= now
    ):
        raise HTTPException(
            status_code=400,
            detail="Cannot propose to a listing that is not currently published and active",
        )

    # Determine proposing organization and validate roles
    proposer_org_id: Optional[uuid.UUID] = None

    if listing.listing_type == "offering_sponsorship":
        # Target event must be provided and belong to the proposing organizer org
        target_event = db.get(Event, data.target_event_id)
        if not target_event:
            raise HTTPException(status_code=404, detail="Target event not found")

        proposer_org_id = target_event.organization_id
        require_org_member(db, proposer_org_id, current_user, ["owner", "admin"])
        proposer_org = db.get(Organization, proposer_org_id)
        if not proposer_org or proposer_org.organization_type not in ("organizer", "both"):
            raise HTTPException(
                status_code=400,
                detail="Proposing organization must be of type 'organizer' or 'both'",
            )

    elif listing.listing_type == "seeking_sponsors":
        # Target event must be the listing's event
        if data.target_event_id != listing.event_id:
            raise HTTPException(
                status_code=400,
                detail="Target event must match the listing's event",
            )
        target_event = db.get(Event, data.target_event_id)
        if not target_event:
            raise HTTPException(status_code=404, detail="Target event not found")

        # Proposer must be a sponsor org where user is active owner/admin
        user_sponsor_memberships = db.execute(
            select(OrganizationMember)
            .join(Organization, OrganizationMember.organization_id == Organization.id)
            .where(
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == "active",
                OrganizationMember.role.in_(["owner", "admin"]),
                Organization.status == "active",
                Organization.organization_type.in_(["sponsor", "both"]),
                Organization.id != listing.owner_organization_id,
            )
        ).scalars().all()

        if not user_sponsor_memberships:
            raise HTTPException(
                status_code=403,
                detail="You must be an owner/admin of an active sponsor organization to propose to this listing",
            )

        if data.proposer_organization_id:
            matching = [
                m
                for m in user_sponsor_memberships
                if m.organization_id == data.proposer_organization_id
            ]
            if not matching:
                raise HTTPException(
                    status_code=403,
                    detail="You are not an authorized owner/admin of the specified sponsor organization",
                )
            proposer_org_id = data.proposer_organization_id
        else:
            proposer_org_id = user_sponsor_memberships[0].organization_id

        proposer_org = db.get(Organization, proposer_org_id)

    # Both organizations must be different
    if proposer_org_id == listing.owner_organization_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot create a sponsorship proposal to your own organization",
        )

    # Package validation
    selected_package: Optional[SponsorshipPackage] = None
    if data.package_id:
        selected_package = db.get(SponsorshipPackage, data.package_id)
        if not selected_package or selected_package.listing_id != listing.id:
            raise HTTPException(
                status_code=400,
                detail="Selected package does not belong to this sponsorship listing",
            )

    proposed_amount = (
        data.proposed_amount
        if data.proposed_amount is not None
        else (selected_package.price if selected_package else None)
    )
    if proposed_amount is None:
        raise HTTPException(
            status_code=400,
            detail="Proposed amount is required when no package is selected",
        )

    proposed_benefits = (
        data.proposed_benefits
        if data.proposed_benefits is not None
        else (selected_package.benefits if selected_package else None)
    )

    # Prevent duplicate active proposal
    existing_active = (
        db.query(SponsorshipProposal)
        .filter(
            SponsorshipProposal.listing_id == listing.id,
            SponsorshipProposal.proposer_organization_id == proposer_org_id,
            SponsorshipProposal.target_event_id == data.target_event_id,
            SponsorshipProposal.status.in_(["pending", "negotiating"]),
        )
        .first()
    )
    if existing_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An active proposal already exists for this listing and event",
        )

    proposal = SponsorshipProposal(
        id=uuid.uuid4(),
        listing_id=listing.id,
        proposer_organization_id=proposer_org_id,
        target_event_id=data.target_event_id,
        package_id=data.package_id,
        created_by_user_id=current_user.id,
        proposed_amount=proposed_amount,
        currency=data.currency.upper(),
        proposed_benefits=proposed_benefits,
        message=data.message,
        status="pending",
    )
    db.add(proposal)
    db.commit()
    db.refresh(proposal)

    # Dispatch notification to listing owner org
    notify_org_admins(
        db=db,
        org_id=listing.owner_organization_id,
        notification_type="sponsorship_proposal_received",
        title=f"New Sponsorship Proposal: {listing.title}",
        body=f"{proposer_org.name} has submitted a sponsorship proposal: {data.message[:120]}",
        event_id=data.target_event_id,
        data={"proposal_id": str(proposal.id), "listing_id": str(listing.id)},
        exclude_user_id=current_user.id,
    )
    db.commit()

    return proposal


def list_org_sponsorship_proposals(
    db: Session,
    org_id: uuid.UUID,
    current_user: User,
    direction: Optional[str] = None,
    status_filter: Optional[str] = None,
) -> List[SponsorshipProposal]:
    require_org_member(db, org_id, current_user)

    query = (
        db.query(SponsorshipProposal)
        .join(SponsorshipListing, SponsorshipProposal.listing_id == SponsorshipListing.id)
        .options(
            joinedload(SponsorshipProposal.listing).joinedload(SponsorshipListing.owner_organization),
            joinedload(SponsorshipProposal.proposer_organization),
            joinedload(SponsorshipProposal.target_event),
            joinedload(SponsorshipProposal.package),
        )
    )

    if direction == "incoming":
        query = query.filter(SponsorshipListing.owner_organization_id == org_id)
    elif direction == "outgoing":
        query = query.filter(SponsorshipProposal.proposer_organization_id == org_id)
    else:
        query = query.filter(
            or_(
                SponsorshipListing.owner_organization_id == org_id,
                SponsorshipProposal.proposer_organization_id == org_id,
            )
        )

    if status_filter:
        query = query.filter(SponsorshipProposal.status == status_filter)

    return query.order_by(SponsorshipProposal.created_at.desc()).all()


def get_sponsorship_proposal(
    db: Session,
    proposal_id: uuid.UUID,
    current_user: User,
) -> SponsorshipProposal:
    proposal = (
        db.query(SponsorshipProposal)
        .options(
            joinedload(SponsorshipProposal.listing).joinedload(SponsorshipListing.owner_organization),
            joinedload(SponsorshipProposal.proposer_organization),
            joinedload(SponsorshipProposal.target_event),
            joinedload(SponsorshipProposal.package),
            selectinload(SponsorshipProposal.negotiation_messages).joinedload(
                SponsorshipNegotiationMessage.author_organization
            ),
            selectinload(SponsorshipProposal.negotiation_messages).joinedload(
                SponsorshipNegotiationMessage.author_user
            ),
        )
        .filter(SponsorshipProposal.id == proposal_id)
        .first()
    )
    if not proposal:
        raise HTTPException(status_code=404, detail="Sponsorship proposal not found")

    # Access check: member of proposer org OR listing owner org
    is_proposer_member = (
        db.execute(
            select(OrganizationMember).where(
                OrganizationMember.organization_id == proposal.proposer_organization_id,
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == "active",
            )
        ).scalar_one_or_none()
        is not None
    )
    is_listing_owner_member = (
        db.execute(
            select(OrganizationMember).where(
                OrganizationMember.organization_id == proposal.listing.owner_organization_id,
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == "active",
            )
        ).scalar_one_or_none()
        is not None
    )

    if not (is_proposer_member or is_listing_owner_member):
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to view this sponsorship proposal",
        )

    return proposal


# ---------------------------------------------------------------------------
# Negotiation & Counteroffers Service
# ---------------------------------------------------------------------------

def create_negotiation_message(
    db: Session,
    proposal_id: uuid.UUID,
    data: SponsorshipNegotiationMessageCreate,
    current_user: User,
) -> SponsorshipNegotiationMessage:
    proposal = (
        db.query(SponsorshipProposal)
        .options(
            joinedload(SponsorshipProposal.listing),
            joinedload(SponsorshipProposal.proposer_organization),
        )
        .filter(SponsorshipProposal.id == proposal_id)
        .first()
    )
    if not proposal:
        raise HTTPException(status_code=404, detail="Sponsorship proposal not found")

    if proposal.status not in ("pending", "negotiating"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot add negotiation messages to proposal with status '{proposal.status}'",
        )

    # Determine author organization
    is_proposer_admin = (
        db.execute(
            select(OrganizationMember).where(
                OrganizationMember.organization_id == proposal.proposer_organization_id,
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == "active",
                OrganizationMember.role.in_(["owner", "admin"]),
            )
        ).scalar_one_or_none()
        is not None
    )
    is_listing_owner_admin = (
        db.execute(
            select(OrganizationMember).where(
                OrganizationMember.organization_id == proposal.listing.owner_organization_id,
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == "active",
                OrganizationMember.role.in_(["owner", "admin"]),
            )
        ).scalar_one_or_none()
        is not None
    )

    if not (is_proposer_admin or is_listing_owner_admin):
        raise HTTPException(
            status_code=403,
            detail="You must be an owner/admin of one of the participating organizations to negotiate",
        )

    author_org_id = (
        proposal.proposer_organization_id
        if is_proposer_admin and not is_listing_owner_admin
        else proposal.listing.owner_organization_id
    )
    other_org_id = (
        proposal.listing.owner_organization_id
        if author_org_id == proposal.proposer_organization_id
        else proposal.proposer_organization_id
    )

    # Validate counter offer terms
    if data.message_type == "counter_offer":
        if data.counter_amount is None:
            raise HTTPException(
                status_code=400, detail="counter_amount is required for counteroffers"
            )
        if not data.currency:
            raise HTTPException(
                status_code=400, detail="currency is required for counteroffers"
            )
        if data.counter_package_id:
            pkg = db.get(SponsorshipPackage, data.counter_package_id)
            if not pkg or pkg.listing_id != proposal.listing_id:
                raise HTTPException(
                    status_code=400,
                    detail="Counter package does not belong to the proposal's listing",
                )
        proposal.status = "negotiating"
        proposal.updated_at = datetime.now(timezone.utc)

    msg = SponsorshipNegotiationMessage(
        id=uuid.uuid4(),
        proposal_id=proposal.id,
        author_organization_id=author_org_id,
        author_user_id=current_user.id,
        message_type=data.message_type,
        message=data.message,
        counter_amount=data.counter_amount,
        currency=data.currency.upper() if data.currency else None,
        counter_package_id=data.counter_package_id,
        counter_benefits=data.counter_benefits,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    # Notify other party
    notif_type = (
        "sponsorship_counteroffer_received"
        if data.message_type == "counter_offer"
        else "sponsorship_negotiation_message_received"
    )
    notif_title = (
        "New Sponsorship Counteroffer"
        if data.message_type == "counter_offer"
        else "New Sponsorship Message"
    )
    author_org = db.get(Organization, author_org_id)
    notify_org_admins(
        db=db,
        org_id=other_org_id,
        notification_type=notif_type,
        title=notif_title,
        body=f"{author_org.name if author_org else 'Partner'} sent a {data.message_type}: {data.message[:100]}",
        event_id=proposal.target_event_id,
        data={"proposal_id": str(proposal.id), "message_id": str(msg.id)},
        exclude_user_id=current_user.id,
    )
    db.commit()

    return msg


def accept_sponsorship_proposal(
    db: Session,
    proposal_id: uuid.UUID,
    current_user: User,
) -> SponsorshipDeal:
    proposal = (
        db.query(SponsorshipProposal)
        .options(
            joinedload(SponsorshipProposal.listing),
            joinedload(SponsorshipProposal.package),
            selectinload(SponsorshipProposal.negotiation_messages),
        )
        .filter(SponsorshipProposal.id == proposal_id)
        .first()
    )
    if not proposal:
        raise HTTPException(status_code=404, detail="Sponsorship proposal not found")

    if proposal.status not in ("pending", "negotiating"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot accept proposal with status '{proposal.status}'",
        )

    # Determine latest counteroffer
    counter_offers = [
        m for m in proposal.negotiation_messages if m.message_type == "counter_offer"
    ]
    counter_offers.sort(key=lambda m: m.created_at)

    latest_counter = counter_offers[-1] if counter_offers else None

    # Receiving organization identification
    if latest_counter:
        receiving_org_id = (
            proposal.proposer_organization_id
            if latest_counter.author_organization_id == proposal.listing.owner_organization_id
            else proposal.listing.owner_organization_id
        )
    else:
        receiving_org_id = proposal.listing.owner_organization_id

    # Caller must be active owner/admin of receiving organization
    require_org_member(db, receiving_org_id, current_user, ["owner", "admin"])

    # Determine agreed terms
    if latest_counter:
        agreed_amount = latest_counter.counter_amount or Decimal("0")
        agreed_currency = latest_counter.currency or proposal.currency
        agreed_terms = {
            "source": "counter_offer",
            "message_id": str(latest_counter.id),
            "package_id": str(latest_counter.counter_package_id) if latest_counter.counter_package_id else None,
            "benefits": latest_counter.counter_benefits,
        }
    else:
        agreed_amount = proposal.proposed_amount or Decimal("0")
        agreed_currency = proposal.currency
        agreed_terms = {
            "source": "initial_proposal",
            "package_id": str(proposal.package_id) if proposal.package_id else None,
            "benefits": proposal.proposed_benefits,
        }

    # Derive sponsor and organizer roles
    if proposal.listing.listing_type == "seeking_sponsors":
        organizer_org_id = proposal.listing.owner_organization_id
        sponsor_org_id = proposal.proposer_organization_id
    else:
        sponsor_org_id = proposal.listing.owner_organization_id
        organizer_org_id = proposal.proposer_organization_id

    # Check duplicate deal
    existing_deal = (
        db.query(SponsorshipDeal)
        .filter(SponsorshipDeal.proposal_id == proposal.id)
        .first()
    )
    if existing_deal:
        raise HTTPException(
            status_code=409, detail="A sponsorship deal already exists for this proposal"
        )

    now = datetime.now(timezone.utc)
    proposal.status = "accepted"
    proposal.responded_at = now
    proposal.updated_at = now

    deal = SponsorshipDeal(
        id=uuid.uuid4(),
        proposal_id=proposal.id,
        event_id=proposal.target_event_id,
        sponsor_organization_id=sponsor_org_id,
        organizer_organization_id=organizer_org_id,
        agreed_amount=agreed_amount,
        currency=agreed_currency,
        agreed_terms=agreed_terms,
        status="active",
    )
    db.add(deal)

    # Decrement available slots on package if applicable
    if proposal.package and proposal.package.available_slots:
        if proposal.package.available_slots > 0:
            proposal.package.available_slots -= 1

    db.commit()
    db.refresh(deal)

    # Notify both organizations
    notify_org_admins(
        db=db,
        org_id=sponsor_org_id,
        notification_type="sponsorship_proposal_accepted",
        title="Sponsorship Proposal Accepted",
        body=f"Sponsorship deal finalized for amount {agreed_currency} {agreed_amount}",
        event_id=proposal.target_event_id,
        data={"deal_id": str(deal.id), "proposal_id": str(proposal.id)},
        exclude_user_id=current_user.id,
    )
    notify_org_admins(
        db=db,
        org_id=organizer_org_id,
        notification_type="sponsorship_proposal_accepted",
        title="Sponsorship Proposal Accepted",
        body=f"Sponsorship deal finalized for amount {agreed_currency} {agreed_amount}",
        event_id=proposal.target_event_id,
        data={"deal_id": str(deal.id), "proposal_id": str(proposal.id)},
        exclude_user_id=current_user.id,
    )
    db.commit()

    return deal


def reject_sponsorship_proposal(
    db: Session,
    proposal_id: uuid.UUID,
    current_user: User,
) -> SponsorshipProposal:
    proposal = (
        db.query(SponsorshipProposal)
        .options(
            joinedload(SponsorshipProposal.listing),
            selectinload(SponsorshipProposal.negotiation_messages),
        )
        .filter(SponsorshipProposal.id == proposal_id)
        .first()
    )
    if not proposal:
        raise HTTPException(status_code=404, detail="Sponsorship proposal not found")

    if proposal.status not in ("pending", "negotiating"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reject proposal with status '{proposal.status}'",
        )

    counter_offers = [
        m for m in proposal.negotiation_messages if m.message_type == "counter_offer"
    ]
    counter_offers.sort(key=lambda m: m.created_at)
    latest_counter = counter_offers[-1] if counter_offers else None

    if latest_counter:
        receiving_org_id = (
            proposal.proposer_organization_id
            if latest_counter.author_organization_id == proposal.listing.owner_organization_id
            else proposal.listing.owner_organization_id
        )
    else:
        receiving_org_id = proposal.listing.owner_organization_id

    require_org_member(db, receiving_org_id, current_user, ["owner", "admin"])

    now = datetime.now(timezone.utc)
    proposal.status = "rejected"
    proposal.responded_at = now
    proposal.updated_at = now
    db.commit()

    other_org_id = (
        proposal.proposer_organization_id
        if receiving_org_id == proposal.listing.owner_organization_id
        else proposal.listing.owner_organization_id
    )
    notify_org_admins(
        db=db,
        org_id=other_org_id,
        notification_type="sponsorship_proposal_rejected",
        title="Sponsorship Proposal Rejected",
        body="The sponsorship proposal/counteroffer was declined.",
        event_id=proposal.target_event_id,
        data={"proposal_id": str(proposal.id)},
        exclude_user_id=current_user.id,
    )
    db.commit()

    return proposal


def withdraw_sponsorship_proposal(
    db: Session,
    proposal_id: uuid.UUID,
    current_user: User,
) -> SponsorshipProposal:
    proposal = (
        db.query(SponsorshipProposal)
        .options(joinedload(SponsorshipProposal.listing))
        .filter(SponsorshipProposal.id == proposal_id)
        .first()
    )
    if not proposal:
        raise HTTPException(status_code=404, detail="Sponsorship proposal not found")

    if proposal.status not in ("pending", "negotiating"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot withdraw proposal with status '{proposal.status}'",
        )

    require_org_member(db, proposal.proposer_organization_id, current_user, ["owner", "admin"])

    now = datetime.now(timezone.utc)
    proposal.status = "withdrawn"
    proposal.responded_at = now
    proposal.updated_at = now
    db.commit()

    notify_org_admins(
        db=db,
        org_id=proposal.listing.owner_organization_id,
        notification_type="sponsorship_proposal_withdrawn",
        title="Sponsorship Proposal Withdrawn",
        body="The proposer organization has withdrawn their sponsorship proposal.",
        event_id=proposal.target_event_id,
        data={"proposal_id": str(proposal.id)},
        exclude_user_id=current_user.id,
    )
    db.commit()

    return proposal


# ---------------------------------------------------------------------------
# Sponsorship Deals Service
# ---------------------------------------------------------------------------

def list_org_sponsorship_deals(
    db: Session,
    org_id: uuid.UUID,
    current_user: User,
    status_filter: Optional[str] = None,
    event_id: Optional[uuid.UUID] = None,
    limit: int = 20,
    offset: int = 0,
) -> List[SponsorshipDeal]:
    require_org_member(db, org_id, current_user)

    query = (
        db.query(SponsorshipDeal)
        .options(
            joinedload(SponsorshipDeal.event),
            joinedload(SponsorshipDeal.sponsor_organization),
            joinedload(SponsorshipDeal.organizer_organization),
            selectinload(SponsorshipDeal.deliverables),
        )
        .filter(
            or_(
                SponsorshipDeal.sponsor_organization_id == org_id,
                SponsorshipDeal.organizer_organization_id == org_id,
            )
        )
    )

    if status_filter:
        query = query.filter(SponsorshipDeal.status == status_filter)
    if event_id:
        query = query.filter(SponsorshipDeal.event_id == event_id)

    return query.order_by(SponsorshipDeal.created_at.desc()).offset(offset).limit(limit).all()


def get_sponsorship_deal(
    db: Session,
    deal_id: uuid.UUID,
    current_user: User,
) -> SponsorshipDeal:
    deal = (
        db.query(SponsorshipDeal)
        .options(
            joinedload(SponsorshipDeal.event),
            joinedload(SponsorshipDeal.sponsor_organization),
            joinedload(SponsorshipDeal.organizer_organization),
            selectinload(SponsorshipDeal.deliverables).joinedload(
                SponsorshipDeliverable.responsible_organization
            ),
        )
        .filter(SponsorshipDeal.id == deal_id)
        .first()
    )
    if not deal:
        raise HTTPException(status_code=404, detail="Sponsorship deal not found")

    is_sponsor_member = (
        db.execute(
            select(OrganizationMember).where(
                OrganizationMember.organization_id == deal.sponsor_organization_id,
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == "active",
            )
        ).scalar_one_or_none()
        is not None
    )
    is_organizer_member = (
        db.execute(
            select(OrganizationMember).where(
                OrganizationMember.organization_id == deal.organizer_organization_id,
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == "active",
            )
        ).scalar_one_or_none()
        is not None
    )

    if not (is_sponsor_member or is_organizer_member):
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to view this sponsorship deal",
        )

    return deal


def update_sponsorship_deal_status(
    db: Session,
    deal_id: uuid.UUID,
    new_status: str,
    current_user: User,
) -> SponsorshipDeal:
    deal = db.get(SponsorshipDeal, deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail="Sponsorship deal not found")

    is_sponsor_admin = (
        db.execute(
            select(OrganizationMember).where(
                OrganizationMember.organization_id == deal.sponsor_organization_id,
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == "active",
                OrganizationMember.role.in_(["owner", "admin"]),
            )
        ).scalar_one_or_none()
        is not None
    )
    is_organizer_admin = (
        db.execute(
            select(OrganizationMember).where(
                OrganizationMember.organization_id == deal.organizer_organization_id,
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == "active",
                OrganizationMember.role.in_(["owner", "admin"]),
            )
        ).scalar_one_or_none()
        is not None
    )

    if not (is_sponsor_admin or is_organizer_admin):
        raise HTTPException(
            status_code=403,
            detail="You must be an owner/admin of a participating organization to update deal status",
        )

    if deal.status == "completed":
        raise HTTPException(
            status_code=400, detail="Completed deals cannot be reopened"
        )
    if deal.status == "cancelled":
        raise HTTPException(
            status_code=400, detail="Cancelled deals cannot be reactivated"
        )

    deal.status = new_status
    deal.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(deal)

    # Notify both organizations
    other_org = (
        deal.sponsor_organization_id
        if is_organizer_admin
        else deal.organizer_organization_id
    )
    notify_org_admins(
        db=db,
        org_id=other_org,
        notification_type="sponsorship_deal_status_updated",
        title=f"Sponsorship Deal {new_status.capitalize()}",
        body=f"Sponsorship deal status changed to '{new_status}'",
        event_id=deal.event_id,
        data={"deal_id": str(deal.id), "status": new_status},
        exclude_user_id=current_user.id,
    )
    db.commit()

    return deal


# ---------------------------------------------------------------------------
# Sponsorship Deliverables Service
# ---------------------------------------------------------------------------

def create_sponsorship_deliverable(
    db: Session,
    deal_id: uuid.UUID,
    data: SponsorshipDeliverableCreate,
    current_user: User,
) -> SponsorshipDeliverable:
    deal = db.get(SponsorshipDeal, deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail="Sponsorship deal not found")

    is_sponsor_admin = (
        db.execute(
            select(OrganizationMember).where(
                OrganizationMember.organization_id == deal.sponsor_organization_id,
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == "active",
                OrganizationMember.role.in_(["owner", "admin"]),
            )
        ).scalar_one_or_none()
        is not None
    )
    is_organizer_admin = (
        db.execute(
            select(OrganizationMember).where(
                OrganizationMember.organization_id == deal.organizer_organization_id,
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == "active",
                OrganizationMember.role.in_(["owner", "admin"]),
            )
        ).scalar_one_or_none()
        is not None
    )

    if not (is_sponsor_admin or is_organizer_admin):
        raise HTTPException(
            status_code=403,
            detail="You must be an owner/admin of a participating organization to create deliverables",
        )

    if data.responsible_organization_id not in (
        deal.sponsor_organization_id,
        deal.organizer_organization_id,
    ):
        raise HTTPException(
            status_code=400,
            detail="Responsible organization must be either the sponsor or organizer party to this deal",
        )

    deliverable = SponsorshipDeliverable(
        id=uuid.uuid4(),
        deal_id=deal.id,
        responsible_organization_id=data.responsible_organization_id,
        title=data.title,
        description=data.description,
        due_at=data.due_at,
        status="pending",
        created_by_user_id=current_user.id,
    )
    db.add(deliverable)
    db.commit()
    db.refresh(deliverable)

    notify_org_admins(
        db=db,
        org_id=data.responsible_organization_id,
        notification_type="sponsorship_deliverable_assigned",
        title="New Sponsorship Deliverable Assigned",
        body=f"Deliverable assigned: {data.title}",
        event_id=deal.event_id,
        data={"deal_id": str(deal.id), "deliverable_id": str(deliverable.id)},
        exclude_user_id=current_user.id,
    )
    db.commit()

    return deliverable


def list_sponsorship_deliverables(
    db: Session,
    deal_id: uuid.UUID,
    current_user: User,
) -> List[SponsorshipDeliverable]:
    deal = db.get(SponsorshipDeal, deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail="Sponsorship deal not found")

    is_sponsor_member = (
        db.execute(
            select(OrganizationMember).where(
                OrganizationMember.organization_id == deal.sponsor_organization_id,
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == "active",
            )
        ).scalar_one_or_none()
        is not None
    )
    is_organizer_member = (
        db.execute(
            select(OrganizationMember).where(
                OrganizationMember.organization_id == deal.organizer_organization_id,
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == "active",
            )
        ).scalar_one_or_none()
        is not None
    )

    if not (is_sponsor_member or is_organizer_member):
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to view deliverables for this deal",
        )

    return (
        db.query(SponsorshipDeliverable)
        .options(joinedload(SponsorshipDeliverable.responsible_organization))
        .filter(SponsorshipDeliverable.deal_id == deal_id)
        .order_by(SponsorshipDeliverable.created_at.asc())
        .all()
    )


def update_sponsorship_deliverable(
    db: Session,
    deliverable_id: uuid.UUID,
    data: SponsorshipDeliverableUpdate,
    current_user: User,
) -> SponsorshipDeliverable:
    deliverable = (
        db.query(SponsorshipDeliverable)
        .options(joinedload(SponsorshipDeliverable.deal))
        .filter(SponsorshipDeliverable.id == deliverable_id)
        .first()
    )
    if not deliverable:
        raise HTTPException(status_code=404, detail="Deliverable not found")

    deal = deliverable.deal

    is_resp_admin = (
        db.execute(
            select(OrganizationMember).where(
                OrganizationMember.organization_id == deliverable.responsible_organization_id,
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == "active",
                OrganizationMember.role.in_(["owner", "admin"]),
            )
        ).scalar_one_or_none()
        is not None
    )
    is_deal_admin = (
        db.execute(
            select(OrganizationMember).where(
                OrganizationMember.organization_id.in_(
                    [deal.sponsor_organization_id, deal.organizer_organization_id]
                ),
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.status == "active",
                OrganizationMember.role.in_(["owner", "admin"]),
            )
        ).scalar_one_or_none()
        is not None
    )

    if not (is_resp_admin or is_deal_admin):
        raise HTTPException(
            status_code=403,
            detail="You must be an authorized admin of the responsible organization or deal party to update this deliverable",
        )

    # Validate evidence URL if provided
    if data.evidence_url is not None:
        url = data.evidence_url.strip()
        if url and not (url.startswith("http://") or url.startswith("https://")):
            raise HTTPException(
                status_code=400,
                detail="evidence_url must be a valid HTTP(S) URL",
            )
        deliverable.evidence_url = url or None

    if data.title is not None:
        deliverable.title = data.title
    if data.description is not None:
        deliverable.description = data.description
    if data.due_at is not None:
        deliverable.due_at = data.due_at

    now = datetime.now(timezone.utc)
    if data.status is not None:
        if data.status == "completed":
            deliverable.completed_at = now
        elif deliverable.status == "completed" and data.status != "completed":
            deliverable.completed_at = None
        deliverable.status = data.status

    deliverable.updated_at = now
    db.commit()
    db.refresh(deliverable)

    # Deliver notifications on completion or rejection
    if data.status in ("completed", "rejected"):
        other_party = (
            deal.sponsor_organization_id
            if deliverable.responsible_organization_id == deal.organizer_organization_id
            else deal.organizer_organization_id
        )
        notif_type = (
            "sponsorship_deliverable_completed"
            if data.status == "completed"
            else "sponsorship_deliverable_rejected"
        )
        notify_org_admins(
            db=db,
            org_id=other_party,
            notification_type=notif_type,
            title=f"Deliverable {data.status.capitalize()}: {deliverable.title}",
            body=f"Sponsorship deliverable '{deliverable.title}' has been marked as '{data.status}'",
            event_id=deal.event_id,
            data={"deal_id": str(deal.id), "deliverable_id": str(deliverable.id)},
            exclude_user_id=current_user.id,
        )
        db.commit()

    return deliverable
