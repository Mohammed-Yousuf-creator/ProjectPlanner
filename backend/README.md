# Event & Hackathon Management Platform - Backend Foundation

This repository contains the backend foundation for an event and hackathon management platform built with Python, FastAPI, SQLite, and SQLAlchemy 2.x.

This initial phase establishes the core database architecture, declarative models, Pydantic schemas, migration pipeline with Alembic, JWT access-token authentication with Argon2 password hashing, and test suite.

---

## 1. Technology Stack

- **Language:** Python 3.12+ (tested on Python 3.14)
- **Framework:** FastAPI (REST API framework)
- **Database:** SQLite (local file-based relational store at `data/app.db`)
- **ORM:** SQLAlchemy 2.x (synchronous declarative mapping, UUID support, UTC timestamp decorators)
- **Validation & Schemas:** Pydantic v2 & `pydantic-settings`
- **Migrations:** Alembic
- **Security:** PyJWT (HS256 access tokens), `pwdlib[argon2]` (Argon2 password hashing)
- **Testing:** pytest, httpx

---

## 2. Project Structure

```text
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                  # FastAPI application entrypoint & root router mount
│   ├── api/
│   │   ├── __init__.py
│   │   ├── router.py            # API v1 central router
│   │   └── routes/
│   │       ├── __init__.py
│   │       ├── auth.py          # /api/v1/auth/register and /api/v1/auth/login
│   │       ├── users.py         # /api/v1/users/me
│   │       └── health.py        # /api/v1/health
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py            # Pydantic-settings configuration & .env loading
│   │   ├── security.py          # Argon2 hashing & PyJWT token utilities
│   │   └── dependencies.py      # FastAPI reusable dependencies (get_current_user)
│   ├── db/
│   │   ├── __init__.py
│   │   ├── base.py              # DeclarativeBase & UTCDateTime TypeDecorator
│   │   └── session.py           # SQLite connection, engine & SessionLocal factory
│   ├── models/
│   │   ├── __init__.py          # Exports and registers all 10 models with Base
│   │   ├── user.py              # User and UserProfile models
│   │   ├── organization.py      # Organization and OrganizationMember models
│   │   ├── event.py             # Event, EventMembership, EventTrack models
│   │   └── team.py              # Team, TeamMember, TeamInvitation models
│   ├── schemas/
│   │   ├── __init__.py          # Pydantic schema exports
│   │   ├── auth.py              # RegisterRequest, LoginRequest, AuthResponse, TokenResponse
│   │   ├── user.py              # UserRead, UserProfileRead, UserProfileUpdate, UserMeResponse
│   │   ├── organization.py      # OrganizationCreate, OrganizationRead, OrganizationMemberRead
│   │   ├── event.py             # EventCreate, EventUpdate, EventRead, EventMembership*, EventTrack*
│   │   └── team.py              # TeamCreate, TeamRead, TeamMember*, TeamInvitation*
│   └── services/
│       ├── __init__.py
│       └── auth_service.py      # Registration & authentication business logic
├── alembic/
│   ├── versions/                # Generated database migration files
│   ├── env.py                   # Alembic environment configured with app settings & models
│   ├── script.py.mako
│   └── README
├── data/
│   └── app.db                   # SQLite production/development database file
├── tests/
│   ├── __init__.py
│   ├── conftest.py              # Pytest fixtures, test database setup, and TestClient
│   ├── test_auth.py             # Authentication & user endpoint tests
│   ├── test_health.py           # Health check & DB connectivity tests
│   └── test_models.py           # All 10 models, constraints, and relationship tests
├── .env                         # Local environment settings (ignored by git)
├── .env.example                 # Example environment template
├── .gitignore                   # Git ignore patterns
├── alembic.ini                  # Alembic CLI configuration
├── requirements.txt             # Project dependencies
└── README.md                    # Project documentation
```

---

## 3. Database Architecture & Models

The foundation defines exactly 10 relational tables:

1. **`users`**: Central account table. Holds UUID, unique normalized email, unique normalized username, Argon2 password hash, account status, email verification timestamp, and UTC audit timestamps.
2. **`user_profiles`**: One-to-one child record created automatically upon user registration with display name, bio, social links, and visibility settings.
3. **`organizations`**: Organizers and sponsors with globally unique slug, type check constraint (`organizer`, `sponsor`, `both`, `other`), status, and creator foreign key.
4. **`organization_members`**: Join table between users and organizations with roles (`owner`, `admin`, `member`), statuses (`invited`, `active`, `suspended`), and unique constraint on `(organization_id, user_id)`.
5. **`events`**: Events belonging to organizations with unique constraint on `(organization_id, slug)`, format checks (`online`, `offline`, `hybrid`), status checks, team size constraints (`min_team_size >= 1`, `max_team_size >= min_team_size`), and location/timing attributes.
6. **`event_memberships`**: Event registrations with unique constraint on `(event_id, user_id)`, role checks (`participant`, `judge`, `mentor`), status checks, and flexible JSON registration metadata.
7. **`event_tracks`**: Tracks for an event with unique constraint on `(event_id, name)`.
8. **`teams`**: Teams formed for a specific event with unique constraint on `(event_id, name)` and join code hash support.
9. **`team_members`**: Membership of users in teams with unique constraint on `(team_id, user_id)`, role checks (`owner`, `lead`, `member`), and status checks (`active`, `left`).
10. **`team_invitations`**: Pending invitations with database-level check constraint guaranteeing exactly one invite target (`(invitee_user_id IS NOT NULL AND invitee_email IS NULL) OR (invitee_user_id IS NULL AND invitee_email IS NOT NULL)`), code hash, and status checks.

### Key Database Conventions:
- **UUIDs**: All primary keys and foreign keys use UUIDs via `sqlalchemy.Uuid(as_uuid=True)`.
- **Foreign Keys**: Enabled across SQLite connections via `PRAGMA foreign_keys=ON` SQLAlchemy event listeners.
- **UTC Timestamps**: Timestamps are stored in UTC. The custom `UTCDateTime` TypeDecorator attaches UTC timezone information upon loading from SQLite to ensure correct serialization.

---

## 4. Environment Setup

### 1. Create and Activate Virtual Environment

```bash
# From the backend directory
python -m venv .venv

# On Windows PowerShell:
.venv\Scripts\Activate.ps1

# On Linux/macOS:
source .venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure `.env` File

Copy `.env.example` to `.env` if not already present:

```bash
cp .env.example .env
```

Ensure `.env` contains a secure random key for JWT signing:

```env
APP_NAME=Event Platform API
APP_ENV=development
DATABASE_URL=sqlite:///./data/app.db

JWT_SECRET_KEY=replace_with_a_64_character_hex_or_random_secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
JWT_ISSUER=event-platform
JWT_AUDIENCE=event-platform-users
```

---

## 5. Running Database Migrations

Alembic manages all schema creation and future evolutions. Do not call `Base.metadata.create_all()` in production code.

### Apply Migrations to SQLite

```bash
alembic upgrade head
```

This creates `data/app.db` and applies all 10 tables and constraints.

### How to Generate a New Migration After Changing Models

When you add or modify SQLAlchemy models in `app/models/`:

```bash
# Autogenerate migration script
alembic revision --autogenerate -m "describe_your_changes"

# Review the generated file in alembic/versions/

# Apply migration
alembic upgrade head
```

---

## 6. Starting the FastAPI Server

Start the application with Uvicorn:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- **Interactive API Documentation (Swagger UI):** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc Documentation:** [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)
- **OpenAPI Schema:** [http://127.0.0.1:8000/openapi.json](http://127.0.0.1:8000/openapi.json)

---

## 7. API Endpoints

### Health Check

- **`GET /api/v1/health`**
  - Verifies service operational status and database connection.
  - Returns `{"status": "ok", "app_name": "...", "environment": "...", "database": "connected"}`.

### Authentication

- **`POST /api/v1/auth/register`**
  - **Request Body (`RegisterRequest`):**
    ```json
    {
      "email": "user@example.com",
      "username": "coder",
      "password": "SecurePassword123!",
      "display_name": "Jane Coder"
    }
    ```
  - **Response (`AuthResponse` - 201 Created):**
    ```json
    {
      "access_token": "eyJhbGciOiJIUzI1Ni...",
      "token_type": "bearer",
      "user": {
        "id": "c1f...",
        "email": "user@example.com",
        "username": "coder",
        "account_status": "active",
        "email_verified_at": null,
        "created_at": "2026-11-13T16:00:00Z",
        "updated_at": "2026-11-13T16:00:00Z",
        "profile": {
          "display_name": "Jane Coder",
          "profile_visibility": "public"
        }
      }
    }
    ```

- **`POST /api/v1/auth/login`**
  - **Request Body (`LoginRequest`):**
    ```json
    {
      "email": "user@example.com",
      "password": "SecurePassword123!"
    }
    ```
  - **Response (`TokenResponse` - 200 OK):**
    ```json
    {
      "access_token": "eyJhbGciOiJIUzI1Ni...",
      "token_type": "bearer"
    }
    ```

### User Information

- **`GET /api/v1/users/me`**
  - **Headers:** `Authorization: Bearer <access_token>`
  - **Response (`UserMeResponse` - 200 OK):** Returns current user information and profile. Rejects inactive or suspended accounts.

### Authentication Design Notes & Logout Limitation
- Passwords are encrypted with **Argon2** via `pwdlib`.
- Access tokens are stateless JWTs signed with **HS256** expiring after 30 minutes. Claims include `sub`, `iat`, `exp`, `jti`, `iss`, `aud`.
- **Logout limitation:** In this foundation phase, there is no server-side token revocation or session blacklist. Clients log out by discarding the access token. A copied access token remains valid until its 30-minute expiration window expires.

---

## 8. Running the Test Suite

The test suite runs with `pytest` using an isolated temporary SQLite database file per test. It does not modify or delete the local development database `data/app.db`.

```bash
pytest -v
```

### Test Coverage Highlights:
- **Authentication:** Registration, normalization, duplicate email/username rejection, Argon2 password hashing verification, login verification, bad password rejection, invalid token rejection, expired token rejection, suspended account rejection.
- **Database Models & Constraints:** All 10 tables registered, SQLite foreign key enforcement, unique constraints, check constraints (event format, event team sizes, team invitation XOR target), one-to-one user profile relationship with cascade delete, and event/team/organization relational integrity.
- **Service Health:** Live database connectivity check via `/api/v1/health`.

