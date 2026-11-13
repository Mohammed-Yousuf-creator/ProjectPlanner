import uuid

from fastapi import APIRouter, Depends, File, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.stored_file import StoredFileRead
from app.services.file_service import download_team_file, upload_team_file

router = APIRouter()


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

