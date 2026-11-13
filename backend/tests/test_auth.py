from datetime import timedelta
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.models.user import User, UserProfile


def test_successful_registration(client: TestClient, db_session: Session):
    """Test user registration succeeds and creates both user and user_profile."""
    payload = {
        "email": "Alice@example.com",
        "username": "alice",
        "password": "SecurePassword123!",
        "display_name": "Alice Wonderland",
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201

    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "alice@example.com"
    assert data["user"]["username"] == "alice"
    assert data["user"]["profile"]["display_name"] == "Alice Wonderland"

    # Verify directly in database
    user = db_session.execute(
        select(User).where(User.email == "alice@example.com")
    ).scalar_one()
    assert user.username == "alice"
    assert user.profile is not None
    assert user.profile.display_name == "Alice Wonderland"


def test_duplicate_email_rejection(client: TestClient):
    """Test registering with an existing email is rejected with 409 Conflict."""
    payload1 = {
        "email": "duplicate@example.com",
        "username": "userone",
        "password": "SecurePassword123!",
        "display_name": "User One",
    }
    res1 = client.post("/api/v1/auth/register", json=payload1)
    assert res1.status_code == 201

    payload2 = {
        "email": "DUPLICATE@example.com",  # Normalized case check
        "username": "usertwo",
        "password": "SecurePassword123!",
        "display_name": "User Two",
    }
    res2 = client.post("/api/v1/auth/register", json=payload2)
    assert res2.status_code == 409
    assert "email" in res2.json()["detail"].lower()


def test_duplicate_username_rejection(client: TestClient):
    """Test registering with an existing username is rejected with 409 Conflict."""
    payload1 = {
        "email": "user1@example.com",
        "username": "common_username",
        "password": "SecurePassword123!",
        "display_name": "User 1",
    }
    res1 = client.post("/api/v1/auth/register", json=payload1)
    assert res1.status_code == 201

    payload2 = {
        "email": "user2@example.com",
        "username": "COMMON_USERNAME",  # Normalized case check
        "password": "SecurePassword123!",
        "display_name": "User 2",
    }
    res2 = client.post("/api/v1/auth/register", json=payload2)
    assert res2.status_code == 409
    assert "username" in res2.json()["detail"].lower()


def test_password_stored_as_hash(client: TestClient, db_session: Session):
    """Test password is never stored in plaintext and is hashed with Argon2."""
    raw_password = "MySuperSecretPassword999!"
    payload = {
        "email": "hashing_test@example.com",
        "username": "hashtest",
        "password": raw_password,
        "display_name": "Hash Tester",
    }
    res = client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 201

    user = db_session.execute(
        select(User).where(User.email == "hashing_test@example.com")
    ).scalar_one()

    # Must not match raw password
    assert user.password_hash != raw_password
    # Must start with argon2 identifier
    assert "$argon2" in user.password_hash


def test_successful_login(client: TestClient):
    """Test login with valid credentials succeeds and returns JWT access token."""
    reg_payload = {
        "email": "login_user@example.com",
        "username": "login_user",
        "password": "CorrectPassword123!",
        "display_name": "Login User",
    }
    client.post("/api/v1/auth/register", json=reg_payload)

    login_payload = {
        "email": "LOGIN_USER@example.com",  # Case normalization test
        "password": "CorrectPassword123!",
    }
    res = client.post("/api/v1/auth/login", json=login_payload)
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_incorrect_password_rejection(client: TestClient):
    """Test login with invalid password returns 401 Unauthorized."""
    reg_payload = {
        "email": "wrong_pw@example.com",
        "username": "wrong_pw_user",
        "password": "CorrectPassword123!",
        "display_name": "Password User",
    }
    client.post("/api/v1/auth/register", json=reg_payload)

    login_payload = {
        "email": "wrong_pw@example.com",
        "password": "WrongPassword999!",
    }
    res = client.post("/api/v1/auth/login", json=login_payload)
    assert res.status_code == 401
    assert "invalid" in res.json()["detail"].lower()


def test_invalid_token_rejection(client: TestClient):
    """Test accessing protected route with an invalid token is rejected."""
    headers = {"Authorization": "Bearer not_a_valid_token"}
    res = client.get("/api/v1/users/me", headers=headers)
    assert res.status_code == 401


def test_expired_token_rejection(client: TestClient, db_session: Session):
    """Test accessing protected route with an expired token is rejected."""
    reg_payload = {
        "email": "expired_token@example.com",
        "username": "expired_user",
        "password": "CorrectPassword123!",
        "display_name": "Expired Tester",
    }
    res = client.post("/api/v1/auth/register", json=reg_payload)
    user_id = res.json()["user"]["id"]

    # Create token that already expired 10 minutes ago
    expired_token = create_access_token(
        subject=user_id,
        expires_delta=timedelta(minutes=-10),
    )

    headers = {"Authorization": f"Bearer {expired_token}"}
    res = client.get("/api/v1/users/me", headers=headers)
    assert res.status_code == 401
    assert "expired" in res.json()["detail"].lower()


def test_access_me_without_token_denied(client: TestClient):
    """Test accessing /users/me without Authorization header returns 401."""
    res = client.get("/api/v1/users/me")
    assert res.status_code == 401


def test_access_me_with_valid_token_succeeds(client: TestClient):
    """Test accessing /users/me with valid Bearer token returns UserMeResponse."""
    reg_payload = {
        "email": "valid_user@example.com",
        "username": "valid_user",
        "password": "CorrectPassword123!",
        "display_name": "Valid User",
    }
    reg_res = client.post("/api/v1/auth/register", json=reg_payload)
    token = reg_res.json()["access_token"]

    headers = {"Authorization": f"Bearer {token}"}
    res = client.get("/api/v1/users/me", headers=headers)
    assert res.status_code == 200

    data = res.json()
    assert data["email"] == "valid_user@example.com"
    assert data["username"] == "valid_user"
    assert data["profile"]["display_name"] == "Valid User"
    assert data["account_status"] == "active"


def test_suspended_users_cannot_authenticate(client: TestClient, db_session: Session):
    """Test that suspended accounts cannot log in and active tokens are rejected."""
    reg_payload = {
        "email": "suspended@example.com",
        "username": "suspended_user",
        "password": "Password123!",
        "display_name": "Suspended User",
    }
    reg_res = client.post("/api/v1/auth/register", json=reg_payload)
    token = reg_res.json()["access_token"]

    # Mark user as suspended in the database
    user = db_session.execute(
        select(User).where(User.email == "suspended@example.com")
    ).scalar_one()
    user.account_status = "suspended"
    db_session.commit()

    # 1. Login attempt should fail with 403 Forbidden
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "suspended@example.com", "password": "Password123!"},
    )
    assert login_res.status_code == 403
    assert "suspended" in login_res.json()["detail"].lower()

    # 2. Accessing /users/me with existing token should also be rejected with 403
    headers = {"Authorization": f"Bearer {token}"}
    me_res = client.get("/api/v1/users/me", headers=headers)
    assert me_res.status_code == 403
    assert "suspended" in me_res.json()["detail"].lower()

