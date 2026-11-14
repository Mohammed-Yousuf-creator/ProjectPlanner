import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from app.models.event import Event, EventMembership
from app.models.mentor_request import MentorRequest
from app.models.team import Team, TeamMember
from app.models.user import User, UserProfile
from app.schemas.mentor_request import (
    MentorRequestCreate,
    MentorRequestRead,
    MentorRequestStatusUpdate,
)
from app.services.notification_service import create_notification
from app.services.organization_service import get_member_in_org, require_org_member


def _build_mentor_request_read(req: MentorRequest) -> MentorRequestRead:
    team_name = req.team.name if req.team else None
    mentor_name = None
    if req.assigned_mentor_user:
        profile = req.assigned_mentor_user.profile
        mentor_name = profile.display_name if profile else req.assigned_mentor_user.username

    return MentorRequestRead(
        id=req.id,
        event_id=req.event_id,
        requested_by_user_id=req.requested_by_user_id,
        team_id=req.team_id,
        team_name=team_name,
        assigned_mentor_user_id=req.assigned_mentor_user_id,
        mentor_name=mentor_name,
        topic=req.topic,
        description=req.description,
        priority=req.priority,
        status=req.status,
        resolution_note=req.resolution_note,
        created_at=req.created_at,
        updated_at=req.updated_at,
        resolved_at=req.resolved_at,
    )


def create_mentor_request(
    db: Session,
    event_id: uuid.UUID,
    current_user: User,
    data: MentorRequestCreate,
) -> MentorRequestRead:
    """Allow an eligible event participant to request mentor assistance."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    # Participant membership check
    ev_mem = (
        db.query(EventMembership)
        .filter(
            EventMembership.event_id == event_id,
            EventMembership.user_id == current_user.id,
            EventMembership.role == "participant",
            EventMembership.status.in_(["registered", "approved"]),
        )
        .first()
    )
    if not ev_mem:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only registered or approved participants can request mentor assistance.",
        )

    # Team validation if team_id provided
    team = None
    if data.team_id:
        team = db.get(Team, data.team_id)
        if not team or team.event_id != event_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Team does not exist or does not belong to this event.",
            )
        team_mem = (
            db.query(TeamMember)
            .filter(
                TeamMember.team_id == data.team_id,
                TeamMember.user_id == current_user.id,
                TeamMember.status == "active",
            )
            .first()
        )
        if not team_mem:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You must be an active member of the specified team.",
            )

    req = MentorRequest(
        event_id=event_id,
        requested_by_user_id=current_user.id,
        team_id=data.team_id,
        topic=data.topic.strip(),
        description=data.description.strip(),
        priority=data.priority,
        status="pending",
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return _build_mentor_request_read(req)


def list_my_mentor_requests(
    db: Session,
    current_user: User,
    event_id: Optional[uuid.UUID] = None,
) -> List[MentorRequestRead]:
    """Return mentor requests created by the authenticated participant."""
    query = (
        select(MentorRequest)
        .options(
            joinedload(MentorRequest.team),
            joinedload(MentorRequest.assigned_mentor_user).joinedload(User.profile),
        )
        .where(MentorRequest.requested_by_user_id == current_user.id)
    )
    if event_id:
        query = query.where(MentorRequest.event_id == event_id)

    query = query.order_by(MentorRequest.created_at.desc())
    items = db.execute(query).scalars().all()
    return [_build_mentor_request_read(r) for r in items]


def list_event_mentor_requests(
    db: Session,
    event_id: uuid.UUID,
    current_user: User,
    status_filter: Optional[str] = None,
    priority_filter: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> List[MentorRequestRead]:
    """List mentor requests for organizers (all) or approved mentors (unassigned + assigned to self)."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    is_organizer = False
    org_mem = get_member_in_org(db, event.organization_id, current_user.id)
    if org_mem and org_mem.status == "active" and org_mem.role in ("owner", "admin"):
        is_organizer = True

    is_mentor = False
    if not is_organizer:
        mentor_mem = (
            db.query(EventMembership)
            .filter(
                EventMembership.event_id == event_id,
                EventMembership.user_id == current_user.id,
                EventMembership.role == "mentor",
                EventMembership.status == "approved",
            )
            .first()
        )
        if mentor_mem:
            is_mentor = True

    if not (is_organizer or is_mentor):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view mentor requests for this event.",
        )

    query = (
        select(MentorRequest)
        .options(
            joinedload(MentorRequest.team),
            joinedload(MentorRequest.assigned_mentor_user).joinedload(User.profile),
        )
        .where(MentorRequest.event_id == event_id)
    )

    if not is_organizer:
        # Mentors see unassigned requests + requests assigned to them
        query = query.where(
            or_(
                MentorRequest.assigned_mentor_user_id.is_(None),
                MentorRequest.assigned_mentor_user_id == current_user.id,
            )
        )

    if status_filter:
        query = query.where(MentorRequest.status == status_filter)
    if priority_filter:
        query = query.where(MentorRequest.priority == priority_filter)

    query = query.order_by(MentorRequest.created_at.desc())
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    items = db.execute(query).scalars().all()
    return [_build_mentor_request_read(r) for r in items]


def assign_mentor(
    db: Session,
    request_id: uuid.UUID,
    mentor_user_id: uuid.UUID,
    current_user: User,
) -> MentorRequestRead:
    """Allow organizers to assign an approved event mentor to a request."""
    req = db.get(MentorRequest, request_id)
    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mentor request not found",
        )

    event = req.event
    require_org_member(db, event.organization_id, current_user, ["owner", "admin"])

    # Verify mentor has approved mentor membership in this event
    mentor_mem = (
        db.query(EventMembership)
        .filter(
            EventMembership.event_id == event.id,
            EventMembership.user_id == mentor_user_id,
            EventMembership.role == "mentor",
            EventMembership.status == "approved",
        )
        .first()
    )
    if not mentor_mem:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Target user is not an approved mentor for this event.",
        )

    now = datetime.now(timezone.utc)
    req.assigned_mentor_user_id = mentor_user_id
    req.status = "assigned"
    req.updated_at = now

    # In-app notifications
    create_notification(
        db=db,
        user_id=req.requested_by_user_id,
        notification_type="mentor_request_assigned",
        title="Mentor Assigned",
        body=f"A mentor has been assigned to your request '{req.topic}'.",
        event_id=event.id,
        data={"mentor_request_id": str(req.id), "status": "assigned"},
    )
    create_notification(
        db=db,
        user_id=mentor_user_id,
        notification_type="mentor_request_assigned",
        title="New Mentor Request Assigned",
        body=f"You have been assigned to mentor request '{req.topic}'.",
        event_id=event.id,
        data={"mentor_request_id": str(req.id), "status": "assigned"},
    )

    db.commit()
    db.refresh(req)
    return _build_mentor_request_read(req)


def update_mentor_request_status(
    db: Session,
    request_id: uuid.UUID,
    current_user: User,
    data: MentorRequestStatusUpdate,
) -> MentorRequestRead:
    """Update status of a mentor request. Assigned mentor or organizer only."""
    req = db.get(MentorRequest, request_id)
    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mentor request not found",
        )

    event = req.event
    is_organizer = False
    org_mem = get_member_in_org(db, event.organization_id, current_user.id)
    if org_mem and org_mem.status == "active" and org_mem.role in ("owner", "admin"):
        is_organizer = True

    is_assigned_mentor = req.assigned_mentor_user_id == current_user.id

    if not (is_organizer or is_assigned_mentor):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the assigned mentor or an organizer can update this request's status.",
        )

    # Validate state transitions
    valid_transitions = {
        "assigned": ["in_progress", "resolved"],
        "in_progress": ["resolved"],
        "pending": ["rejected"] if is_organizer else [],
    }

    allowed_next = valid_transitions.get(req.status, [])
    if data.status not in allowed_next:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status transition from '{req.status}' to '{data.status}'.",
        )

    now = datetime.now(timezone.utc)
    req.status = data.status
    req.updated_at = now
    if data.status == "resolved":
        req.resolved_at = now
    if data.resolution_note is not None:
        req.resolution_note = data.resolution_note.strip() if data.resolution_note else None

    # Notify requesting participant
    create_notification(
        db=db,
        user_id=req.requested_by_user_id,
        notification_type="mentor_request_status_updated",
        title=f"Mentor Request {data.status.capitalize()}",
        body=f"Your mentor request '{req.topic}' status is now '{data.status}'.",
        event_id=event.id,
        data={"mentor_request_id": str(req.id), "status": data.status},
    )

    db.commit()
    db.refresh(req)
    return _build_mentor_request_read(req)


def cancel_mentor_request(
    db: Session,
    request_id: uuid.UUID,
    current_user: User,
) -> MentorRequestRead:
    """Allow original requester to cancel their own pending request."""
    req = db.get(MentorRequest, request_id)
    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mentor request not found",
        )

    if req.requested_by_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only cancel your own mentor requests.",
        )

    if req.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel a request with status '{req.status}'. Only pending requests can be cancelled.",
        )

    req.status = "cancelled"
    req.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(req)
    return _build_mentor_request_read(req)



def list_my_mentoring_events(db: Session, current_user: User) -> List[Event]:
    """Return distinct events where the current user mentors a request.

    A mentor can be assigned across several requests in one event, so the result
    is de-duplicated; events are ordered newest-start first.
    """
    return (
        db.query(Event)
        .join(MentorRequest, MentorRequest.event_id == Event.id)
        .filter(MentorRequest.assigned_mentor_user_id == current_user.id)
        .distinct()
        .order_by(Event.starts_at.desc().nullslast(), Event.created_at.desc())
        .all()
    )
