import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.sponsorship import (
    SponsorshipDealRead,
    SponsorshipDealStatusUpdate,
    SponsorshipDeliverableRead,
)
from app.services.sponsorship_service import (
    get_sponsorship_deal,
    list_org_sponsorship_deals,
    update_sponsorship_deal_status,
)

router = APIRouter()


@router.get(
    "/organizations/{organization_id}/sponsorship-deals",
    response_model=List[SponsorshipDealRead],
)
def get_org_deals(
    organization_id: uuid.UUID,
    status: Optional[str] = Query(None),
    event_id: Optional[uuid.UUID] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List sponsorship deals involving the organization."""
    deals = list_org_sponsorship_deals(
        db=db,
        org_id=organization_id,
        current_user=current_user,
        status_filter=status,
        event_id=event_id,
        limit=limit,
        offset=offset,
    )
    return [
        SponsorshipDealRead(
            id=d.id,
            proposal_id=d.proposal_id,
            event_id=d.event_id,
            event_name=d.event.name if d.event else None,
            event_title=d.event.name if d.event else None,
            sponsor_organization_id=d.sponsor_organization_id,
            sponsor_organization_name=d.sponsor_organization.name if d.sponsor_organization else None,
            organizer_organization_id=d.organizer_organization_id,
            organizer_organization_name=d.organizer_organization.name if d.organizer_organization else None,
            agreed_amount=d.agreed_amount,
            currency=d.currency,
            agreed_terms=d.agreed_terms,
            starts_at=d.starts_at,
            ends_at=d.ends_at,
            status=d.status,
            deliverables_count=len(d.deliverables),
            completed_deliverables_count=sum(1 for deliv in d.deliverables if deliv.status == "completed"),
            created_at=d.created_at,
            updated_at=d.updated_at,
            deliverables=[],
        )
        for d in deals
    ]


@router.get("/sponsorship-deals/{deal_id}", response_model=SponsorshipDealRead)
def get_deal_detail(
    deal_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get complete deal details and deliverable progress for authorized deal parties."""
    d = get_sponsorship_deal(db=db, deal_id=deal_id, current_user=current_user)

    deliv_reads = [
        SponsorshipDeliverableRead(
            id=deliv.id,
            deal_id=deliv.deal_id,
            responsible_organization_id=deliv.responsible_organization_id,
            responsible_organization_name=deliv.responsible_organization.name if deliv.responsible_organization else None,
            title=deliv.title,
            description=deliv.description,
            due_at=deliv.due_at,
            status=deliv.status,
            evidence_url=deliv.evidence_url,
            created_by_user_id=deliv.created_by_user_id,
            completed_at=deliv.completed_at,
            created_at=deliv.created_at,
            updated_at=deliv.updated_at,
        )
        for deliv in d.deliverables
    ]

    return SponsorshipDealRead(
        id=d.id,
        proposal_id=d.proposal_id,
        event_id=d.event_id,
        event_name=d.event.name if d.event else None,
        event_title=d.event.name if d.event else None,
        sponsor_organization_id=d.sponsor_organization_id,
        sponsor_organization_name=d.sponsor_organization.name if d.sponsor_organization else None,
        organizer_organization_id=d.organizer_organization_id,
        organizer_organization_name=d.organizer_organization.name if d.organizer_organization else None,
        agreed_amount=d.agreed_amount,
        currency=d.currency,
        agreed_terms=d.agreed_terms,
        starts_at=d.starts_at,
        ends_at=d.ends_at,
        status=d.status,
        deliverables_count=len(d.deliverables),
        completed_deliverables_count=sum(1 for deliv in d.deliverables if deliv.status == "completed"),
        created_at=d.created_at,
        updated_at=d.updated_at,
        deliverables=deliv_reads,
    )


@router.patch("/sponsorship-deals/{deal_id}/status", response_model=SponsorshipDealRead)
def patch_deal_status(
    deal_id: uuid.UUID,
    data: SponsorshipDealStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update deal status to completed or cancelled."""
    d = update_sponsorship_deal_status(
        db=db, deal_id=deal_id, new_status=data.status, current_user=current_user
    )
    return SponsorshipDealRead(
        id=d.id,
        proposal_id=d.proposal_id,
        event_id=d.event_id,
        sponsor_organization_id=d.sponsor_organization_id,
        organizer_organization_id=d.organizer_organization_id,
        agreed_amount=d.agreed_amount,
        currency=d.currency,
        agreed_terms=d.agreed_terms,
        starts_at=d.starts_at,
        ends_at=d.ends_at,
        status=d.status,
        created_at=d.created_at,
        updated_at=d.updated_at,
    )
