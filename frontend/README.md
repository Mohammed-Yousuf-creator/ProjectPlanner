# Frontend — Event & Hackathon Management Platform

React 19 + TypeScript + Vite single-page app for the FastAPI backend in `../backend`.
Styling follows `../DESIGN_SYSTEM.md` ("Editorial Warm Stone"); the build order and
route table come from `../PLAN.md`.

- **190** TypeScript modules · **69** page modules · **25** endpoint modules · **22** hooks
- **42** UI/domain/layout components, one component per file
- Type-safe API layer generated from the backend's OpenAPI schema

---

## 1. Quick start

The backend must be running first — the dev server proxies to it and there is no
mock data layer.

```bash
# terminal 1 — backend (see ../backend/README.md)
cd ../backend
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000

# terminal 2 — frontend
cd frontend
npm install
npm run dev            # http://localhost:5173
```

Then open http://localhost:5173, register an account, and you land on `/dashboard`.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on `0.0.0.0:5173` with the `/api` proxy (HTTP + WebSocket). |
| `npm run build` | `tsc -b` (project references, no emit) then `vite build` into `dist/`. |
| `npm run preview` | Serves the production build locally. |
| `npm run typecheck` | Type-checks `src/` only, faster than a full build. |
| `npm run lint` | ESLint 9 flat config (`eslint.config.js`). |
| `npm run test` | Vitest + React Testing Library (jsdom). |
| `npm run test:watch` | Same, in watch mode. |
| `npm run api:types` | Regenerates `src/api/schema.d.ts` from a running backend. |
| `npm run format` | Prettier over `src/**/*.{ts,tsx,css}`. |

---

## 2. Environment variables

Copy `.env.example` to `.env` if you need to change defaults. Everything is
optional; the defaults work against a local backend.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api/v1` | Browser-facing API prefix. Keep it relative so requests stay same-origin. |
| `VITE_API_PROXY_TARGET` | `http://127.0.0.1:8000` | Where the Vite dev proxy forwards `/api`. Read by `vite.config.ts` (Node side only). |

> The backend ships **no CORS middleware**. In development the Vite proxy keeps the
> browser on one origin, which is why `VITE_API_BASE_URL` must stay relative. In
> production, serve `dist/` behind the same origin as the API (reverse proxy) or
> add CORS to the backend. See `docs/OPEN_QUESTIONS.md` §5.

---

## 3. Folder map

```
frontend/
├─ index.html                  Vite entry; loads fonts + favicon
├─ vite.config.ts              alias @→src, dev proxy (/api, ws:true), vitest config
├─ tailwind.config.ts          design tokens: canvas/fill/line/ink/taupe/forest/rust
├─ eslint.config.js            flat config (ESLint 9)
└─ src/
   ├─ main.tsx                 React root
   ├─ App.tsx                  QueryClient + ToastProvider + auth bootstrap + RouterProvider
   ├─ index.css                Tailwind layers, focus-visible ring, animation keyframes
   ├─ api/
   │  ├─ client.ts             axios instance, in-memory token, 401 handler, cleanParams
   │  ├─ schema.d.ts           GENERATED from OpenAPI — do not hand-edit
   │  ├─ types.ts              curated re-exports from schema.d.ts
   │  └─ endpoints/            25 modules, one per backend route group
   ├─ stores/
   │  └─ authStore.ts          zustand: accessToken (localStorage), user, bootstrapping
   ├─ hooks/                   22 query/mutation modules, one per resource
   ├─ lib/
   │  ├─ cn.ts                 clsx wrapper
   │  ├─ errors.ts             toApiError(): FastAPI string + 422 array details
   │  ├─ format.ts             dates, relative time, bytes, enums, scores, datetime-local
   │  ├─ constants.ts          enum options mirrored from the backend
   │  ├─ permissions.ts        canManageTeam / canManageOrganization / …
   │  ├─ registration.ts       client mirror of the server's registration rules
   │  ├─ projectReadiness.ts   pre-flight mirror of the server's submit validations
   │  └─ ws.ts                 TeamSocket: authenticate-first, 1008 = no reconnect
   ├─ components/
   │  ├─ ui/                   21 primitives + barrel (Button, Card, Modal, DataTable, …)
   │  ├─ layout/               AppShell, Header, Footer, NotificationBell, UserMenu, ContextSidebar
   │  └─ domain/               12 shared domain components (EventCard, RegistrationButton, …)
   ├─ pages/                   one folder per feature area, one component per file
   │  ├─ auth/                 LoginPage, RegisterPage
   │  ├─ landing/              LandingPage
   │  ├─ events/               EventsPage, EventDetailPage, … (12 files)
   │  ├─ dashboard/            DashboardPage + widgets
   │  ├─ participant/          MyRegistrationsPage, MyEventDetailPage, …
   │  ├─ team/                 TeamWorkspacePage + one file per tab/modal (13 files)
   │  ├─ notifications/        NotificationsPage
   │  ├─ organizations/        OrganizationsPage, OrganizationDetailPage, CreateEventPage, …
   │  ├─ manage/               ManageEventPage + one file per organizer tab (9 files)
   │  ├─ judge/                JudgeWorkspacePage, EvaluationPanel
   │  ├─ marketplace/          MarketplacePage, ListingDetailPage, ProposalPage, DealPage, …
   │  ├─ sponsors/             SponsorsPage
   │  └─ sponsorship/          OrgSponsorshipPage + listings/proposals/deals tabs
   ├─ routes/
   │  ├─ index.tsx             the authoritative route table
   │  ├─ guards.tsx            RequireAuth, GuestOnly
   │  ├─ lazyPage.tsx          route-level code splitting helper
   │  ├─ RouteFallback.tsx     Suspense fallback
   │  └─ NotFoundPage.tsx
   └─ test/                    setup.ts, renderWithProviders.tsx, factories.ts
```

### Conventions

- **One component per file**, grouped by similarity. A page's sub-views live next to it
  (`pages/manage/ManageTracksTab.tsx`), not in a shared dump.
- **No hand-written API shapes.** Every request/response type comes from
  `src/api/types.ts`, which re-exports `schema.d.ts`.
- **No business rules duplicated in components.** Reusable rules live in `src/lib/`
  (`registration.ts`, `permissions.ts`, `projectReadiness.ts`) and are unit-testable.
- **The server is authoritative.** Client-side validation exists to explain state, never
  to replace a server check; every server error is rendered verbatim.
- **Design tokens only.** No raw hex values in components — use `bg-canvas`,
  `text-ink`, `border-line`, `text-forest`, `text-rust`, etc.

---

## 4. API layer

`src/api/client.ts` is a single axios instance:

- Base URL is relative (`/api/v1`), so the dev proxy and a production reverse proxy both work.
- The access token lives **in memory** and is pushed in by `authStore`; only the token
  string is persisted (`localStorage['ep.access_token']`).
- A `401` on anything other than `/auth/login` or `/auth/register` invokes the
  registered unauthorized handler, which clears the session and redirects to
  `/login?next=…&expired=1`.
- `cleanParams()` strips `undefined`/`''` so FastAPI's typed query params never receive
  an empty string.

### Regenerating types

```bash
# backend must be running on :8000
npm run api:types
```

This rewrites `src/api/schema.d.ts` (ignored by ESLint because it is generated). If the
backend changes a field name, `tsc -b` will fail in the files that consume it — that is
intentional. Add any new names you use to `src/api/types.ts`.

---

## 5. Data fetching

- **TanStack Query 5.** Each resource has a `*Keys` object so invalidation is
  centralised (`eventKeys`, `teamKeys`, `judgingKeys`, `sponsorKeys`, …).
- **Route-level code splitting.** `routes/index.tsx` wraps each page in
  `lazyPage(() => import(...), 'PageName')`, so the entry chunk (~444 kB, 143 kB gzip)
  only holds the shell, guards, and shared UI.
- **No polling.** The only live channel is the team WebSocket, which invalidates two
  query keys and lets REST refetch.
- **Optimistic updates are not used.** Every mutation invalidates and re-reads, because
  the backend enforces state machines (publish, accept, submit) that the client cannot
  reproduce safely.

### WebSocket

`src/lib/ws.ts` connects to `/api/v1/teams/{team_id}/ws` through the same proxy
(`ws: true`), authenticates with `{"type":"authenticate","access_token":"…"}` as the
**first frame** (never in the URL), pings every 25 s, and:

- close code `1008` → **no reconnect**, fires `onAccessRevoked`
- any other close → exponential backoff `1s, 2s, 4s …` capped at 30 s, max 8 attempts
- `reconnectNow()` is exposed for the manual "Reconnect" button

Payloads are treated as opaque: only the event *type* is forwarded, and the UI refetches
over REST. See `docs/OPEN_QUESTIONS.md` §6.

---

## 6. Authorisation model

Role checks are computed from data the API already returns, never from a client claim:

| Capability | Source of truth |
| --- | --- |
| Organization owner/admin | `GET /organizations/mine` → `my_role` |
| Team owner/lead | `TeamRead.members[].role` for the current user |
| Task edit rights | team role + task author (`lib/permissions.ts`) |
| Judge access | presence in `GET /events/{id}/judges`; 403s rendered as explanatory states |
| Leaderboard visibility | 403 until the event is `completed`, except org owner/admin |

Route guards (`RequireAuth`, `GuestOnly`) only handle *signed in vs. signed out*.
Every finer-grained check is also enforced server-side, so a stale client cache can
never grant access — it can only produce a 403 that is rendered as an empty state.

---

## 7. Testing

```bash
npm run test
```

**10 files, 95 tests.** Vitest + jsdom + React Testing Library.
`src/test/renderWithProviders.tsx` mounts any
component inside the same providers the real app uses (react-query + toasts + router),
and `src/test/factories.ts` provides typed fixtures whose timing defaults are relative
to *now* so they never go stale.

Coverage maps to `PLAN.md` §14:

| Test file | Requirement |
| --- | --- |
| `stores/__tests__/authStore.test.ts` | token persistence, 401 clears the session, login 401 does not |
| `lib/__tests__/errors.test.ts` | string `detail`, 422 array `detail`, network/timeout branches |
| `components/ui/__tests__/primitives.test.tsx` | Button/Badge/Modal variants, ESC + dismissible behaviour |
| `pages/events/__tests__/EventsPage.test.tsx` | filters reach both the URL and the request params |
| `components/domain/__tests__/RegistrationButton.test.tsx` | success, 409, 400, rejected, not-yet-open |
| `components/domain/__tests__/JoinCodeModal.test.tsx` | one-time code shown, copyable, not accidentally dismissible |
| `lib/__tests__/ws.test.ts` | authenticate-first, no reconnect on 1008, exponential backoff |
| `pages/events/__tests__/EventLeaderboardPage.test.tsx` | `rank: null` → "—", score printed verbatim |
| `pages/marketplace/__tests__/ProposalPage.test.tsx` | decisions offered while open, hidden once closed |
| `test/smoke.test.tsx` | **all 28 routes** mount to a stable frame (no crash, no stuck skeleton) |

API calls are mocked at the `src/api/endpoints/*` boundary with `vi.mock` for the
targeted tests, and at the axios adapter for the route smoke test, so tests exercise real
component logic without network access.

`src/test/smoke.test.tsx` is the safety net for the whole route table: it walks the real
`router.routes`, replaces the axios adapter with a path-aware stub, and asserts every page
leaves its skeleton for content, an empty state, or an error state. Adding a page that
crashes on first render fails this test immediately.

---

## 8. Accessibility & design-system compliance

- Every interactive primitive has a visible `focus-visible` ring (`src/index.css`).
- Modals trap focus, close on `ESC`, lock background scroll, and restore focus on close.
- `Modal`/`ConfirmDialog` accept `dismissible={false}` for irreversible or one-time
  content (the join code).
- Radius rules from `DESIGN_SYSTEM.md` §3 are enforced by the primitives: cards
  `rounded-2xl`, buttons/inputs `rounded-xl`, badges `rounded-lg`; `rounded-full` is
  used only for status dots and avatars.
- Tables use real `<table>` semantics via `DataTable` with `scope="col"` headers.
- Status text is both colour-coded and labelled, so it survives grayscale.

---

## 9. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `Cannot reach the server` on every page | Backend is not running on `:8000`, or `VITE_API_PROXY_TARGET` is wrong. |
| Everything 404s under `/api` | You opened the built `dist/` with a static server that does not proxy `/api`. |
| Redirected to `/login?expired=1` after 30 minutes | Expected — there is no refresh token. Sign in again. |
| WebSocket reconnects in a loop | Token is missing/expired; `1008` stops retries once the server actually rejects it. |
| Types reference a field the backend does not send | Run `npm run api:types` against the current backend, then `npm run typecheck`. |
| `npm run build` fails on `vite.config.ts` | The config is type-checked by `tsconfig.node.json`; keep `test` config inside `defineConfig` from `vitest/config`. |

Known backend gaps and the workarounds this app uses: see **`docs/OPEN_QUESTIONS.md`**.
The summary for backend owners is **`../Backend_missing.md`**.
