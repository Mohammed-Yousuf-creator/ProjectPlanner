import abc
import hashlib
import os
import shutil
import uuid
from pathlib import Path
from typing import BinaryIO, Optional, Tuple

from fastapi import HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError

from app.core.config import settings

# Limits
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_VIDEO_SIZE = 100 * 1024 * 1024  # 100 MB

SUPPORTED_IMAGE_MIMES = {
    "image/jpeg": ("JPEG", [".jpg", ".jpeg"]),
    "image/png": ("PNG", [".png"]),
    "image/webp": ("WEBP", [".webp"]),
}

SUPPORTED_VIDEO_MIMES = {
    "video/mp4": [".mp4"],
    "video/webm": [".webm"],
    "video/quicktime": [".mov"],
}

ALL_SUPPORTED_MIMES = set(SUPPORTED_IMAGE_MIMES.keys()) | set(
    SUPPORTED_VIDEO_MIMES.keys()
)


class BaseStorageProvider(abc.ABC):
    """Abstract storage provider interface."""

    @abc.abstractmethod
    def save_upload(
        self, team_id: uuid.UUID, file_id: uuid.UUID, upload_file: UploadFile
    ) -> Tuple[str, int, str]:
        """Save an upload stream and return (storage_key, size_bytes, checksum_sha256)."""
        pass

    @abc.abstractmethod
    def get_file_path(self, storage_key: str) -> Path:
        """Resolve storage_key to local filesystem Path."""
        pass

    @abc.abstractmethod
    def delete_file(self, storage_key: str) -> None:
        """Delete file associated with storage_key."""
        pass


def validate_video_container(header_bytes: bytes, mime_type: str) -> bool:
    """Validate container signatures for video files."""
    if mime_type == "video/webm":
        # EBML header
        return header_bytes.startswith(b"\x1a\x45\xdf\xa3")

    if mime_type in ("video/mp4", "video/quicktime"):
        if len(header_bytes) < 8:
            return False
        # ISO Base Media File Format: bytes 4-8 are usually 'ftyp', 'moov', 'mdat', 'wide', 'free'
        box_type = header_bytes[4:8]
        if box_type in (b"ftyp", b"moov", b"mdat", b"wide", b"free", b"skip"):
            return True
        # Some MOV files start directly with moov/mdat/wide
        if header_bytes[0:4] in (b"moov", b"mdat", b"wide"):
            return True

    return False


class LocalStorageProvider(BaseStorageProvider):
    """Local disk storage provider with chunked streaming and content validation."""

    def __init__(self, root_dir: Optional[str] = None):
        self.root_dir = Path(root_dir or settings.UPLOAD_DIR).resolve()
        self.root_dir.mkdir(parents=True, exist_ok=True)

    def get_team_dir(self, team_id: uuid.UUID) -> Path:
        team_dir = (self.root_dir / str(team_id)).resolve()
        # Prevent path traversal
        if not str(team_dir).startswith(str(self.root_dir)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid storage directory path.",
            )
        team_dir.mkdir(parents=True, exist_ok=True)
        return team_dir

    def save_upload(
        self, team_id: uuid.UUID, file_id: uuid.UUID, upload_file: UploadFile
    ) -> Tuple[str, int, str]:
        """Stream upload to disk in chunks, calculate SHA-256, and validate file content."""
        content_type = (upload_file.content_type or "").lower().strip()
        if content_type not in ALL_SUPPORTED_MIMES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file type '{content_type}'.",
            )

        is_image = content_type in SUPPORTED_IMAGE_MIMES
        max_allowed = MAX_IMAGE_SIZE if is_image else MAX_VIDEO_SIZE

        # Determine target file extension safely
        orig_filename = upload_file.filename or "file"
        suffix = Path(orig_filename).suffix.lower()
        if not suffix:
            if is_image:
                suffix = SUPPORTED_IMAGE_MIMES[content_type][1][0]
            else:
                suffix = SUPPORTED_VIDEO_MIMES[content_type][0]

        team_dir = self.get_team_dir(team_id)
        storage_filename = f"{file_id}{suffix}"
        target_path = (team_dir / storage_filename).resolve()

        # Check path traversal
        if not str(target_path).startswith(str(team_dir)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid filename.",
            )

        hasher = hashlib.sha256()
        total_size = 0
        chunk_size = 64 * 1024  # 64 KB

        try:
            with open(target_path, "wb") as f_out:
                while True:
                    chunk = upload_file.file.read(chunk_size)
                    if not chunk:
                        break
                    total_size += len(chunk)
                    if total_size > max_allowed:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"File exceeds maximum allowed size ({max_allowed // (1024 * 1024)} MB).",
                        )
                    hasher.update(chunk)
                    f_out.write(chunk)
        except Exception:
            # Clean up partial file on failure
            if target_path.exists():
                try:
                    target_path.unlink()
                except OSError:
                    pass
            raise

        if total_size == 0:
            if target_path.exists():
                target_path.unlink()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Empty files are not allowed.",
            )

        # Validate actual content signatures
        try:
            if is_image:
                expected_format = SUPPORTED_IMAGE_MIMES[content_type][0]
                try:
                    with Image.open(target_path) as img:
                        img.verify()
                        if img.format != expected_format:
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Image content does not match declared MIME type '{content_type}'.",
                            )
                except (UnidentifiedImageError, OSError):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="File is not a valid image.",
                    )
            else:
                # Video validation
                with open(target_path, "rb") as vf:
                    header = vf.read(64)
                if not validate_video_container(header, content_type):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="File is not a valid video container.",
                    )
        except Exception:
            # Clean up file on validation failure
            if target_path.exists():
                try:
                    target_path.unlink()
                except OSError:
                    pass
            raise

        # Storage key relative to root: e.g. "team_id/file_id.ext"
        storage_key = f"{team_id}/{storage_filename}"
        checksum = hasher.hexdigest()
        return storage_key, total_size, checksum

    def get_file_path(self, storage_key: str) -> Path:
        resolved = (self.root_dir / storage_key).resolve()
        if not str(resolved).startswith(str(self.root_dir)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid storage key.",
            )
        if not resolved.exists() or not resolved.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found in storage.",
            )
        return resolved

    def delete_file(self, storage_key: str) -> None:
        try:
            path = self.get_file_path(storage_key)
            if path.exists():
                path.unlink()
        except HTTPException:
            pass


# Global storage instance
storage_provider = LocalStorageProvider()

