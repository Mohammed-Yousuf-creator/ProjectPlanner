from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.auth import (
    AuthResponse,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
)
from app.services.auth_service import authenticate_user, refresh_session, register_user

router = APIRouter()


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
def register(
    request: RegisterRequest,
    db: Session = Depends(get_db),
) -> AuthResponse:
    """Register a new user account with profile and return a JWT access token."""
    return register_user(db, request)


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="User login",
)
def login(
    request: LoginRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Authenticate with email and password and return a JWT access token."""
    return authenticate_user(db, request)



@router.post(
    "/refresh",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Exchange a refresh token for a new access token",
)
def refresh(
    request: RefreshRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Rotate a refresh token into a fresh access/refresh pair.

    Unauthenticated by design: the refresh token itself is the credential. A
    revoked or expired token yields 401 and the client must sign in again.
    """
    return refresh_session(db, request)
