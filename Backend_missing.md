# Backend-missing features

What the frontend needs from the backend, what it does **in the meantime**, and exactly
how to implement each gap.

> **Status: gaps 1–7 are closed.** The original brief was frontend-only, so the first
> version of this document was a request to backend owners. That scope was later
> reversed, and gaps 1–7 have since been implemented in `backend/` with tests, and the
> frontend workarounds removed. Gaps 8–12 remain open (all P3 polish) and are still
> written as implementation requests.
>
> Backend test count went from **93 → 121** covering the closed gaps, then to **171**
> with the AI features (`test_ai_features.py`, `test_skill_matching.py`).
>
> **AI features (later addition):** the assistant, submission summaries and
> skill-based matchmaking now live in the backend too — `app/api/routes/ai.py`,
> `app/services/{gemini_client,skill_matching,skill_service,ai_chat_service,submission_summary_service}.py`.
> All of them degrade gracefully when `GEMINI_API_KEY` is empty.

**Legend** — **P1** blocks a core workflow · **P2** causes extra requests or missing
convenience · **P3** polish.

| # | Gap | Pri | Status | Where it lives now |
| --- | --- | --- | --- | --- |
| 1 | No `GET /events/{id}/my-team` | **P1** | ✅ **Closed** | `app/api/routes/teams.py`, `team_service.get_my_team_for_event` |
| 2 | No team file listing | **P1** | ✅ **Closed** | `app/api/routes/team_files.py`, `file_service.list_team_files` |
| 3 | No "events I judge / mentor" | **P2** | ✅ **Closed** | `app/api/routes/users.py` — `/users/me/judging-events`, `/users/me/mentoring-events` |
| 4 | No token refresh | **P2** | ✅ **Closed** | `app/api/routes/auth.py` — `POST /auth/refresh`, `security.create_refresh_token` |
| 5 | No CORS middleware | **P1** for production | ✅ **Closed** | `app/main.py` + `CORS_ORIGINS` in `app/core/config.py` |
| 6 | WS payload shapes undocumented | **P2** | ✅ **Closed** | Envelope pinned by `test_websocket_broadcast_envelope_is_typed` |
| 7 | Notification deep-link targets undefined | **P2** | ✅ **Closed** | `frontend/src/lib/notificationTarget.ts` maps every emitted type |
| 8 | No global search | **P3** | ⬜ Open | Header search intentionally omitted |
| 9 | No cross-event submission feed | **P3** | ⬜ Open | Per-event lists only |
| 10 | `event_type` is free text | **P3** | ⬜ Open | Six suggestions via `<datalist>`, field stays open |
| 11 | No listing text search | **P3** | ⬜ Open | Page-local filter, labelled as such |
| 12 | Deal `event_id` filter has no picker source | **P3** | ⬜ Open | Plain "event id" text input |

### What changed in the frontend

| Gap | Workaround removed | Now |
| --- | --- | --- |
| 1 | `useMyTeamForEvent` probed up to N teams, 5 concurrent | One `GET /events/{id}/my-team`; 404 resolves to `null` |
| 2 | `TeamFilesTab` scraped attachments from the last 100 chat messages | `useTeamFiles` → `GET /teams/{id}/files` with pagination + uploader attribution |
| 3 | Judges/mentors reachable by direct link only | `RoleEventsPanel` on the dashboard via `useMyJudgingEvents` / `useMyMentoringEvents` |
| 4 | Any 401 ended the session | Axios interceptor refreshes once (queued), replays the request, signs out only if refresh fails |
| 7 | Only deal/proposal notifications linked | `resolveNotificationTarget` covers all 11 emitted types with an event-detail fallback |

---

## 1. `GET /events/{event_id}/my-team` — P1 ✅

### As implemented

`GET /api/v1/events/{event_id}/my-team` → `200 TeamDetailRead` (roster included, since
the caller is by definition a member) or `404 {"detail": "You are not on a team for this event."}`.
Disbanded teams and members with `status != active` are excluded; the lookup is scoped to
the event, so the same user can be on different teams in different events.

Implementation: `team_service.get_my_team_for_event` composes the existing
`check_user_active_team_in_event` + `get_team_details`, so there is no duplicated
membership logic. Tests: 6 in `tests/test_teams.py`.

Frontend: `useMyTeamForEvent` now makes exactly one request and treats 404/403 as a
legitimate "no team" answer. The probing code is deleted.

### Why it is needed
Three screens need "the team I am on in this event": the event page (team CTA instead of
"create/join"), the leaderboard (to highlight *your* team), and the participant event
detail. Without it the client cannot answer the question directly.

### Current workaround
`frontend/src/hooks/useMyTeamForEvent.ts`:

1. `GET /events/{event_id}/teams?limit=100`
2. For each team, `GET /teams/{team_id}`, **at most 5 in flight**, stopping at the first
   team whose `members[]` contains the current user.
3. Caches the result for 60 s under `['events', eventId, 'my-team']`.

For a 200-team event that is up to 200 requests on a cold load. It also cannot paginate
past `limit=100`, so a user on team #150 is reported as "no team".

### Implementation guide

1. **Add the service function** (`backend/app/services/team_service.py`):

   ```python
   def get_my_team_for_event(db: Session, *, event_id: UUID, user_id: UUID) -> Team | None:
       return (
           db.query(Team)
           .join(TeamMember, TeamMember.team_id == Team.id)
           .filter(
               Team.event_id == event_id,
               Team.status != TeamStatus.DISBANDED,
               TeamMember.user_id == user_id,
           )
           .first()
       )
   ```

   Reuse whatever join helper already powers the "team members" roster so the
   `disbanded` filter and status semantics stay identical.

2. **Add the route** (`backend/app/api/routes/teams.py`, next to the other
   `/{event_id}/teams` routes):

   ```python
   @router.get("/events/{event_id}/my-team", response_model=TeamRead)
   def read_my_team(event_id: UUID, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
       event = event_service.get_event_or_404(db, event_id)
       team = team_service.get_my_team_for_event(db, event_id=event.id, user_id=current_user.id)
       if team is None:
           raise HTTPException(status_code=404, detail="You are not on a team for this event.")
       return team
   ```

3. **Declare the 404 in the OpenAPI docs** so the generated client keeps ``404`` distinct
   from an empty response — the frontend branches on it.

4. **Add a test** in `backend/tests/test_teams.py`:
   - member → 200 with their team
   - non-member → 404
   - disbanded team only → 404

5. **Tell the frontend.** After regenerating types (`npm run api:types`), replace the
   body of `useMyTeamForEvent` with:

   ```ts
   return useQuery({
     queryKey: ['events', eventId, 'my-team'],
     queryFn: () => getMyTeamForEvent(eventId as string),
     enabled: Boolean(eventId) && isAuthenticated,
     retry: false,          // 404 is an expected answer
   });
   ```

   Everything that consumes the hook already handles `data === undefined`, so no page
   changes are needed. Delete the probe helper; keep the 60 s `staleTime`.

### Acceptance
Loading an event page for an event with 200 teams issues **one** `/my-team` request, and
a user on a low-ranked team sees the "your team" state.

---

## 2. `GET /teams/{team_id}/files` — P1 ✅

### As implemented

`GET /api/v1/teams/{team_id}/files?limit=50&offset=0` → `List[TeamFileRead]`, newest
first (`created_at DESC, id DESC`). Soft-deleted files are excluded, `limit` is capped at
100, and non-members get `403`. `TeamFileRead` extends `StoredFileRead` with
`uploaded_by_username`, `uploaded_by_display_name` and `message_id` (null unless the file
was posted as a chat attachment), so the UI can attribute each file without extra calls.

Tests: 6 in `tests/test_team_collaboration.py`.

Frontend: `TeamFilesTab` uses `useTeamFiles` with real pagination and an uploader column;
the "derive from chat messages" scraping is deleted.

### Why it is needed
The team workspace has a "Files" tab. Today there is no way to list files; the only way
to obtain a `StoredFileRead` is from a chat message or an upload response.

### Current workaround
`frontend/src/pages/team/TeamFilesTab.tsx` fetches the last 100 messages
(`GET /teams/{id}/messages?limit=100`), flattens `message.attachments`, de-duplicates by
file id, and labels the tab "files shared in chat". Files attached to older messages, or
to a task, are invisible.

### Implementation guide

1. **Model** — no schema change needed: `StoredFile` already records `team_id`. Add an
   index if one is missing:

   ```python
   # backend/app/models/stored_file.py (inside __table_args__)
   Index("ix_stored_files_team_created", "team_id", "created_at")
   ```

   Ship the index in an Alembic revision (`alembic revision --autogenerate -m
   "index stored_files team_id created_at"`), not by editing a past migration.

2. **Service** (`backend/app/services/team_file_service.py`):

   ```python
   def list_team_files(db: Session, *, team_id: UUID, limit: int, offset: int) -> list[StoredFile]:
       return (
           db.query(StoredFile)
           .filter(StoredFile.team_id == team_id)
           .order_by(StoredFile.created_at.desc(), StoredFile.id)
           .offset(offset).limit(min(limit, 100)).all()
       )
   ```

   Sort by `created_at DESC, id` so paging is stable when two uploads share a timestamp.

3. **Route** (`backend/app/api/routes/team_files.py`, alongside the upload handler):

   ```python
   @router.get("/teams/{team_id}/files", response_model=list[StoredFileRead])
   def list_files(team_id: UUID, limit: int = Query(50, ge=1, le=100),
                  offset: int = Query(0, ge=0),
                  db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
       team_service.require_team_member(db, team_id=team_id, user_id=current_user.id)
       return team_file_service.list_team_files(db, team_id=team_id, limit=limit, offset=offset)
   ```

   Match the other list endpoints exactly: `limit`/`offset`, `le=100`, membership check
   via the existing `require_team_member` helper so non-members get `403`.

4. **Expose uploader + origin.** Recommended `StoredFileRead` additions so the UI can
   group and link instead of showing bare file names:

   ```python
   uploaded_by_user_id: UUID | None
   uploaded_by_display_name: str | None   # joined from UserProfile
   message_id: UUID | None                # null for task/direct uploads
   ```

   These are additive, so existing consumers keep working.

5. **Tests** (`backend/tests/test_team_files.py`): member sees files newest-first;
   non-member gets 403; `limit=101` is rejected by validation; paging with
   `offset=limit` returns the next slice and never repeats a row.

6. **Frontend follow-up** — replace the derivation in `TeamFilesTab.tsx` with
   `useTeamFiles(teamId, { limit, offset })` and add `Pagination`. The existing download
   path (axios `blob` + `Bearer`) already works and needs no change.

---

## 3. "Events I judge / mentor" — P2 ✅

### As implemented

Two endpoints on the users router:

- `GET /api/v1/users/me/judging-events` → `List[EventRead]` — events where the caller has
  `EventMembership.role == "judge"` and `status == "approved"` (the same rows
  `GET /events/{id}/judges` reads, so the two views cannot disagree).
- `GET /api/v1/users/me/mentoring-events` → `List[EventRead]` — distinct events where a
  `MentorRequest.assigned_mentor_user_id` points at the caller. De-duplicated, because one
  mentor is usually assigned several requests per event.

Both are unpaginated by design: a person holds a handful of roles. Removing judging access
(`DELETE /events/{id}/judges/{user_id}`) drops the event from the list immediately.

Tests: 5 in `tests/test_projects_and_judging.py`.

Frontend: `RoleEventsPanel` on the dashboard, driven by `useMyJudgingEvents` /
`useMyMentoringEvents`. It renders nothing for a plain participant.

### Why it is needed
Judges and mentors have no discovery surface. `GET /events` returns public events only,
so a judge cannot find the event they were added to.

### Current workaround
`/judge/events/{eventId}` and `/events/{eventId}/mentor` are reached by direct link from
`ManageOverviewTab`, the event workspace nav, or a notification deep-link. A 403 renders
as "Judge access required" rather than an error.

### Implementation guide

1. **Service** — the judge table already links users to events; add:

   ```python
   def list_judged_events(db: Session, *, user_id: UUID) -> list[Event]:
       return (db.query(Event)
                 .join(EventJudge, EventJudge.event_id == Event.id)
                 .filter(EventJudge.user_id == user_id,
                         EventJudge.status == JudgeStatus.ACTIVE)
                 .order_by(Event.starts_at.desc().nullslast())
                 .all())
   ```

   Mirror it for mentor requests (`MentorRequest.mentor_user_id`) and de-duplicate with
   `distinct()`.

2. **Routes** (`backend/app/api/routes/users.py`):

   ```python
   @router.get("/users/me/judging-events", response_model=list[EventRead])
   @router.get("/users/me/mentoring-events", response_model=list[EventRead])
   ```

   Keep them unpaginated (a user judges a handful of events) but document the cap.

3. **Frontend follow-up** — add `useMyJudgingEvents()` / `useMyMentoringEvents()`, then a
   "Your judging & mentoring" section on `/dashboard`. Both workspaces gain a real entry
   point and the 403 state stops being load-bearing.

---

## 4. Token refresh — P2 ✅

### As implemented

Stateless refresh tokens — a signed JWT with the same `sub`/`iss`/`aud` as an access token
but a distinct `typ` claim and a 14-day lifetime (`REFRESH_TOKEN_EXPIRE_DAYS`).

- `POST /api/v1/auth/register` and `POST /api/v1/auth/login` now return
  `{access_token, refresh_token, token_type, expires_in}`.
- `POST /api/v1/auth/refresh` takes `{refresh_token}` and returns a **rotated** pair.
- Type confusion is impossible in both directions: `decode_access_token` rejects
  `typ == "refresh"`, `decode_refresh_token` rejects `typ == "access"`. Tokens minted
  before `typ` existed carry no value and are still accepted, so a rolling deploy does not
  sign everyone out.

Tests: 7 in `tests/test_auth.py`, including both confusion directions and a deleted user.

**Known tradeoff:** stateless refresh means no server-side revocation list. Rotating
`JWT_SECRET_KEY` invalidates everything at once; if per-session revocation is needed later,
add a `refresh_tokens` table with a `jti` blocklist — the token already carries `jti`.

Frontend: the axios interceptor refreshes once (concurrent 401s share a single in-flight
refresh), replays the original request, and only ends the session when refreshing fails.

### Why it is needed
Tokens expire in 30 minutes. There is no way to extend a session, so users are logged out
mid-workflow.

### Current workaround
`frontend/src/api/client.ts` intercepts every `401` except `/auth/login` and
`/auth/register`, calls the unauthorized handler, and redirects to
`/login?next=<path>&expired=1`. Any unsaved form state is lost.

### Implementation guide

1. **Decide the model first.** The safest pairing with `localStorage`-based access tokens
   is a **rotating refresh token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie**:

   - `POST /auth/refresh` reads the cookie, validates it, rotates it (store only a hash,
     as `join_code` already does), and returns `{ access_token, expires_in }`.
   - `POST /auth/logout` revokes it and clears the cookie.
   - Access tokens stay short (15–30 min); refresh tokens live 7–30 days and are
     single-use (reuse ⇒ revoke the whole family).

2. **Add the cookie plumbing.** `fastapi.Response.set_cookie(...)` on login/refresh; you
   will need `CORSMiddleware` (`allow_credentials=True`, explicit origins) if the frontend
   and API are not same-origin — otherwise use a reverse proxy and skip CORS (§5).

3. **Frontend follow-up** — in `client.ts`, replace the redirect with a single-flight
   refresh queue:

   ```ts
   // one in-flight refresh shared by all failed requests
   let refreshing: Promise<string | null> | null = null;
   // on 401 (excluding /auth/*): await refresh → retry once → else redirect
   ```

   Retry **once** only; a second 401 must fall through to the redirect.

4. **Tests.** Backend: refresh rotates and invalidates the old token; replaying a used
   token returns 401 and revokes the family; expired cookie → 401. Frontend: concurrent
   401s produce exactly one refresh call.

---

## 5. CORS — P1 for any separate-origin deploy ✅

### As implemented

`app/main.py` already registered `CORSMiddleware`; it is now settings-driven rather than
hardcoded:

```
CORS_ORIGINS="https://app.example.com,https://admin.example.com"
CORS_ALLOW_CREDENTIALS=false
```

The `"*"` default keeps local tooling working. `allow_credentials` stays `false` because
authentication is Bearer-token based, not cookie based — which also avoids the `*` +
credentials combination browsers reject outright.

Tests: 3 in `tests/test_health.py` (preflight, actual request, and origin parsing).

### Why it is needed
The API sends no `Access-Control-Allow-Origin`, so a browser cannot call it from a
different origin. `useTeamSocket` also needs `WebSocket` upgrade access.

### Current workaround
`frontend/vite.config.ts` proxies `/api` → `http://127.0.0.1:8000` with `ws: true`, and
the client base URL is relative (`/api/v1`). Development is therefore same-origin, which
is why the app works today.

### Implementation guide

1. **Preferred: same origin.** Serve the built SPA and the API behind one reverse proxy
   (nginx/Caddy) — `dist/` at `/`, FastAPI at `/api`. No CORS, no cookie flags to relax,
   and `localStorage` tokens stay on one origin. This is the recommended production shape.

2. **If a separate API origin is required**, add `Starlette`'s middleware:

   ```python
   # backend/app/main.py
   from fastapi.middleware.cors import CORSMiddleware
   app.add_middleware(
       CORSMiddleware,
       allow_origins=settings.cors_allow_origins,   # explicit list, never ["*"]
       allow_credentials=True,
       allow_methods=["*"],
       allow_headers=["*"],
   )
   ```

   Add `cors_allow_origins: list[str] = []` to `app/core/config.py` and document it in
   `backend/README.md` §4.5. `allow_credentials=True` forbids `allow_origins=["*"]` —
   keep an explicit list per environment.

3. **WebSockets** are **not** covered by CORS middleware. Add an origin check in the
   `/ws` handler (reject unknown `Origin` with close code `1008`, which the client
   already treats as "do not reconnect").

4. **Docs.** Record the decision in `backend/README.md` §8 so the frontend knows whether
   to keep the proxy.

---

## 6. WebSocket payload shapes — P2 ✅

### As closed

The payloads were already typed — `broadcast_sync(team_id, event_type, data)` emits
`{"type": ..., "data": ...}` where `data` is the REST model (`model_dump(mode="json")`).
The gap was that nothing pinned it, so a refactor could have changed the shape silently.

`test_websocket_broadcast_envelope_is_typed` now asserts the envelope is exactly
`{type, data}` and that `data` equals the POST response body field-for-field. Event types
are `message.created|updated|deleted`, `task.created|updated|deleted`,
`task.assignees.updated`, plus `authenticated` / `pong` control frames.

Frontend: unchanged by design — `src/lib/ws.ts` forwards the event *type* only and lets
react-query refetch, so payload changes cannot break the UI.

### Why it is needed
`backend/README.md` §8 documents frame **types** and the authenticate handshake but not
the payload bodies, so the client cannot apply surgical cache updates.

### Current workaround
`frontend/src/lib/ws.ts` reads only `type`; `useTeamSocket` maps
`message.*` → `['team', id, 'messages']` and `task.*` → `['team', id, 'tasks']`
invalidations, then REST refetches.

### Implementation guide

1. Document one example body per event type, reusing the matching `*Read` schema so the
   shapes cannot drift:

   ```jsonc
   { "type": "message.created", "message": { /* MessageRead */ } }
   { "type": "message.updated", "message": { /* MessageRead */ } }
   { "type": "message.deleted", "message_id": "…", "deleted_at": "…" }
   { "type": "task.updated",    "task":    { /* TeamTaskRead */ } }
   { "type": "task.assignees.updated", "task_id": "…", "assignee_ids": ["…"] }
   ```

2. Alternatively (better long-term) derive the payload from the Pydantic models and emit
   the OpenAPI schema for the WS frames as a documented `EventMessage` union.

3. **Frontend follow-up** — with documented bodies, `useTeamSocket` can
   `queryClient.setQueryData` to append a message or patch a task, dropping one REST
   round-trip per broadcast. Keep the invalidation as a fallback for unknown types.

4. **Tests.** Backend: assert the exact JSON emitted for each mutation (the
   `websocket_manager` broadcaster is already testable). Frontend: one test per
   documented type.

---

## 7. Notification deep-link targets — P2 ✅

### As closed

The backend already supplied reference ids in `NotificationRead.data`
(`proposal_id`, `deal_id`, `deliverable_id`, `mentor_request_id`, `event_id`). The gap was
client-side: only deal and proposal notifications had a link.

`frontend/src/lib/notificationTarget.ts` now resolves every emitted type, most-specific
first: deal → proposal → mentor request → event-scoped page → event detail. Unknown types
with an event id fall back to `/my/events/{id}`, and a notification with no usable id
renders as plain text rather than a broken link.

Tests: 9 in `frontend/src/lib/__tests__/notificationTarget.test.ts`.

### Why it is needed
`NotificationRead` carries reference fields, but which reference types have routable
pages is unspecified, so most notifications cannot be clicked.

### Current workaround
`frontend/src/components/domain/NotificationItem.tsx` links only when `data.deal_id` or
`data.proposal_id` is present; everything else renders as plain text.

### Implementation guide

1. **Publish the enumeration.** In `backend/README.md` §8, list every `reference_type`
   and the intended destination, e.g.:

   | `reference_type` | Destination |
   | --- | --- |
   | `organization_invitation` | `/organizations` |
   | `team_invitation` | `/my/team-invitations` |
   | `mentor_request` | `/my/mentor-requests` |
   | `announcement` | `/events/{event_id}/announcements` |
   | `sponsorship_proposal` | `/sponsorship/proposals/{reference_id}` |
   | `sponsorship_deal` | `/sponsorship/deals/{reference_id}` |

2. **Guarantee the pair.** Make `reference_type` non-null whenever `reference_id` is set
   (a check constraint or a model validator), so the client never has to guess.

3. **Frontend follow-up** — replace the `deal_id`/`proposal_id` special case with one
   exhaustive `notificationRoute(notification): string | null` map in
   `src/lib/notifications.ts`. TypeScript's `never` check then flags any new
   `reference_type` at compile time.

---

## 8. Global search — P3

### Current workaround
No header search field is rendered (so the UI never promises it). Per-resource search
works where the API supports it: `events?city=`, `events/{id}/participants?search=`,
`check-ins?search=`, `sponsors?query=`.

### Implementation guide
Add `GET /search?q=&types=event,team,project,organization&limit=` returning a
discriminated union (`{ entity: "event", item: EventRead }`), built from
`ILIKE`/`LIKE` over the indexed name/title columns, scoped to what the caller may see
(public events, their own teams, projects in events they belong to). Then add a debounced
header field writing `?q=` to a `/search` route.

---

## 9. Cross-event submission feed — P3

### Current workaround
`GET /events/{event_id}/projects` per event; the organizer console links to it and the
judge workspace paginates it.

### Implementation guide
Add `GET /users/me/submissions?role=judge|organizer&status=&limit=&offset`, reusing the
existing query builder with the membership filter optional. Return
`ProjectPublicRead`-shaped rows plus `event_id`/`event_name` so the row can link out.

---

## 10. `event_type` is free text — P3

### Current workaround
`EVENT_TYPE_SUGGESTIONS` (six values) renders a `<datalist>`; the field stays editable so
existing events with custom types remain valid. Discovery filters by whatever string the
server accepts.

### Implementation guide
If you want a strict enum: add `EventType` to `app/models/event.py`, migrate existing
rows by mapping unknown values to `other` (keep the original string in a
`event_type_label` column so nothing is lost), and expose it in OpenAPI. Then change
`EVENT_TYPE_SUGGESTIONS` to `{ value, label }` pairs — both the create form and the
filter read from that constant.

---

## 11. Listing text search — P3

### Current workaround
`frontend/src/pages/marketplace/MarketplacePage.tsx` filters the current page by title
and says so in the UI and in the empty state.

### Implementation guide
Add `q: str | None = Query(None, max_length=100)` to the listing list endpoint and apply
`or_(SponsorshipListing.title.ilike(f"%{q}%"), SponsorshipListing.description.ilike(...))`.
Then delete the client filter; the existing `Pagination` already reflects server paging.

---

## 12. Deal `event_id` filter has no picker source — P3

### Current workaround
`OrgDealsTab` exposes a plain "Event id (optional)" text input rather than a picker.

### Implementation guide
No backend change needed — `GET /organizations/{id}/events` already exists. This entry is
recorded because the current UI is deliberately minimal; a follow-up frontend change can
swap the input for a `Select` populated from that endpoint.

---

## Verification checklist

Run this after touching either side. It is what I ran to close gaps 1–7:

```bash
cd backend
.venv/bin/pytest -q                    # 121 tests, 0 failures
.venv/bin/uvicorn app.main:app --port 8000
```

```bash
cd frontend
npm run api:types     # regenerate schema.d.ts from the running backend
npm run typecheck     # catches every consumer of a renamed/moved field
npm run lint          # 0 errors
npm run test          # 116 tests, 12 files
npm run build         # route-level splitting still intact
```

### Manual smoke test for the closed gaps

```bash
# 1. my-team answers 404 rather than "not found" for a non-member
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8000/api/v1/events/$EVENT_ID/my-team

# 2. refresh rotates and the new access token works
curl -s -X POST http://127.0.0.1:8000/api/v1/auth/refresh \
  -H 'Content-Type: application/json' \
  -d "{\"refresh_token\":\"$REFRESH\"}"

# 3. an access token is refused by /auth/refresh (expect 401)
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  http://127.0.0.1:8000/api/v1/auth/refresh \
  -H 'Content-Type: application/json' -d "{\"refresh_token\":\"$ACCESS\"}"

# 4. discovery endpoints answer for the right user only
curl -s -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8000/api/v1/users/me/judging-events
```

### Still open

Gaps 8–12 are all P3 and do not block any workflow. Each entry above keeps the
step-by-step implementation guide, so they can be picked up independently.
