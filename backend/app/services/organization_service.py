import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.organization import Organization, OrganizationMember
from app.models.user import User, UserProfile
from app.schemas.organization import (
    OrganizationCreate,
    OrganizationInviteRequest,
    OrganizationMemberDetailRead,
    OrganizationUpdate,
    OrganizationWithMyRoleRead,
)


def slugify(text: str) -> str:
    """Generate a URL-friendly slug from text."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text.strip("-")


def get_member_in_org(
    db: Session, org_id: uuid.UUID, user_id: uuid.UUID
) -> Optional[OrganizationMember]:
    """Retrieve membership record for a user in an organization."""
    return db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user_id,
        )
    ).scalar_one_or_none()


def require_org_member(
    db: Session, org_id: uuid.UUID, user: User, allowed_roles: Optional[List[str]] = None
) -> OrganizationMember:
    """Ensure user is an active member of organization with one of allowed_roles."""
    # Check if organization exists first
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    membership = get_member_in_org(db, org_id, user.id)
    if not membership or membership.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not an active member of this organization",
        )

    if allowed_roles and membership.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to perform this action in this organization",
        )

    return membership


def create_organization(
    db: Session, current_user: User, data: OrganizationCreate
) -> Organization:
    """Create an organization and make the creator its active owner in one transaction."""
    slug = data.slug.strip() if data.slug else slugify(data.name)
    if not slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not generate valid slug from organization name",
        )

    # Check slug uniqueness globally
    existing = db.execute(
        select(Organization).where(Organization.slug == slug)
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Organization with slug '{slug}' already exists",
        )

    org_id = uuid.uuid4()
    org = Organization(
        id=org_id,
        name=data.name.strip(),
        slug=slug,
        organization_type=data.organization_type,
        description=data.description.strip() if data.description else None,
        website_url=data.website_url.strip() if data.website_url else None,
        logo_url=data.logo_url.strip() if data.logo_url else None,
        contact_email=str(data.contact_email).strip().lower() if data.contact_email else None,
        created_by_user_id=current_user.id,
        status="active",
    )

    owner_membership = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=current_user.id,
        role="owner",
        status="active",
        joined_at=datetime.now(timezone.utc),
    )

    db.add(org)
    db.add(owner_membership)
    db.commit()
    db.refresh(org)
    return org


def get_user_organizations(
    db: Session, current_user: User
) -> List[OrganizationWithMyRoleRead]:
    """Return all organizations the user belongs to with role and status."""
    memberships = db.execute(
        select(OrganizationMember)
        .options(joinedload(OrganizationMember.organization))
        .where(OrganizationMember.user_id == current_user.id)
    ).scalars().all()

    results: List[OrganizationWithMyRoleRead] = []
    for m in memberships:
        org = m.organization
        results.append(
            OrganizationWithMyRoleRead(
                id=org.id,
                name=org.name,
                slug=org.slug,
                organization_type=org.organization_type,
                description=org.description,
                website_url=org.website_url,
                logo_url=org.logo_url,
                contact_email=org.contact_email,
                created_by_user_id=org.created_by_user_id,
                status=org.status,
                created_at=org.created_at,
                updated_at=org.updated_at,
                my_role=m.role,
                my_status=m.status,
                my_joined_at=m.joined_at,
            )
        )
    return results


def get_organization_details(
    db: Session, org_id: uuid.UUID, current_user: User
) -> Organization:
    """Return organization details. Only active members can access private details."""
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    # Check active membership
    require_org_member(db, org_id, current_user)
    return org


def update_organization(
    db: Session, org_id: uuid.UUID, current_user: User, data: OrganizationUpdate
) -> Organization:
    """Update organization details. Only owners and admins can update."""
    require_org_member(db, org_id, current_user, allowed_roles=["owner", "admin"])

    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    update_dict = data.model_dump(exclude_unset=True)

    if "slug" in update_dict and update_dict["slug"]:
        new_slug = update_dict["slug"].strip()
        if new_slug != org.slug:
            existing = db.execute(
                select(Organization).where(Organization.slug == new_slug)
            ).scalar_one_or_none()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Organization with slug '{new_slug}' already exists",
                )
            org.slug = new_slug

    if "name" in update_dict and update_dict["name"] is not None:
        org.name = update_dict["name"].strip()
    if "organization_type" in update_dict and update_dict["organization_type"] is not None:
        org.organization_type = update_dict["organization_type"]
    if "description" in update_dict:
        org.description = update_dict["description"].strip() if update_dict["description"] else None
    if "website_url" in update_dict:
        org.website_url = update_dict["website_url"].strip() if update_dict["website_url"] else None
    if "logo_url" in update_dict:
        org.logo_url = update_dict["logo_url"].strip() if update_dict["logo_url"] else None
    if "contact_email" in update_dict:
        org.contact_email = str(update_dict["contact_email"]).strip().lower() if update_dict["contact_email"] else None

    org.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(org)
    return org


def get_organization_members(
    db: Session, org_id: uuid.UUID, current_user: User
) -> List[OrganizationMemberDetailRead]:
    """Return active organization members. Only organization members can access."""
    require_org_member(db, org_id, current_user)

    members = db.execute(
        select(OrganizationMember)
        .options(
            joinedload(OrganizationMember.user).selectinload(User.profile)
        )
        .where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.status == "active",
        )
    ).scalars().all()

    results: List[OrganizationMemberDetailRead] = []
    for m in members:
        user = m.user
        display_name = user.profile.display_name if user.profile else user.username
        results.append(
            OrganizationMemberDetailRead(
                id=m.id,
                organization_id=m.organization_id,
                user_id=m.user_id,
                role=m.role,
                status=m.status,
                joined_at=m.joined_at,
                created_at=m.created_at,
                email=user.email,
                username=user.username,
                display_name=display_name,
            )
        )
    return results


def invite_member(
    db: Session, org_id: uuid.UUID, current_user: User, data: OrganizationInviteRequest
) -> OrganizationMember:
    """Invite an existing user to the organization. Only owner and admins can invite."""
    require_org_member(db, org_id, current_user, allowed_roles=["owner", "admin"])

    if data.role == "owner":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot invite user as owner",
        )

    norm_email = str(data.email).strip().lower()
    target_user = db.execute(
        select(User).where(User.email == norm_email)
    ).scalar_one_or_none()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User with this email not found",
        )

    existing_membership = get_member_in_org(db, org_id, target_user.id)
    if existing_membership:
        if existing_membership.status == "active":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User is already an active member of this organization",
            )
        elif existing_membership.status == "invited":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User already has a pending invitation for this organization",
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User has suspended status in this organization",
            )

    invitation = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=target_user.id,
        role=data.role,
        status="invited",
        joined_at=None,
    )
    db.add(invitation)
    db.commit()
    db.refresh(invitation)
    return invitation


def accept_invitation(
    db: Session, org_id: uuid.UUID, membership_id: uuid.UUID, current_user: User
) -> OrganizationMember:
    """Accept an organization invitation. Only the invited user can accept."""
    membership = db.get(OrganizationMember, membership_id)
    if not membership or membership.organization_id != org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found",
        )

    if membership.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to respond to this invitation",
        )

    if membership.status != "invited":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation is not pending",
        )

    membership.status = "active"
    membership.joined_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(membership)
    return membership


def reject_invitation(
    db: Session, org_id: uuid.UUID, membership_id: uuid.UUID, current_user: User
) -> None:
    """Reject an organization invitation. Only the invited user can reject."""
    membership = db.get(OrganizationMember, membership_id)
    if not membership or membership.organization_id != org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found",
        )

    if membership.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to respond to this invitation",
        )

    if membership.status != "invited":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation is not pending",
        )

    db.delete(membership)
    db.commit()


def remove_member(
    db: Session, org_id: uuid.UUID, target_user_id: uuid.UUID, current_user: User
) -> None:
    """Remove a member from the organization."""
    caller_membership = require_org_member(
        db, org_id, current_user, allowed_roles=["owner", "admin"]
    )

    target_membership = get_member_in_org(db, org_id, target_user_id)
    if not target_membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in this organization",
        )

    # Admins cannot remove an owner
    if caller_membership.role == "admin" and target_membership.role == "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins cannot remove an organization owner",
        )

    # The last remaining owner cannot be removed
    if target_membership.role == "owner":
        active_owners_count = db.execute(
            select(func.count(OrganizationMember.id)).where(
                OrganizationMember.organization_id == org_id,
                OrganizationMember.role == "owner",
                OrganizationMember.status == "active",
            )
        ).scalar() or 0

        if active_owners_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The last remaining owner cannot be removed",
            )

    db.delete(target_membership)
    db.commit()

