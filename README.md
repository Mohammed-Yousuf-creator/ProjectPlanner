# Project Planner

A locally hostable, solo-developer central hub for planning and controlling software projects.
Built from a template synthesized across four project-planning video transcripts (sponsor sections ignored).

**Tech stack:** Go backend · PostgreSQL database · React frontend
**Target:** Linux Mint — all data stored on your computer
**Local startup:** under 10 minutes (DB → backend → frontend)

---

## Where the template came from

The app mixes the best aspects of each transcript, taking none of them literally:

| Video | What was taken | What was ignored |
|-------|---------------|------------------|
| Video 1 | 9-step planning process (goal → user stories → data models → ruthless MVP → wireframe → future → architecture → stack → process) | Sponsor sections |
| Video 2 | Upfront decisions, subtasks with hard deadlines, daily commits — and the **doom-perfectionism warning** that coding must start within 14 days of deciding | Sponsor sections |
| Video 3 | Blueprint before coding, micro-challenges, backend → DB → frontend build order, systems for memory vs knowledge vs problem-solving | The specific "project shown" — taken as template only, not literally |
| Video 4 | Bare-minimum core first, black-box modules with thin interfaces, optional external vendors, parallel data flows, deep modules, DLC after core | The cloud AI harness — taken as template only; **no AI features** in this app |

Sponsor sections in every transcript were ignored, per instructions.

---

## Features

1. **Central hub (dashboard)** — one place to list, open, and delete all your solo projects.
2. **14-day coding deadline (anti doom-perfectionism)** — when you create a project, a `coding_deadline` is set automatically at *decision date + 14 days*. The dashboard and project page surface a countdown; once passed, the project is flagged **OVERDUE** with a "START CODING NOW" banner. This enforces the video-2 rule that you start coding within two weeks.
3. **Hackathon project type** — choose "Hackathon" when creating a project. You get a live countdown clock from the hackathon start time, plus MVP-only scope mode and time-boxed tasks to help you ship before the clock hits zero.
4. **User stories, tasks, data models** — non-technical user stories, micro-tasks (optionally time-boxed), and data-model definitions per project (video 1 steps 2–3).
5. **File uploads (max 10 MB, compressed in backend)** — attach files up to 10 MB. The Go backend gzip-compresses each file *before storing it on your local disk*. No external compression service is required (it's free, built-in).
6. **Database stored locally** — PostgreSQL runs on your machine; all data stays on your computer. No cloud lock-in.
7. **External services optional** — you can self-host Postgres and auth yourself, or fast-track with a hosted Postgres (e.g. Neon) when you want speed for prod/hackathons. The app works the same either way via `DATABASE_URL`.
8. **No AI features** — deliberately absent, per constraint.

---

## Prerequisites (Linux Mint)

Install these once. On Linux Mint:

```bash
# PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# Go (1.20+) — download the official tarball and extract to /usr/local
# https://go.dev/dl/  (or your distro's golang package)

# Node.js + npm (for the frontend)
sudo apt install nodejs npm
# (or use NodeSource / nvm for newer versions)
```

Verify:
```bash
go version      # go1.20+
psql --version  # postgres
node --version  # v18+
npm --version
```

---

## Local run in under 10 minutes

### 1) Start the database

Option A — Docker (quickest if you have Docker):
```bash
docker compose up -d postgres
```

Option B — bare-metal Postgres on Linux Mint:
```bash
sudo service postgresql start
# Create the database and user (default credentials the app expects):
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres createdb projectplanner
```

The app connects to `postgres://postgres:postgres@localhost:5432/projectplanner?sslmode=disable` by default. Override with `DATABASE_URL` if needed.

### 2) Initialize the schema

The backend runs the migration (`backend/migrations/0001_initial.sql`) automatically on startup, so there's no separate migration step. Just start the server (next step).

### 3) Start the backend

```bash
cd /home/user/ProjectPlanner
go mod tidy          # downloads the Postgres driver (one-time, needs internet)
go run backend/main.go   # or: go build -o projectplanner . && ./projectplanner
```

Backend listens on `http://localhost:8080`. Set `PORT` to change it.

### 4) Host the frontend

```bash
cd frontend
npm install          # one-time
npm run dev          # Vite dev server, opens http://localhost:5173
```

The frontend proxies `/api` to the Go backend on `:8080`. You're now running the full stack locally.

Total: well under 10 minutes once Go/Postgres/Node are installed.

### Production / fast-track note
To run the frontend against a built backend, run `npm run build` in `frontend/` and serve `frontend/dist` with any static file server (or point the Go server at it). External services remain optional — swap `DATABASE_URL` to a hosted Postgres if you want to fast-track for prod or a hackathon.

---

## Configuration

Environment variables (all optional):

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/projectplanner?sslmode=disable` | Postgres connection string |
| `PORT` | `8080` | Backend HTTP port |
| `UPLOADS_DIR` | `uploads` | Directory where compressed attachments are stored locally |
| `MIGRATION_PATH` | `backend/migrations/0001_initial.sql` | Schema migration SQL location |

---

## Project structure

```
projectplanner/
├── README.md
├── go.mod                          # Go module (lib/pq Postgres driver)
├── backend/
│   ├── main.go                     # HTTP server + routes
│   ├── models.go                   # domain structs (project, story, task, model, upload)
│   ├── db.go                       # schema initialization from migration SQL
│   ├── routes.go                   # method+path router, CORS, JSON helpers
│   ├── handlers.go                 # projects, deadline, stories, tasks, data models, health
│   ├── upload.go                   # 10 MB cap + gzip compress before local storage
│   └── migrations/
│       └── 0001_initial.sql        # Postgres schema (stored locally)
├── frontend/                       # Vite + React
│   ├── package.json
│   ├── vite.config.js              # proxies /api to :8080
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css
│       ├── services/api.js
│       ├── components/             # CountdownClock, ProjectCard, FileUpload
│       └── pages/                  # Dashboard, NewProject, ProjectDetail
├── uploads/                        # compressed attachments (local, gitignored)
├── docker-compose.yml              # optional Postgres only
└── .gitignore
```

---

## API overview

`GET /api/health` — service + DB health  
`GET /api/projects` — list projects (includes deadline/overdue state)  
`POST /api/projects` — create project (sets coding_deadline = now + 14 days)  
`GET/PUT/DELETE /api/projects/:id`  
`GET /api/projects/:id/deadline` — 14-day coding deadline status  
`GET /api/projects/:id/countdown` — hackathon countdown clock  
`GET/POST /api/projects/:id/stories` — user stories  
`PUT/DELETE /api/stories/:id`  
`GET/POST /api/projects/:id/tasks` — tasks (time-boxed for hackathons)  
`PUT/DELETE /api/tasks/:id`  
`GET/POST /api/projects/:id/datamodels` — data models  
`PUT/DELETE /api/datamodels/:id`  
`GET/POST /api/projects/:id/uploads` — attachments (≤10 MB, gzip-compressed)  
`GET /api/uploads/:id/download` — download (decompressed on the fly)  
`DELETE /api/uploads/:id`

---

## Constraints honored (from the transcripts)

- ✅ Sponsor sections ignored in all transcripts
- ✅ Coding starts within 14 days of deciding (enforced via `coding_deadline` + overdue UI)
- ✅ File uploads capped at 10 MB, gzip-compressed in the backend before storage
- ✅ DB data stored locally on your computer (Linux Mint)
- ✅ Local startup under 10 minutes
- ✅ External services optional (self-host or fast-track via `DATABASE_URL`)
- ✅ Hackathon project type with countdown clock + MVP-only scope
- ✅ No AI features inside the project
- ✅ Video 3 / Video 4 taken as template only, not literally

---

## Next (DLC after core)

Per the video-4 "DLC after core" principle, after the core ships you could add: daily-commit streaks, burndown charts, task time-boxing timers, export to Markdown/JSON, and optional hosted-auth fast-track. Keep the core stupid-simple first.
