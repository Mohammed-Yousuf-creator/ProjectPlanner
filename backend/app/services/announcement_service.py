import uuid
from datetime import datetime, timezone
from typing import List, Optional, Set

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.announcement import Announcement
from app.models.event import Event, EventMembership
from app.models.team import Team, TeamMember
from app.models.user import User
from app.schemas.announcement import (
    AnnouncementCreate,
    AnnouncementRead,
    AnnouncementUpdate,
)
from app.services.notification_service import create_notification
from app.services.organization_service import get_member_in_org, require_org_member


def validate_announcement_audience(
    db: Session,
    event_id: uuid.UUID,
    audience_type: str,
    target_team_id: Optional[uuid.UUID],
) -> None:
    """Validate audience type and target team constraints."""
    allowed_audiences = ("all", "participants", "judges", "mentors", "team")
    if audience_type not in allowed_audiences:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid audience type '{audience_type}'. Allowed: {', '.join(allowed_audiences)}",
        )

    if audience_type == "team":
        if not target_team_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="target_team_id is mandatory for audience_type 'team'.",
            )
        team = db.get(Team, target_team_id)
        if not team or team.event_id != event_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Target team does not exist or does not belong to this event.",
            )
        if team.status == "disbanded":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot target a disbanded team.",
            )
    else:
        if target_team_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"target_team_id must be null for audience_type '{audience_type}'.",
            )


def create_announcement(
    db: Session,
    event_id: uuid.UUID,
    current_user: User,
    data: AnnouncementCreate,
) -> AnnouncementRead:
    """Create a draft announcement. Organizer only."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    require_org_member(db, event.organization_id, current_user, ["owner", "admin"])
    validate_announcement_audience(db, event_id, data.audience_type, data.target_team_id)

    announcement = Announcement(
        event_id=event_id,
        author_user_id=current_user.id,
        title=data.title.strip(),
        body=data.body.strip(),
        audience_type=data.audience_type,
        target_team_id=data.target_team_id,
        status="draft",
        published_at=None,
    )
    db.add(announcement)
    db.commit()
    db.refresh(announcement)
    return AnnouncementRead.model_validate(announcement)


def list_announcements(
    db: Session,
    event_id: uuid.UUID,
    current_user: User,
) -> List[AnnouncementRead]:
    """Return announcements visible to the authenticated user based on role and audience."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    # 1. Organizer check: can view all announcements (draft, published, withdrawn)
    org_mem = get_member_in_org(db, event.organization_id, current_user.id)
    if org_mem and org_mem.status == "active" and org_mem.role in ("owner", "admin"):
        query = (
            select(Announcement)
            .where(Announcement.event_id == event_id)
            .order_by(Announcement.created_at.desc())
        )
        items = db.execute(query).scalars().all()
        return [AnnouncementRead.model_validate(a) for a in items]

    # 2. Member role check
    memberships = (
        db.query(EventMembership)
        .filter(
            EventMembership.event_id == event_id,
            EventMembership.user_id == current_user.id,
            EventMembership.status.in_(["registered", "approved"]),
        )
        .all()
    )
    if not memberships:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view announcements for this event.",
        )

    user_roles: Set[str] = {m.role for m in memberships}

    # Find active teams for user
    active_teams = (
        db.query(TeamMember.team_id)
        .join(Team, Team.id == TeamMember.team_id)
        .filter(
            Team.event_id == event_id,
            TeamMember.user_id == current_user.id,
            TeamMember.status == "active",
        )
        .all()
    )
    active_team_ids: Set[uuid.UUID] = {t[0] for t in active_teams}

    # Query published announcements
    published_announcements = (
        db.query(Announcement)
        .filter(
            Announcement.event_id == event_id,
            Announcement.status == "published",
        )
        .order_by(Announcement.published_at.desc(), Announcement.created_at.desc())
        .all()
    )

    visible_announcements: List[AnnouncementRead] = []
    for a in published_announcements:
        if a.audience_type == "all":
            visible_announcements.append(AnnouncementRead.model_validate(a))
        elif a.audience_type == "participants" and "participant" in user_roles:
            visible_announcements.append(AnnouncementRead.model_validate(a))
        elif a.audience_type == "judges" and "judge" in user_roles:
            visible_announcements.append(AnnouncementRead.model_validate(a))
        elif a.audience_type == "mentors" and "mentor" in user_roles:
            visible_announcements.append(AnnouncementRead.model_validate(a))
        elif a.audience_type == "team" and a.target_team_id in active_team_ids:
            visible_announcements.append(AnnouncementRead.model_validate(a))

    return visible_announcements


def update_draft_announcement(
    db: Session,
    announcement_id: uuid.UUID,
    current_user: User,
    data: AnnouncementUpdate,
) -> AnnouncementRead:
    """Edit a draft announcement. Published/withdrawn announcements cannot be edited."""
    announcement = db.get(Announcement, announcement_id)
    if not announcement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Announcement not found",
        )

    require_org_member(db, announcement.event.organization_id, current_user, ["owner", "admin"])

    if announcement.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot edit announcement with status '{announcement.status}'. Only drafts can be edited.",
        )

    new_audience = (
        data.audience_type if data.audience_type is not None else announcement.audience_type
    )
    new_team = (
        data.target_team_id
        if data.target_team_id is not None or data.audience_type is not None
        else announcement.target_team_id
    )

    validate_announcement_audience(db, announcement.event_id, new_audience, new_team)

    if data.title is not None:
        title_val = data.title.strip()
        if not title_val:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Title cannot be empty.",
            )
        announcement.title = title_val

    if data.body is not None:
        body_val = data.body.strip()
        if not body_val:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Body cannot be empty.",
            )
        announcement.body = body_val

    announcement.audience_type = new_audience
    announcement.target_team_id = new_team if new_audience == "team" else None
    announcement.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(announcement)
    return AnnouncementRead.model_validate(announcement)


def publish_announcement(
    db: Session,
    announcement_id: uuid.UUID,
    current_user: User,
) -> AnnouncementRead:
    """Publish an announcement and deliver in-app notifications in one transaction."""
    announcement = db.get(Announcement, announcement_id)
    if not announcement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Announcement not found",
        )

    event = announcement.event
    require_org_member(db, event.organization_id, current_user, ["owner", "admin"])

    if announcement.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Announcement has already been {announcement.status}.",
        )

    now = datetime.now(timezone.utc)
    announcement.status = "published"
    announcement.published_at = now
    announcement.updated_at = now

    # Determine recipient users based on audience
    recipient_user_ids: Set[uuid.UUID] = set()

    if announcement.audience_type == "all":
        members = (
            db.query(EventMembership.user_id)
            .filter(
                EventMembership.event_id == event.id,
                EventMembership.status.in_(["registered", "approved"]),
            )
            .all()
        )
        recipient_user_ids.update(m[0] for m in members)

    elif announcement.audience_type == "participants":
        members = (
            db.query(EventMembership.user_id)
            .filter(
                EventMembership.event_id == event.id,
                EventMembership.role == "participant",
                EventMembership.status.in_(["registered", "approved"]),
            )
            .all()
        )
        recipient_user_ids.update(m[0] for m in members)

    elif announcement.audience_type == "judges":
        members = (
            db.query(EventMembership.user_id)
            .filter(
                EventMembership.event_id == event.id,
                EventMembership.role == "judge",
                EventMembership.status == "approved",
            )
            .all()
        )
        recipient_user_ids.update(m[0] for m in members)

    elif announcement.audience_type == "mentors":
        members = (
            db.query(EventMembership.user_id)
            .filter(
                EventMembership.event_id == event.id,
                EventMembership.role == "mentor",
                EventMembership.status == "approved",
            )
            .all()
        )
        recipient_user_ids.update(m[0] for m in members)

    elif announcement.audience_type == "team":
        if announcement.target_team_id:
            team_mems = (
                db.query(TeamMember.user_id)
                .filter(
                    TeamMember.team_id == announcement.target_team_id,
                    TeamMember.status == "active",
                )
                .all()
            )
            recipient_user_ids.update(m[0] for m in team_mems)

    # Dispatch notifications in same transaction with deduplication
    notif_data = {
        "announcement_id": str(announcement.id),
        "audience_type": announcement.audience_type,
    }
    for uid in recipient_user_ids:
        create_notification(
            db=db,
            user_id=uid,
            notification_type="announcement",
            title=f"Announcement: {announcement.title}",
            body=announcement.body,
            event_id=event.id,
            data=notif_data,
        )

    db.commit()
    db.refresh(announcement)
    return AnnouncementRead.model_validate(announcement)


def withdraw_announcement(
    db: Session,
    announcement_id: uuid.UUID,
    current_user: User,
) -> AnnouncementRead:
    """Withdraw a published announcement, preserving historical notifications."""
    announcement = db.get(Announcement, announcement_id)
    if not announcement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Announcement not found",
        )

    require_org_member(db, announcement.event.organization_id, current_user, ["owner", "admin"])

    if announcement.status != "published":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot withdraw announcement with status '{announcement.status}'. Only published announcements can be withdrawn.",
        )

    announcement.status = "withdrawn"
    announcement.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(announcement)
    return AnnouncementRead.model_validate(announcement)

