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



# -----------------------------------------------------------------------------
# Refresh tokens (Backend_missing.md #4)
# -----------------------------------------------------------------------------


def _register(client: TestClient, suffix: str) -> dict:
    res = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"refresh_{suffix}@example.com",
            "username": f"refresh_{suffix}",
            "password": "SecurePassword123!",
            "display_name": f"Refresh {suffix}",
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def test_register_and_login_issue_refresh_tokens(client: TestClient):
    """Both entry points return a refresh token and the access lifetime."""
    suffix = uuid.uuid4().hex[:6]
    body = _register(client, suffix)
    assert body["refresh_token"]
    assert body["expires_in"] > 0

    login = client.post(
        "/api/v1/auth/login",
        json={"email": f"refresh_{suffix}@example.com", "password": "SecurePassword123!"},
    )
    assert login.status_code == 200
    assert login.json()["refresh_token"]


def test_refresh_rotates_tokens(client: TestClient):
    """A refresh token yields a working new access token and a new refresh token."""
    suffix = uuid.uuid4().hex[:6]
    body = _register(client, suffix)
    original_refresh = body["refresh_token"]

    res = client.post("/api/v1/auth/refresh", json={"refresh_token": original_refresh})
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["access_token"]
    assert data["refresh_token"]
    assert data["refresh_token"] != original_refresh  # rotated

    # The new access token authenticates against a protected endpoint.
    me = client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {data['access_token']}"},
    )
    assert me.status_code == 200
    assert me.json()["email"] == f"refresh_{suffix}@example.com"


def test_access_token_is_not_accepted_as_refresh_token(client: TestClient):
    """Token types are not interchangeable."""
    suffix = uuid.uuid4().hex[:6]
    body = _register(client, suffix)

    res = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": body["access_token"]},
    )
    assert res.status_code == 401
    assert "refresh" in res.json()["detail"].lower()


def test_refresh_token_is_not_accepted_as_access_token(client: TestClient):
    """A refresh token cannot authenticate a normal API request."""
    suffix = uuid.uuid4().hex[:6]
    body = _register(client, suffix)

    res = client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {body['refresh_token']}"},
    )
    assert res.status_code == 401


def test_expired_refresh_token_is_rejected(client: TestClient):
    """An expired refresh token returns 401 with a distinguishable message."""
    from app.core.security import create_refresh_token

    suffix = uuid.uuid4().hex[:6]
    body = _register(client, suffix)
    user_id = body["user"]["id"]

    expired = create_refresh_token(subject=user_id, expires_delta=timedelta(seconds=-10))
    res = client.post("/api/v1/auth/refresh", json={"refresh_token": expired})
    assert res.status_code == 401
    assert "expired" in res.json()["detail"].lower()


def test_garbage_refresh_token_is_rejected(client: TestClient):
    """Malformed input is a 401, never a 500."""
    res = client.post("/api/v1/auth/refresh", json={"refresh_token": "not-a-jwt"})
    assert res.status_code == 401


def test_refresh_token_for_deleted_user_is_rejected(client: TestClient, db_session: Session):
    """A refresh token for a user that no longer exists cannot mint an access token."""
    suffix = uuid.uuid4().hex[:6]
    body = _register(client, suffix)

    user = db_session.execute(
        select(User).where(User.username == f"refresh_{suffix}")
    ).scalar_one()
    db_session.delete(user)
    db_session.commit()

    res = client.post("/api/v1/auth/refresh", json={"refresh_token": body["refresh_token"]})
    assert res.status_code == 401
