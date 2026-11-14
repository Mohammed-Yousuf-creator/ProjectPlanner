# Open questions / backend gaps

Everything here is a **workaround already implemented in this frontend**, listed so the
backend team can remove the workaround later. Each entry names the exact file that would
change. Backend owners should read `../../Backend_missing.md`, which expands the first
entries into step-by-step implementation guides.

---

## 1. No "get my team for an event" endpoint

**Symptom.** There is no way to ask "which team in event X am I on?" in a single request.

**Workaround.** `src/hooks/useMyTeamForEvent.ts` lists the event's teams
(`GET /events/{id}/teams`) and probes `GET /teams/{team_id}` with a concurrency cap of 5
until it finds a team whose `members[]` contains the current user. Results are cached for
60 s.

**Cost.** For an event with hundreds of teams this is dozens of requests per cold load.

**Proposal.** `GET /events/{event_id}/my-team` → `TeamRead | 404`. Then
`useMyTeamForEvent` becomes a single `useQuery`, and the probe code (plus its concurrency
plumbing) is deleted.

**Files affected.** `src/hooks/useMyTeamForEvent.ts`, `src/pages/events/EventDetailPage.tsx`,
`src/pages/events/EventLeaderboardPage.tsx`.

---

## 2. No endpoint to list a team's files

**Symptom.** Files are uploaded to `POST /teams/{id}/files` and come back attached to
messages as `StoredFileRead[]`, but there is no `GET /teams/{id}/files`.

**Workaround.** `src/pages/team/TeamFilesTab.tsx` derives a file list from the last 100
chat messages and states this in the UI ("files shared in chat").

**Cost.** Files attached to older messages, or attached to a task, never appear.

**Proposal.** `GET /teams/{team_id}/files?limit&offset` → `StoredFileRead[]`, plus
`uploaded_by` and `message_id` so the UI can group by uploader. The tab then becomes a
plain paginated query; the derivation logic is deleted.

**Files affected.** `src/pages/team/TeamFilesTab.tsx`, `src/hooks/useTeamFiles.ts`.

---

## 3. No "events I judge / mentor" endpoint

**Symptom.** A judge or mentor cannot discover their own events from the API.

**Workaround.** `/judge/events/{eventId}` and `/events/{eventId}/mentor` are reachable
only by direct link (from `ManageOverviewTab`, the event page's workspace nav, or a
notification deep-link). Both pages handle a 403 by explaining that access is required
rather than showing an error.

**Proposal.** `GET /users/me/judging-events` and `GET /users/me/mentoring-events` →
`EventRead[]`, and a "Judging" section on `/dashboard`. Both pages then get a real entry
point.

**Files affected.** `src/pages/judge/JudgeWorkspacePage.tsx`,
`src/pages/events/EventMentorPage.tsx`, `src/pages/dashboard/DashboardPage.tsx`.

---

## 4. No token refresh

**Symptom.** The access token expires after 30 minutes with no refresh endpoint.

**Workaround.** `src/api/client.ts` intercepts 401 (excluding `/auth/login` and
`/auth/register`), calls the registered unauthorized handler, and redirects to
`/login?next=<path>&expired=1`. Unsaved form state is lost.

**Proposal.** `POST /auth/refresh` accepting the current access token and returning a new
one, plus a rotating refresh token in an `HttpOnly` cookie. The interceptor becomes a
single-flight refresh-and-retry queue; the redirect only happens if the refresh fails.

**Files affected.** `src/api/client.ts`, `src/stores/authStore.ts`, `src/App.tsx`.

---

## 5. No CORS middleware

**Symptom.** The backend sends no `Access-Control-Allow-*` headers, so a browser on a
different origin cannot call it.

**Workaround.** `vite.config.ts` proxies `/api` to `http://127.0.0.1:8000` (with
`ws: true` for the team socket), keeping every browser request same-origin. The client
base URL is therefore relative (`/api/v1`), never absolute.

**Proposal.** For local demos, add `CORSMiddleware` with an explicit origin allowlist
environment variable. For production, serve `dist/` from the same origin behind a
reverse proxy — that is strictly safer than widening CORS, since the token lives in
`localStorage`.

**Files affected.** none in the frontend; `VITE_API_BASE_URL` would become absolute only
if a separate API host is introduced.

---

## 6. WebSocket payload shapes are undocumented

**Symptom.** `backend/README.md` documents the frame *types*
(`message.created`, `task.updated`, …) and the authenticate handshake, but not the
payload bodies.

**Workaround.** `src/lib/ws.ts` parses only `type` and treats the rest as opaque.
`useTeamSocket` translates two types into react-query invalidations (`messages`, `tasks`)
and everything else into a no-op. No client ever reads a WS payload field.

**Cost.** Any broadcast triggers a full REST refetch of that list rather than a surgical
cache update.

**Proposal.** Document each payload (mirror the corresponding `*Read` schema) in
`backend/README.md` §8. The client can then use `queryClient.setQueryData` for appends,
which removes a round-trip per message.

**Files affected.** `src/lib/ws.ts`, `src/hooks/useTeamSocket.ts`.

---

## 7. Notification deep-link targets are inferred

**Symptom.** `NotificationRead` carries `reference_type`/`reference_id`, but the frontend
does not know which reference types have a routable page.

**Workaround.** `src/components/domain/NotificationItem.tsx` links only when a
`deal_id` or `proposal_id` is present in the notification `data` payload (those two pages
exist); every other notification renders as non-linked text.

**Proposal.** Publish the canonical enumeration of `reference_type` values and their
intended routes. Then add them to a single `notificationRoute()` map — one place to
extend instead of a guess.

**Files affected.** `src/components/domain/NotificationItem.tsx`,
`src/pages/notifications/NotificationsPage.tsx`.

---

## 8. No global search endpoint

**Symptom.** There is no cross-entity search (`/search?q=…`).

**Workaround.** The header search field from `DESIGN_SYSTEM.md` recipe 5.1 is
deliberately **not** rendered, so the UI never promises a capability that does not exist.
Per-resource search that the API *does* support is wired up: `GET /events?city=`,
`GET /events/{id}/participants?search=`, `GET /check-ins?search=`, and
`GET /sponsors?query=`.

The marketplace full-text filter is client-side and limited to the current page — the UI
says so in its empty state.

**Proposal.** `GET /search?q=&types=event,team,project,organization` returning a
discriminated union, then add the header search with debounce and grouped results.

**Files affected.** `src/components/layout/Header.tsx` (add the field),
`src/pages/marketplace/MarketplacePage.tsx` (drop the client-side filter).

---

## 9. No global project-submission listing

**Symptom.** Organizers can see submissions per event (`GET /events/{id}/projects`), and
judges get them per submission, but there is no paginated cross-event submission feed.

**Workaround.** `ManageEventPage` → **Overview → Submitted projects** links to the
per-event list; `JudgeWorkspacePage` paginates `GET /events/{event_id}/projects` for the
event being judged.

**Proposal.** `GET /users/me/submissions?role=judge&status=&limit&offset`. Lower priority
than the others — the per-event view covers the real workflow.

**Files affected.** `src/pages/judge/JudgeWorkspacePage.tsx`,
`src/pages/manage/ManageOverviewTab.tsx`.

---

## 10. Free-text `event_type`

**Symptom.** `event_type` is a free string (max 50 chars) rather than an enum, so
discovery filters cannot be exhaustive.

**Workaround.** `EVENT_TYPE_SUGGESTIONS` in `src/lib/constants.ts` provides six common
values as a `<datalist>`; the field stays freely editable (a strict `Select` would make
some events unfilterable). `EventsPage` filters by whatever the server accepts.

**Proposal.** If event types become an enum, change `EVENT_TYPE_SUGGESTIONS` to an
options array with `{value,label}` — the form and filter both read from that constant.

**Files affected.** `src/lib/constants.ts`, `src/pages/events/EventFilters.tsx`,
`src/components/domain/EventFormFields.tsx`.

---

## 11. No sponsor/listing text search

**Symptom.** `GET /sponsorship-listings` has no `q`/`search` parameter.

**Workaround.** `MarketplacePage` offers a page-local filter and labels it as such
("Filter this page by title…"), with an empty state that explains only the current page
was filtered. `GET /sponsors?query=` is used where the API does support search.

**Proposal.** Add `q` to the listing list endpoint (title + description, case-insensitive),
capped at the same `limit`/`offset`. Then delete the client filter and the disclaimer.

**Files affected.** `src/pages/marketplace/MarketplacePage.tsx`,
`src/api/endpoints/sponsorshipListings.ts`.

---

## 12. Deal `event_id` filter has no lookup endpoint

**Symptom.** Deals can be filtered by `event_id`, but the console has no cheap way to
turn an event into a picker for that filter.

**Workaround.** `OrgDealsTab` exposes a plain "Event id (optional)" text input instead of
guessing an event picker, and says the filter is by id.

**Proposal.** Accept the existing organization events list as the picker source (already
available via `GET /organizations/{id}/events`) — no backend change needed, only a
frontend refinement. Tracked here because the current UI is intentionally minimal.

**Files affected.** `src/pages/sponsorship/OrgDealsTab.tsx`.
