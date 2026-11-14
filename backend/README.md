# Event & Hackathon Management Platform - Backend

This repository contains the backend for an event and hackathon management platform built with Python, FastAPI, SQLite, and SQLAlchemy 2.x.

- **Phase 1:** Foundation (database architecture, 10 models, Pydantic schemas, Alembic migrations, JWT access tokens, Argon2 password hashing).
- **Phase 2:** Organizations, Event Management, Public Event Discovery, and Event Tracks.
- **Phase 3:** Participant Registration, Dashboard, and Organizer Participant Management.
- **Phase 4:** Team Formation and Membership Management.
- **Phase 5:** Team Collaboration (task boards, multi-assignee task management, persistent team chat, WebSockets real-time updates, and local image/video storage).
- **Phase 6:** Projects, Submission Versions, Judging Criteria, Evaluations, and Leaderboards.
- **Phase 7:** Event Operations (event schedules, announcements, audience-targeted in-app notifications, participant check-in metrics, and mentor requests lifecycle).
- **Phase 8:** Sponsorship Marketplace (sponsor discovery, bidirectional sponsorship listings, packages, proposals, negotiations & counteroffers, deals snapshotting, and deliverable tracking).

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
│   │       ├── team_files.py    # /api/v1/teams/{team_id}/files/*
│   │       ├── projects.py      # /api/v1/events/{event_id}/projects, /api/v1/teams/{team_id}/project
│   │       ├── submissions.py   # /api/v1/projects/{project_id}/submissions/*
│   │       ├── judging.py       # /api/v1/events/{event_id}/judges, judging-criteria, evaluations
│   │       ├── leaderboards.py  # /api/v1/events/{event_id}/leaderboard
│   │       ├── event_schedule.py# /api/v1/events/{event_id}/schedule, /api/v1/schedule/{item_id}
│   │       ├── announcements.py # /api/v1/events/{event_id}/announcements, /api/v1/announcements/*
│   │       ├── notifications.py # /api/v1/notifications/me/*
│   │       ├── checkins.py      # /api/v1/events/{event_id}/check-ins/*, check-in operations
│   │       ├── mentor_requests.py# /api/v1/events/{event_id}/mentor-requests, /api/v1/mentor-requests/*
│   │       ├── sponsors.py      # /api/v1/sponsors discovery
│   │       ├── sponsorship_listings.py # /api/v1/sponsorship-listings, /packages, org listings
│   │       ├── sponsorship_proposals.py# /api/v1/sponsorship-proposals, negotiations, accept/reject
│   │       ├── sponsorship_deals.py    # /api/v1/sponsorship-deals
│   │       └── sponsorship_deliverables.py# /api/v1/sponsorship-deliverables
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
│   │   ├── __init__.py          # Exports and registers all 30 models with Base
│   │   ├── user.py              # User and UserProfile models
│   │   ├── organization.py      # Organization and OrganizationMember models
│   │   ├── event.py             # Event, EventMembership, EventTrack models
│   │   ├── team.py              # Team, TeamMember, TeamInvitation models
│   │   ├── team_task.py         # TeamTask and TeamTaskAssignee models
│   │   ├── team_message.py      # TeamMessage and TeamMessageAttachment models
│   │   ├── stored_file.py       # StoredFile model
│   │   ├── project.py           # Project and ProjectSubmission models
│   │   ├── judging.py           # JudgingCriteria, Evaluation, EvaluationScore models
│   │   ├── event_schedule.py    # EventScheduleItem model
│   │   ├── announcement.py      # Announcement model
│   │   ├── notification.py      # Notification model
│   │   ├── mentor_request.py    # MentorRequest model
│   │   └── sponsorship.py       # SponsorshipListing, Package, Proposal, Message, Deal, Deliverable
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
│   │   ├── stored_file.py       # StoredFileRead
│   │   ├── project.py           # ProjectCreate, ProjectRead, ProjectDetailRead, ProjectPublicRead
│   │   ├── submission.py        # ProjectSubmissionCreate, ProjectSubmissionUpdate, ProjectSubmissionRead
│   │   ├── judging.py           # Judge*, JudgingCriteria*, Evaluation*, LeaderboardEntryRead
│   │   ├── event_schedule.py    # EventScheduleItemCreate, EventScheduleItemUpdate, EventScheduleItemRead
│   │   ├── announcement.py      # AnnouncementCreate, AnnouncementUpdate, AnnouncementRead
│   │   ├── notification.py      # NotificationRead, NotificationUnreadCountResponse
│   │   ├── checkin.py           # CheckInAttendeeRead, CheckInSummaryRead
│   │   ├── mentor_request.py    # MentorRequestCreate, MentorRequestAssign, MentorRequestStatusUpdate, MentorRequestRead
│   │   └── sponsorship.py       # Sponsorship Listing, Package, Proposal, Deal, Deliverable schemas
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
│   │   ├── file_service.py         # Image/video uploads, streaming validation, safe download responses
│   │   ├── project_service.py      # Project creation, team scoping, public discovery
│   │   ├── submission_service.py   # Versioned submissions, drafts, deadline validation, immutability
│   │   ├── judging_service.py      # Judge management, criteria configuration, draft & submitted evaluations
│   │   ├── leaderboard_service.py  # Dynamic weighted score calculation, ties, and access control
│   │   ├── notification_service.py # In-app notifications creation, batch dispatch, deduplication & mark read
│   │   ├── event_schedule_service.py # Schedule items CRUD, chronological ordering, organizer controls
│   │   ├── announcement_service.py # Audience-targeted announcements, transactional notification dispatch
│   │   ├── checkin_service.py      # Attendee check-in list, search, duplicate prevention, undo & metrics
│   │   ├── mentor_request_service.py # Participant mentor assistance requests, mentor assign & resolution workflow
│   │   └── sponsorship_service.py  # Bidirectional listings, packages, proposals, negotiations, deals, deliverables
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
│   ├── test_models.py                    # All 30 models, constraints, and relationship tests
│   ├── test_organizations.py             # Organization CRUD, roles, and invitation tests
│   ├── test_events.py                    # Event lifecycle, draft visibility, publishing tests
│   ├── test_tracks.py                    # Event track creation, update, and deletion tests
│   ├── test_registrations.py             # Participant registration, withdrawal, reactivation, timing tests
│   ├── test_participant_dashboard.py     # Participant dashboard, event categorization, and detail tests
│   ├── test_organizer_participants.py    # Organizer participant management, approval, and check-in tests
│   ├── test_teams.py                     # Team creation, discovery, join code, invitations, and membership tests
│   ├── test_team_collaboration.py        # Tasks, persistent messaging, WebSockets, and file upload tests
│   ├── test_projects_and_judging.py      # Projects, submissions, judging criteria, evaluations, and leaderboards
│   ├── test_event_operations.py          # Schedule, announcements, notifications, check-ins, mentor requests
│   └── test_sponsorship_marketplace.py  # Sponsor discovery, listings, packages, proposals, deals, deliverables
├── .env                         # Local environment settings (ignored by git)
├── .env.example                 # Example environment template
├── .gitignore                   # Git ignore patterns
├── alembic.ini                  # Alembic CLI configuration
├── requirements.txt             # Project dependencies
└── README.md                    # Project documentation
```

---

## 3. Database Architecture & Models

The system comprises 30 relational tables:

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
16. **`projects`**: One project per team per event with unique `(event_id, team_id)`, track reference, and creator foreign key.
17. **`project_submissions`**: Sequential version history (`version_number`) per project, draft/submitted status, metadata, repository and demo URLs, and submission timestamp.
18. **`judging_criteria`**: Scoring criteria per event with `name`, `max_score > 0`, `weight > 0`, and unique `(event_id, name)`.
19. **`evaluations`**: Judge evaluations for submissions with draft/submitted status, general feedback, and unique `(submission_id, judge_user_id)`.
20. **`evaluation_scores`**: Individual criterion scores per evaluation with `score` in `[0, max_score]` and unique `(evaluation_id, criterion_id)`.
21. **`event_schedule_items`**: Chronological agenda items per event with `item_type`, `starts_at`, `ends_at`, `status` (`active`, `cancelled`), venue, and meeting URL.
22. **`announcements`**: Event broadcast messages with audience targeting (`all`, `participants`, `judges`, `mentors`, `team`), `status` (`draft`, `published`, `withdrawn`), and published timestamp.
23. **`notifications`**: In-app user notifications with `type`, `title`, `body`, read tracking (`is_read`, `read_at`), contextual reference IDs, and user recipient indexing.
24. **`mentor_requests`**: On-demand participant assistance requests with `topic`, `status` (`pending`, `assigned`, `in_progress`, `resolved`, `cancelled`, `rejected`), assigned mentor, resolution notes, and timestamps.
25. **`sponsorship_listings`**: Sponsorship opportunities created by organizers or sponsors. Columns: `id`, `owner_organization_id`, `event_id`, `listing_type` (`seeking_sponsors`, `offering_sponsorship`), `title`, `description`, `audience_description`, `benefits`, `min_budget`, `max_budget`, `currency`, `status` (`draft`, `published`, `closed`), `expires_at`, `created_by_user_id`, `created_at`, `updated_at`.
26. **`sponsorship_packages`**: Commercial packages attached to a sponsorship listing with `name`, `description`, `price`, `currency`, `benefits`, and `available_slots`.
27. **`sponsorship_proposals`**: Formal commercial proposals connecting two organizations for a target event with `listing_id`, `proposer_organization_id`, `target_event_id`, `package_id`, `proposed_amount`, `currency`, `proposed_benefits`, `message`, and `status` (`pending`, `negotiating`, `accepted`, `rejected`, `withdrawn`, `expired`).
28. **`sponsorship_negotiation_messages`**: Structured conversation and counteroffer history with `proposal_id`, `author_organization_id`, `author_user_id`, `message_type` (`message`, `counter_offer`), `message`, `counter_amount`, `currency`, `counter_package_id`, and `counter_benefits`.
29. **`sponsorship_deals`**: Immutable contract snapshots finalized upon proposal acceptance with `proposal_id` (unique), `event_id`, `sponsor_organization_id`, `organizer_organization_id`, `agreed_amount`, `currency`, `agreed_terms`, `starts_at`, `ends_at`, and `status` (`active`, `completed`, `cancelled`).
30. **`sponsorship_deliverables`**: Benefit tracking and proof items for deals with `deal_id`, `responsible_organization_id`, `title`, `description`, `due_at`, `status` (`pending`, `in_progress`, `completed`, `rejected`, `cancelled`), `evidence_url` (validated HTTP/HTTPS), and `completed_at`.

---

## 4. Environment & Dependency Setup

Follow these steps to prepare your Python environment, directory structure, and configuration.

### 4.1 Prerequisites

- **Python 3.12+** (tested and verified on Python 3.14).
- **Git** (for repository clone and version control).
- **SQLite 3** (bundled with Python standard library `sqlite3`).

### 4.2 Create and Activate a Virtual Environment

From the `backend/` directory, create and activate an isolated virtual environment:

#### Windows PowerShell:
```powershell
# Navigate to the backend directory
cd backend

# Create virtual environment
python -m venv .venv

# If script execution is restricted on your machine, enable it for this process:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process

# Activate environment
.venv\Scripts\Activate.ps1
```

#### Windows Command Prompt (CMD):
```cmd
cd backend
python -m venv .venv
.venv\Scripts\activate.bat
```

#### Linux / macOS (bash / zsh):
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
```

> [!TIP]
> Always verify that your active Python interpreter points to `.venv`:
> - Windows: `Get-Command python` or `where python`
> - Linux/macOS: `which python`

### 4.3 Install Project Dependencies

Upgrade `pip` and install all required libraries from `requirements.txt`:

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 4.4 Create Required Storage Directories

The backend stores the SQLite database at `data/app.db` and uploaded team files at `data/uploads/`. Create these directories before initializing the database or running the server:

#### Windows PowerShell:
```powershell
New-Item -ItemType Directory -Force -Path "data\uploads"
```

#### Windows Command Prompt (CMD):
```cmd
mkdir data\uploads
```

#### Linux / macOS:
```bash
mkdir -p data/uploads
```

### 4.5 Configure Environment Variables (`.env`)

Copy `.env.example` to `.env` in the `backend/` root:

#### Windows PowerShell / Linux / macOS:
```bash
cp .env.example .env
```

#### Windows Command Prompt (CMD):
```cmd
copy .env.example .env
```

Generate a cryptographically secure 64-character secret key for JWT signing:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Update your `.env` file with the generated key and review the configuration:

```env
# Application Settings
APP_NAME=Event Platform API
APP_ENV=development

# Database & Storage
DATABASE_URL=sqlite:///./data/app.db
UPLOAD_DIR=./data/uploads

# JWT Security
JWT_SECRET_KEY=your_generated_64_character_hex_secret_here
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=14
JWT_ISSUER=event-platform
JWT_AUDIENCE=event-platform-users
```

#### Environment Variables Reference:

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `APP_NAME` | string | `Event Platform API` | Application title used in OpenAPI metadata. |
| `APP_ENV` | string | `development` | Deployment environment (`development`, `testing`, `production`). |
| `DATABASE_URL` | string | `sqlite:///./data/app.db` | SQLAlchemy connection URI. |
| `UPLOAD_DIR` | string | `./data/uploads` | Filesystem destination for team file attachments and avatars. |
| `JWT_SECRET_KEY` | string | *Required* | 256-bit cryptographically secure secret for HS256 HMAC signing. |
| `JWT_ALGORITHM` | string | `HS256` | Token signing algorithm. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | int | `30` | Lifespan of newly issued access tokens in minutes. |
| `REFRESH_TOKEN_EXPIRE_DAYS` | int | `14` | Lifespan of refresh tokens in days. Long because they are only ever exchanged for a new pair. |
| `JWT_ISSUER` | string | `event-platform` | Expected `iss` claim validated on incoming tokens. |
| `JWT_AUDIENCE` | string | `event-platform-users` | Expected `aud` claim validated on incoming tokens. |
| `CORS_ORIGINS` | string | `*` | Comma-separated browser origins allowed to call the API. Lock this down to the real frontend origin(s) in production. |
| `CORS_ALLOW_CREDENTIALS` | bool | `false` | Keep `false` with Bearer-token auth; browsers reject `*` + credentials. |

---

## 5. Database Setup & Alembic Migrations

The project uses **SQLAlchemy 2.x** with synchronous declarative mapping and **Alembic** to manage database schema creation, evolution, and versioning.

### 5.1 Architecture & Configuration Overview

- **`alembic.ini`**: Defines the migration script location (`alembic/`) and ensures the backend root is on `sys.path`.
- **`alembic/env.py`**: Dynamically imports `settings.DATABASE_URL` from `app.core.config`, resolves the relative path to the backend directory, and imports `app.models` to register all 30 declarative models with `Base.metadata`.
- **Batch Mode for SQLite**: `alembic/env.py` configures `render_as_batch=True`, enabling Alembic to safely perform table alterations, column additions, and constraint modifications on SQLite without locking or data loss.

### 5.2 Step-by-Step Database Initialization

#### Step 1: Run All Migrations to Head
Execute the migration runner to build the entire database schema from scratch:

```bash
alembic upgrade head
```

Alembic will sequentially apply all 5 revisions:
1. **`2c7c34c08b6b` (initial_schema)**: Creates core foundation tables: `users`, `user_profiles`, `organizations`, `organization_members`, `events`, `event_memberships`, `event_tracks`, `teams`, `team_members`, and `team_invitations`.
2. **`7e31321756b8` (team_collaboration_tables)**: Adds collaboration tables: `team_tasks`, `team_task_assignees`, `team_messages`, `team_message_attachments`, and `stored_files`.
3. **`a1e4180992a5` (projects_submissions_and_judging_tables)**: Adds project lifecycle and evaluation tables: `projects`, `project_submissions`, `judging_criteria`, `evaluations`, and `evaluation_scores`.
4. **`fef8424c9c22` (event_operations_tables)**: Adds operational tables: `event_schedule_items`, `announcements`, `notifications`, and `mentor_requests`.
5. **`c19a521b8e72` (sponsorship_marketplace_tables)**: Adds marketplace tables: `sponsorship_listings`, `sponsorship_packages`, `sponsorship_proposals`, `sponsorship_negotiation_messages`, `sponsorship_deals`, and `sponsorship_deliverables`.

#### Step 2: Verify Current Migration Version
Confirm that the database is synchronized with the latest head revision:

```bash
alembic current
```
*Expected Output:*
```text
c19a521b8e72 (head)
```

#### Step 3: Inspect Full Migration History
View the complete lineage and revision descriptions:

```bash
alembic history --verbose
```

#### Step 4: Verify Database File & Integrity
Verify that SQLite created the database file and passes integrity validation:

```bash
python -c "import sqlite3; con = sqlite3.connect('data/app.db'); print('Integrity:', con.execute('PRAGMA integrity_check;').fetchone()[0]); con.close()"
```
*Expected Output:*
```text
Integrity: ok
```

Verify that all **31 tables** (30 application tables + `alembic_version`) exist:

```bash
python -c "import sqlite3; con = sqlite3.connect('data/app.db'); cur = con.cursor(); cur.execute('SELECT name FROM sqlite_master WHERE type=\'table\' AND name NOT LIKE \'sqlite_%\''); tables = [r[0] for r in cur.fetchall()]; print(f'Total tables: {len(tables)}'); print(', '.join(sorted(tables)))"
```
*Expected Output:*
```text
Total tables: 31
alembic_version, announcements, evaluation_scores, evaluations, event_memberships, event_schedule_items, event_tracks, events, judging_criteria, mentor_requests, notifications, organization_members, organizations, project_submissions, projects, sponsorship_deals, sponsorship_deliverables, sponsorship_listings, sponsorship_negotiation_messages, sponsorship_packages, sponsorship_proposals, stored_files, team_invitations, team_members, team_message_attachments, team_messages, team_task_assignees, team_tasks, teams, user_profiles, users
```

### 5.3 Useful Developer Migration Commands

- **Roll back one revision:**
  ```bash
  alembic downgrade -1
  ```
- **Roll back to a specific revision:**
  ```bash
  alembic downgrade 2c7c34c08b6b
  ```
- **Roll back entire schema to empty state:**
  ```bash
  alembic downgrade base
  ```
- **Autogenerate a new migration after modifying SQLAlchemy models:**
  ```bash
  alembic revision --autogenerate -m "describe_your_changes_here"
  ```
- **Reset and rebuild database completely:**
  ```bash
  # Delete database file and re-run migrations:
  # Windows PowerShell:
  Remove-Item -Force data\app.db; alembic upgrade head

  # Linux/macOS:
  rm -f data/app.db && alembic upgrade head
  ```

---

## 6. Library Setup & Verification

The backend relies on key security, imaging, and ASGI networking libraries. Verify that these libraries and their underlying C extensions are properly compiled and operational in your environment.

### 6.1 `pwdlib[argon2]` (Password Hashing)
- **Role:** Handles salted, memory-hard Argon2id password hashing and constant-time verification for user passwords and team join codes.
- **Verification Command:**
  ```bash
  python -c "from app.core.security import hash_password, verify_password; h = hash_password('SecureSecret123!'); assert verify_password('SecureSecret123!', h); print('[OK] Argon2 password hashing verified.')"
  ```
- *Expected Output:* `[OK] Argon2 password hashing verified.`

### 6.2 `PyJWT` (JWT Authentication Engine)
- **Role:** Signs and decodes HS256 authentication tokens, validating cryptographic signatures, token expiration (`exp`), issuer (`iss`), and audience (`aud`) claims.
- **Verification Command:**
  ```bash
  python -c "import uuid; from app.core.security import create_access_token, decode_access_token; uid = uuid.uuid4(); token = create_access_token(uid, extra_claims={'email': 'test@example.com'}); payload = decode_access_token(token); assert payload['sub'] == str(uid); print('[OK] PyJWT authentication verified.')"
  ```
- *Expected Output:* `[OK] PyJWT authentication verified.`

### 6.3 `Pillow` (Image Processing & Validation)
- **Role:** Used in team file uploads (`app/api/routes/team_files.py`) to inspect image file headers, validate actual image formats (PNG, JPEG, GIF, WEBP), and prevent malicious or corrupted file uploads.
- **Verification Command:**
  ```bash
  python -c "import PIL.Image; print(f'[OK] Pillow image engine verified (version: {PIL.Image.__version__}).')"
  ```
- *Expected Output:* `[OK] Pillow image engine verified (version: ...).`

### 6.4 `pydantic-settings` (Environment Configuration)
- **Role:** Loads and strictly validates `.env` configuration keys into strongly-typed application settings at startup.
- **Verification Command:**
  ```bash
  python -c "from app.core.config import settings; print(f'[OK] Configuration loaded: {settings.APP_NAME} | Env: {settings.APP_ENV} | DB: {settings.DATABASE_URL}')"
  ```
- *Expected Output:* `[OK] Configuration loaded: Event Platform API | Env: development | DB: sqlite:///./data/app.db`

### 6.5 `Uvicorn` & `WebSockets` (Real-Time Communication)
- **Role:** High-performance ASGI server supporting HTTP/1.1 and RFC 6455 WebSockets for the live team collaboration chat endpoint (`/api/v1/teams/{team_id}/messages/ws`).
- **Verification Command:**
  ```bash
  python -c "import uvicorn, websockets; print('[OK] Uvicorn and WebSockets ready.')"
  ```
- *Expected Output:* `[OK] Uvicorn and WebSockets ready.`

---

## 7. Starting the FastAPI Server

Start the application with Uvicorn in development mode:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 7.1 Verify Health Endpoint
In a separate terminal, test that the service is running and connected to SQLite:

```bash
curl http://127.0.0.1:8000/api/v1/health
```

*Expected JSON Response:*
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2026-11-14T02:00:00.000000Z"
}
```

### 7.2 Interactive API Documentation
- **Swagger UI (Interactive API Explorer):** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc (Detailed Specifications):** [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)
- **OpenAPI Schema (Raw JSON):** [http://127.0.0.1:8000/openapi.json](http://127.0.0.1:8000/openapi.json)

---

## 8. API Endpoints Documentation

### Health Check
- **`GET /api/v1/health`**: Verifies service operational status and database connection.

### Authentication
- **`POST /api/v1/auth/register`**: Register a new user, create their profile, and return
  `{access_token, refresh_token, token_type, expires_in, user}`.
- **`POST /api/v1/auth/login`**: Authenticate with email/password. Returns the same token
  pair. Access tokens last `ACCESS_TOKEN_EXPIRE_MINUTES` (default 30).
- **`POST /api/v1/auth/refresh`**: Exchange `{refresh_token}` for a **rotated** token pair.
  Unauthenticated — the refresh token is itself the credential. Returns `401` for an
  expired, revoked, deleted-user, or wrong-type token.
- **`GET /api/v1/users/me`**: Return authenticated user information and profile.
- **`GET /api/v1/users/me/judging-events`**: Events where the caller has approved judging
  access (`EventMembership.role = "judge"`). Unpaginated — a user judges a few events.
- **`GET /api/v1/users/me/mentoring-events`**: Distinct events where a mentor request is
  assigned to the caller. De-duplicated across multiple requests in one event.

#### Refresh token design
Refresh tokens are **stateless**: the same signed JWT format as an access token, with a
14-day lifetime (`REFRESH_TOKEN_EXPIRE_DAYS`) and a distinct `typ` claim. Type confusion is
rejected in both directions:

- `decode_access_token` throws `InvalidTokenError` when `typ == "refresh"`.
- `decode_refresh_token` throws `InvalidTokenError` when `typ != "refresh"`.

Tokens minted before the `typ` claim existed carry no value and are still accepted, so a
rolling deploy does not sign every user out. There is no server-side revocation list;
rotating `JWT_SECRET_KEY` invalidates all tokens. If per-session revocation is needed, add
a `refresh_tokens` table keyed on the `jti` claim the token already carries.

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
- **`GET /api/v1/events/{event_id}/my-team`**:
  - Returns the caller's team in the event as a full `TeamDetailRead` (roster included).
  - `404 {"detail": "You are not on a team for this event."}` when the caller is not on
    an active team — an expected answer, not an error.
  - Disbanded teams and members with `status != active` are excluded. Scoped per event, so
    the same user can resolve to different teams in different events.
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
- **`GET /api/v1/teams/{team_id}/files`**:
  - Paginated listing (`limit` 1–100 default 50, `offset`) ordered newest first
    (`created_at DESC, id DESC`). Restricted to active team members.
  - Returns `TeamFileRead`: the stored-file fields plus `uploaded_by_username`,
    `uploaded_by_display_name`, and `message_id` (null unless the file was posted as a
    chat attachment).
  - Soft-deleted files (`deleted_at` set) are excluded.
- **`GET /api/v1/teams/{team_id}/files/{file_id}`**:
  - Download team file with safe `Content-Disposition` header. Restricted to active team members. Prevents cross-team IDOR access.

---

### Phase 6: Projects, Submissions, Judging & Leaderboards

#### Project Management
- **`POST /api/v1/events/{event_id}/projects`**:
  - Create a team project and its first draft submission (`version_number = 1`) in a single transaction.
  - Restricted to active team owners or leads. One project per team per event.
  - Validates optional event track and HTTP(S) links.
- **`GET /api/v1/teams/{team_id}/project`**:
  - Returns the team's project, latest submission, and full submission history (including drafts). Restricted to active team members.
- **`GET /api/v1/events/{event_id}/projects`**:
  - Public discovery listing submitted projects for participants, judges, or organizers. Never exposes draft submissions. Supports pagination.

#### Submission Versions & Immutability
- **`PATCH /api/v1/projects/{project_id}/submissions/{submission_id}`**:
  - Edit draft submission details. Modifying a submitted version returns `HTTP 409 Conflict`.
- **`POST /api/v1/projects/{project_id}/submissions`**:
  - Create the next submission version. Requires previous version to be submitted; rejects duplicate drafts. Copies previous data as draft template.
- **`GET /api/v1/projects/{project_id}/submissions`**:
  - Return version history. Team members and organizers view all versions; judges view submitted versions only.
- **`POST /api/v1/projects/{project_id}/submissions/{submission_id}/submit`**:
  - Finalize a submission before the event deadline.
  - Enforces required title, abstract, valid HTTP(S) repository URL, and event minimum team size.
  - Sets submission to `submitted` (immutable) and marks team status as `submitted` (blocking new members from joining).

#### Judge & Criteria Management
- **`POST /api/v1/events/{event_id}/judges`**: Add an existing user as an approved event judge. Enforces participant/judge exclusivity.
- **`GET /api/v1/events/{event_id}/judges`**: List judges for authorized event organizers.
- **`DELETE /api/v1/events/{event_id}/judges/{user_id}`**: Remove judging access by setting membership status to `withdrawn`. Existing evaluations are preserved.
- **`POST /api/v1/events/{event_id}/judging-criteria`**: Create criteria with `max_score > 0` and `weight > 0`.
- **`GET /api/v1/events/{event_id}/judging-criteria`**: Active criteria visible to participants and judges; all criteria visible to organizers.
- **`PATCH /api/v1/judging-criteria/{criterion_id}`**: Update criterion. Blocked if evaluations have already begun for the event.
- **`DELETE /api/v1/judging-criteria/{criterion_id}`**: Delete criterion. Blocked if evaluations have already begun.

#### Evaluation System
- **`POST /api/v1/submissions/{submission_id}/evaluations`**:
  - Create a draft evaluation for an approved judge. Rejects drafts or superseded submission versions.
  - Conflict of interest prevention: judges cannot evaluate projects from teams they currently or previously belonged to.
- **`GET /api/v1/submissions/{submission_id}/evaluations/me`**: Return judge's own evaluation and scores.
- **`PUT /api/v1/evaluations/{evaluation_id}`**: Save or update draft evaluation scores. Allows incomplete drafts.
- **`POST /api/v1/evaluations/{evaluation_id}/submit`**:
  - Finalize evaluation. Every active criterion must be scored within its `[0, max_score]` range.
  - Submitted evaluations become immutable (`HTTP 409 Conflict` on edit attempts).

#### Dynamic Leaderboard
- **`GET /api/v1/events/{event_id}/leaderboard`**:
  - Dynamically calculates scores using the formula:
    - Normalized score: `(score / max_score) * 100`
    - Judge weighted score: `sum(normalized_score * weight) / sum(weight)`
    - Final project score: `average(weighted_score across submitted evaluations)`
  - Standard competition ranking handling ties with equal ranks.
  - Unjudged projects receive no invented scores (`final_score = None`, `rank = None`).
  - Access control: Organizers view anytime; participants and public view only after event completion.

---

### Phase 7: Event Operations

#### Event Schedule Management
- **`POST /api/v1/events/{event_id}/schedule`**:
  - Add an item to the event agenda/schedule (`title`, `item_type`, `starts_at`, `ends_at`, optional `venue`, `meeting_url`).
  - Restricted to organization `owner` and `admin`. Validates `ends_at >= starts_at`.
- **`GET /api/v1/events/{event_id}/schedule`**:
  - List schedule items ordered chronologically (`starts_at ASC, ends_at ASC`).
  - Publicly accessible for published public events; requires event membership or organizer access otherwise.
  - Active items returned by default; `include_cancelled=true` query parameter allowed for organizers only.
- **`PATCH /api/v1/schedule/{item_id}`**:
  - Update schedule item fields. Restricted to organization `owner` and `admin`.
- **`DELETE /api/v1/schedule/{item_id}`**:
  - Soft-delete schedule item (sets `status = "cancelled"`). Restricted to organization `owner` and `admin`.

#### Announcement Management & Notification Dispatch
- **`POST /api/v1/events/{event_id}/announcements`**:
  - Create a draft announcement (`title`, `body`, `target_audience`: `all`, `participants`, `judges`, `mentors`, `team`, optional `target_team_id`).
  - Restricted to organization `owner` and `admin`.
- **`GET /api/v1/events/{event_id}/announcements`**:
  - Return visible announcements filtered by user role and audience targeting.
  - Drafts visible only to organizers. Published announcements filtered:
    - `all`: All active event members.
    - `participants`: Approved/registered participants.
    - `judges`: Approved judges.
    - `mentors`: Approved mentors.
    - `team`: Active members of the targeted team only.
- **`PATCH /api/v1/announcements/{announcement_id}`**:
  - Edit draft announcement. Publishing or modifying an already published/withdrawn announcement is rejected (`400 Bad Request`).
- **`POST /api/v1/announcements/{announcement_id}/publish`**:
  - Publish announcement (`status = "published"`, `published_at = utcnow`).
  - Transactionally resolves eligible recipients based on target audience and dispatches in-app `Notification` records.
  - Published announcements are immutable against further content edits.
- **`POST /api/v1/announcements/{announcement_id}/withdraw`**:
  - Withdraw announcement (`status = "withdrawn"`). Existing delivered notifications are preserved.

#### In-App Notifications
- **`GET /api/v1/notifications/me`**:
  - Retrieve paginated notifications for the authenticated user, ordered newest first (`created_at DESC`).
  - Supports `unread_only=true` filter and `limit`/`offset` pagination. Strict user isolation enforced.
- **`GET /api/v1/notifications/me/unread-count`**:
  - Return total unread notification count for the authenticated user.
- **`PATCH /api/v1/notifications/{notification_id}/read`**:
  - Mark a single notification as read (`is_read = true`, `read_at = utcnow`). Restricted to notification owner.
- **`POST /api/v1/notifications/me/read-all`**:
  - Mark all notifications for the authenticated user as read in a single batch operation.

#### Participant Check-in Operations & Metrics
- **`GET /api/v1/events/{event_id}/check-ins`**:
  - Search and filter attendees for check-in management.
  - Restricted to organization `owner` and `admin`.
  - Supports `checked_in=true/false` filter, text search across username/email/display name, and pagination.
- **`GET /api/v1/events/{event_id}/check-ins/summary`**:
  - Return aggregated check-in metrics: `total_eligible_participants`, `total_checked_in`, `attendance_percentage`, `last_check_in_at`.
  - Accurately excludes withdrawn and rejected registrations from attendance denominator.
- **`POST /api/v1/events/{event_id}/participants/{user_id}/check-in`**:
  - Mark an approved or registered participant as checked in.
  - Prevents duplicate check-in if already checked in (`400 Bad Request`).
  - Restricted to organization `owner` and `admin`.
- **`DELETE /api/v1/events/{event_id}/participants/{user_id}/check-in`**:
  - Undo participant check-in (`checked_in_at = None`).
  - Restricted to organization `owner` and `admin`. Rejects undoing a participant who is not currently checked in.

#### Mentor Request Management
- **`POST /api/v1/events/{event_id}/mentor-requests`**:
  - Request mentor assistance (`topic`, `description`, `priority`: `low`, `medium`, `high`, `urgent`, optional `team_id`).
  - Restricted to registered or approved participants of the event.
  - If `team_id` is specified, verifies requester is an active member of that team.
- **`GET /api/v1/participants/me/mentor-requests`**:
  - Return all mentor requests created by the authenticated participant across events.
- **`GET /api/v1/events/{event_id}/mentor-requests`**:
  - List mentor requests for an event with role-based visibility:
    - Organizers see all requests in the event.
    - Mentors see unassigned requests (`status = "pending"`) plus requests assigned to themselves.
    - Non-mentor/non-organizer participants are denied access (`403 Forbidden`).
- **`PATCH /api/v1/mentor-requests/{request_id}/assign`**:
  - Assign request to an approved event mentor (`mentor_user_id`).
  - Allowed for event organizers or the mentor claiming the request for themselves.
  - Sets `status = "assigned"` and `assigned_mentor_user_id`, and dispatches notification to the requester.
- **`PATCH /api/v1/mentor-requests/{request_id}/status`**:
  - Advance status (`assigned -> in_progress -> resolved` or `pending -> rejected`).
  - Enforces valid state machine transitions.
  - Recording `resolved` captures `resolved_at` and optional `resolution_note`.
  - Dispatches status change notifications to requester. Restricted to assigned mentor or event organizers.
- **`POST /api/v1/mentor-requests/{request_id}/cancel`**:
  - Requester cancels their own request while in `pending` status. Sets `status = "cancelled"`.

---

### Phase 8: Sponsorship Marketplace

#### Sponsor Discovery & Public Listings
- **`GET /api/v1/sponsors`**:
  - Discover active sponsor organizations offering sponsorship.
  - Supports search across organization name and description, currency filtering, minimum/maximum budget filtering, and pagination.
  - Returns public sponsor profile with active listing count and public listing summaries. Excludes private organization details.
- **`GET /api/v1/sponsorship-listings`**:
  - Public discovery endpoint returning published, unexpired sponsorship listings.
  - Supports filtering by `listing_type` (`seeking_sponsors`, `offering_sponsorship`), `event_type`, `city`, `organization_name`, `min_budget`, `max_budget`, and `currency`.
  - Excludes drafts, closed listings, and expired listings.
- **`GET /api/v1/sponsorship-listings/{listing_id}`**:
  - Retrieve detailed public listing information with commercial packages and public event information.
  - Drafts, closed, and expired listings are strictly restricted to active members of the listing owner organization (returning `HTTP 404 Not Found` to unauthorized users).

#### Sponsorship Listing Management
- **`POST /api/v1/organizations/{organization_id}/sponsorship-listings`**:
  - Create a sponsorship listing in `draft` status.
  - Restricted to active organization `owner` and `admin`.
  - Validates organization type compatibility:
    - `seeking_sponsors`: Requires organization type `organizer` or `both`, and requires `event_id` referencing an event owned by the organization.
    - `offering_sponsorship`: Requires organization type `sponsor` or `both`. `event_id` is optional and validated against organization ownership if provided.
  - Validates non-negative budgets and `max_budget >= min_budget`.
- **`GET /api/v1/organizations/{organization_id}/sponsorship-listings`**:
  - List all sponsorship listings (including drafts) for active organization members.
- **`PATCH /api/v1/sponsorship-listings/{listing_id}`**:
  - Update draft sponsorship listing details. Modifying published or closed listings is rejected (`HTTP 400 Bad Request`).
- **`POST /api/v1/sponsorship-listings/{listing_id}/publish`**:
  - Transition a draft listing to `published`.
  - Validates all prerequisite constraints (active organization, valid event ownership, unexpired dates). Closed and expired listings cannot be published.
- **`POST /api/v1/sponsorship-listings/{listing_id}/close`**:
  - Close a listing (`status = "closed"`). Preserves existing proposals and finalized deals.

#### Package Management
- **`POST /api/v1/sponsorship-listings/{listing_id}/packages`**:
  - Create a commercial sponsorship package (`name`, `price >= 0`, `currency`, `benefits`, optional positive `available_slots`).
  - Restricted to active organization `owner` and `admin`.
- **`GET /api/v1/sponsorship-listings/{listing_id}/packages`**:
  - List packages for a sponsorship listing.
- **`PATCH /api/v1/sponsorship-packages/{package_id}`**:
  - Update package details.
  - If any proposal has referenced the package, commercial terms (`price`, `currency`, `benefits`) are protected from silent modification (`HTTP 400 Bad Request`).
- **`DELETE /api/v1/sponsorship-packages/{package_id}`**:
  - Delete an unreferenced package. Packages referenced by any proposal cannot be deleted (`HTTP 400 Bad Request`).

#### Proposal Management
- **`POST /api/v1/sponsorship-listings/{listing_id}/proposals`**:
  - Submit a formal sponsorship proposal.
  - Restricted to active `owner` and `admin` of the proposing organization.
  - Automatically identifies and validates proposing organization:
    - For `offering_sponsorship` listings: Proposer is the organizer owning the `target_event_id`.
    - For `seeking_sponsors` listings: Proposer must be an active sponsor organization where the user has `owner`/`admin` rights.
  - Prevents proposing to one's own organization.
  - Prevents duplicate active proposals (`pending` or `negotiating`) for the same listing and event (`HTTP 409 Conflict`).
  - Dispatches `sponsorship_proposal_received` in-app notification to the listing owner organization.
- **`GET /api/v1/organizations/{organization_id}/sponsorship-proposals`**:
  - List incoming and outgoing proposals for active organization members. Supports filtering by `direction` (`incoming`, `outgoing`) and `status`.
- **`GET /api/v1/sponsorship-proposals/{proposal_id}`**:
  - View full proposal details, terms, and complete chronological negotiation history. Strictly restricted to members of the two participating organizations (`HTTP 403 Forbidden` to outsiders).

#### Negotiations & Counteroffers
- **`POST /api/v1/sponsorship-proposals/{proposal_id}/messages`**:
  - Add a negotiation message or formal counteroffer (`counter_amount`, `currency`, `counter_package_id`, `counter_benefits`).
  - Restricted to active `owner` and `admin` of either participating organization while proposal is `pending` or `negotiating`.
  - Counteroffers advance status to `negotiating` and become the current terms for acceptance.
  - Dispatches `sponsorship_counteroffer_received` or `sponsorship_negotiation_message_received` in-app notifications to the partner organization.
- **`POST /api/v1/sponsorship-proposals/{proposal_id}/accept`**:
  - Accept the current proposal or counteroffer.
  - Strictly restricted to the receiving party:
    - If no counteroffer exists: Only the listing owner organization can accept.
    - If a counteroffer exists: Only the party receiving the latest counteroffer can accept.
  - In a single database transaction:
    - Marks proposal as `accepted`.
    - Decrements package available slots (if applicable).
    - Snapshots commercial terms into a new immutable `SponsorshipDeal`.
    - Dispatches `sponsorship_proposal_accepted` in-app notifications.
- **`POST /api/v1/sponsorship-proposals/{proposal_id}/reject`**:
  - Reject the current proposal or counteroffer. Restricted to the receiving party. Sets status to `rejected` and notifies the other party.
- **`POST /api/v1/sponsorship-proposals/{proposal_id}/withdraw`**:
  - Withdraw proposal. Allowed only for the original proposing organization while `pending` or `negotiating`.

#### Deals & Deliverables
- **`GET /api/v1/organizations/{organization_id}/sponsorship-deals`**:
  - List all sponsorship deals involving the organization (as sponsor or organizer), with deliverable completion metrics.
- **`GET /api/v1/sponsorship-deals/{deal_id}`**:
  - Return complete deal snapshot, agreed commercial terms, and deliverable tracking items. Restricted to active members of the two deal parties.
- **`PATCH /api/v1/sponsorship-deals/{deal_id}/status`**:
  - Transition deal status from `active` to `completed` or `cancelled`.
  - Reopening completed or cancelled deals is rejected (`HTTP 400 Bad Request`).
- **`POST /api/v1/sponsorship-deals/{deal_id}/deliverables`**:
  - Create a deliverable for tracking promised sponsorship benefits (`responsible_organization_id`, `title`, `description`, `due_at`).
  - Validates that `responsible_organization_id` is one of the two deal parties.
  - Dispatches `sponsorship_deliverable_assigned` in-app notification.
- **`GET /api/v1/sponsorship-deals/{deal_id}/deliverables`**:
  - List deliverables for a deal.
- **`PATCH /api/v1/sponsorship-deliverables/{deliverable_id}`**:
  - Update deliverable details, status (`pending`, `in_progress`, `completed`, `rejected`, `cancelled`), or evidence.
  - Enforces HTTP/HTTPS protocol validation on `evidence_url`.
  - Automatically records `completed_at` timestamp upon entering `completed` status.
  - Dispatches `sponsorship_deliverable_completed` or `sponsorship_deliverable_rejected` in-app notifications.

### Phase 9: AI Features (Assistant, Summaries, Matchmaking)

All AI features are **optional and degrade gracefully**. With `GEMINI_API_KEY`
empty the server still serves every endpoint: the assistant answers from a
keyword matcher, summaries are extracted from the submission text, and
matchmaking is unaffected (it never used a model). Responses always carry a
`source` of `gemini` or `fallback` so the client can label them honestly.

Configuration (see `.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | *(empty)* | Enables live generation. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Model for chat and summaries. |
| `GEMINI_API_BASE` | Google endpoint | Override for a proxy. |
| `GEMINI_TIMEOUT_SECONDS` | `30` | Per-request timeout. |
| `GEMINI_MAX_OUTPUT_TOKENS` | `1024` | Caps generation length. |

**`GET /api/v1/ai/status`** *(unauthenticated)*
Reports `ai_enabled`, the configured `model` (`null` when no key is set), and
per-feature availability. The client uses `ai_enabled` to choose between the
"AI" and "Offline answer" labels.

**Skills** — the input to matchmaking.
- **`GET /api/v1/users/me/skills`** / **`PUT /api/v1/users/me/skills`**: read and
  replace your whole skill set. The PUT is a full replacement: labels are
  trimmed, de-duplicated case-insensitively (`React.js` and `react` merge, keeping
  the first spelling and the higher proficiency), blanks dropped. More than 50
  skills or a proficiency outside 1–5 is a 422.
- **`GET /api/v1/users/{user_id}/skills`**: another user's skills.

**Matchmaking** — a deterministic algorithm in `app/services/skill_matching.py`,
not a model. Each skill is weighted by rarity (`1 / (1 + holders)`), a candidate
scores the weight of the skills they bring that you lack, and shared skills incur
an `OVERLAP_PENALTY` of `0.6` so near-duplicates rank last. Ties break
alphabetically, so ranking is reproducible.
- **`GET /api/v1/events/{event_id}/matchmaking/teammates`**: registered
  participants ranked against you.
- **`GET /api/v1/events/{event_id}/matchmaking/teams`**: open teams ranked by what
  you would add.
- **`POST /api/v1/events/{event_id}/matchmaking/preview`**: rank against a
  hypothetical skill set without saving it.

**Assistant**
- **`GET /api/v1/ai/conversations`** / **`POST /api/v1/ai/conversations`**: list and
  create conversations.
- **`GET | DELETE /api/v1/ai/conversations/{id}`**: read history or delete.
- **`POST /api/v1/ai/conversations/{id}/messages`**: send a message; returns both
  turns. History is capped at 20 turns per request, 50 conversations per user
  (the oldest is pruned).
- **`POST /api/v1/ai/chat`**: one-shot message without persisting a conversation.

Conversations are owner-only — another user's id returns 404, not 403, so their
existence is not disclosed. The user's turn is persisted **before** generation, so
a provider failure never loses what they typed.

**Summaries**
- **`GET /api/v1/submissions/{submission_id}/summary`**: cached overview with `tldr`,
  `technologies`, `highlights` and `talking_points`. Pass `?refresh=true` to
  regenerate.
- **`GET /api/v1/events/{event_id}/ai/overview`**: organizer-only digest across
  every submitted project, reporting how many were `generated` vs `cached`.

A draft submission is visible only to its owning team. Submitted work is visible
to the owning team, the organization's owner/admin, and approved judges/mentors.

---

## 9. Running the Test Suite

The test suite runs with `pytest` against an isolated temporary SQLite database:

```bash
pytest -v
```

Total tests: **121 passing** across 14 test modules:
- `test_auth.py` (18 tests): Registration, duplicate checks, login, JWT validation,
  expiration, user me, refresh-token issuance, rotation, expiry, deleted-user rejection,
  and both directions of access/refresh type confusion.
- `test_models.py` (8 tests): All 30 tables registered, foreign keys, unique & check constraints, relationships.
- `test_health.py` (4 tests): Health check, database ping, CORS preflight, and
  `CORS_ORIGINS` parsing.
- `test_organizations.py` (6 tests): Org CRUD, slug uniqueness, user org listing, invitations accept/reject, member removal.
- `test_events.py` (6 tests): Event creation, draft visibility, publishing validation, public discovery filtering, cancelling.
- `test_tracks.py` (3 tests): Track CRUD and uniqueness constraints.
- `test_registrations.py` (8 tests): Participant registration, withdrawal, reactivation, timing boundaries, organizer check-in.
- `test_participant_dashboard.py` (3 tests): Participant dashboard metrics, event categorization, registered event details.
- `test_organizer_participants.py` (3 tests): Organizer participant roster, search/filter, status updates, check-in.
- `test_teams.py` (20 tests): Team creation, lifecycle status transitions, join codes, team discovery, roster privacy, invitations, role updates, ownership transfer, disbanding, capacity enforcement, and `GET /events/{id}/my-team` (membership, 404, disbanded exclusion, non-member, leaving, auth).
- `test_team_collaboration.py` (18 tests): Tasks CRUD, status transitions, assignees replacement, persistent chat, attachments, WebSocket authentication, real-time broadcasts, the typed `{type, data}` envelope contract, file validation, oversized rejections, disconnects on leave/disband, and the paginated team file listing.
- `test_projects_and_judging.py` (13 tests): Project creation, single project per team constraint, submission versions, draft editing, submitted immutability, deadline & team size checks, judge management, criteria immutability, evaluation lifecycle, conflict of interest checks, leaderboard dynamic calculation, ties, access control, and judge/mentor event discovery (`/users/me/judging-events`, `/users/me/mentoring-events`).
- `test_event_operations.py` (5 tests): Event schedule management, announcements & audience targeting, notifications privacy & unread tracking, check-in metrics & undo, mentor requests assignment & lifecycle.
- `test_sponsorship_marketplace.py` (6 tests): Sponsor discovery, bidirectional listings, packages, proposals, negotiations & counteroffers, deals snapshotting, deliverable lifecycle, and notification dispatch.
