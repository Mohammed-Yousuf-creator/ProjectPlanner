import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class StoredFileRead(BaseModel):
    """A stored file record, as returned by upload."""

    id: uuid.UUID
    team_id: uuid.UUID
    uploaded_by_user_id: uuid.UUID
    original_filename: str
    mime_type: str
    size_bytes: int
    checksum_sha256: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TeamFileRead(StoredFileRead):
    """A team file enriched for the team Files tab.

    Adds who uploaded it and which chat message references it (if any), so the
    client can group by uploader and deep-link back to the conversation without
    fetching the whole message history.
    """

    uploaded_by_username: Optional[str] = None
    uploaded_by_display_name: Optional[str] = None
    # Null when the file was uploaded outside chat (e.g. a future task attachment).
    message_id: Optional[uuid.UUID] = None
