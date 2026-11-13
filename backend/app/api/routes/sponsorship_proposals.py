import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.sponsorship import (
    SponsorshipDealRead,
    SponsorshipListingRead,
    SponsorshipNegotiationMessageCreate,
    SponsorshipNegotiationMessageRead,
    SponsorshipPackageRead,
    SponsorshipProposalCreate,
    SponsorshipProposalRead,
)
from app.services.sponsorship_service import (
    accept_sponsorship_proposal,
    create_negotiation_message,
    create_sponsorship_proposal,
    get_sponsorship_proposal,
    list_org_sponsorship_proposals,
    reject_sponsorship_proposal,
    withdraw_sponsorship_proposal,
)

router = APIRouter()


@router.post(
    "/sponsorship-listings/{listing_id}/proposals",
    response_model=SponsorshipProposalRead,
    status_code=status.HTTP_201_CREATED,
)
def post_proposal(
    listing_id: uuid.UUID,
    data: SponsorshipProposalCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a sponsorship proposal for a listing."""
    p = create_sponsorship_proposal(
        db=db, listing_id=listing_id, data=data, current_user=current_user
    )
    return SponsorshipProposalRead(
        id=p.id,
        listing_id=p.listing_id,
        proposer_organization_id=p.proposer_organization_id,
        target_event_id=p.target_event_id,
        package_id=p.package_id,
        created_by_user_id=p.created_by_user_id,
        proposed_amount=p.proposed_amount,
        currency=p.currency,
        proposed_benefits=p.proposed_benefits,
        message=p.message,
        status=p.status,
        responded_at=p.responded_at,
        created_at=p.created_at,
        updated_at=p.updated_at,
        listing_title=p.listing.title if p.listing else None,
        listing_owner_organization_id=p.listing.owner_organization_id if p.listing else None,
        listing_owner_organization_name=p.listing.owner_organization.name if p.listing and p.listing.owner_organization else None,
        proposer_organization_name=p.proposer_organization.name if p.proposer_organization else None,
        target_event_name=p.target_event.name if p.target_event else None,
        target_event_title=p.target_event.name if p.target_event else None,
        package_name=p.package.name if p.package else None,
    )


@router.get(
    "/organizations/{organization_id}/sponsorship-proposals",
    response_model=List[SponsorshipProposalRead],
)
def get_org_proposals(
    organization_id: uuid.UUID,
    direction: Optional[str] = Query(None, pattern="^(incoming|outgoing)$"),
    status: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List incoming and outgoing sponsorship proposals for an organization."""
    proposals = list_org_sponsorship_proposals(
        db=db,
        org_id=organization_id,
        current_user=current_user,
        direction=direction,
        status_filter=status,
    )
    return [
        SponsorshipProposalRead(
            id=p.id,
            listing_id=p.listing_id,
            proposer_organization_id=p.proposer_organization_id,
            target_event_id=p.target_event_id,
            package_id=p.package_id,
            created_by_user_id=p.created_by_user_id,
            proposed_amount=p.proposed_amount,
            currency=p.currency,
            proposed_benefits=p.proposed_benefits,
            message=p.message,
            status=p.status,
            responded_at=p.responded_at,
            created_at=p.created_at,
            updated_at=p.updated_at,
            listing_title=p.listing.title if p.listing else None,
            listing_owner_organization_id=p.listing.owner_organization_id if p.listing else None,
            listing_owner_organization_name=p.listing.owner_organization.name if p.listing and p.listing.owner_organization else None,
            proposer_organization_name=p.proposer_organization.name if p.proposer_organization else None,
            target_event_name=p.target_event.name if p.target_event else None,
            target_event_title=p.target_event.name if p.target_event else None,
            package_name=p.package.name if p.package else None,
        )
        for p in proposals
    ]


@router.get("/sponsorship-proposals/{proposal_id}", response_model=SponsorshipProposalRead)
def get_proposal_detail(
    proposal_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get full proposal details for authorized members of either party."""
    p = get_sponsorship_proposal(db=db, proposal_id=proposal_id, current_user=current_user)

    listing_read = None
    if p.listing:
        listing_read = SponsorshipListingRead(
            id=p.listing.id,
            owner_organization_id=p.listing.owner_organization_id,
            event_id=p.listing.event_id,
            listing_type=p.listing.listing_type,
            title=p.listing.title,
            description=p.listing.description,
            audience_description=p.listing.audience_description,
            benefits=p.listing.benefits,
            min_budget=p.listing.min_budget,
            max_budget=p.listing.max_budget,
            currency=p.listing.currency,
            status=p.listing.status,
            expires_at=p.listing.expires_at,
            created_by_user_id=p.listing.created_by_user_id,
            created_at=p.listing.created_at,
            updated_at=p.listing.updated_at,
            owner_organization_name=p.listing.owner_organization.name if p.listing.owner_organization else None,
            event_name=p.listing.event.name if p.listing.event else None,
            event_title=p.listing.event.name if p.listing.event else None,
            packages=[
                SponsorshipPackageRead.model_validate(pkg) for pkg in p.listing.packages
            ],
        )

    msg_reads = [
        SponsorshipNegotiationMessageRead(
            id=m.id,
            proposal_id=m.proposal_id,
            author_organization_id=m.author_organization_id,
            author_organization_name=m.author_organization.name if m.author_organization else None,
            author_user_id=m.author_user_id,
            author_user_name=m.author_user.username if m.author_user else None,
            message_type=m.message_type,
            message=m.message,
            counter_amount=m.counter_amount,
            currency=m.currency,
            counter_package_id=m.counter_package_id,
            counter_benefits=m.counter_benefits,
            created_at=m.created_at,
        )
        for m in p.negotiation_messages
    ]

    return SponsorshipProposalRead(
        id=p.id,
        listing_id=p.listing_id,
        proposer_organization_id=p.proposer_organization_id,
        target_event_id=p.target_event_id,
        package_id=p.package_id,
        created_by_user_id=p.created_by_user_id,
        proposed_amount=p.proposed_amount,
        currency=p.currency,
        proposed_benefits=p.proposed_benefits,
        message=p.message,
        status=p.status,
        responded_at=p.responded_at,
        created_at=p.created_at,
        updated_at=p.updated_at,
        listing_title=p.listing.title if p.listing else None,
        listing_owner_organization_id=p.listing.owner_organization_id if p.listing else None,
        listing_owner_organization_name=p.listing.owner_organization.name if p.listing and p.listing.owner_organization else None,
        proposer_organization_name=p.proposer_organization.name if p.proposer_organization else None,
        target_event_name=p.target_event.name if p.target_event else None,
        target_event_title=p.target_event.name if p.target_event else None,
        package_name=p.package.name if p.package else None,
        listing=listing_read,
        negotiation_messages=msg_reads,
    )


@router.post(
    "/sponsorship-proposals/{proposal_id}/messages",
    response_model=SponsorshipNegotiationMessageRead,
    status_code=status.HTTP_201_CREATED,
)
def post_negotiation_message(
    proposal_id: uuid.UUID,
    data: SponsorshipNegotiationMessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a negotiation message or counteroffer to a proposal."""
    m = create_negotiation_message(
        db=db, proposal_id=proposal_id, data=data, current_user=current_user
    )
    return SponsorshipNegotiationMessageRead(
        id=m.id,
        proposal_id=m.proposal_id,
        author_organization_id=m.author_organization_id,
        author_organization_name=m.author_organization.name if m.author_organization else None,
        author_user_id=m.author_user_id,
        author_user_name=m.author_user.username if m.author_user else None,
        message_type=m.message_type,
        message=m.message,
        counter_amount=m.counter_amount,
        currency=m.currency,
        counter_package_id=m.counter_package_id,
        counter_benefits=m.counter_benefits,
        created_at=m.created_at,
    )


@router.post("/sponsorship-proposals/{proposal_id}/accept", response_model=SponsorshipDealRead)
def post_accept_proposal(
    proposal_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Accept the latest proposal or counteroffer and finalize the deal."""
    deal = accept_sponsorship_proposal(
        db=db, proposal_id=proposal_id, current_user=current_user
    )
    return SponsorshipDealRead(
        id=deal.id,
        proposal_id=deal.proposal_id,
        event_id=deal.event_id,
        event_name=deal.event.name if deal.event else None,
        event_title=deal.event.name if deal.event else None,
        sponsor_organization_id=deal.sponsor_organization_id,
        sponsor_organization_name=deal.sponsor_organization.name if deal.sponsor_organization else None,
        organizer_organization_id=deal.organizer_organization_id,
        organizer_organization_name=deal.organizer_organization.name if deal.organizer_organization else None,
        agreed_amount=deal.agreed_amount,
        currency=deal.currency,
        agreed_terms=deal.agreed_terms,
        starts_at=deal.starts_at,
        ends_at=deal.ends_at,
        status=deal.status,
        created_at=deal.created_at,
        updated_at=deal.updated_at,
        deliverables=[],
    )


@router.post("/sponsorship-proposals/{proposal_id}/reject", response_model=SponsorshipProposalRead)
def post_reject_proposal(
    proposal_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reject the latest proposal or counteroffer."""
    p = reject_sponsorship_proposal(
        db=db, proposal_id=proposal_id, current_user=current_user
    )
    return SponsorshipProposalRead(
        id=p.id,
        listing_id=p.listing_id,
        proposer_organization_id=p.proposer_organization_id,
        target_event_id=p.target_event_id,
        package_id=p.package_id,
        created_by_user_id=p.created_by_user_id,
        proposed_amount=p.proposed_amount,
        currency=p.currency,
        proposed_benefits=p.proposed_benefits,
        message=p.message,
        status=p.status,
        responded_at=p.responded_at,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


@router.post("/sponsorship-proposals/{proposal_id}/withdraw", response_model=SponsorshipProposalRead)
def post_withdraw_proposal(
    proposal_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Withdraw a pending or negotiating proposal."""
    p = withdraw_sponsorship_proposal(
        db=db, proposal_id=proposal_id, current_user=current_user
    )
    return SponsorshipProposalRead(
        id=p.id,
        listing_id=p.listing_id,
        proposer_organization_id=p.proposer_organization_id,
        target_event_id=p.target_event_id,
        package_id=p.package_id,
        created_by_user_id=p.created_by_user_id,
        proposed_amount=p.proposed_amount,
        currency=p.currency,
        proposed_benefits=p.proposed_benefits,
        message=p.message,
        status=p.status,
        responded_at=p.responded_at,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )
