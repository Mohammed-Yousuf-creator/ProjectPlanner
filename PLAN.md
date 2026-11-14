# PLAN.md — Frontend Build Plan (Event & Hackathon Management Platform)

> **Audience:** GitHub Copilot (or any coding model). Follow this file literally.
> **Context files you must also have open:** `README.md` (backend contract) and `DESIGN_SYSTEM.md` (visual contract).
> **Prime directive:** Do NOT invent endpoints, fields, enums, routes, or behaviors. If something is not in `README.md` or in the backend's live `/openapi.json`, you do not know it. Stop and follow the "When information is missing" rule (Section 0.3).

---

## 0. Ground Rules (read first, apply always)

### 0.1 Sources of truth, in priority order
1. **Live OpenAPI schema** at `http://127.0.0.1:8000/openapi.json` — the ONLY source for request/response field names and types. `README.md` lists endpoints and rules but does NOT list every response field.
2. **`README.md`** — endpoint paths, methods, permissions, business rules, enum values.
3. **`DESIGN_SYSTEM.md`** — every color, radius, font, and component look.
4. This `PLAN.md` — structure, order of work, conventions.

If two sources conflict, the order above wins (OpenAPI > README > DESIGN_SYSTEM > PLAN for API facts; DESIGN_SYSTEM wins for visuals).

### 0.2 Hard prohibitions
- Do NOT call any endpoint not listed in `README.md` Section 8.
- Do NOT guess field names. Generate types from OpenAPI (Step 1.4) and import them.
- Do NOT add features the backend lacks: no refresh tokens, no password reset, no email verification, no social login, no avatar upload, no WebSocket for notifications, no payments, no file listing for teams, no user search endpoint.
- Do NOT use `rounded-full` except for status dots and circular avatars (see DESIGN_SYSTEM Rule #1).
- Do NOT use any color hex outside the DESIGN_SYSTEM palette. No purple, no gradients, no glassmorphism except the sticky header blur given in the recipe.
- Do NOT use lorem ipsum or fake data. Every list is real API data. Empty states use the "Zero Dummy Data" recipe pattern (5.8) with honest copy.
- Do NOT use `any` in TypeScript. Do NOT silence errors with `// @ts-ignore`.
- Do NOT store anything but the access token in localStorage.
- Do NOT add dependencies not listed in Section 1.2.

### 0.3 When information is missing
If you need a fact (a field name, a request body shape, whether an endpoint returns a list or a wrapper object) that is not available:
1. Check `/openapi.json` (fetched into `src/api/openapi.json` at Step 1.4).
2. If still unknown, do NOT guess. Write a `// TODO(BACKEND-QUESTION): <what is unknown>` comment, implement the UI with the minimal safe behavior, and add a line to `docs/OPEN_QUESTIONS.md`.
3. Continue with the next task.

### 0.4 Working method
- Complete phases **in order**. Do not start a phase until the previous phase's "Done when" checklist passes.
- After each phase run: `npm run typecheck && npm run lint && npm run build`. All must pass.
- Commit message format: `feat(frontend): phase N – <title>`.
- Keep files small (<300 lines). Split components rather than growing files.

---

## 1. Phase 1 — Project Scaffold & Tooling

### 1.1 Create the project
Create a new folder `frontend/` next to `backend/`:
```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
```

### 1.2 Allowed dependencies (install exactly these, nothing else)
Runtime:
- `react-router-dom` (v6) — routing
- `@tanstack/react-query` (v5) — server state
- `axios` — HTTP client
- `zustand` — auth store only
- `react-hook-form` + `zod` + `@hookform/resolvers` — forms & validation
- `date-fns` — date formatting (no moment, no dayjs)
- `clsx` — conditional classes
- `lucide-react` — icons (DESIGN_SYSTEM permits Lucide OR Material Symbols; **use Lucide only**, do not mix)

Dev:
- `tailwindcss@3.4` + `postcss` + `autoprefixer`
- `openapi-typescript` — type generation
- `vitest` + `@testing-library/react` + `@testing-library/jest-dom` + `jsdom` + `msw`
- `eslint`, `prettier` (Vite template defaults are fine)

### 1.3 Vite config (dev proxy — required)
The backend README does not mention CORS middleware. Avoid CORS entirely with a dev proxy in `vite.config.ts`:
- Proxy `/api` → `http://127.0.0.1:8000` with `changeOrigin: true` and **`ws: true`** (the team WebSocket lives under `/api/v1/...`).
- The frontend ALWAYS calls relative URLs like `/api/v1/events`. Never hardcode `http://127.0.0.1:8000` in source code.
- Create `.env.example` with `VITE_API_BASE_URL=/api/v1`. API client reads `import.meta.env.VITE_API_BASE_URL`.

### 1.4 Generate API types from OpenAPI
1. Backend must be running: `uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`.
2. Add npm scripts:
   - `"api:types": "openapi-typescript http://127.0.0.1:8000/openapi.json -o src/api/schema.d.ts"`
   - `"typecheck": "tsc --noEmit"`
3. Run `npm run api:types`. Commit `src/api/schema.d.ts`.
4. Create `src/api/types.ts` that re-exports named aliases from the generated file, e.g. `export type EventRead = components['schemas']['EventRead']`. Use the exact schema names the backend exposes (README lists names like `EventRead`, `TeamRead`, `ProjectDetailRead`, `NotificationRead`, `LeaderboardEntryRead`, `OrganizerParticipantRead`). If a name differs in the generated file, **use the generated name**.
5. **Every component and hook must import its API types from `src/api/types.ts`.** Never hand-write an interface for an API response.

### 1.5 Tailwind + design tokens
1. Initialize Tailwind 3.4. `content: ['./index.html', './src/**/*.{ts,tsx}']`.
2. In `tailwind.config.ts` extend theme with named tokens (so components can use names instead of repeating hex). Use EXACT hex from DESIGN_SYSTEM Section 2:
   - `canvas: #FAF7F2`, `canvas-2: #F8F5F0`, `fill: #F4EFEA`, `surface: #FFFFFF`
   - `line: #E7DFD5`, `line-subtle: #F0EAE1`
   - `ink: #1F1916`, `taupe: #73645A`, `muted: #8A7A70`
   - `forest: #2F5B3C`, `forest-dark: #23452D`
   - `rust: #943C1D`
   - `obsidian-hover: #332A25`, `hover-stone: #EFE9DF`
   - Fonts: `sans: ['Plus Jakarta Sans','Inter','system-ui','sans-serif']`, `mono: ['JetBrains Mono','ui-monospace','monospace']`
3. In `index.html` add Google Fonts links for **Plus Jakarta Sans** (400,500,600,700,800) and **JetBrains Mono** (400,600,700).
4. In `src/index.css`: Tailwind directives; `body { @apply bg-canvas text-ink font-sans antialiased selection:bg-[#EBDDCF] selection:text-rust; }`.
5. Status colors (amber / slate / orange / emerald / red) use stock Tailwind palette classes exactly as written in DESIGN_SYSTEM badge recipes.
6. For errors/danger states (not defined in the design system), use `red-50 / red-200 / red-800` Tailwind classes with `rounded-lg`. This is the ONLY addition to the palette; document it in a comment in `tailwind.config.ts`.

### 1.6 Folder structure (create exactly this)
```text
frontend/src/
├── api/
│   ├── client.ts            # axios instance, interceptors
│   ├── schema.d.ts          # GENERATED – never edit
│   ├── types.ts             # type aliases from schema
│   └── endpoints/           # one file per README route group (see 3.x)
├── hooks/                   # react-query hooks, one file per domain
├── stores/
│   └── authStore.ts
├── lib/
│   ├── format.ts            # date/number/currency helpers
│   ├── errors.ts            # API error → message
│   ├── ws.ts                # team websocket client
│   └── cn.ts                # clsx wrapper
├── components/
│   ├── ui/                  # design-system primitives (Phase 2)
│   ├── layout/              # AppShell, Header, Sidebar, PageHeader
│   └── domain/              # event cards, team cards, etc.
├── pages/                   # one folder per feature area
├── routes/
│   ├── index.tsx
│   └── guards.tsx
├── App.tsx
└── main.tsx
```

### Done when (Phase 1)
- `npm run dev` serves a blank warm-stone page (`#FAF7F2`).
- `npm run api:types` succeeds; `src/api/schema.d.ts` exists.
- `fetch('/api/v1/health')` in the browser console returns `status: "healthy"` through the proxy.

---

## 2. Phase 2 — Design-System Primitives

Build these in `src/components/ui/`. Each is a thin wrapper that copies the Tailwind classes from the matching DESIGN_SYSTEM recipe **verbatim** (translate hex to the token names from 1.5 or keep arbitrary-value hex; both are acceptable, but values must match).

| Component | Source recipe | Notes |
|---|---|---|
| `Button` | 5.2 | variants: `primary` (forest), `dark` (obsidian), `outline`, `chip`, `danger` (red, rounded-xl). Props: `loading`, `icon`, `disabled`. Always `rounded-xl`. |
| `Input`, `Textarea`, `Select`, `Field` (label + error) | 5.6 | `Field` renders label `text-xs font-semibold` + error text `text-[11px] text-red-800`. |
| `Card` | 5.4 / 3 | `bg-white border border-line rounded-2xl shadow-sm`. Prop `interactive` adds the hover border `hover:border-rust/60 hover:shadow-md`. |
| `Badge` | 5.3 | variants: `metric` (forest/emerald), `category` (rust), `gold`, `silver`, `bronze`, `neutral`, `danger`, `warning`. `rounded-lg`, mono, uppercase. |
| `StatusDot` | 5.3 live indicator | only place besides avatars allowed `rounded-full`. |
| `Avatar` | 3 | `rounded-full`; initials fallback; **never** an `<img>` from an unknown field—use `avatar_url` only where the schema has it. |
| `Modal` | 5.7 | focus trap, ESC to close, scroll lock. |
| `DataTable` | 5.5 | header `font-mono text-[10px] uppercase tracking-wider`, rows `divide-[#F0EAE1]`, hover `bg-canvas`. |
| `EmptyState` | 5.8 | props: `icon`, `title`, `description`, `actions`. Copy must be honest, e.g. "No events published yet." Do NOT copy the "Load Sample Benchmark" wording. |
| `Tabs` | 3 | segmented, `rounded-xl` container, NOT pill. |
| `Pagination` | — | prev/next buttons using `limit`/`offset` (all list endpoints use these). |
| `Spinner`, `Skeleton` | — | skeleton uses `bg-fill rounded-xl animate-pulse`. |
| `Toast` | — | small card `rounded-xl`, top-right; success=forest, error=red. |
| `ConfirmDialog` | 5.7 | built on `Modal` for destructive actions. |
| `PageHeader` | 4 | H1 style from typography section + optional actions slot. |

Layout components (`src/components/layout/`):
- `Header` — recipe 5.1. Brand wordmark: use the project name from README title ("Event Platform"), NOT "brand". Remove the fake search input (no search endpoint exists globally). Right side: notification bell with unread badge (Phase 11), user menu (avatar, "Sign out").
- `AppShell` — header + `max-w-7xl` content container.
- `ContextSidebar` — `bg-canvas-2` left nav used inside Organization and Event workspaces.

### Done when (Phase 2)
- A temporary `/_kit` dev-only route renders every primitive in every variant.
- Grep check: `grep -rn "rounded-full" src/` returns ONLY `StatusDot` and `Avatar`.
- Grep check: no hex colors outside the DESIGN_SYSTEM list (`grep -rnoE "#[0-9A-Fa-f]{6}" src/ | sort -u` — compare manually).

---

## 3. Phase 3 — API Client, Auth, Routing

### 3.1 Axios client (`src/api/client.ts`)
- `baseURL = import.meta.env.VITE_API_BASE_URL`.
- Request interceptor: if token in auth store, set `Authorization: Bearer <token>`.
- Response interceptor: on **401** → clear token, clear react-query cache, redirect to `/login?next=<current path>`. There is **no refresh endpoint**; tokens expire after 30 minutes (`ACCESS_TOKEN_EXPIRE_MINUTES=30`). Show a toast "Session expired. Please sign in again."
- Normalize errors in `lib/errors.ts`: FastAPI returns `detail` as a string (for 400/401/403/404/409) or an array of `{loc, msg, type}` (for 422). Convert both to a displayable string; for 422 also expose per-field messages keyed by `loc[loc.length-1]`. Verify the exact shape by calling the API once and reading the response; if different from this, follow reality and record it in `docs/OPEN_QUESTIONS.md`.

### 3.2 Endpoint modules (`src/api/endpoints/`)
Create one file per README route group. Each exports plain async functions that return typed data. **Function names map 1:1 to README endpoints.** Required files:
`auth.ts, users.ts, organizations.ts, events.ts, tracks.ts, registrations.ts, participants.ts, teams.ts, teamTasks.ts, teamMessages.ts, teamFiles.ts, projects.ts, submissions.ts, judging.ts, leaderboards.ts, schedule.ts, announcements.ts, notifications.ts, checkins.ts, mentorRequests.ts, sponsors.ts, sponsorshipListings.ts, sponsorshipProposals.ts, sponsorshipDeals.ts, sponsorshipDeliverables.ts`

Rules:
- Request bodies are typed from the generated schema (`components['schemas']['XxxCreate']`).
- Query params are only those the README names (e.g. events: `event_type`, `format`, `city`, `limit`, `offset`).
- Do not add helper endpoints that "would be nice".

### 3.3 Auth store (`stores/authStore.ts`, zustand)
- State: `accessToken | null`, `user | null`.
- Persist ONLY `accessToken` in `localStorage` key `ep.access_token`.
- On app boot, if a token exists, call `GET /users/me` to hydrate `user`. If it 401s, clear the token.
- `login(email, password)` → `POST /auth/login`; `register(...)` → `POST /auth/register`. **Read the exact request body and the response shape (`AuthResponse` vs `TokenResponse`) from OpenAPI** before coding the forms; do not assume field names (e.g. whether login uses `email` and register needs `username`, `display_name`).

### 3.4 Routing (`routes/index.tsx`)
Use `createBrowserRouter`. Route guards in `routes/guards.tsx`:
- `RequireAuth` — redirects to `/login?next=...`.
- `GuestOnly` — redirects authenticated users to `/dashboard`.

Route table (these are FRONTEND routes; they are not backend routes):

| Path | Page | Guard | Primary API |
|---|---|---|---|
| `/` | Landing + public events preview | public | `GET /events` |
| `/login`, `/register` | Auth forms | GuestOnly | auth |
| `/events` | Public event discovery | public | `GET /events` |
| `/events/:eventId` | Event detail | public | `GET /events/{id}`, tracks, schedule |
| `/dashboard` | Participant dashboard | Auth | `GET /participants/me/dashboard` |
| `/my/registrations` | My registrations | Auth | `GET /participants/me/registrations` |
| `/my/events/:eventId` | My registered event detail | Auth | `GET /participants/me/events/{id}` |
| `/my/team-invitations` | Invitations inbox | Auth | `GET /participants/me/team-invitations` |
| `/my/mentor-requests` | My mentor requests | Auth | `GET /participants/me/mentor-requests` |
| `/events/:eventId/teams` | Team discovery + create | Auth | teams |
| `/teams/:teamId` | Team workspace (tabs: Overview, Board, Chat, Files, Project) | Auth | teams, tasks, messages, files, project |
| `/events/:eventId/projects` | Submitted projects gallery | public/Auth | `GET /events/{id}/projects` |
| `/events/:eventId/leaderboard` | Leaderboard | public | leaderboard |
| `/events/:eventId/schedule` | Schedule | public | schedule |
| `/events/:eventId/announcements` | Announcements feed | Auth | announcements |
| `/events/:eventId/mentor` | Mentor desk (request / mentor queue) | Auth | mentor-requests |
| `/judge/events/:eventId` | Judge workspace | Auth | judging |
| `/notifications` | Notifications | Auth | notifications |
| `/organizations` | My organizations | Auth | `GET /organizations/mine` |
| `/organizations/new` | Create org | Auth | `POST /organizations` |
| `/organizations/:orgId` | Org overview (members, events) | Auth | org endpoints |
| `/organizations/:orgId/events/new` | Create event | Auth | `POST /organizations/{id}/events` |
| `/manage/events/:eventId` | Organizer event console (tabs below) | Auth | many |
| `/sponsors` | Sponsor directory | public | `GET /sponsors` |
| `/marketplace` | Sponsorship listings | public | `GET /sponsorship-listings` |
| `/marketplace/:listingId` | Listing detail | public | `GET /sponsorship-listings/{id}` |
| `/organizations/:orgId/sponsorship` | Org sponsorship hub (listings, proposals, deals) | Auth | sponsorship |
| `/sponsorship/proposals/:proposalId` | Proposal + negotiation thread | Auth | proposals |
| `/sponsorship/deals/:dealId` | Deal + deliverables | Auth | deals |
| `*` | 404 page | public | — |

### 3.5 react-query conventions
- One hook per endpoint in `src/hooks/`, named `useEvents`, `useCreateTeam`, etc.
- Query keys are arrays starting with the domain: `['events', params]`, `['team', teamId]`, `['team', teamId, 'tasks', filters]`.
- Every mutation invalidates the exact keys it affects.
- Default `staleTime: 30_000`, `retry: 1` (never retry 4xx).

### Done when (Phase 3)
- Register → auto-login (or login) → `/dashboard` placeholder shows the real username from `GET /users/me`.
- Expired/invalid token redirects to login with a toast.
- Header shows Sign out; signing out clears cache.

---

## 4. Phase 4 — Public Discovery & Auth Screens

1. **Login / Register pages** — centered `Card` (max-w-md), forms via react-hook-form + zod. Zod rules must mirror the backend's validation as defined in OpenAPI (min/max lengths, patterns). If OpenAPI has no constraints, only require non-empty + valid email format. Display backend 409 (duplicate email/username) inline on the correct field.
2. **Events discovery (`/events`)** — grid of Event Cards (recipe 5.4). Filters: `event_type`, `format` (`online`/`offline`/`hybrid`), `city` text; `Pagination` using `limit`/`offset`. Filter state lives in the URL query string. Card fields come from `EventRead` — only render fields that exist in the schema.
3. **Event detail (`/events/:eventId`)** — header (title, organizer, format badge, dates in local time with the event timezone shown if the schema provides it), tracks list (`GET /events/{id}/tracks`), schedule preview (`GET /events/{id}/schedule`), links to Teams/Projects/Leaderboard. Primary CTA **Register** (Phase 5). Draft/private events return 404/403 for the public: show an EmptyState "This event isn't available."
4. **Sponsor directory & marketplace (read-only public views)** — built in Phase 12; leave nav links hidden until then.

### Done when
- With a seeded backend, public pages render real data and filters change the URL and results.

---

## 5. Phase 5 — Participant Registration & Dashboard

1. **Register button** states on event detail, driven by the API result, never by guessing:
   - Calls `POST /events/{id}/register` with optional `registration_data` (JSON object). If the event has no defined custom form, send nothing/`{}` per OpenAPI. Do not build a custom-question builder (no backend support).
   - Map errors: `409` already registered; `400/403/422` show the `detail` message verbatim (README says rejection reasons include: not open, closed, started, draft, previously rejected).
   - Reactivating after withdrawal uses the same endpoint.
2. **Withdraw** via `ConfirmDialog` → `POST /events/{id}/withdraw`.
3. **Dashboard (`/dashboard`)** — from `GET /participants/me/dashboard`:
   - Greeting using `display_name`.
   - Metric tiles for the five counts named in README: `total_active_registrations`, `upcoming_events_count`, `ongoing_events_count`, `completed_events_count`, `waitlisted_events_count` (mono numbers, forest color).
   - Four sections: upcoming, ongoing, completed, waitlisted (event cards with registration status badge).
   - Include pending invitation count badge only if you fetch `GET /participants/me/team-invitations` (allowed).
4. **My registrations (`/my/registrations`)** — table from `GET /participants/me/registrations` with status badges (`registered`, `approved`, `waitlisted`).
5. **My event detail (`/my/events/:eventId`)** — from `GET /participants/me/events/{id}`; show custom answers (`registration_data`) as key/value list, tracks, registration status, timestamps. A 403 means not actively registered → EmptyState + link to the public event.

### Done when
- A user can register, see it on the dashboard, withdraw, re-register (same row reactivated), and see correct error messages for closed registration.

---

## 6. Phase 6 — Teams

Backend facts to respect (from README):
- A user may have **at most one active team per event**.
- Join code is returned **once**, at creation only (`generate_join_code: true`). The UI MUST display it in a copyable "Save this code now" modal immediately after creation and warn it cannot be retrieved again. Never store it.
- Team statuses: `forming`, `active`, `submitted`, `disbanded`.
- Roles: `owner`, `lead`, `member`. Member status: `active`, `left`.

Screens (`/events/:eventId/teams`):
1. **Discovery list** — `GET /events/{id}/teams` (paginated): name, description, status badge, `member_count / max_team_size`, `available_slots`. Only registered/approved participants may call it → 403 shows "Register for this event to browse teams."
2. **Create team** modal — `POST /events/{id}/teams`: name, description, checkbox "Generate join code". On success show join-code modal (above).
3. **Join with code** modal on a team card — `POST /teams/{id}/join` with the plaintext code. Show backend error text for: wrong code, full team, already in another team, disbanded/submitted.
4. **"My team in this event" detection — KNOWN API GAP.** There is no "get my team" endpoint. Implement helper `useMyTeamForEvent(eventId)`: fetch the team list, then for each team call `GET /teams/{id}`; the team where `members` is **not null** is the user's team (README: non-members get `members: null`). Cap concurrency at 5, cache aggressively, and add `// TODO(BACKEND-QUESTION): replace with a dedicated endpoint` plus an entry in `docs/OPEN_QUESTIONS.md`. Do not invent an endpoint.
5. **Invitations inbox (`/my/team-invitations`)** — `GET /participants/me/team-invitations`; Accept → `POST /team-invitations/{id}/accept`; Reject → `POST /team-invitations/{id}/reject`.
6. **Team overview tab (`/teams/:teamId`)** — roster from `GET /teams/{id}` / `GET /teams/{id}/members`. Role-aware actions (show a button only if the current user's role permits it per README):
   - Owner/Lead: send invite by email (`POST /teams/{id}/invitations`).
   - Owner: remove member (`DELETE .../members/{user_id}`), set role lead/member (`PATCH .../members/{user_id}/role`), transfer ownership, disband.
   - Non-owner: Leave (`POST /teams/{id}/leave`).
   - Show backend rejection messages verbatim.

### Done when
- Two accounts can: create team → copy code → second account joins → invite flows work → ownership transfer leaves exactly one owner → disband removes access.

---

## 7. Phase 7 — Team Collaboration (Board, Chat, Files, WebSocket)

Tab layout inside `/teams/:teamId`: **Overview | Board | Chat | Files | Project**.

### 7.1 Task Board (`Board` tab)
- Four columns by status: `todo`, `in_progress`, `review`, `done`. Priorities: `low`, `medium`, `high`, `urgent` (priority shown as `Badge`).
- Data: `GET /teams/{id}/tasks` with filters `status`, `priority`, `assignee_id`, `limit`, `offset`. Within columns, order by `position` ascending (API already returns this order).
- Create: `POST /teams/{id}/tasks` (`title`, `description`, `priority`, `due_at`, `status`, `position`).
- Move between columns: `PATCH .../tasks/{task_id}` with `status`. Use simple buttons/menu ("Move to…") first; drag-and-drop is OPTIONAL and only after all else works (use native HTML5 drag events; no new dependency).
- Edit details/priority: only creator, owner, or lead (hide controls otherwise; also handle 403).
- Assignees: `PUT .../tasks/{task_id}/assignees` with `{ user_ids: [...] }`. Picker lists active team members only (from roster). Empty array clears.
- Delete: `DELETE` (soft delete) behind `ConfirmDialog`.
- Do NOT show `completed_at` as editable; display only.

### 7.2 Chat (`Chat` tab)
- History: `GET /teams/{id}/messages` (limit/offset, chronological). Load newest page first and add "Load earlier" using `offset` — **verify the ordering/paging semantics against OpenAPI description and one real call before coding**; if ambiguous, add to OPEN_QUESTIONS and implement simple "Load more".
- Send: `POST /teams/{id}/messages` with `body` and/or `attachment_ids`. Require at least one.
- Edit own message: `PATCH .../messages/{message_id}`; delete: `DELETE` (own, or owner/lead). Deleted messages render as "Message deleted" (README: text is masked).
- Attachments render using safe metadata only (never filesystem paths). Download via authenticated request (see 7.3).

### 7.3 Files (`Files` tab and chat attachments)
- Upload: `POST /teams/{id}/files`, `multipart/form-data`. Client-side pre-validation mirrors the README: images `JPEG, PNG, WebP` ≤ **10 MB**; videos `MP4, WebM, MOV` ≤ **100 MB**. Still handle server rejections.
- Show upload progress using axios `onUploadProgress`.
- Flow for attachments: upload file → receive file id → pass id in `attachment_ids` of the message. Read the upload response schema from OpenAPI (`StoredFileRead`).
- **There is no "list team files" endpoint.** The Files tab therefore ONLY: (a) provides an upload control, (b) lists files discovered from chat message attachments. Do not invent a listing call.
- Download: `GET /teams/{id}/files/{file_id}` requires the Bearer header, so a plain `<a href>` will fail. Fetch with axios as `blob`, then create an object URL (revoke after use). Image previews use the same blob approach.

### 7.4 WebSocket (`lib/ws.ts`)
Protocol (from README, follow exactly):
1. Open `ws(s)://<current host>/api/v1/teams/{team_id}/ws` (derive from `window.location`; the Vite proxy handles `ws: true`).
2. On `open`, immediately send `{"type":"authenticate","access_token":"<JWT>"}`.
3. Wait for `{"type":"authenticated","user_id":...,"team_id":...}`. Until received, do not treat the socket as ready.
4. Send `{"type":"ping"}` every 25 s; expect `{"type":"pong"}`.
5. Handle broadcast `type` values — ONLY these: `message.created`, `message.updated`, `message.deleted`, `task.created`, `task.updated`, `task.deleted`, `task.assignees.updated`.
6. **Do not assume the payload shape.** On receiving an event, safest implementation: invalidate the matching react-query keys (`['team', id, 'messages']` or `['team', id, 'tasks']`) so data refetches from REST. Only optimistically patch from the payload after inspecting a real payload and documenting it in `docs/OPEN_QUESTIONS.md`.
7. Close code **1008** (policy violation) = auth failure or removed from team → stop reconnecting, show a banner "You no longer have access to this team's live updates", and refetch team detail (likely 403 → redirect to teams list).
8. Other closes → reconnect with exponential backoff (1s, 2s, 4s … max 30s). Cap at 8 attempts, then show a "Reconnect" button.
9. Show connection state with `StatusDot` (green pulsing = live, taupe = offline).

### Done when
- Two browsers on one team: creating a task or message in one appears in the other within ~1 s without refresh.
- Removing a member closes their socket and the UI reacts.
- A 100 MB+ video and a 12 MB image are rejected client-side with clear messages.

---

## 8. Phase 8 — Projects & Submissions (participant side)

Tab **Project** in `/teams/:teamId`:
- `GET /teams/{id}/project` → project + latest submission + full history. No project yet → EmptyState with "Create project" (owner/lead only) → `POST /events/{event_id}/projects` (fields incl. optional track; HTTP(S) links only — validate URL protocol client-side too).
- **Submission versions:** list history with version number and `draft`/`submitted` badge.
- Edit a draft: `PATCH /projects/{pid}/submissions/{sid}`. Submitted versions are read-only (409 otherwise) — render fields disabled.
- Create next version: `POST /projects/{pid}/submissions` — only enabled when the latest version is `submitted`.
- Submit: `POST /projects/{pid}/submissions/{sid}/submit`. Before calling, show a checklist derived from README rules (title, abstract, valid HTTP(S) repo URL, team meets event `min_team_size`, before event deadline) and show server errors verbatim. Warn: "Submitting makes this version immutable and blocks new members from joining your team."
- Public gallery `/events/:eventId/projects` — `GET /events/{id}/projects` (paginated), cards only for submitted projects.

### Done when
- Draft → edit → submit → immutable; new version gets copied data as a draft.

---

## 9. Phase 9 — Judging & Leaderboard

### 9.1 Judge workspace (`/judge/events/:eventId`)
- Criteria: `GET /events/{id}/judging-criteria`.
- Submissions to judge: `GET /events/{id}/projects` then submissions via `GET /projects/{pid}/submissions` (judges see submitted versions only).
- For a submission: `GET /submissions/{sid}/evaluations/me`; if none → "Start evaluation" → `POST /submissions/{sid}/evaluations`.
- Scoring form: one numeric input per criterion with range `[0, max_score]` shown beside the field (e.g. "0–10") and weight shown as mono badge. Save draft: `PUT /evaluations/{eid}` (partial allowed). Submit: `POST /evaluations/{eid}/submit` (all active criteria required). After submit → read-only (409 on edit).
- Conflict-of-interest and superseded-version errors: show server `detail`.
- Judges have no "my judging events" endpoint → reach this page via direct link from the Event detail page ("Judge workspace" link shown to everyone logged in; the page itself shows an EmptyState on 403). Record in OPEN_QUESTIONS.

### 9.2 Leaderboard (`/events/:eventId/leaderboard`)
- `GET /events/{id}/leaderboard`. Table recipe 5.5.
- Rank column: `#1`… from API `rank`; `rank = null` and `final_score = null` render as "—" with a "Not yet judged" neutral badge. **Never compute or fabricate scores client-side.**
- Medal badges (Gold/Silver/Bronze) only for ranks 1/2/3 using the DESIGN_SYSTEM badge recipes. Ties share a rank number (the API already assigns it).
- Highlight the row of the current user's team using the amber-tint row style (recipe 5.5), only if the team can be identified (via `useMyTeamForEvent`).
- Non-organizers may get a 403 before the event is completed → EmptyState "Leaderboard is published after the event completes."
- Include a one-line footnote describing the formula exactly as in README (normalized score → weighted by criterion weight → averaged across judges).

---

## 10. Phase 10 — Event Operations (participant-facing)

1. **Schedule (`/events/:eventId/schedule`)** — `GET /events/{id}/schedule`, group by local date, chronological. Item badges by `item_type` (use values from OpenAPI). Show venue and meeting URL (open in new tab with `rel="noopener noreferrer"`; only render if protocol is http/https). Cancelled items appear only for organizers (`include_cancelled=true`).
2. **Announcements (`/events/:eventId/announcements`)** — `GET /events/{id}/announcements`; show audience badge (`all/participants/judges/mentors/team`).
3. **Notifications** —
   - Header bell: poll `GET /notifications/me/unread-count` every 30 s (no WebSocket exists for notifications; do not build one). Pause polling when the tab is hidden.
   - Page `/notifications`: `GET /notifications/me` (limit/offset, `unread_only` toggle); mark one read `PATCH /notifications/{id}/read`; mark all `POST /notifications/me/read-all`.
   - Deep-link a notification only using context reference fields present in `NotificationRead` (read the schema); if the target cannot be determined, show it non-clickable.
4. **Mentor desk (`/events/:eventId/mentor`)**
   - Participant: create request (`topic`, `description`, `priority` = `low|medium|high|urgent`, optional `team_id` chosen from user's own team only); view own list (`GET /participants/me/mentor-requests`); cancel while `pending` (`POST /mentor-requests/{id}/cancel`).
   - Mentor/Organizer view: `GET /events/{id}/mentor-requests` (403 for others → hide the tab/EmptyState). Actions: claim/assign (`PATCH /mentor-requests/{id}/assign` with `mentor_user_id`), advance status (`PATCH .../status`). Only show valid transitions per README: `assigned → in_progress → resolved`, `pending → rejected`. Resolved accepts optional `resolution_note`.
   - Status badges for: `pending, assigned, in_progress, resolved, cancelled, rejected`.

---

## 11. Phase 11 — Organizations & Organizer Console

### 11.1 Organizations
- `/organizations` — `GET /organizations/mine` (show `my_role`, `my_status`, `my_joined_at`). Pending invitations (`my_status = invited`) show Accept/Reject (`.../members/invitations/{membership_id}/accept|reject`).
- `/organizations/new` — `POST /organizations`. `type` ∈ `organizer | sponsor | both | other`; slug globally unique (409 → inline error).
- `/organizations/:orgId` — details (`GET`), edit (owner/admin `PATCH`), members (`GET .../members`), invite by email as `admin|member` (`POST .../members/invitations`), remove member (rules: admins can't remove owners; last owner can't be removed — rely on server errors).
- Org events list `GET /organizations/{id}/events` (includes drafts) with "Create event" → `POST /organizations/{id}/events` (owner/admin).

### 11.2 Event form & lifecycle
- Create/Edit form fields come from `EventCreate`/`EventUpdate` in OpenAPI. Client validation per README: `min_team_size >= 1`, `max_team_size >= min_team_size`, format ∈ `online|offline|hybrid`.
- Publish: `POST /events/{id}/publish` — the server validates timing, timezone, format, venue; show its error message(s) verbatim. Cancel: `POST /events/{id}/cancel` behind `ConfirmDialog` (cancelled events cannot be re-published).

### 11.3 Organizer event console (`/manage/events/:eventId`)
Tabs (all organizer-only; 403 → EmptyState "Organizer access required"):
1. **Overview** — event details + publish/cancel.
2. **Tracks** — CRUD (`POST/GET /events/{id}/tracks`, `PATCH/DELETE /tracks/{id}`).
3. **Participants** — `GET /events/{id}/participants` with status filter, search (username/email), pagination; status update `PATCH .../participants/{user_id}` to `approved|waitlisted|rejected`.
4. **Check-in** — `GET /events/{id}/check-ins` (filter `checked_in`, search, pagination); summary tiles from `GET .../check-ins/summary` (`total_eligible_participants`, `total_checked_in`, `attendance_percentage`, `last_check_in_at`); check in `POST .../participants/{user_id}/check-in`; undo `DELETE` same path. Duplicate check-in returns 400 → show message.
5. **Schedule** — CRUD (`POST /events/{id}/schedule`, `PATCH /schedule/{id}`, `DELETE /schedule/{id}` = cancel). Validate `ends_at >= starts_at`.
6. **Announcements** — create draft (`target_audience`, `target_team_id` only when audience = `team`), edit draft, **Publish** (confirm: "Notifies recipients"), **Withdraw**. Published items are read-only.
7. **Judges & Criteria** — add judge (`POST /events/{id}/judges`; read request body from OpenAPI), list, remove; criteria CRUD (`max_score > 0`, `weight > 0`); show a banner and disable edit/delete when the server returns "evaluations have begun".
8. **Mentor requests** — same list as 10.4 with organizer actions.
9. **Leaderboard** — link to the public leaderboard page.

Date inputs: use `<input type="datetime-local">`, convert to UTC ISO strings on submit, render in local time on display. Never send naive local strings.

---

## 12. Phase 12 — Sponsorship Marketplace

Read `README.md` Phase 8 section carefully; business rules are strict.

1. **Public**
   - `/sponsors` — `GET /sponsors` (search, `currency`, `min_budget`, `max_budget`, pagination).
   - `/marketplace` — `GET /sponsorship-listings` filters: `listing_type` (`seeking_sponsors|offering_sponsorship`), `event_type`, `city`, `organization_name`, `min_budget`, `max_budget`, `currency`.
   - `/marketplace/:listingId` — detail + packages + public event info. Unauthorized/draft → 404 → EmptyState.
2. **Org sponsorship hub (`/organizations/:orgId/sponsorship`)** with tabs: **Listings | Proposals | Deals**.
   - Listings: `GET /organizations/{id}/sponsorship-listings`; create (`POST`, owner/admin) — form must enforce:
     - `seeking_sponsors`: org type must be `organizer` or `both`; `event_id` REQUIRED and must be one of the org's events (dropdown from `GET /organizations/{id}/events`).
     - `offering_sponsorship`: org type `sponsor` or `both`; `event_id` optional.
     - Budgets ≥ 0 and `max_budget >= min_budget`.
     - Disable the unavailable `listing_type` option with a tooltip explaining why, based on the org's `type`.
   - Draft-only edit (`PATCH`); Publish; Close (all with confirm dialogs where destructive).
   - Packages: create/list/update/delete. If server rejects edits/deletes because a proposal references the package (400), show its message.
   - Proposals tab: `GET /organizations/{id}/sponsorship-proposals` with `direction` (`incoming|outgoing`) and `status` filters.
   - Deals tab: `GET /organizations/{id}/sponsorship-deals` with deliverable completion metrics.
3. **Submit proposal** (from listing detail, authenticated users with owner/admin of a proposing org): `POST /sponsorship-listings/{id}/proposals`. Fields from OpenAPI (`target_event_id`, `package_id`, `proposed_amount`, `currency`, `proposed_benefits`, `message`). Proposer organization is auto-identified by the server — if the schema requires an org id field, use it; otherwise do not send one. 409 duplicate active proposal → clear message.
4. **Proposal page (`/sponsorship/proposals/:proposalId`)** — `GET` returns terms + chronological negotiation history. Only the two organizations' members can view (403 otherwise).
   - Thread shows `message` vs `counter_offer` entries (amount, currency, package, benefits for counteroffers).
   - Post message/counteroffer (`POST .../messages`) only while `pending|negotiating`.
   - **Accept / Reject** buttons: show only to the receiving party (README rule: no counteroffer → listing owner org; with counteroffer → the party receiving the latest counteroffer). Compute from thread data (`author_organization_id` of last `counter_offer` vs. the user's org). If it cannot be determined confidently, show both buttons and rely on the server's 403, plus a TODO in OPEN_QUESTIONS.
   - **Withdraw**: only the original proposer while `pending|negotiating`.
   - Accept → confirm dialog: "Creates a binding deal snapshot; decrements package slots." On success navigate to the deal.
5. **Deal page (`/sponsorship/deals/:dealId`)** — snapshot (agreed amount, currency, terms, dates, status) + deliverables.
   - Status change `PATCH .../status` → `completed|cancelled` only from `active` (confirm; irreversible).
   - Deliverables: create (`responsible_organization_id` ∈ the two deal parties — dropdown of exactly those two orgs), list, update (`status`: `pending|in_progress|completed|rejected|cancelled`, `evidence_url` must be http/https — validate client-side). `completed_at` is display-only.

---

## 13. Cross-Cutting Requirements

### 13.1 Every data view must handle 4 states
Loading (Skeleton), Error (card with message + "Retry"), Empty (EmptyState), Success. No view may render `undefined`.

### 13.2 Permissions in UI
- The server is the authority. UI hides controls by role when the role is known, but ALWAYS handles 401/403/404/409 gracefully and shows `detail` text.
- 403 on a page → "You don't have access" EmptyState with a back link; never a blank screen.

### 13.3 Dates & numbers
- API timestamps are UTC. Use `lib/format.ts`: `formatDateTime`, `formatDate`, `formatRelative` (date-fns). Render monospace for timestamps/metrics per DESIGN_SYSTEM Section 4.
- Currency: `Intl.NumberFormat` with the record's `currency` code; never hardcode `$`.

### 13.4 Security
- Never render API strings with `dangerouslySetInnerHTML`.
- External links: only http/https, `target="_blank" rel="noopener noreferrer"`.
- Never log tokens. Never put the token in URLs except the WebSocket first-message (required by README protocol — NOT in the query string).

### 13.5 Accessibility baseline
- Visible focus ring (`focus:ring-1 focus:ring-[#2F5B3C]` per recipes), labels bound to inputs, modals trap focus, buttons have text or `aria-label`, color is never the only status signal (badges contain text).

### 13.6 Responsiveness
Mobile-first; header collapses nav at `<md`; tables scroll horizontally (`overflow-x-auto` as in recipe 5.5); board columns stack on mobile.

### 13.7 Copy tone
Direct, professional, no emoji except the medal emoji in medal badges (as in the recipes). Use real domain terms: "hackathon", "team", "submission", "judge", "sponsor".

---

## 14. Testing (Vitest + RTL + MSW)

Minimum required tests (create in `src/**/__tests__/`):
1. Auth store: login stores token; 401 interceptor clears it.
2. `ErrorToMessage` handles string `detail` and 422 array `detail`.
3. `Button`, `Badge`, `Modal` render and obey variants.
4. Events discovery: filters update the URL and request params.
5. Register button: handles 200, 409, 400.
6. Join-code modal appears once after team creation and shows the code.
7. WebSocket client: sends authenticate first, handles 1008 without reconnect, backs off on other closes (mock `WebSocket`).
8. Leaderboard renders `rank = null` as "—" and does not compute scores.
9. Proposal page shows Accept/Reject only for the receiving org (mock thread data).

Use MSW handlers whose response shapes are derived from the generated types.

---

## 15. Docs to produce

- `frontend/README.md`: setup (`npm i`, run backend first, `npm run api:types`, `npm run dev`), env vars, folder map, how to regenerate types.
- `frontend/docs/OPEN_QUESTIONS.md`: every `TODO(BACKEND-QUESTION)` item. Pre-fill with these known gaps:
  1. No "get my team for event" endpoint (workaround in 6.4).
  2. No team files listing endpoint.
  3. No "events I judge/mentor" endpoint (judge/mentor entry is via direct links).
  4. No token refresh; sessions end after 30 min.
  5. No CORS documented (dev proxy used; production needs same-origin reverse proxy or CORS middleware).
  6. WebSocket event payload shapes undocumented (UI refetches via REST).
  7. Notification deep-link targets depend on `NotificationRead` reference fields.
  8. No global search endpoint (header has no search).

---

## 16. Final Acceptance Checklist

- [ ] `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` all pass.
- [ ] No endpoint is called that is absent from `README.md` Section 8 (grep `src/api/endpoints` against the README list).
- [ ] No hand-written API response interfaces (everything from `src/api/types.ts`).
- [ ] `grep -rn "rounded-full" src/` only matches `StatusDot` and `Avatar`.
- [ ] No colors outside the design palette; no gradients; fonts are Plus Jakarta Sans + JetBrains Mono.
- [ ] Every list has loading, error, and empty states.
- [ ] End-to-end manual run-through works with a fresh DB: register organizer → create org → create + publish event → register participant → approve → create team → chat/tasks via two browsers → create project → submit → add judge + criteria → evaluate → complete event → leaderboard → sponsorship listing → proposal → counteroffer → accept → deal → deliverable completed.
- [ ] `docs/OPEN_QUESTIONS.md` lists every assumption you had to avoid.
