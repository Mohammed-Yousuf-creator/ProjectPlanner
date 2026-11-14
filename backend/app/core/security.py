import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import jwt
from pwdlib import PasswordHash

from app.core.config import settings

# `typ` claim values. Access and refresh tokens are signed with the same key, so
# the claim is what keeps them from being interchangeable.
ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"

# Initialize Argon2 password hasher using pwdlib recommended settings
password_hasher = PasswordHash.recommended()


def hash_password(password: str) -> str:
    """Hash a plaintext password using Argon2."""
    return password_hasher.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a stored hash."""
    return password_hasher.verify(plain_password, hashed_password)


def create_access_token(
    subject: str | uuid.UUID,
    expires_delta: Optional[timedelta] = None,
    extra_claims: Optional[dict[str, Any]] = None,
) -> str:
    """Create a signed JWT access token.
    
    Contains standard claims: sub, iat, exp, jti, iss, aud.
    """
    now = datetime.now(timezone.utc)
    if expires_delta is not None:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    payload: dict[str, Any] = {
        "sub": str(subject),
        "iat": now,
        "exp": expire,
        "jti": str(uuid.uuid4()),
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
        "typ": ACCESS_TOKEN_TYPE,
    }

    if extra_claims:
        payload.update(extra_claims)

    encoded_jwt = jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    return encoded_jwt


def _decode_signed_token(token: str) -> dict[str, Any]:
    """Shared validation: signature, expiry, issuer, audience and required claims.

    Deliberately does NOT check the ``typ`` claim — the two public decoders below
    each enforce the type they accept, so a token of the wrong kind is rejected
    in both directions.
    """
    return jwt.decode(
        token,
        settings.JWT_SECRET_KEY,
        algorithms=[settings.JWT_ALGORITHM],
        issuer=settings.JWT_ISSUER,
        audience=settings.JWT_AUDIENCE,
        options={
            "require": ["sub", "iat", "exp", "jti", "iss", "aud"],
            "verify_signature": True,
            "verify_exp": True,
            "verify_iat": True,
            "verify_iss": True,
            "verify_aud": True,
        },
    )


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT access token, rejecting refresh tokens.

    Tokens issued before the ``typ`` claim existed carry no value and are still
    accepted, so a rolling deploy does not log every user out.
    """
    payload = _decode_signed_token(token)
    typ = payload.get("typ")
    if typ is not None and typ != ACCESS_TOKEN_TYPE:
        raise jwt.InvalidTokenError("Token is not an access token")
    return payload



# ---------------------------------------------------------------------------
# Refresh tokens
# ---------------------------------------------------------------------------
#
# Refresh tokens are stateless: a signed JWT with the same subject and
# issuer/audience as an access token, but a different `typ` claim and a much
# longer lifetime. `decode_refresh_token` enforces `typ == "refresh"` and
# `decode_access_token` enforces `typ == "access"`, so the two can never be
# swapped — a leaked access token cannot be refreshed, and a refresh token is
# rejected everywhere a Bearer access token is expected.
#
# Stateless refresh means there is no server-side revocation list. A user who
# needs to invalidate a stolen refresh token rotates `JWT_SECRET_KEY`, which
# invalidates both kinds at once.



def create_refresh_token(
    subject: str | uuid.UUID,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a signed JWT refresh token (long-lived, exchange-only)."""
    now = datetime.now(timezone.utc)
    expire = now + (
        expires_delta
        if expires_delta is not None
        else timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )

    payload: dict[str, Any] = {
        "sub": str(subject),
        "iat": now,
        "exp": expire,
        "jti": str(uuid.uuid4()),
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
        "typ": REFRESH_TOKEN_TYPE,
    }

    return jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_refresh_token(token: str) -> dict[str, Any]:
    """Decode a refresh token, rejecting access tokens and malformed payloads."""
    payload = _decode_signed_token(token)
    if payload.get("typ") != REFRESH_TOKEN_TYPE:
        raise jwt.InvalidTokenError("Token is not a refresh token")
    return payload
