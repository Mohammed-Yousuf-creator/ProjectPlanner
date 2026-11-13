# Event & Hackathon Management Platform - Backend

This repository contains the backend for an event and hackathon management platform built with Python, FastAPI, SQLite, and SQLAlchemy 2.x.

Phase 1 established the foundation (database architecture, 10 models, Pydantic schemas, Alembic migrations, JWT access tokens, Argon2 password hashing).
Phase 2 implements **Organizations, Event Management, Public Event Discovery, and Event Tracks**.

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
│   │       ├── health.py        # /api/v1/health
│   │       ├── organizations.py # /api/v1/organizations/*
│   │       ├── events.py        # /api/v1/events/*
│   │       └── tracks.py        # /api/v1/tracks/*
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py            # Pydantic-settings configuration & .env loading
│   │   ├── security.py          # Argon2 hashing & PyJWT token utilities
│   │   └── dependencies.py      # get_current_user & get_optional_current_user
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
│   │   ├── organization.py      # OrganizationCreate, OrganizationUpdate, OrganizationRead, Member schemas
│   │   ├── event.py             # EventCreate, EventUpdate, EventRead, EventTrack schemas
│   │   └── team.py              # TeamCreate, TeamRead, TeamMember*, TeamInvitation*
│   └── services/
│       ├── __init__.py
│       ├── auth_service.py         # Registration & authentication business logic
│       ├── organization_service.py # Organization & membership authorization & business logic
│       └── event_service.py        # Event lifecycle, publishing, filtering & track logic
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
│   ├── test_models.py           # All 10 models, constraints, and relationship tests
│   ├── test_organizations.py    # Organization CRUD, roles, and invitation tests
│   ├── test_events.py           # Event lifecycle, draft visibility, publishing tests
│   └── test_tracks.py           # Event track creation, update, and deletion tests
├── .env                         # Local environment settings (ignored by git)
├── .env.example                 # Example environment template
├── .gitignore                   # Git ignore patterns
├── alembic.ini                  # Alembic CLI configuration
├── requirements.txt             # Project dependencies
└── README.md                    # Project documentation
```

---

## 3. Database Architecture & Models

The system defines 10 relational tables:

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

Alembic manages all schema creation and evolutions:

```bash
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

## 7. API Endpoints Documentation

### Health Check
- **`GET /api/v1/health`**: Verifies service operational status and database connection.

### Authentication
- **`POST /api/v1/auth/register`**: Register a new user and automatically create their user profile.
- **`POST /api/v1/auth/login`**: Authenticate with email/password and receive a JWT access token.
- **`GET /api/v1/users/me`**: Return authenticated user information and profile.

### Organizations Management
- **`POST /api/v1/organizations`**:
  - Authenticated users only.
  - Creator is automatically assigned as `owner` in `organization_members` in a single transaction.
  - Allowed types: `organizer`, `sponsor`, `both`, `other`.
- **`GET /api/v1/organizations/mine`**:
  - Return all organizations the authenticated user belongs to.
  - Includes user's `my_role` (`owner`, `admin`, `member`), `my_status`, and `my_joined_at`.
- **`GET /api/v1/organizations/{organization_id}`**:
  - Private organization details accessible only to active organization members.
- **`PATCH /api/v1/organizations/{organization_id}`**:
  - Update organization information.
  - Authorized for organization `owner` and `admin` only.
- **`GET /api/v1/organizations/{organization_id}/members`**:
  - Return active members of the organization with user profile details.
  - Restricted to active organization members.
- **`POST /api/v1/organizations/{organization_id}/members/invitations`**:
  - Invite an existing registered user via email as `admin` or `member` (cannot invite as `owner`).
  - Restricted to organization `owner` and `admin`.
  - Creates membership with status `invited`.
- **`POST /api/v1/organizations/{organization_id}/members/invitations/{membership_id}/accept`**:
  - Invited user accepts their pending invitation.
  - Restricted to the invited user matching `current_user.id`.
- **`POST /api/v1/organizations/{organization_id}/members/invitations/{membership_id}/reject`**:
  - Invited user rejects their pending invitation.
- **`DELETE /api/v1/organizations/{organization_id}/members/{user_id}`**:
  - Remove an organization member.
  - Authorized for `owner` and `admin`.
  - Admins cannot remove owners.
  - The last remaining owner cannot be removed.

### Event Management
- **`POST /api/v1/organizations/{organization_id}/events`**:
  - Create an event.
  - Authorized for organization `owner` and `admin`.
  - Organization must be of type `organizer` or `both`.
  - Automatically assigns `created_by_user_id = current_user.id`.
  - Events start with status `draft`.
  - Validates dates (`ends_at > starts_at`, `registration_closes_at > registration_opens_at`, etc.) and team size bounds (`max_team_size >= min_team_size >= 1`).
- **`GET /api/v1/organizations/{organization_id}/events`**:
  - List all events under an organization including drafts.
  - Restricted to active organization members.
- **`GET /api/v1/events/{event_id}`**:
  - Public visitors can access published events with `public` visibility.
  - Drafts and private events are accessible only to active organization members.
- **`PATCH /api/v1/events/{event_id}`**:
  - Update event details.
  - Authorized for organization `owner` and `admin`.
- **`POST /api/v1/events/{event_id}/publish`**:
  - Publish draft event (`status = "published"`).
  - Only draft events can be published.
  - Validates required fields (`starts_at`, `ends_at`, `timezone`, `format`, venue/city for offline/hybrid).
  - Authorized for organization `owner` and `admin`.
- **`POST /api/v1/events/{event_id}/cancel`**:
  - Cancel event (`status = "cancelled"`).
  - Cancelled events cannot be re-published without future restoration flow.
  - Authorized for organization `owner` and `admin`.

### Public Event Discovery
- **`GET /api/v1/events`**:
  - Return publicly visible published events (`status = 'published'`, `visibility = 'public'`).
  - Drafts, private, and cancelled events are never exposed.
  - Query parameters:
    - `event_type`: filter by type (e.g. `hackathon`)
    - `format`: filter by format (`online`, `offline`, `hybrid`)
    - `city`: filter by city (case-insensitive)
    - `limit`: default 20 (max 100)
    - `offset`: default 0

### Event Tracks
- **`POST /api/v1/events/{event_id}/tracks`**:
  - Create track for an event.
  - Prevents duplicate track names within the event.
  - Authorized for organization `owner` and `admin`.
- **`GET /api/v1/events/{event_id}/tracks`**:
  - List tracks for an event.
  - Inherits event visibility permissions.
- **`PATCH /api/v1/tracks/{track_id}`**:
  - Update track name and description.
  - Authorized for organization `owner` and `admin`.
- **`DELETE /api/v1/tracks/{track_id}`**:
  - Delete track.
  - Authorized for organization `owner` and `admin`.

---

## 8. Authorization & IDOR Protection

1. **Authentication:** Uses validated Bearer JWT tokens. Current user identity is always retrieved from JWT `sub`, never from user-supplied IDs or headers.
2. **Organization Isolation:** Operations verify that records belong to the organization specified in the route before inspecting or modifying data.
3. **Role Checks:** Owner and admin permissions are enforced server-side against the database for every protected operation.
4. **Event Visibility:** Published public events are open; draft and private events are hidden from unauthorized visitors and only accessible to verified active organization members.

---

## 9. Running the Test Suite

The test suite runs with `pytest` against an isolated temporary SQLite database:

```bash
pytest -v
```

Total tests: 35 passing (authentication, models, constraints, organizations, events, tracks, health check).
