import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.event import Event, EventMembership
from app.models.project import Project, ProjectSubmission
from app.models.team import Team, TeamMember
from app.models.user import User
from app.schemas.submission import (
    ProjectSubmissionCreate,
    ProjectSubmissionRead,
    ProjectSubmissionUpdate,
)
from app.services.organization_service import get_member_in_org
from app.services.project_service import validate_http_url


def edit_draft_submission(
    db: Session,
    project_id: uuid.UUID,
    submission_id: uuid.UUID,
    current_user: User,
    data: ProjectSubmissionUpdate,
) -> ProjectSubmissionRead:
    """Edit a draft submission. Submitted versions return HTTP 409."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    submission = db.get(ProjectSubmission, submission_id)
    if not submission or submission.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found for this project",
        )

    # Only active team owner or lead can edit
    team_member = (
        db.query(TeamMember)
        .filter(
            TeamMember.team_id == project.team_id,
            TeamMember.user_id == current_user.id,
            TeamMember.status == "active",
        )
        .first()
    )
    if not team_member or team_member.role not in ("owner", "lead"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only active team owner or lead can edit a submission.",
        )

    # Only draft versions can be modified
    if submission.status == "submitted":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot edit a submitted version.",
        )

    # Validate URLs if provided
    validate_http_url(data.repo_url, "Repository URL")
    validate_http_url(data.demo_url, "Demo URL")
    validate_http_url(data.presentation_url, "Presentation URL")

    # Apply updates
    if data.title is not None:
        title_val = data.title.strip()
        if not title_val:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Title cannot be empty.",
            )
        submission.title = title_val

    if data.tagline is not None:
        submission.tagline = data.tagline.strip() if data.tagline else None

    if data.abstract is not None:
        abstract_val = data.abstract.strip()
        if not abstract_val:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Abstract cannot be empty.",
            )
        submission.abstract = abstract_val

    if data.description is not None:
        submission.description = data.description.strip() if data.description else None

    if data.repo_url is not None:
        submission.repo_url = data.repo_url.strip() if data.repo_url else None

    if data.demo_url is not None:
        submission.demo_url = data.demo_url.strip() if data.demo_url else None

    if data.presentation_url is not None:
        submission.presentation_url = (
            data.presentation_url.strip() if data.presentation_url else None
        )

    submission.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(submission)
    return ProjectSubmissionRead.model_validate(submission)


def create_next_submission_version(
    db: Session,
    project_id: uuid.UUID,
    current_user: User,
    data: Optional[ProjectSubmissionCreate] = None,
) -> ProjectSubmissionRead:
    """Create the next submission version from the latest submitted version."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    # Only active team owner or lead can create next version
    team_member = (
        db.query(TeamMember)
        .filter(
            TeamMember.team_id == project.team_id,
            TeamMember.user_id == current_user.id,
            TeamMember.status == "active",
        )
        .first()
    )
    if not team_member or team_member.role not in ("owner", "lead"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only active team owner or lead can create a new submission version.",
        )

    # There must not already be another draft version
    existing_draft = (
        db.query(ProjectSubmission)
        .filter(
            ProjectSubmission.project_id == project_id,
            ProjectSubmission.status == "draft",
        )
        .first()
    )
    if existing_draft:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A draft submission already exists for this project.",
        )

    # Previous version must have been submitted
    latest = (
        db.query(ProjectSubmission)
        .filter(ProjectSubmission.project_id == project_id)
        .order_by(ProjectSubmission.version_number.desc())
        .first()
    )
    if not latest or latest.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Previous submission version must be submitted before creating a new version.",
        )

    # Validate URLs if provided in override data
    if data:
        validate_http_url(data.repo_url, "Repository URL")
        validate_http_url(data.demo_url, "Demo URL")
        validate_http_url(data.presentation_url, "Presentation URL")

    # Increment version_number and copy from latest submitted version
    title = (data.title.strip() if data and data.title else latest.title)
    tagline = (
        data.tagline.strip()
        if (data and data.tagline is not None)
        else latest.tagline
    )
    abstract = (
        data.abstract.strip() if data and data.abstract else latest.abstract
    )
    description = (
        data.description.strip()
        if (data and data.description is not None)
        else latest.description
    )
    repo_url = (
        data.repo_url.strip()
        if (data and data.repo_url is not None)
        else latest.repo_url
    )
    demo_url = (
        data.demo_url.strip()
        if (data and data.demo_url is not None)
        else latest.demo_url
    )
    presentation_url = (
        data.presentation_url.strip()
        if (data and data.presentation_url is not None)
        else latest.presentation_url
    )

    new_version = ProjectSubmission(
        project_id=project_id,
        version_number=latest.version_number + 1,
        submitted_by_user_id=current_user.id,
        title=title,
        tagline=tagline,
        abstract=abstract,
        description=description,
        repo_url=repo_url,
        demo_url=demo_url,
        presentation_url=presentation_url,
        status="draft",
        submitted_at=None,
    )
    db.add(new_version)
    db.commit()
    db.refresh(new_version)
    return ProjectSubmissionRead.model_validate(new_version)


def get_project_submissions(
    db: Session, project_id: uuid.UUID, current_user: User
) -> List[ProjectSubmissionRead]:
    """Return the project's version history."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    event = project.event

    # 1. Team member of project's team can view all versions
    team_mem = (
        db.query(TeamMember)
        .filter(
            TeamMember.team_id == project.team_id,
            TeamMember.user_id == current_user.id,
            TeamMember.status == "active",
        )
        .first()
    )

    # 2. Authorized event organizer can view all versions
    org_mem = get_member_in_org(db, event.organization_id, current_user.id)
    is_org = org_mem and org_mem.status == "active" and org_mem.role in ("owner", "admin")

    # 3. Approved event judge can view submitted versions only
    judge_mem = (
        db.query(EventMembership)
        .filter(
            EventMembership.event_id == event.id,
            EventMembership.user_id == current_user.id,
            EventMembership.role == "judge",
            EventMembership.status == "approved",
        )
        .first()
    )

    if team_mem or is_org:
        subs = (
            db.query(ProjectSubmission)
            .filter(ProjectSubmission.project_id == project_id)
            .order_by(ProjectSubmission.version_number.asc())
            .all()
        )
    elif judge_mem:
        subs = (
            db.query(ProjectSubmission)
            .filter(
                ProjectSubmission.project_id == project_id,
                ProjectSubmission.status == "submitted",
            )
            .order_by(ProjectSubmission.version_number.asc())
            .all()
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view submissions for this project.",
        )

    return [ProjectSubmissionRead.model_validate(s) for s in subs]


def finalize_submission(
    db: Session,
    project_id: uuid.UUID,
    submission_id: uuid.UUID,
    current_user: User,
) -> ProjectSubmissionRead:
    """Finalize and submit a draft submission version."""
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    submission = db.get(ProjectSubmission, submission_id)
    if not submission or submission.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found for this project",
        )

    # Only active team owner or lead can submit
    team_member = (
        db.query(TeamMember)
        .filter(
            TeamMember.team_id == project.team_id,
            TeamMember.user_id == current_user.id,
            TeamMember.status == "active",
        )
        .first()
    )
    if not team_member or team_member.role not in ("owner", "lead"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only active team owner or lead can submit.",
        )

    # Submission must be a draft
    if submission.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submission is already submitted.",
        )

    event = project.event
    # Validate event status
    if event.status in ("cancelled", "completed"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot submit for a {event.status} event.",
        )

    # Enforce submission_deadline_at
    now = datetime.now(timezone.utc)
    if event.submission_deadline_at and now > event.submission_deadline_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submission deadline has passed.",
        )

    # Validate required repository URL
    if not submission.repo_url or not submission.repo_url.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A valid repository URL is required for submission.",
        )
    validate_http_url(submission.repo_url, "Repository URL")

    # Validate title and abstract
    if not submission.title or not submission.title.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submission title is required.",
        )
    if not submission.abstract or not submission.abstract.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submission abstract is required.",
        )

    # Validate team has at least event's minimum team size
    active_count = (
        db.query(func.count(TeamMember.id))
        .filter(
            TeamMember.team_id == project.team_id,
            TeamMember.status == "active",
        )
        .scalar()
        or 0
    )
    if active_count < event.min_team_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Team must have at least {event.min_team_size} active members to submit. Current: {active_count}",
        )

    # Set status to submitted
    submission.status = "submitted"
    submission.submitted_at = now
    submission.submitted_by_user_id = current_user.id
    submission.updated_at = now

    # Mark the team status as submitted
    team = project.team
    if team.status != "submitted":
        team.status = "submitted"
        team.updated_at = now

    db.commit()
    db.refresh(submission)
    return ProjectSubmissionRead.model_validate(submission)

