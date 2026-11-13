import uuid
from typing import List

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.team import (
    TeamCreatedResponse,
    TeamCreateRequest,
    TeamDetailRead,
    TeamDiscoveryItem,
    TeamInvitationDetailRead,
    TeamInvitationRead,
    TeamInviteCreateRequest,
    TeamJoinRequest,
    TeamMemberInfo,
    TeamMemberRead,
    TeamMemberRoleUpdateRequest,
    TeamTransferOwnershipRequest,
)
from app.services.team_service import (
    accept_team_invitation,
    create_team,
    create_team_invitation,
    disband_team,
    get_team_details,
    join_team_with_code,
    leave_team,
    list_event_teams,
    list_my_team_invitations,
    list_team_members,
    reject_team_invitation,
    remove_team_member,
    transfer_team_ownership,
    update_team_member_role,
)

router = APIRouter()


# -----------------------------------------------------------------------------
# Event Team Creation & Discovery
# -----------------------------------------------------------------------------


@router.post(
    "/events/{event_id}/teams",
    response_model=TeamCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a team for an event",
)
def create_event_team(
    event_id: uuid.UUID,
    data: TeamCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TeamCreatedResponse:
    """Create a new team for an event with creator as the active owner."""
    return create_team(db, event_id, current_user, data)


@router.get(
    "/events/{event_id}/teams",
    response_model=List[TeamDiscoveryItem],
    status_code=status.HTTP_200_OK,
    summary="List teams for an event",
)
def get_event_teams(
    event_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[TeamDiscoveryItem]:
    """Return non-disbanded teams belonging to an event for eligible participants."""
    return list_event_teams(db, event_id, current_user, limit=limit, offset=offset)


# -----------------------------------------------------------------------------
# Team Details & Joining
# -----------------------------------------------------------------------------


@router.get(
    "/teams/{team_id}",
    response_model=TeamDetailRead,
    status_code=status.HTTP_200_OK,
    summary="Get team details",
)
def get_team(
    team_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TeamDetailRead:
    """Return team details. Full roster is only included for active members of the team."""
    return get_team_details(db, team_id, current_user)


@router.post(
    "/teams/{team_id}/join",
    response_model=TeamMemberRead,
    status_code=status.HTTP_200_OK,
    summary="Join team using join code",
)
def join_team(
    team_id: uuid.UUID,
    data: TeamJoinRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TeamMemberRead:
    """Join an active team using a valid join code."""
    return join_team_with_code(db, team_id, current_user, data.join_code)


# -----------------------------------------------------------------------------
# Team Invitations
# -----------------------------------------------------------------------------


@router.post(
    "/teams/{team_id}/invitations",
    response_model=TeamInvitationRead,
    status_code=status.HTTP_201_CREATED,
    summary="Invite a participant to the team",
)
def invite_to_team(
    team_id: uuid.UUID,
    data: TeamInviteCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TeamInvitationRead:
    """Send a team invitation to an eligible registered participant."""
    return create_team_invitation(db, team_id, current_user, data.invitee_email)


@router.post(
    "/team-invitations/{invitation_id}/accept",
    response_model=TeamMemberRead,
    status_code=status.HTTP_200_OK,
    summary="Accept team invitation",
)
def accept_invitation(
    invitation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TeamMemberRead:
    """Accept a pending team invitation."""
    return accept_team_invitation(db, invitation_id, current_user)


@router.post(
    "/team-invitations/{invitation_id}/reject",
    response_model=TeamInvitationRead,
    status_code=status.HTTP_200_OK,
    summary="Reject team invitation",
)
def reject_invitation(
    invitation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TeamInvitationRead:
    """Reject a pending team invitation."""
    return reject_team_invitation(db, invitation_id, current_user)


# -----------------------------------------------------------------------------
# Team Membership Management
# -----------------------------------------------------------------------------


@router.get(
    "/teams/{team_id}/members",
    response_model=List[TeamMemberInfo],
    status_code=status.HTTP_200_OK,
    summary="Get team roster",
)
def get_roster(
    team_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[TeamMemberInfo]:
    """Return team roster to active team members."""
    return list_team_members(db, team_id, current_user)


@router.post(
    "/teams/{team_id}/leave",
    response_model=TeamMemberRead,
    status_code=status.HTTP_200_OK,
    summary="Leave team",
)
def leave_team_endpoint(
    team_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TeamMemberRead:
    """Allow an active non-owner member to leave the team."""
    return leave_team(db, team_id, current_user)


@router.delete(
    "/teams/{team_id}/members/{user_id}",
    response_model=TeamMemberRead,
    status_code=status.HTTP_200_OK,
    summary="Remove team member",
)
def remove_member(
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TeamMemberRead:
    """Allow the team owner to remove an active member."""
    return remove_team_member(db, team_id, user_id, current_user)


@router.patch(
    "/teams/{team_id}/members/{user_id}/role",
    response_model=TeamMemberRead,
    status_code=status.HTTP_200_OK,
    summary="Update member role",
)
def update_role(
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    data: TeamMemberRoleUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TeamMemberRead:
    """Allow the team owner to assign or revoke lead role."""
    return update_team_member_role(db, team_id, user_id, current_user, data.role)


@router.post(
    "/teams/{team_id}/transfer-ownership",
    response_model=TeamMemberRead,
    status_code=status.HTTP_200_OK,
    summary="Transfer team ownership",
)
def transfer_ownership(
    team_id: uuid.UUID,
    data: TeamTransferOwnershipRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TeamMemberRead:
    """Allow the team owner to transfer ownership to another active member."""
    return transfer_team_ownership(db, team_id, data.new_owner_user_id, current_user)


@router.post(
    "/teams/{team_id}/disband",
    response_model=TeamDetailRead,
    status_code=status.HTTP_200_OK,
    summary="Disband team",
)
def disband_team_endpoint(
    team_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TeamDetailRead:
    """Allow the team owner to disband the team."""
    return disband_team(db, team_id, current_user)

