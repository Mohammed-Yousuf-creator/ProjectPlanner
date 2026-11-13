import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import get_optional_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.judging import LeaderboardEntryRead
from app.services.leaderboard_service import get_event_leaderboard

router = APIRouter()


@router.get(
    "/events/{event_id}/leaderboard",
    response_model=List[LeaderboardEntryRead],
    summary="Get event leaderboard",
)
def get_event_leaderboard_endpoint(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
) -> List[LeaderboardEntryRead]:
    """Calculate and return dynamically scored event leaderboard."""
    return get_event_leaderboard(db, event_id, current_user)

