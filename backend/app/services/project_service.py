import uuid
from typing import List, Optional
from urllib.parse import urlparse

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.models.event import Event, EventMembership, EventTrack
from app.models.organization import OrganizationMember
from app.models.project import Project, ProjectSubmission
from app.models.team import Team, TeamMember
from app.models.user import User
from app.schemas.project import (
    ProjectCreate,
    ProjectDetailRead,
    ProjectPublicRead,
    ProjectRead,
)
from app.schemas.submission import ProjectSubmissionRead
from app.services.organization_service import get_member_in_org


def validate_http_url(url: Optional[str], field_name: str = "URL") -> None:
    """Validate that a URL has a valid http/https scheme and netloc."""
    if not url:
        return
    url_str = url.strip()
    if not url_str:
        return
    parsed = urlparse(url_str)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} must be a valid HTTP or HTTPS URL.",
        )


def create_project(
    db: Session, event_id: uuid.UUID, current_user: User, data: ProjectCreate
) -> ProjectDetailRead:
    """Create a project and its first draft submission in one database transaction."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    # User must have an active membership in a team for this event
    team_member = (
        db.query(TeamMember)
        .join(Team, Team.id == TeamMember.team_id)
        .filter(
            Team.event_id == event_id,
            TeamMember.user_id == current_user.id,
            TeamMember.status == "active",
        )
        .first()
    )

    if not team_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not belong to an active team for this event.",
        )

    team = team_member.team
    if team.status == "disbanded":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot create a project for a disbanded team.",
        )

    # Only team owner or team lead can create the project
    if team_member.role not in ("owner", "lead"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only team owner or lead can create a project.",
        )

    # A team can have only one project per event
    existing_project = (
        db.query(Project)
        .filter(Project.event_id == event_id, Project.team_id == team.id)
        .first()
    )
    if existing_project:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Team already has a project for this event.",
        )

    # Validate selected track belongs to this event
    track: Optional[EventTrack] = None
    if data.track_id:
        track = db.get(EventTrack, data.track_id)
        if not track or track.event_id != event_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Selected track does not belong to this event.",
            )

    # Validate URLs
    validate_http_url(data.repo_url, "Repository URL")
    validate_http_url(data.demo_url, "Demo URL")
    validate_http_url(data.presentation_url, "Presentation URL")

    # Create project
    project = Project(
        event_id=event_id,
        team_id=team.id,
        track_id=data.track_id,
        created_by_user_id=current_user.id,
    )
    db.add(project)
    db.flush()  # populate project.id

    # Automatically create submission version 1 with status draft
    submission = ProjectSubmission(
        project_id=project.id,
        version_number=1,
        submitted_by_user_id=current_user.id,
        title=data.title.strip(),
        tagline=data.tagline.strip() if data.tagline else None,
        abstract=data.abstract.strip(),
        description=data.description.strip() if data.description else None,
        repo_url=data.repo_url.strip() if data.repo_url else None,
        demo_url=data.demo_url.strip() if data.demo_url else None,
        presentation_url=data.presentation_url.strip() if data.presentation_url else None,
        status="draft",
        submitted_at=None,
    )
    db.add(submission)
    db.commit()
    db.refresh(project)
    db.refresh(submission)

    sub_read = ProjectSubmissionRead.model_validate(submission)
    return ProjectDetailRead(
        id=project.id,
        event_id=project.event_id,
        team_id=project.team_id,
        track_id=project.track_id,
        created_by_user_id=project.created_by_user_id,
        created_at=project.created_at,
        updated_at=project.updated_at,
        team_name=team.name,
        track_name=track.name if track else None,
        submissions=[sub_read],
        latest_submission=sub_read,
    )


def get_team_project(
    db: Session, team_id: uuid.UUID, current_user: User
) -> ProjectDetailRead:
    """Return the team's project, latest submission, and available submission history."""
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    # Only active team members can view the complete project, including drafts
    membership = (
        db.query(TeamMember)
        .filter(
            TeamMember.team_id == team_id,
            TeamMember.user_id == current_user.id,
            TeamMember.status == "active",
        )
        .first()
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only active team members can view the team's project.",
        )

    project = (
        db.query(Project)
        .options(
            joinedload(Project.submissions),
            joinedload(Project.track),
        )
        .filter(Project.team_id == team_id)
        .first()
    )
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No project found for this team.",
        )

    sorted_subs = sorted(project.submissions, key=lambda s: s.version_number)
    sub_reads = [ProjectSubmissionRead.model_validate(s) for s in sorted_subs]
    latest_sub = sub_reads[-1] if sub_reads else None

    return ProjectDetailRead(
        id=project.id,
        event_id=project.event_id,
        team_id=project.team_id,
        track_id=project.track_id,
        created_by_user_id=project.created_by_user_id,
        created_at=project.created_at,
        updated_at=project.updated_at,
        team_name=team.name,
        track_name=project.track.name if project.track else None,
        submissions=sub_reads,
        latest_submission=latest_sub,
    )


def list_event_projects(
    db: Session,
    event_id: uuid.UUID,
    current_user: User,
    page: int = 1,
    page_size: int = 20,
) -> List[ProjectPublicRead]:
    """List submitted projects belonging to an event for participants, judges, or organizers."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    # Authorization check
    is_authorized = False

    # 1. Organization owner/admin
    org_mem = get_member_in_org(db, event.organization_id, current_user.id)
    if org_mem and org_mem.status == "active" and org_mem.role in ("owner", "admin"):
        is_authorized = True

    # 2. Eligible registered event participant
    if not is_authorized:
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
        if ev_mem:
            is_authorized = True

    # 3. Approved event judge
    if not is_authorized:
        judge_mem = (
            db.query(EventMembership)
            .filter(
                EventMembership.event_id == event_id,
                EventMembership.user_id == current_user.id,
                EventMembership.role == "judge",
                EventMembership.status == "approved",
            )
            .first()
        )
        if judge_mem:
            is_authorized = True

    if not is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view projects for this event.",
        )

    # Query projects for this event
    projects = (
        db.query(Project)
        .options(
            joinedload(Project.team),
            joinedload(Project.track),
            joinedload(Project.submissions),
        )
        .filter(Project.event_id == event_id)
        .order_by(Project.created_at.asc())
        .all()
    )

    results: List[ProjectPublicRead] = []
    for p in projects:
        # Find latest submitted version
        submitted_versions = [
            s for s in p.submissions if s.status == "submitted"
        ]
        if not submitted_versions:
            continue

        latest_submitted = max(submitted_versions, key=lambda s: s.version_number)
        results.append(
            ProjectPublicRead(
                project_id=p.id,
                event_id=p.event_id,
                team_id=p.team_id,
                team_name=p.team.name,
                track_id=p.track_id,
                track_name=p.track.name if p.track else None,
                latest_submission=ProjectSubmissionRead.model_validate(latest_submitted),
                created_at=p.created_at,
            )
        )

    # Pagination
    start = (page - 1) * page_size
    end = start + page_size
    return results[start:end]

