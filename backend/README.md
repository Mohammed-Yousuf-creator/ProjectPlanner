# Event & Hackathon Management Platform - Backend

This repository contains the backend for an event and hackathon management platform built with Python, FastAPI, SQLite, and SQLAlchemy 2.x.

- **Phase 1:** Foundation (database architecture, 10 models, Pydantic schemas, Alembic migrations, JWT access tokens, Argon2 password hashing).
- **Phase 2:** Organizations, Event Management, Public Event Discovery, and Event Tracks.
- **Phase 3:** Participant Registration, Dashboard, and Organizer Participant Management.

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
│   │       ├── tracks.py        # /api/v1/tracks/*
│   │       ├── registrations.py # /api/v1/events/{event_id}/register, withdraw, participants
│   │       └── participants.py  # /api/v1/participants/me/*
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
│   │   ├── registration.py      # EventRegisterRequest, EventRegistrationResponse, OrganizerParticipantRead
│   │   ├── participant.py       # ParticipantDashboardResponse, ParticipantRegistrationRead, etc.
│   │   └── team.py              # TeamCreate, TeamRead, TeamMember*, TeamInvitation*
│   └── services/
│       ├── __init__.py
│       ├── auth_service.py         # Registration & authentication business logic
│       ├── organization_service.py # Organization & membership authorization & business logic
│       ├── event_service.py        # Event lifecycle, publishing, filtering & track logic
│       ├── registration_service.py # Event registration, withdrawal, check-in & organizer participant management
│       └── participant_service.py  # Participant registrations list, dashboard, and registered event details
├── alembic/
│   ├── versions/                # Generated database migration files
│   ├── env.py                   # Alembic environment configured with app settings & models
│   ├── script.py.mako
│   └── README
├── data/
│   └── app.db                   # SQLite production/development database file
├── tests/
│   ├── __init__.py
│   ├── conftest.py                       # Pytest fixtures, test database setup, and TestClient
│   ├── test_auth.py                      # Authentication & user endpoint tests
│   ├── test_health.py                    # Health check & DB connectivity tests
│   ├── test_models.py                    # All 10 models, constraints, and relationship tests
│   ├── test_organizations.py             # Organization CRUD, roles, and invitation tests
│   ├── test_events.py                    # Event lifecycle, draft visibility, publishing tests
│   ├── test_tracks.py                    # Event track creation, update, and deletion tests
│   ├── test_registrations.py             # Participant registration, withdrawal, reactivation, timing tests
│   ├── test_participant_dashboard.py     # Participant dashboard, event categorization, and detail tests
│   └── test_organizer_participants.py    # Organizer participant management, approval, and check-in tests
├── .env                         # Local environment settings (ignored by git)
├── .env.example                 # Example environment template
├── .gitignore                   # Git ignore patterns
├── alembic.ini                  # Alembic CLI configuration
├── requirements.txt             # Project dependencies
└── README.md                    # Project documentation
```

---

## 3. Database Architecture & Models

The system reuses 10 relational tables:

1. **`users`**: Central account table. Holds UUID, unique normalized email, unique normalized username, Argon2 password hash, account status, email verification timestamp, and UTC audit timestamps.
2. **`user_profiles`**: One-to-one child record created automatically upon user registration with display name, bio, social links, and visibility settings.
3. **`organizations`**: Organizers and sponsors with globally unique slug, type check constraint (`organizer`, `sponsor`, `both`, `other`), status, and creator foreign key.
4. **`organization_members`**: Join table between users and organizations with roles (`owner`, `admin`, `member`), statuses (`invited`, `active`, `suspended`), and unique constraint on `(organization_id, user_id)`.
5. **`events`**: Events belonging to organizations with unique constraint on `(organization_id, slug)`, format checks (`online`, `offline`, `hybrid`), status checks, team size constraints (`min_team_size >= 1`, `max_team_size >= min_team_size`), and location/timing attributes.
6. **`event_memberships`**: Event registrations with unique constraint on `(event_id, user_id)`, role checks (`participant`, `judge`, `mentor`), status checks (`registered`, `approved`, `waitlisted`, `rejected`, `withdrawn`), check-in timestamps, and flexible JSON registration metadata.
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
- **`POST /api/v1/organizations`**: Create an organization. Automatically sets creator as `owner`.
- **`GET /api/v1/organizations/mine`**: Return all organizations the user belongs to, including `my_role`, `my_status`, and `my_joined_at`.
- **`GET /api/v1/organizations/{organization_id}`**: Return organization details. Restricted to active organization members.
- **`PATCH /api/v1/organizations/{organization_id}`**: Update organization. Restricted to `owner` and `admin`.
- **`GET /api/v1/organizations/{organization_id}/members`**: List active members. Restricted to active organization members.
- **`POST /api/v1/organizations/{organization_id}/members/invitations`**: Invite registered user via email as `admin` or `member`.
- **`POST /api/v1/organizations/{organization_id}/members/invitations/{membership_id}/accept`**: Accept pending invitation.
- **`POST /api/v1/organizations/{organization_id}/members/invitations/{membership_id}/reject`**: Reject pending invitation.
- **`DELETE /api/v1/organizations/{organization_id}/members/{user_id}`**: Remove member. Admins cannot remove owners; last remaining owner cannot be removed.

### Event Management & Public Discovery
- **`POST /api/v1/organizations/{organization_id}/events`**: Create event. Restricted to `owner`/`admin`. Starts as `draft`.
- **`GET /api/v1/organizations/{organization_id}/events`**: List all organization events including drafts. Restricted to active organization members.
- **`GET /api/v1/events`**: Public discovery endpoint. Returns published events with `public` visibility. Never exposes drafts, private events, or cancelled events. Supports `event_type`, `format`, `city`, `limit`, and `offset` filtering.
- **`GET /api/v1/events/{event_id}`**: Return event details. Public visitors can view published public events; drafts and private events require active organization membership.
- **`PATCH /api/v1/events/{event_id}`**: Update event details. Restricted to organization `owner` and `admin`.
- **`POST /api/v1/events/{event_id}/publish`**: Publish draft event. Validates required timing, timezone, format, and venue fields before publishing.
- **`POST /api/v1/events/{event_id}/cancel`**: Cancel event. Cancelled events cannot be re-published.

### Event Tracks
- **`POST /api/v1/events/{event_id}/tracks`**: Create track for an event.
- **`GET /api/v1/events/{event_id}/tracks`**: List tracks for an event.
- **`PATCH /api/v1/tracks/{track_id}`**: Update track name and description.
- **`DELETE /api/v1/tracks/{track_id}`**: Delete track.

### Participant Registration & Dashboard (Phase 3)
- **`POST /api/v1/events/{event_id}/register`**:
  - Register the authenticated user for an event or reactivate a previously withdrawn registration.
  - Requires event to be `published` or `registration_open`, and publicly visible.
  - Rejects draft, cancelled, completed events, and registrations before `registration_opens_at`, after `registration_closes_at`, or after event start time.
  - Stores optional `registration_data` JSON.
  - Prevents duplicate active registrations (`409 Conflict`).
  - Allows reactivating `withdrawn` registrations in-place without creating redundant rows. Rejects self-registration if previously `rejected`.
- **`POST /api/v1/events/{event_id}/withdraw`**:
  - Participant withdraws their own registration.
  - Updates status to `withdrawn` while preserving registration history. Rejects already withdrawn or rejected registrations.
- **`GET /api/v1/participants/me/registrations`**:
  - Return active registrations (`registered`, `approved`, `waitlisted`) for the authenticated user with event and organization details. Excludes withdrawn and rejected registrations.
- **`GET /api/v1/participants/me/dashboard`**:
  - Return participant dashboard containing:
    - User information (`user_id`, `username`, `email`, `display_name`, `avatar_url`, `headline`).
    - Registration summary metrics (`total_active_registrations`, `upcoming_events_count`, `ongoing_events_count`, `completed_events_count`, `waitlisted_events_count`).
    - Four categorized collections: `upcoming_events`, `ongoing_events`, `completed_events`, and `waitlisted_events` based on UTC start/end timestamps and registration status.
- **`GET /api/v1/participants/me/events/{event_id}`**:
  - Detailed view of an event for actively registered participants only. Includes event details, organization details, registration status, timestamps, custom registration answers, and event tracks.
  - Withdrawn and rejected registrations are denied access (`403 Forbidden`).

### Organizer Participant Management (Phase 3)
- **`GET /api/v1/events/{event_id}/participants`**:
  - List registered participants for an event.
  - Restricted to organization `owner` and `admin` of the hosting organization.
  - Supports status filtering (`registered`, `approved`, `waitlisted`, `rejected`, `withdrawn`), username/email searching, and pagination (`limit`, `offset`).
- **`PATCH /api/v1/events/{event_id}/participants/{user_id}`**:
  - Update a participant's registration status (`approved`, `waitlisted`, `rejected`).
  - Restricted to organization `owner` and `admin`. Rejects modifications on withdrawn registrations.
- **`POST /api/v1/events/{event_id}/participants/{user_id}/check-in`**:
  - Mark an approved or registered participant as checked in with current UTC timestamp.
  - Restricted to organization `owner` and `admin`.
  - Rejects check-ins for `waitlisted`, `rejected`, or `withdrawn` participants.

---

## 8. Running the Test Suite

The test suite runs with `pytest` against an isolated temporary SQLite database:

```bash
pytest -v
```

Total tests: **49 passing** (authentication, database constraints, organizations, events, tracks, participant registration, withdrawal, dashboard, and organizer participant management).
