import uuid
from typing import Tuple

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.models.user import User, UserProfile
from app.schemas.auth import (
    AuthResponse,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
)
from app.schemas.user import UserMeResponse


def normalize_email(email: str) -> str:
    """Normalize email address to lowercase and stripped of whitespace."""
    return email.strip().lower()


def normalize_username(username: str) -> str:
    """Normalize username to lowercase and stripped of whitespace."""
    return username.strip().lower()


def register_user(db: Session, request: RegisterRequest) -> AuthResponse:
    """Register a new user and create their initial profile in a single transaction."""
    norm_email = normalize_email(str(request.email))
    norm_username = normalize_username(request.username)

    # Check for existing email
    existing_email = db.execute(
        select(User).where(User.email == norm_email)
    ).scalar_one_or_none()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already registered",
        )

    # Check for existing username
    existing_username = db.execute(
        select(User).where(User.username == norm_username)
    ).scalar_one_or_none()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username is already taken",
        )

    hashed_pw = hash_password(request.password)
    user_id = uuid.uuid4()

    new_user = User(
        id=user_id,
        email=norm_email,
        username=norm_username,
        password_hash=hashed_pw,
        account_status="active",
    )

    new_profile = UserProfile(
        user_id=user_id,
        display_name=request.display_name.strip(),
        profile_visibility="public",
    )

    db.add(new_user)
    db.add(new_profile)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User with this email or username already exists",
        )

    # Refresh user with profile loaded
    user = db.execute(
        select(User)
        .options(selectinload(User.profile))
        .where(User.id == user_id)
    ).scalar_one()

    access_token = create_access_token(subject=user.id)

    return AuthResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserMeResponse.model_validate(user),
    )


def authenticate_user(db: Session, request: LoginRequest) -> TokenResponse:
    """Authenticate a user using email and password, returning an access token."""
    norm_email = normalize_email(str(request.email))

    user = db.execute(
        select(User).where(User.email == norm_email)
    ).scalar_one_or_none()

    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if user.account_status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is suspended or inactive",
        )

    access_token = create_access_token(subject=user.id)
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
    )

