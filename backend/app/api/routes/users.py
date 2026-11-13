from fastapi import APIRouter, Depends, status

from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.user import UserMeResponse

router = APIRouter()


@router.get(
    "/me",
    response_model=UserMeResponse,
    status_code=status.HTTP_200_OK,
    summary="Get current user profile",
)
def get_current_user_profile(
    current_user: User = Depends(get_current_user),
) -> UserMeResponse:
    """Retrieve the currently authenticated user and their profile."""
    return UserMeResponse.model_validate(current_user)

