import uuid
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_optional_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.sponsorship import (
    SponsorshipListingCreate,
    SponsorshipListingRead,
    SponsorshipListingUpdate,
    SponsorshipPackageCreate,
    SponsorshipPackageRead,
    SponsorshipPackageUpdate,
)
from app.services.sponsorship_service import (
    close_sponsorship_listing,
    create_sponsorship_listing,
    create_sponsorship_package,
    delete_sponsorship_package,
    discover_sponsorship_listings,
    get_public_sponsorship_listing,
    list_org_sponsorship_listings,
    list_sponsorship_packages,
    publish_sponsorship_listing,
    update_sponsorship_listing,
    update_sponsorship_package,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Public Sponsorship Listings Discovery
# ---------------------------------------------------------------------------

@router.get("/sponsorship-listings", response_model=List[SponsorshipListingRead])
def get_public_listings(
    listing_type: Optional[str] = Query(None, pattern="^(seeking_sponsors|offering_sponsorship)$"),
    event_type: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    organization_name: Optional[str] = Query(None),
    min_budget: Optional[Decimal] = Query(None, ge=0),
    max_budget: Optional[Decimal] = Query(None, ge=0),
    currency: Optional[str] = Query(None, min_length=3, max_length=3),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Discover published, active sponsorship listings."""
    return discover_sponsorship_listings(
        db=db,
        listing_type=listing_type,
        event_type=event_type,
        city=city,
        org_name=organization_name,
        min_budget=min_budget,
        max_budget=max_budget,
        currency=currency,
        limit=limit,
        offset=offset,
    )


@router.get("/sponsorship-listings/{listing_id}", response_model=SponsorshipListingRead)
def get_listing_detail(
    listing_id: uuid.UUID,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    """Get public details for a published listing, or private details for authorized owners."""
    listing = get_public_sponsorship_listing(db=db, listing_id=listing_id, current_user=current_user)
    return SponsorshipListingRead(
        id=listing.id,
        owner_organization_id=listing.owner_organization_id,
        event_id=listing.event_id,
        listing_type=listing.listing_type,
        title=listing.title,
        description=listing.description,
        audience_description=listing.audience_description,
        benefits=listing.benefits,
        min_budget=listing.min_budget,
        max_budget=listing.max_budget,
        currency=listing.currency,
        status=listing.status,
        expires_at=listing.expires_at,
        created_by_user_id=listing.created_by_user_id,
        created_at=listing.created_at,
        updated_at=listing.updated_at,
        owner_organization_name=listing.owner_organization.name if listing.owner_organization else None,
        event_name=listing.event.name if listing.event else None,
        event_title=listing.event.name if listing.event else None,
        packages=[SponsorshipPackageRead.model_validate(p) for p in listing.packages],
    )


# ---------------------------------------------------------------------------
# Organization Sponsorship Listings Management
# ---------------------------------------------------------------------------

@router.post(
    "/organizations/{organization_id}/sponsorship-listings",
    response_model=SponsorshipListingRead,
    status_code=status.HTTP_201_CREATED,
)
def create_org_listing(
    organization_id: uuid.UUID,
    data: SponsorshipListingCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a draft sponsorship listing for an organization."""
    listing = create_sponsorship_listing(
        db=db, org_id=organization_id, data=data, current_user=current_user
    )
    return SponsorshipListingRead(
        id=listing.id,
        owner_organization_id=listing.owner_organization_id,
        event_id=listing.event_id,
        listing_type=listing.listing_type,
        title=listing.title,
        description=listing.description,
        audience_description=listing.audience_description,
        benefits=listing.benefits,
        min_budget=listing.min_budget,
        max_budget=listing.max_budget,
        currency=listing.currency,
        status=listing.status,
        expires_at=listing.expires_at,
        created_by_user_id=listing.created_by_user_id,
        created_at=listing.created_at,
        updated_at=listing.updated_at,
        packages=[],
    )


@router.get(
    "/organizations/{organization_id}/sponsorship-listings",
    response_model=List[SponsorshipListingRead],
)
def get_org_listings(
    organization_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all sponsorship listings (including drafts) for organization members."""
    listings = list_org_sponsorship_listings(
        db=db, org_id=organization_id, current_user=current_user
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


@router.patch("/sponsorship-listings/{listing_id}", response_model=SponsorshipListingRead)
def patch_listing(
    listing_id: uuid.UUID,
    data: SponsorshipListingUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update draft sponsorship listing details."""
    listing = update_sponsorship_listing(
        db=db, listing_id=listing_id, data=data, current_user=current_user
    )
    return SponsorshipListingRead(
        id=listing.id,
        owner_organization_id=listing.owner_organization_id,
        event_id=listing.event_id,
        listing_type=listing.listing_type,
        title=listing.title,
        description=listing.description,
        audience_description=listing.audience_description,
        benefits=listing.benefits,
        min_budget=listing.min_budget,
        max_budget=listing.max_budget,
        currency=listing.currency,
        status=listing.status,
        expires_at=listing.expires_at,
        created_by_user_id=listing.created_by_user_id,
        created_at=listing.created_at,
        updated_at=listing.updated_at,
        packages=[SponsorshipPackageRead.model_validate(p) for p in listing.packages],
    )


@router.post("/sponsorship-listings/{listing_id}/publish", response_model=SponsorshipListingRead)
def publish_listing(
    listing_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Publish a draft sponsorship listing."""
    listing = publish_sponsorship_listing(
        db=db, listing_id=listing_id, current_user=current_user
    )
    return SponsorshipListingRead(
        id=listing.id,
        owner_organization_id=listing.owner_organization_id,
        event_id=listing.event_id,
        listing_type=listing.listing_type,
        title=listing.title,
        description=listing.description,
        audience_description=listing.audience_description,
        benefits=listing.benefits,
        min_budget=listing.min_budget,
        max_budget=listing.max_budget,
        currency=listing.currency,
        status=listing.status,
        expires_at=listing.expires_at,
        created_by_user_id=listing.created_by_user_id,
        created_at=listing.created_at,
        updated_at=listing.updated_at,
        packages=[SponsorshipPackageRead.model_validate(p) for p in listing.packages],
    )


@router.post("/sponsorship-listings/{listing_id}/close", response_model=SponsorshipListingRead)
def close_listing(
    listing_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Close a sponsorship listing."""
    listing = close_sponsorship_listing(
        db=db, listing_id=listing_id, current_user=current_user
    )
    return SponsorshipListingRead(
        id=listing.id,
        owner_organization_id=listing.owner_organization_id,
        event_id=listing.event_id,
        listing_type=listing.listing_type,
        title=listing.title,
        description=listing.description,
        audience_description=listing.audience_description,
        benefits=listing.benefits,
        min_budget=listing.min_budget,
        max_budget=listing.max_budget,
        currency=listing.currency,
        status=listing.status,
        expires_at=listing.expires_at,
        created_by_user_id=listing.created_by_user_id,
        created_at=listing.created_at,
        updated_at=listing.updated_at,
        packages=[SponsorshipPackageRead.model_validate(p) for p in listing.packages],
    )


# ---------------------------------------------------------------------------
# Sponsorship Packages Management
# ---------------------------------------------------------------------------

@router.post(
    "/sponsorship-listings/{listing_id}/packages",
    response_model=SponsorshipPackageRead,
    status_code=status.HTTP_201_CREATED,
)
def create_package(
    listing_id: uuid.UUID,
    data: SponsorshipPackageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a sponsorship package for a listing."""
    return create_sponsorship_package(
        db=db, listing_id=listing_id, data=data, current_user=current_user
    )


@router.get(
    "/sponsorship-listings/{listing_id}/packages",
    response_model=List[SponsorshipPackageRead],
)
def get_packages(
    listing_id: uuid.UUID,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    """List packages for a sponsorship listing."""
    return list_sponsorship_packages(
        db=db, listing_id=listing_id, current_user=current_user
    )


@router.patch("/sponsorship-packages/{package_id}", response_model=SponsorshipPackageRead)
def patch_package(
    package_id: uuid.UUID,
    data: SponsorshipPackageUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a sponsorship package."""
    return update_sponsorship_package(
        db=db, package_id=package_id, data=data, current_user=current_user
    )


@router.delete("/sponsorship-packages/{package_id}", status_code=status.HTTP_200_OK)
def delete_package(
    package_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an unreferenced sponsorship package."""
    delete_sponsorship_package(db=db, package_id=package_id, current_user=current_user)
    return {"status": "deleted"}
