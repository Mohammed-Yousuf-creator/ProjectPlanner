# Running the platform locally

Everything you need to run the backend and the frontend on your own machine, from
a clean clone to a populated app. Expect about five minutes.

The project has two halves:

| Folder      | What it is                          | Port |
| ----------- | ----------------------------------- | ---- |
| `backend/`  | FastAPI + SQLAlchemy + Alembic      | 8000 |
| `frontend/` | React + TypeScript + Vite           | 5173 |

**Prerequisites:** Python 3.11+ and Node.js 20+.
Check with `python3 --version` and `node --version`.

---

## 1. Backend

Open a terminal in the repository root.

```bash
cd backend

# Create and activate a virtual environment.
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

# Install dependencies.
pip install -r requirements.txt
```

### Configure the environment

```bash
cp .env.example .env
```

Open `.env` and set **one** required value — a secret for signing tokens:

```ini
JWT_SECRET_KEY=replace_with_a_long_random_string
```

Generate one with:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

The rest of `.env.example` works as-is for local development. Notable defaults:

- `DATABASE_URL=sqlite:///./data/app.db` — a single file, nothing to install.
- `CORS_ORIGINS=*` — permissive, which is what you want on localhost.
- `GEMINI_API_KEY=` — **empty**, and that is fine. See [AI features](#4-ai-features-optional).

### Create the database

```bash
# The uploads directory is not tracked by git; create it once.
mkdir -p data/uploads

# Apply all migrations.
alembic upgrade head
```

You should see a chain of `Running upgrade ...` lines ending at the current head.
Confirm with `alembic current`.

### Start the API

```bash
uvicorn app.main:app --reload --port 8000
```

- Interactive API docs: <http://127.0.0.1:8000/docs>
- Health check: <http://127.0.0.1:8000/api/v1/ai/status>

Leave this terminal running.

---

## 2. Frontend

Open a **second** terminal in the repository root.

```bash
cd frontend
npm install
npm run dev
```

Vite prints the URL — open <http://localhost:5173>.

The dev server proxies every `/api` request to `http://127.0.0.1:8000`, so the
browser never talks to the backend directly and there is no CORS friction. If
your backend runs elsewhere, set `VITE_API_PROXY_TARGET` before `npm run dev`:

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:9000 npm run dev
```

> **The backend must be running first.** If you start only the frontend, every
> page will render its error state.

---

## 3. Try it out

1. Open <http://localhost:5173> and **Register** an account.
2. Go to **Organizations → New organization** to create one.
3. From the organization page, **Create event**, then publish it.
4. Sign out and register a second account, then join the event from the events
   list — two accounts let you exercise teams, invitations and matchmaking.
5. Register for the event, then visit **Skills** in the header and add a few.
6. Open the event → **Matchmaking** to see ranked teammates, and **Assistant** to
   chat with the bot.

### Handy URLs

| Page                 | URL                                        |
| -------------------- | ------------------------------------------ |
| App                  | <http://localhost:5173>                    |
| Events               | <http://localhost:5173/events>             |
| Your skills          | <http://localhost:5173/my/skills>          |
| AI assistant         | <http://localhost:5173/assistant>          |
| Organizer console    | <http://localhost:5173/manage/events/:id>  |
| Matchmaking          | <http://localhost:5173/events/:id/matchmaking> |

---

## 4. AI features (optional)

Three features use Google Gemini:

- **Assistant** — a chatbot that knows the platform and the event you are viewing.
- **Project summaries** — a one-line overview of each submission, plus highlights
  and likely judge questions.
- **Skill matchmaking explanations** — the ranking itself is a deterministic
  algorithm that runs locally; AI only phrases *why* a person or team scored well.

### Turning them on

1. Get a free key from <https://aistudio.google.com/apikey>.
2. Put it in `backend/.env`:

   ```ini
   GEMINI_API_KEY=your_key_here
   ```

3. Restart the backend.

**Never commit your `.env`.** It is already git-ignored. `.env.example` is the
tracked template and must keep `GEMINI_API_KEY` empty.

### What happens without a key

Nothing breaks. The app is designed to run fully offline:

| Feature      | Without a key                                                    |
| ------------ | ---------------------------------------------------------------- |
| Assistant    | Keyword-based answers, clearly labelled **Offline answer**        |
| Summaries    | Extracted from the submitted abstract, labelled **Extracted**     |
| Matchmaking  | Fully functional — the algorithm never needed AI in the first place |

No configuration, code change or conditional is required. The status endpoint
(`/api/v1/ai/status`) reports whether live AI is active, and the UI shows the
corresponding badge.

---

## 5. Tests and checks

Run these before opening a pull request.

**Backend** (from `backend/`, with the virtualenv active):

```bash
pytest -q
```

**Frontend** (from `frontend/`):

```bash
npm run typecheck    # TypeScript, no emit
npm run lint         # ESLint
npm test             # Vitest unit + render tests
npm run build        # production build
```

All of the above pass without `GEMINI_API_KEY`. Live Gemini calls are never made
in tests.

---

## 6. Common problems

**`ModuleNotFoundError: No module named 'app'`**
Run `uvicorn` from inside `backend/`, and make sure the virtualenv is active.

**`sqlite3.OperationalError: no such table`**
Migrations have not been applied. Run `alembic upgrade head` in `backend/`.

**`OSError: [Errno 98] Address already in use`**
Something is already on port 8000. Either stop it or use `--port 8001` plus the
matching `VITE_API_PROXY_TARGET`.

**Frontend shows errors on every page**
The backend is not running, or it is on a different port than the proxy target.

**AI answers say "Offline answer"**
Expected when `GEMINI_API_KEY` is empty. Add the key and restart the backend — the
setting is read at startup.

**`401 Unauthorized` right after signing in**
Your `JWT_SECRET_KEY` changed while a token was still in the browser. Clear the
site's local storage or sign in again.

**Uploads fail**
`backend/data/uploads` does not exist. `mkdir -p backend/data/uploads`.

**`npm run api:types` fails**
It reads the OpenAPI schema from a running backend on port 8000. Start the
backend first.

---

## 7. Resetting

Wipe local data and start over:

```bash
cd backend
rm -f data/app.db
rm -rf data/uploads/*
alembic upgrade head
```
