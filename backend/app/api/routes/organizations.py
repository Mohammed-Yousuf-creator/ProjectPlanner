import uuid
from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.event import EventCreate, EventRead
from app.schemas.organization import (
    OrganizationCreate,
    OrganizationInviteRequest,
    OrganizationMemberDetailRead,
    OrganizationMemberRead,
    OrganizationRead,
    OrganizationUpdate,
    OrganizationWithMyRoleRead,
)
from app.services.event_service import create_event, get_organization_events
from app.services.organization_service import (
    accept_invitation,
    create_organization,
    get_organization_details,
    get_organization_members,
    get_user_organizations,
    invite_member,
    reject_invitation,
    remove_member,
    update_organization,
)

router = APIRouter()


@router.post(
    "",
    response_model=OrganizationRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create organization",
)
def create_org(
    data: OrganizationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrganizationRead:
    """Create a new organization. The creator automatically becomes the organization owner."""
    return create_organization(db, current_user, data)


@router.get(
    "/mine",
    response_model=List[OrganizationWithMyRoleRead],
    status_code=status.HTTP_200_OK,
    summary="Get my organizations",
)
def get_my_orgs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[OrganizationWithMyRoleRead]:
    """Return all organizations the authenticated user belongs to with role and status."""
    return get_user_organizations(db, current_user)


@router.get(
    "/{organization_id}",
    response_model=OrganizationRead,
    status_code=status.HTTP_200_OK,
    summary="Get organization details",
)
def get_org(
    organization_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrganizationRead:
    """Return organization details. Only active organization members can access private details."""
    return get_organization_details(db, organization_id, current_user)


@router.patch(
    "/{organization_id}",
    response_model=OrganizationRead,
    status_code=status.HTTP_200_OK,
    summary="Update organization details",
)
def update_org(
    organization_id: uuid.UUID,
    data: OrganizationUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrganizationRead:
    """Update organization details. Only owners and admins can update."""
    return update_organization(db, organization_id, current_user, data)


@router.get(
    "/{organization_id}/members",
    response_model=List[OrganizationMemberDetailRead],
    status_code=status.HTTP_200_OK,
    summary="Get organization members",
)
def get_members(
    organization_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[OrganizationMemberDetailRead]:
    """Return active organization members. Only organization members can access the member list."""
    return get_organization_members(db, organization_id, current_user)


@router.post(
    "/{organization_id}/members/invitations",
    response_model=OrganizationMemberRead,
    status_code=status.HTTP_201_CREATED,
    summary="Invite user to organization",
)
def invite_user(
    organization_id: uuid.UUID,
    data: OrganizationInviteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrganizationMemberRead:
    """Invite an existing registered user through their email address."""
    return invite_member(db, organization_id, current_user, data)


@router.post(
    "/{organization_id}/members/invitations/{membership_id}/accept",
    response_model=OrganizationMemberRead,
    status_code=status.HTTP_200_OK,
    summary="Accept organization invitation",
)
def accept_org_invitation(
    organization_id: uuid.UUID,
    membership_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrganizationMemberRead:
    """Allow the invited user to accept their invitation."""
    return accept_invitation(db, organization_id, membership_id, current_user)


@router.post(
    "/{organization_id}/members/invitations/{membership_id}/reject",
    status_code=status.HTTP_200_OK,
    summary="Reject organization invitation",
)
def reject_org_invitation(
    organization_id: uuid.UUID,
    membership_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Allow the invited user to reject their invitation."""
    reject_invitation(db, organization_id, membership_id, current_user)
    return {"message": "Invitation rejected successfully"}


@router.delete(
    "/{organization_id}/members/{user_id}",
    status_code=status.HTTP_200_OK,
    summary="Remove organization member",
)
def remove_org_member(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a member from the organization."""
    remove_member(db, organization_id, user_id, current_user)
    return {"message": "Member removed successfully"}


# ---------------- Organization Events ----------------


@router.post(
    "/{organization_id}/events",
    response_model=EventRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create event under organization",
)
def create_org_event(
    organization_id: uuid.UUID,
    data: EventCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EventRead:
    """Create an event under an organization. Only owners and admins can create events."""
    return create_event(db, organization_id, current_user, data)


@router.get(
    "/{organization_id}/events",
    response_model=List[EventRead],
    status_code=status.HTTP_200_OK,
    summary="List organization events",
)
def list_org_events(
    organization_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[EventRead]:
    """Return events belonging to the organization including drafts. Accessible to active organization members."""
    return get_organization_events(db, organization_id, current_user)

