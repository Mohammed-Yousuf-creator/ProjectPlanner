import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class CheckInAttendeeRead(BaseModel):
    user_id: uuid.UUID
    username: str
    email: str
    display_name: Optional[str] = None
    status: str
    registered_at: datetime
    checked_in_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CheckInSummaryRead(BaseModel):
    total_eligible_registrations: int
    total_checked_in: int
    total_not_checked_in: int
    attendance_percentage: float

    model_config = ConfigDict(from_attributes=True)

