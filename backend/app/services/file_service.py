import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Tuple

from fastapi import HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.models.stored_file import StoredFile
from app.models.team import Team, TeamMember
from app.models.user import User
from app.schemas.stored_file import StoredFileRead
from app.storage.local_storage import storage_provider


def check_active_team_member(
    db: Session, team_id: uuid.UUID, user_id: uuid.UUID
) -> TeamMember:
    """Verify that the team exists and the user is an active member."""
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found.",
        )
    if team.status == "disbanded":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Team is disbanded.",
        )

    membership = (
        db.query(TeamMember)
        .filter(
            TeamMember.team_id == team_id,
            TeamMember.user_id == user_id,
            TeamMember.status == "active",
        )
        .first()
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only active team members can access team collaboration resources.",
        )
    return membership


def upload_team_file(
    db: Session, team_id: uuid.UUID, current_user: User, upload_file: UploadFile
) -> StoredFileRead:
    """Validate, stream to storage, and record stored file metadata."""
    check_active_team_member(db, team_id, current_user.id)

    file_id = uuid.uuid4()
    storage_key, size_bytes, checksum = storage_provider.save_upload(
        team_id=team_id, file_id=file_id, upload_file=upload_file
    )

    clean_filename = Path(upload_file.filename or "file").name
    stored = StoredFile(
        id=file_id,
        team_id=team_id,
        uploaded_by_user_id=current_user.id,
        storage_provider="local",
        storage_key=storage_key,
        original_filename=clean_filename,
        mime_type=upload_file.content_type or "application/octet-stream",
        size_bytes=size_bytes,
        checksum_sha256=checksum,
        created_at=datetime.now(timezone.utc),
    )
    db.add(stored)
    db.commit()
    db.refresh(stored)
    return StoredFileRead.model_validate(stored)


def download_team_file(
    db: Session, team_id: uuid.UUID, file_id: uuid.UUID, current_user: User
) -> FileResponse:
    """Verify team membership and stream the file with safe headers."""
    check_active_team_member(db, team_id, current_user.id)

    file_record = (
        db.query(StoredFile)
        .filter(
            StoredFile.id == file_id,
            StoredFile.team_id == team_id,
            StoredFile.deleted_at.is_(None),
        )
        .first()
    )
    if not file_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found or has been deleted.",
        )

    local_path = storage_provider.get_file_path(file_record.storage_key)
    safe_filename = Path(file_record.original_filename).name

    return FileResponse(
        path=local_path,
        media_type=file_record.mime_type,
        filename=safe_filename,
        content_disposition_type="attachment",
    )

