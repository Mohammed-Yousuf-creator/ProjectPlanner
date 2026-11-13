# Event & Hackathon Management Platform - Backend

This repository contains the backend for an event and hackathon management platform built with Python, FastAPI, SQLite, and SQLAlchemy 2.x.

- **Phase 1:** Foundation (database architecture, 10 models, Pydantic schemas, Alembic migrations, JWT access tokens, Argon2 password hashing).
- **Phase 2:** Organizations, Event Management, Public Event Discovery, and Event Tracks.
- **Phase 3:** Participant Registration, Dashboard, and Organizer Participant Management.
- **Phase 4:** Team Formation and Membership Management.
- **Phase 5:** Team Collaboration (task boards, multi-assignee task management, persistent team chat, WebSockets real-time updates, and local image/video storage).

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
│   │       ├── participants.py  # /api/v1/participants/me/*
│   │       ├── teams.py         # /api/v1/events/{event_id}/teams, /api/v1/teams/*, /api/v1/team-invitations/*
│   │       ├── team_tasks.py    # /api/v1/teams/{team_id}/tasks/*
│   │       ├── team_messages.py # /api/v1/teams/{team_id}/messages/* and WebSocket /ws
│   │       └── team_files.py    # /api/v1/teams/{team_id}/files/*
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py            # Pydantic-settings configuration & .env loading
│   │   ├── security.py          # Argon2 hashing & PyJWT token utilities
│   │   ├── dependencies.py      # get_current_user & get_optional_current_user
│   │   └── websocket_manager.py # Thread-safe WebSocket connection manager and broadcaster
│   ├── db/
│   │   ├── __init__.py
│   │   ├── base.py              # DeclarativeBase & UTCDateTime TypeDecorator
│   │   └── session.py           # SQLite connection, engine & SessionLocal factory
│   ├── models/
│   │   ├── __init__.py          # Exports and registers all 15 models with Base
│   │   ├── user.py              # User and UserProfile models
│   │   ├── organization.py      # Organization and OrganizationMember models
│   │   ├── event.py             # Event, EventMembership, EventTrack models
│   │   ├── team.py              # Team, TeamMember, TeamInvitation models
│   │   ├── team_task.py         # TeamTask and TeamTaskAssignee models
│   │   ├── team_message.py      # TeamMessage and TeamMessageAttachment models
│   │   └── stored_file.py       # StoredFile model
│   ├── schemas/
│   │   ├── __init__.py          # Pydantic schema exports
│   │   ├── auth.py              # RegisterRequest, LoginRequest, AuthResponse, TokenResponse
│   │   ├── user.py              # UserRead, UserProfileRead, UserProfileUpdate, UserMeResponse
│   │   ├── organization.py      # OrganizationCreate, OrganizationUpdate, OrganizationRead, Member schemas
│   │   ├── event.py             # EventCreate, EventUpdate, EventRead, EventTrack schemas
│   │   ├── registration.py      # EventRegisterRequest, EventRegistrationResponse, OrganizerParticipantRead
│   │   ├── participant.py       # ParticipantDashboardResponse, ParticipantRegistrationRead, etc.
│   │   ├── team.py              # TeamCreate, TeamRead, TeamMember*, TeamInvitation*
│   │   ├── team_task.py         # TeamTaskCreateRequest, TeamTaskRead, TeamTaskAssigneesUpdateRequest
│   │   ├── team_message.py      # TeamMessageCreateRequest, TeamMessageRead, TeamMessageUpdateRequest
│   │   └── stored_file.py       # StoredFileRead
│   ├── services/
│   │   ├── __init__.py
│   │   ├── auth_service.py         # Registration & authentication business logic
│   │   ├── organization_service.py # Organization & membership authorization & business logic
│   │   ├── event_service.py        # Event lifecycle, publishing, filtering & track logic
│   │   ├── registration_service.py # Event registration, withdrawal, check-in & organizer participant management
│   │   ├── participant_service.py  # Participant registrations list, dashboard, and registered event details
│   │   ├── team_service.py         # Team creation, discovery, join codes, invitations, and membership management
│   │   ├── team_task_service.py    # Team tasks, assignment list updates, status transitions, position ordering
│   │   ├── team_chat_service.py    # Persistent messaging, safe attachments, edit, and soft-delete
│   │   └── file_service.py         # Image/video uploads, streaming validation, safe download responses
│   └── storage/
│       ├── __init__.py
│       └── local_storage.py        # Local disk storage provider with chunked streaming and Pillow validation
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
│   ├── test_organizer_participants.py    # Organizer participant management, approval, and check-in tests
│   ├── test_teams.py                     # Team creation, discovery, join code, invitations, and membership tests
│   └── test_team_collaboration.py        # Tasks, persistent messaging, WebSockets, and file upload tests
├── .env                         # Local environment settings (ignored by git)
├── .env.example                 # Example environment template
├── .gitignore                   # Git ignore patterns
├── alembic.ini                  # Alembic CLI configuration
├── requirements.txt             # Project dependencies
└── README.md                    # Project documentation
```

---

## 3. Database Architecture & Models

The system comprises 15 relational tables:

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
11. **`team_tasks`**: Tasks within a team board. Columns: `id`, `team_id`, `title`, `description`, `status` (`todo`, `in_progress`, `review`, `done`), `priority` (`low`, `medium`, `high`, `urgent`), `created_by_user_id`, `due_at`, `position`, `completed_at`, `created_at`, `updated_at`, `deleted_at`.
12. **`team_task_assignees`**: Multiple user assignments per task. Composite primary key on `(task_id, user_id)`, with `assigned_by_user_id` and `assigned_at`.
13. **`team_messages`**: Persistent team chat messages. Columns: `id`, `team_id`, `sender_user_id`, `body`, `created_at`, `edited_at`, `deleted_at`.
14. **`stored_files`**: Safe file storage metadata. Columns: `id`, `team_id`, `uploaded_by_user_id`, `storage_provider`, `storage_key` (unique), `original_filename`, `mime_type`, `size_bytes`, `checksum_sha256`, `created_at`, `deleted_at`.
15. **`team_message_attachments`**: Attachment join table between messages and stored files with unique constraint guaranteeing a file is attached to at most one message. Columns: `id`, `message_id`, `file_id`, `created_at`.

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

### Team Formation & Membership Management (Phase 4)
- **`POST /api/v1/events/{event_id}/teams`**:
  - Atomically create a team and assign the authenticated participant as active `owner`.
  - Restricted to registered or approved participants of the event. Rejects cancelled or completed events.
  - Generates a cryptographically secure random join code when requested (`generate_join_code: true`), storing only its Argon2 hash in `join_code_hash`.
  - Returns the raw join code only once in the creation response; `join_code_hash` is never exposed.
  - Enforces unique team names per event and restricts each participant to at most one active team per event.
  - Initializes status to `active` if `1 >= min_team_size`, else `forming`.
- **`GET /api/v1/events/{event_id}/teams`**:
  - Discovery endpoint for event teams. Restricted to registered or approved event participants.
  - Excludes disbanded teams. Returns team ID, name, description, status, `member_count`, `max_team_size`, `available_slots`, and creation timestamp. Supports pagination (`limit`, `offset`).
- **`GET /api/v1/teams/{team_id}`**:
  - Return team details. Active members of the team receive the full roster (`user_id`, `username`, `display_name`, `role`, `status`, `joined_at`, `left_at`). Non-member event participants receive public overview with `members: null`.
- **`POST /api/v1/teams/{team_id}/join`**:
  - Join a team using its plaintext join code.
  - Verifies code against Argon2 hash using constant-time verification.
  - Rejects disbanded or submitted teams, teams at `max_team_size`, and users already belonging to another active team in the event.
  - Reactivates previous `left` membership in-place rather than creating duplicate history.
  - Recalculates team lifecycle (`forming` vs `active`).
- **`POST /api/v1/teams/{team_id}/invitations`**:
  - Send an in-app team invitation by user email.
  - Restricted to team `owner` and `lead`.
  - Resolves email to a registered user and verifies eligible event participation (`registered` or `approved`).
  - Prevents inviting active team members, users in other active teams in this event, or duplicate pending invitations.
  - Sets 7-day expiration timestamp and `pending` status.
- **`GET /api/v1/participants/me/team-invitations`**:
  - Return pending, non-expired invitations for the current authenticated user, including team, event, and inviter profile details.
- **`POST /api/v1/team-invitations/{invitation_id}/accept`**:
  - Accept a pending team invitation. Restricted to the intended invitee.
  - Re-verifies event membership, capacity against `max_team_size`, and absence of other active teams in this event.
  - Creates or reactivates team membership, marks invitation as `accepted`, and recalculates team lifecycle status.
- **`POST /api/v1/team-invitations/{invitation_id}/reject`**:
  - Reject a pending invitation. Restricted to the intended invitee. Sets status to `rejected` and records response timestamp.
- **`GET /api/v1/teams/{team_id}/members`**:
  - Return team roster. Restricted to active team members.
- **`POST /api/v1/teams/{team_id}/leave`**:
  - Allow an active non-owner member or lead to leave. Sets membership status to `left` and `left_at`.
  - Rejects owner leaving without first transferring ownership. Recalculates team lifecycle status.
- **`DELETE /api/v1/teams/{team_id}/members/{user_id}`**:
  - Remove an active member. Restricted to team `owner`. Owner cannot remove themselves. Sets status to `left`.
- **`PATCH /api/v1/teams/{team_id}/members/{user_id}/role`**:
  - Assign or revoke `lead` role (`lead`, `member`). Restricted to team `owner`. Cannot modify owner role.
- **`POST /api/v1/teams/{team_id}/transfer-ownership`**:
  - Transfer ownership to an active team member. Atomically updates old owner to `member` and target to `owner`. Exactly one active owner is maintained.
- **`POST /api/v1/teams/{team_id}/disband`**:
  - Disband team. Restricted to team `owner`. Sets team status to `disbanded`, marks active memberships as `left`, and cancels pending invitations. Disbanded teams cannot accept new members or invitations.

### Team Collaboration — Tasks, Messaging & Files (Phase 5)
#### Team Task Management
- **`POST /api/v1/teams/{team_id}/tasks`**:
  - Create a new task within the team board (`title`, `description`, `priority`, `due_at`, `status`, `position`).
  - Restricted to active team members.
  - Automatically sets `team_id`, `created_by_user_id`, and `completed_at` (if created in `done` status).
  - Broadcasts `task.created` event via WebSocket.
- **`GET /api/v1/teams/{team_id}/tasks`**:
  - List non-deleted tasks for the team.
  - Supports status filtering (`status`), priority filtering (`priority`), assignee filtering (`assignee_id`), and pagination (`limit`, `offset`).
  - Ordered by `position` ascending and creation timestamp. Eagerly loads assignees with profile details.
- **`GET /api/v1/teams/{team_id}/tasks/{task_id}`**:
  - Return detailed task information and assigned members. Restricted to active team members.
- **`PATCH /api/v1/teams/{team_id}/tasks/{task_id}`**:
  - Update task status, details, priority, due date, or position.
  - Active members can update status. Only creator, owner, or lead can update details and priority.
  - Automatically sets `completed_at` when entering `done` status, and clears it when leaving `done`.
  - Broadcasts `task.updated` event via WebSocket.
- **`DELETE /api/v1/teams/{team_id}/tasks/{task_id}`**:
  - Soft-delete a task by setting `deleted_at`. Only creator, owner, or lead can delete.
  - Broadcasts `task.deleted` event via WebSocket.
- **`PUT /api/v1/teams/{team_id}/tasks/{task_id}/assignees`**:
  - Transactionally replace task assignees list (`user_ids: List[UUID]`).
  - Restricted to task creator, team owner, or team lead.
  - Validates that every assignee is an active team member and prevents duplicates. Empty list clears assignments.
  - Broadcasts `task.assignees.updated` event via WebSocket.

#### Persistent Team Messaging
- **`POST /api/v1/teams/{team_id}/messages`**:
  - Post a message with optional text `body` and optional `attachment_ids` (stored file UUIDs).
  - Requires non-empty text or at least one valid attachment.
  - Validates all attachments belong to this team, have not been deleted, and are not already attached to another message.
  - Saves message and attachment relationships in one database transaction.
  - Broadcasts `message.created` event to all connected team WebSocket clients after commit.
- **`GET /api/v1/teams/{team_id}/messages`**:
  - Return chronological message history for the team.
  - Includes sender username, display name, avatar, text body, and safe attachment metadata.
  - Supports limit and offset pagination. Excludes filesystem paths.
- **`PATCH /api/v1/teams/{team_id}/messages/{message_id}`**:
  - Edit message text. Restricted to the original sender and active members. Sets `edited_at`.
- **`DELETE /api/v1/teams/{team_id}/messages/{message_id}`**:
  - Soft-delete message. Allowed for original sender, team owner, or team lead. Sets `deleted_at` and masks text.

#### Real-time WebSockets
- **`WebSocket /api/v1/teams/{team_id}/ws`**:
  - Connect to real-time team collaboration updates.
  - **Authentication Protocol:** Client sends its JWT access token in the first JSON message:
    ```json
    {"type": "authenticate", "access_token": "<JWT_ACCESS_TOKEN>"}
    ```
  - Validates signature, expiry, issuer, audience, and active team membership. Closes connection with policy violation code (`1008`) if invalid.
  - On success, responds with:
    ```json
    {"type": "authenticated", "user_id": "<USER_UUID>", "team_id": "<TEAM_UUID>"}
    ```
  - Supports keep-alive `{"type": "ping"}` / `{"type": "pong"}`.
  - Forcefully disconnects client sessions if member leaves the team, is removed, or the team is disbanded.
  - **Broadcast Event Types:**
    - `message.created`
    - `message.updated`
    - `message.deleted`
    - `task.created`
    - `task.updated`
    - `task.deleted`
    - `task.assignees.updated`

#### Team File Storage
- **`POST /api/v1/teams/{team_id}/files`**:
  - Upload an image (`JPEG`, `PNG`, `WebP` up to 10 MB) or video (`MP4`, `WebM`, `MOV` up to 100 MB).
  - Multipart/form-data upload streamed in chunks to local disk under `UPLOAD_DIR/{team_id}/`.
  - Performs Pillow image open & verification and video container signature validation.
  - Computes SHA-256 checksum and saves metadata in `stored_files`. Cleans up partial files on error.
- **`GET /api/v1/teams/{team_id}/files/{file_id}`**:
  - Download team file with safe `Content-Disposition` header. Restricted to active team members. Prevents cross-team IDOR access.

---

## 8. Running the Test Suite

The test suite runs with `pytest` against an isolated temporary SQLite database:

```bash
pytest -v
```

Total tests: **74 passing** across 11 test modules:
- `test_auth.py` (11 tests): Registration, duplicate checks, login, JWT validation, expiration, user me.
- `test_models.py` (8 tests): All 15 tables registered, foreign keys, unique & check constraints, relationships.
- `test_health.py` (1 test): Health check & database ping.
- `test_organizations.py` (6 tests): Org CRUD, slug uniqueness, user org listing, invitations accept/reject, member removal.
- `test_events.py` (6 tests): Event creation, draft visibility, publishing validation, public discovery filtering, cancelling.
- `test_tracks.py` (3 tests): Track CRUD and uniqueness constraints.
- `test_registrations.py` (8 tests): Participant registration, withdrawal, reactivation, timing boundaries, organizer check-in.
- `test_participant_dashboard.py` (3 tests): Participant dashboard metrics, event categorization, registered event details.
- `test_organizer_participants.py` (3 tests): Organizer participant roster, search/filter, status updates, check-in.
- `test_teams.py` (14 tests): Team creation, lifecycle status transitions, join codes, team discovery, roster privacy, invitations, role updates, ownership transfer, disbanding, and capacity enforcement.
- `test_team_collaboration.py` (11 tests): Tasks CRUD, status transitions, assignees replacement, persistent chat, attachments, WebSocket authentication, real-time broadcasts, file validation, oversized rejections, and disconnects on leave/disband.
