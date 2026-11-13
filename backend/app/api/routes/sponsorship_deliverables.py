import uuid
from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.sponsorship import (
    SponsorshipDeliverableCreate,
    SponsorshipDeliverableRead,
    SponsorshipDeliverableUpdate,
)
from app.services.sponsorship_service import (
    create_sponsorship_deliverable,
    list_sponsorship_deliverables,
    update_sponsorship_deliverable,
)

router = APIRouter()


@router.post(
    "/sponsorship-deals/{deal_id}/deliverables",
    response_model=SponsorshipDeliverableRead,
    status_code=status.HTTP_201_CREATED,
)
def post_deliverable(
    deal_id: uuid.UUID,
    data: SponsorshipDeliverableCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a deliverable for a sponsorship deal."""
    deliv = create_sponsorship_deliverable(
        db=db, deal_id=deal_id, data=data, current_user=current_user
    )
    return SponsorshipDeliverableRead(
        id=deliv.id,
        deal_id=deliv.deal_id,
        responsible_organization_id=deliv.responsible_organization_id,
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


@router.get(
    "/sponsorship-deals/{deal_id}/deliverables",
    response_model=List[SponsorshipDeliverableRead],
)
def get_deliverables(
    deal_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List deliverables for a sponsorship deal."""
    delivs = list_sponsorship_deliverables(
        db=db, deal_id=deal_id, current_user=current_user
    )
    return [
        SponsorshipDeliverableRead(
            id=d.id,
            deal_id=d.deal_id,
            responsible_organization_id=d.responsible_organization_id,
            responsible_organization_name=d.responsible_organization.name if d.responsible_organization else None,
            title=d.title,
            description=d.description,
            due_at=d.due_at,
            status=d.status,
            evidence_url=d.evidence_url,
            created_by_user_id=d.created_by_user_id,
            completed_at=d.completed_at,
            created_at=d.created_at,
            updated_at=d.updated_at,
        )
        for d in delivs
    ]


@router.patch(
    "/sponsorship-deliverables/{deliverable_id}",
    response_model=SponsorshipDeliverableRead,
)
def patch_deliverable(
    deliverable_id: uuid.UUID,
    data: SponsorshipDeliverableUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update deliverable status, evidence URL, or details."""
    d = update_sponsorship_deliverable(
        db=db,
        deliverable_id=deliverable_id,
        data=data,
        current_user=current_user,
    )
    return SponsorshipDeliverableRead(
        id=d.id,
        deal_id=d.deal_id,
        responsible_organization_id=d.responsible_organization_id,
        responsible_organization_name=d.responsible_organization.name if d.responsible_organization else None,
        title=d.title,
        description=d.description,
        due_at=d.due_at,
        status=d.status,
        evidence_url=d.evidence_url,
        created_by_user_id=d.created_by_user_id,
        completed_at=d.completed_at,
        created_at=d.created_at,
        updated_at=d.updated_at,
    )

