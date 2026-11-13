import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class StoredFileRead(BaseModel):
    id: uuid.UUID
    team_id: uuid.UUID
    uploaded_by_user_id: uuid.UUID
    original_filename: str
    mime_type: str
    size_bytes: int
    checksum_sha256: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

