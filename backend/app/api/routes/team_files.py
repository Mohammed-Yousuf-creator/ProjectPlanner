import uuid

from typing import List

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.stored_file import StoredFileRead, TeamFileRead
from app.services.file_service import (
    download_team_file,
    list_team_files,
    upload_team_file,
)

router = APIRouter()


@router.get(
    "/teams/{team_id}/files",
    response_model=List[TeamFileRead],
    status_code=status.HTTP_200_OK,
    summary="List team files",
)
def list_files(
    team_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[TeamFileRead]:
    """List files shared in the team, newest first. Active team members only.

    Soft-deleted files are excluded. Each row names the uploader and, when the
    file arrived as a chat attachment, the message that references it.
    """
    return list_team_files(
        db, team_id, current_user, limit=limit, offset=offset
    )


@router.post(
    "/teams/{team_id}/files",
    response_model=StoredFileRead,
    status_code=status.HTTP_201_CREATED,
    summary="Upload image or video file",
)
def upload_file(
    team_id: uuid.UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StoredFileRead:
    """Upload an image or video file. Streamed to disk and validated by content signature."""
    return upload_team_file(db, team_id, current_user, file)


@router.get(
    "/teams/{team_id}/files/{file_id}",
    response_class=FileResponse,
    status_code=status.HTTP_200_OK,
    summary="Download team file",
)
def download_file(
    team_id: uuid.UUID,
    file_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    """Download a file belonging to the team. Active team members only."""
    return download_team_file(db, team_id, file_id, current_user)

