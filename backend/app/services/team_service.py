import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.core.websocket_manager import ws_manager
from app.models.event import Event, EventMembership
from app.models.team import Team, TeamInvitation, TeamMember
from app.models.user import User
from app.schemas.team import (
    TeamCreatedResponse,
    TeamCreateRequest,
    TeamDetailRead,
    TeamDiscoveryItem,
    TeamInvitationDetailRead,
    TeamInvitationRead,
    TeamInviterInfo,
    TeamMemberInfo,
    TeamMemberRead,
)


def get_user_eligible_event_membership(
    db: Session, event_id: uuid.UUID, user_id: uuid.UUID
) -> Optional[EventMembership]:
    """Return the user's active/approved event membership, or None if ineligible."""
    return (
        db.query(EventMembership)
        .filter(
            EventMembership.event_id == event_id,
            EventMembership.user_id == user_id,
            EventMembership.status.in_(["registered", "approved"]),
        )
        .first()
    )


def check_user_active_team_in_event(
    db: Session, event_id: uuid.UUID, user_id: uuid.UUID
) -> Optional[TeamMember]:
    """Check if the user is already an active member of any non-disbanded team in this event."""
    return (
        db.query(TeamMember)
        .join(Team, Team.id == TeamMember.team_id)
        .filter(
            Team.event_id == event_id,
            Team.status != "disbanded",
            TeamMember.user_id == user_id,
            TeamMember.status == "active",
        )
        .first()
    )


def count_active_members(db: Session, team_id: uuid.UUID) -> int:
    """Return count of active members for a given team."""
    return (
        db.query(func.count(TeamMember.id))
        .filter(
            TeamMember.team_id == team_id,
            TeamMember.status == "active",
        )
        .scalar()
        or 0
    )


def recalculate_team_status(team: Team, min_team_size: int, active_count: int) -> None:
    """Recalculate team lifecycle status based on active members count."""
    if team.status in ("disbanded", "submitted"):
        return
    if active_count >= min_team_size:
        team.status = "active"
    else:
        team.status = "forming"


def create_team(
    db: Session, event_id: uuid.UUID, current_user: User, data: TeamCreateRequest
) -> TeamCreatedResponse:
    """Atomically create a team and assign the creator as the active owner."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found.",
        )

    if event.status in ("cancelled", "completed"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot create a team for a {event.status} event.",
        )

    # Only registered or approved participants can create teams
    membership = get_user_eligible_event_membership(db, event_id, current_user.id)
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only registered or approved participants of the event can create teams.",
        )

    # Check if participant already belongs to another active team in the same event
    existing_team_member = check_user_active_team_in_event(
        db, event_id, current_user.id
    )
    if existing_team_member:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Participant already belongs to an active team in this event.",
        )

    clean_name = data.name.strip()
    # Check duplicate team name in same event
    duplicate = (
        db.query(Team)
        .filter(
            Team.event_id == event_id,
            func.lower(Team.name) == clean_name.lower(),
        )
        .first()
    )
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A team with this name already exists in this event.",
        )

    # Sizing check: event's max team size must be at least 1
    if event.max_team_size < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Event maximum team size is invalid.",
        )

    # Join code handling
    raw_join_code: Optional[str] = None
    join_code_hash: Optional[str] = None
    if data.generate_join_code:
        raw_join_code = secrets.token_hex(4).upper()
        join_code_hash = hash_password(raw_join_code)

    # Initial team status based on min_team_size
    initial_status = "active" if 1 >= event.min_team_size else "forming"

    now = datetime.now(timezone.utc)
    team = Team(
        event_id=event_id,
        name=clean_name,
        description=data.description.strip() if data.description else None,
        created_by_user_id=current_user.id,
        status=initial_status,
        join_code_hash=join_code_hash,
        created_at=now,
        updated_at=now,
    )
    db.add(team)
    db.flush()

    owner_member = TeamMember(
        team_id=team.id,
        user_id=current_user.id,
        role="owner",
        status="active",
        joined_at=now,
    )
    db.add(owner_member)
    db.commit()
    db.refresh(team)

    return TeamCreatedResponse(
        id=team.id,
        event_id=team.event_id,
        name=team.name,
        description=team.description,
        created_by_user_id=team.created_by_user_id,
        status=team.status,
        created_at=team.created_at,
        updated_at=team.updated_at,
        join_code=raw_join_code,
    )


def list_event_teams(
    db: Session,
    event_id: uuid.UUID,
    current_user: User,
    limit: int = 50,
    offset: int = 0,
) -> List[TeamDiscoveryItem]:
    """Return non-disbanded teams belonging to an event for eligible participants."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found.",
        )

    membership = get_user_eligible_event_membership(db, event_id, current_user.id)
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only eligible event participants can view teams.",
        )

    teams = (
        db.query(Team)
        .filter(
            Team.event_id == event_id,
            Team.status != "disbanded",
        )
        .order_by(Team.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    results: List[TeamDiscoveryItem] = []
    for t in teams:
        active_count = count_active_members(db, t.id)
        available = max(0, event.max_team_size - active_count)
        results.append(
            TeamDiscoveryItem(
                id=t.id,
                name=t.name,
                description=t.description,
                status=t.status,
                member_count=active_count,
                max_team_size=event.max_team_size,
                available_slots=available,
                created_at=t.created_at,
            )
        )
    return results


def get_team_details(
    db: Session, team_id: uuid.UUID, current_user: User
) -> TeamDetailRead:
    """Return team details. Full roster is only included for active members of the team."""
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found.",
        )

    event = team.event
    membership = get_user_eligible_event_membership(db, team.event_id, current_user.id)
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only eligible event participants can view team details.",
        )

    active_members_db = (
        db.query(TeamMember)
        .join(User, User.id == TeamMember.user_id)
        .filter(
            TeamMember.team_id == team.id,
            TeamMember.status == "active",
        )
        .all()
    )
    active_count = len(active_members_db)
    available = max(0, event.max_team_size - active_count)

    # Check if current user is an active member of this team
    is_team_member = any(m.user_id == current_user.id for m in active_members_db)

    roster: Optional[List[TeamMemberInfo]] = None
    if is_team_member:
        roster = []
        for m in active_members_db:
            profile = m.user.profile
            display_name = profile.display_name if profile else m.user.username
            roster.append(
                TeamMemberInfo(
                    user_id=m.user_id,
                    username=m.user.username,
                    display_name=display_name,
                    role=m.role,
                    status=m.status,
                    joined_at=m.joined_at,
                    left_at=m.left_at,
                )
            )

    return TeamDetailRead(
        id=team.id,
        event_id=team.event_id,
        name=team.name,
        description=team.description,
        status=team.status,
        created_by_user_id=team.created_by_user_id,
        created_at=team.created_at,
        updated_at=team.updated_at,
        member_count=active_count,
        max_team_size=event.max_team_size,
        available_slots=available,
        members=roster,
    )


def join_team_with_code(
    db: Session, team_id: uuid.UUID, current_user: User, join_code: str
) -> TeamMemberRead:
    """Allow an eligible event participant to join a team using its join code."""
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found.",
        )

    if team.status in ("disbanded", "submitted"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot join a {team.status} team.",
        )

    event = team.event
    membership = get_user_eligible_event_membership(db, team.event_id, current_user.id)
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only registered or approved participants of this event can join teams.",
        )

    # Secure verification of join code
    if not team.join_code_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This team does not accept join codes.",
        )

    if not verify_password(join_code.strip(), team.join_code_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid join code.",
        )

    # Check conflicting active team membership in this event
    existing_team_member = check_user_active_team_in_event(
        db, team.event_id, current_user.id
    )
    if existing_team_member:
        if existing_team_member.team_id == team.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is already an active member of this team.",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User already belongs to an active team in this event.",
        )

    # Capacity check
    active_count = count_active_members(db, team.id)
    if active_count >= event.max_team_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Team has reached its maximum size.",
        )

    now = datetime.now(timezone.utc)
    # Check if the user previously belonged to this team (status == 'left')
    existing_member_record = (
        db.query(TeamMember)
        .filter(
            TeamMember.team_id == team.id,
            TeamMember.user_id == current_user.id,
        )
        .first()
    )

    if existing_member_record:
        existing_member_record.status = "active"
        existing_member_record.role = "member"
        existing_member_record.joined_at = now
        existing_member_record.left_at = None
        member_obj = existing_member_record
    else:
        member_obj = TeamMember(
            team_id=team.id,
            user_id=current_user.id,
            role="member",
            status="active",
            joined_at=now,
        )
        db.add(member_obj)

    # Recalculate lifecycle status
    recalculate_team_status(team, event.min_team_size, active_count + 1)
    team.updated_at = now

    db.commit()
    db.refresh(member_obj)
    return TeamMemberRead.model_validate(member_obj)


def create_team_invitation(
    db: Session, team_id: uuid.UUID, current_user: User, invitee_email: str
) -> TeamInvitationRead:
    """Allow a team owner or lead to invite another eligible participant via email."""
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found.",
        )

    if team.status in ("disbanded", "submitted"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot invite members to a {team.status} team.",
        )

    # Only owner or lead can invite
    my_member = (
        db.query(TeamMember)
        .filter(
            TeamMember.team_id == team.id,
            TeamMember.user_id == current_user.id,
            TeamMember.status == "active",
        )
        .first()
    )
    if not my_member or my_member.role not in ("owner", "lead"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only team owners and team leads can invite members.",
        )

    event = team.event
    # Check team capacity
    active_count = count_active_members(db, team.id)
    if active_count >= event.max_team_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Team has reached its maximum size.",
        )

    # Resolve email to an existing registered user
    clean_email = invitee_email.strip().lower()
    invitee = (
        db.query(User)
        .filter(
            func.lower(User.email) == clean_email,
            User.account_status != "suspended",
            User.deleted_at.is_(None),
        )
        .first()
    )
    if not invitee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No registered user found with that email address.",
        )

    # Check if invitee is an eligible participant of this event
    invitee_membership = get_user_eligible_event_membership(
        db, team.event_id, invitee.id
    )
    if not invitee_membership:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invited user is not a registered or approved participant for this event.",
        )

    # Check if invitee is already an active member of this team
    is_already_in_team = (
        db.query(TeamMember)
        .filter(
            TeamMember.team_id == team.id,
            TeamMember.user_id == invitee.id,
            TeamMember.status == "active",
        )
        .first()
    )
    if is_already_in_team:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already an active member of this team.",
        )

    # Check if invitee already belongs to another active team in this event
    other_team_member = check_user_active_team_in_event(
        db, team.event_id, invitee.id
    )
    if other_team_member:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invited user already belongs to an active team in this event.",
        )

    # Prevent duplicate pending invitations
    now = datetime.now(timezone.utc)
    pending_invitation = (
        db.query(TeamInvitation)
        .filter(
            TeamInvitation.team_id == team.id,
            TeamInvitation.invitee_user_id == invitee.id,
            TeamInvitation.status == "pending",
            TeamInvitation.expires_at > now,
        )
        .first()
    )
    if pending_invitation:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A pending invitation already exists for this user in this team.",
        )

    # Create invitation with 7-day expiry
    # Notice ck_team_invitations_target: invitee_user_id is set and invitee_email is NULL
    expires_at = now + timedelta(days=7)
    invitation = TeamInvitation(
        team_id=team.id,
        invited_by_user_id=current_user.id,
        invitee_user_id=invitee.id,
        invitee_email=None,
        status="pending",
        expires_at=expires_at,
        created_at=now,
    )
    db.add(invitation)
    db.commit()
    db.refresh(invitation)

    return TeamInvitationRead.model_validate(invitation)


def list_my_team_invitations(
    db: Session, current_user: User
) -> List[TeamInvitationDetailRead]:
    """Return pending, non-expired invitations for the current user."""
    now = datetime.now(timezone.utc)
    invitations = (
        db.query(TeamInvitation)
        .join(Team, Team.id == TeamInvitation.team_id)
        .join(Event, Event.id == Team.event_id)
        .filter(
            TeamInvitation.invitee_user_id == current_user.id,
            TeamInvitation.status == "pending",
            TeamInvitation.expires_at > now,
        )
        .order_by(TeamInvitation.created_at.desc())
        .all()
    )

    results: List[TeamInvitationDetailRead] = []
    for inv in invitations:
        inviter = inv.invited_by_user
        inviter_profile = inviter.profile if inviter else None
        display_name = (
            inviter_profile.display_name
            if inviter_profile
            else (inviter.username if inviter else "Unknown")
        )
        inviter_info = TeamInviterInfo(
            user_id=inviter.id if inviter else current_user.id,
            username=inviter.username if inviter else "",
            display_name=display_name,
            email=inviter.email if inviter else None,
            avatar_url=inviter_profile.avatar_url if inviter_profile else None,
        )
        results.append(
            TeamInvitationDetailRead(
                id=inv.id,
                team_id=inv.team.id,
                team_name=inv.team.name,
                event_id=inv.team.event.id,
                event_name=inv.team.event.name,
                inviter=inviter_info,
                expires_at=inv.expires_at,
                status=inv.status,
                created_at=inv.created_at,
            )
        )
    return results


def accept_team_invitation(
    db: Session, invitation_id: uuid.UUID, current_user: User
) -> TeamMemberRead:
    """Accept a pending team invitation and join the team."""
    invitation = (
        db.query(TeamInvitation)
        .filter(TeamInvitation.id == invitation_id)
        .first()
    )
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found.",
        )

    # Only intended invitee can accept
    if invitation.invitee_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not the intended recipient of this invitation.",
        )

    if invitation.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot accept an invitation with status '{invitation.status}'.",
        )

    now = datetime.now(timezone.utc)
    if invitation.expires_at <= now:
        invitation.status = "expired"
        invitation.responded_at = now
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation has expired.",
        )

    team = invitation.team
    if team.status in ("disbanded", "submitted"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot join a {team.status} team.",
        )

    event = team.event
    # Verify participant event membership
    membership = get_user_eligible_event_membership(db, team.event_id, current_user.id)
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not a registered or approved participant for this event.",
        )

    # Capacity check
    active_count = count_active_members(db, team.id)
    if active_count >= event.max_team_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Team has reached its maximum size.",
        )

    # Verify user does not already belong to another active team in the same event
    existing_team_member = check_user_active_team_in_event(
        db, team.event_id, current_user.id
    )
    if existing_team_member:
        if existing_team_member.team_id == team.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is already an active member of this team.",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User already belongs to an active team in this event.",
        )

    # Create or reactivate membership
    existing_member_record = (
        db.query(TeamMember)
        .filter(
            TeamMember.team_id == team.id,
            TeamMember.user_id == current_user.id,
        )
        .first()
    )

    if existing_member_record:
        existing_member_record.status = "active"
        existing_member_record.role = "member"
        existing_member_record.joined_at = now
        existing_member_record.left_at = None
        target_member = existing_member_record
    else:
        target_member = TeamMember(
            team_id=team.id,
            user_id=current_user.id,
            role="member",
            status="active",
            joined_at=now,
        )
        db.add(target_member)

    # Mark invitation accepted
    invitation.status = "accepted"
    invitation.responded_at = now

    # Recalculate team status
    recalculate_team_status(team, event.min_team_size, active_count + 1)
    team.updated_at = now

    db.commit()
    db.refresh(target_member)
    return TeamMemberRead.model_validate(target_member)


def reject_team_invitation(
    db: Session, invitation_id: uuid.UUID, current_user: User
) -> TeamInvitationRead:
    """Reject a pending team invitation."""
    invitation = (
        db.query(TeamInvitation)
        .filter(TeamInvitation.id == invitation_id)
        .first()
    )
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found.",
        )

    if invitation.invitee_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not the intended recipient of this invitation.",
        )

    if invitation.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot reject an invitation with status '{invitation.status}'.",
        )

    now = datetime.now(timezone.utc)
    invitation.status = "rejected"
    invitation.responded_at = now
    db.commit()
    db.refresh(invitation)

    return TeamInvitationRead.model_validate(invitation)


def list_team_members(
    db: Session, team_id: uuid.UUID, current_user: User
) -> List[TeamMemberInfo]:
    """Return team roster to active members of the team."""
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found.",
        )

    my_member = (
        db.query(TeamMember)
        .filter(
            TeamMember.team_id == team.id,
            TeamMember.user_id == current_user.id,
            TeamMember.status == "active",
        )
        .first()
    )
    if not my_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only active team members can view the team roster.",
        )

    active_members = (
        db.query(TeamMember)
        .join(User, User.id == TeamMember.user_id)
        .filter(
            TeamMember.team_id == team.id,
            TeamMember.status == "active",
        )
        .order_by(TeamMember.joined_at.asc())
        .all()
    )

    roster: List[TeamMemberInfo] = []
    for m in active_members:
        profile = m.user.profile
        display_name = profile.display_name if profile else m.user.username
        roster.append(
            TeamMemberInfo(
                user_id=m.user_id,
                username=m.user.username,
                display_name=display_name,
                role=m.role,
                status=m.status,
                joined_at=m.joined_at,
                left_at=m.left_at,
            )
        )
    return roster


def leave_team(
    db: Session, team_id: uuid.UUID, current_user: User
) -> TeamMemberRead:
    """Allow an active team member or lead to leave. Owner must transfer ownership first."""
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found.",
        )

    my_member = (
        db.query(TeamMember)
        .filter(
            TeamMember.team_id == team.id,
            TeamMember.user_id == current_user.id,
            TeamMember.status == "active",
        )
        .first()
    )
    if not my_member:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not an active member of this team.",
        )

    if my_member.role == "owner":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Team owner cannot leave without transferring ownership first.",
        )

    now = datetime.now(timezone.utc)
    my_member.status = "left"
    my_member.left_at = now

    event = team.event
    active_count = count_active_members(db, team.id) - 1
    recalculate_team_status(team, event.min_team_size, active_count)
    team.updated_at = now

    db.commit()
    db.refresh(my_member)
    ws_manager.disconnect_member_sync(team.id, current_user.id, reason="left_team")
    return TeamMemberRead.model_validate(my_member)


def remove_team_member(
    db: Session, team_id: uuid.UUID, target_user_id: uuid.UUID, current_user: User
) -> TeamMemberRead:
    """Allow the team owner to remove an active member."""
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found.",
        )

    # Only owner can remove
    my_member = (
        db.query(TeamMember)
        .filter(
            TeamMember.team_id == team.id,
            TeamMember.user_id == current_user.id,
            TeamMember.status == "active",
        )
        .first()
    )
    if not my_member or my_member.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the team owner can remove members.",
        )

    if target_user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove the team owner.",
        )

    target_member = (
        db.query(TeamMember)
        .filter(
            TeamMember.team_id == team.id,
            TeamMember.user_id == target_user_id,
            TeamMember.status == "active",
        )
        .first()
    )
    if not target_member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target member not found or is not active.",
        )

    if target_member.role == "owner":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove the team owner.",
        )

    now = datetime.now(timezone.utc)
    target_member.status = "left"
    target_member.left_at = now

    event = team.event
    active_count = count_active_members(db, team.id) - 1
    recalculate_team_status(team, event.min_team_size, active_count)
    team.updated_at = now

    db.commit()
    db.refresh(target_member)
    ws_manager.disconnect_member_sync(team.id, target_user_id, reason="removed_from_team")
    return TeamMemberRead.model_validate(target_member)


def update_team_member_role(
    db: Session,
    team_id: uuid.UUID,
    target_user_id: uuid.UUID,
    current_user: User,
    new_role: str,
) -> TeamMemberRead:
    """Allow the owner to assign or revoke the lead role."""
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found.",
        )

    # Only owner can update roles
    my_member = (
        db.query(TeamMember)
        .filter(
            TeamMember.team_id == team.id,
            TeamMember.user_id == current_user.id,
            TeamMember.status == "active",
        )
        .first()
    )
    if not my_member or my_member.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the team owner can change member roles.",
        )

    if target_user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change team owner role through this endpoint.",
        )

    target_member = (
        db.query(TeamMember)
        .filter(
            TeamMember.team_id == team.id,
            TeamMember.user_id == target_user_id,
            TeamMember.status == "active",
        )
        .first()
    )
    if not target_member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target member not found or is not active.",
        )

    if target_member.role == "owner":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change team owner role through this endpoint.",
        )

    target_member.role = new_role
    team.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(target_member)
    return TeamMemberRead.model_validate(target_member)


def transfer_team_ownership(
    db: Session,
    team_id: uuid.UUID,
    new_owner_user_id: uuid.UUID,
    current_user: User,
) -> TeamMemberRead:
    """Allow the team owner to transfer ownership to another active member."""
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found.",
        )

    my_member = (
        db.query(TeamMember)
        .filter(
            TeamMember.team_id == team.id,
            TeamMember.user_id == current_user.id,
            TeamMember.status == "active",
        )
        .first()
    )
    if not my_member or my_member.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the current team owner can transfer ownership.",
        )

    if new_owner_user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already the team owner.",
        )

    target_member = (
        db.query(TeamMember)
        .filter(
            TeamMember.team_id == team.id,
            TeamMember.user_id == new_owner_user_id,
            TeamMember.status == "active",
        )
        .first()
    )
    if not target_member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target user is not an active member of this team.",
        )

    # Atomic transfer: old owner becomes member, new owner becomes owner
    my_member.role = "member"
    target_member.role = "owner"
    team.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(target_member)
    return TeamMemberRead.model_validate(target_member)


def disband_team(
    db: Session, team_id: uuid.UUID, current_user: User
) -> TeamDetailRead:
    """Allow the team owner to disband the team."""
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found.",
        )

    if team.status == "disbanded":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Team is already disbanded.",
        )

    my_member = (
        db.query(TeamMember)
        .filter(
            TeamMember.team_id == team.id,
            TeamMember.user_id == current_user.id,
            TeamMember.status == "active",
        )
        .first()
    )
    if not my_member or my_member.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the team owner can disband the team.",
        )

    now = datetime.now(timezone.utc)
    team.status = "disbanded"
    team.updated_at = now

    # Mark all active memberships as left
    active_members = (
        db.query(TeamMember)
        .filter(
            TeamMember.team_id == team.id,
            TeamMember.status == "active",
        )
        .all()
    )
    for m in active_members:
        m.status = "left"
        m.left_at = now

    # Cancel pending invitations
    pending_invitations = (
        db.query(TeamInvitation)
        .filter(
            TeamInvitation.team_id == team.id,
            TeamInvitation.status == "pending",
        )
        .all()
    )
    for inv in pending_invitations:
        inv.status = "cancelled"
        inv.responded_at = now

    db.commit()
    db.refresh(team)
    ws_manager.disconnect_team_sync(team.id, reason="team_disbanded")

    event = team.event
    return TeamDetailRead(
        id=team.id,
        event_id=team.event_id,
        name=team.name,
        description=team.description,
        status=team.status,
        created_by_user_id=team.created_by_user_id,
        created_at=team.created_at,
        updated_at=team.updated_at,
        member_count=0,
        max_team_size=event.max_team_size,
        available_slots=event.max_team_size,
        members=None,
    )
