# ProjectPlanner

A planning hub for one developer, running on your own computer. Each project is walked
through a fixed planning template, and planning has a deadline: **at most 14 days after you
decide to do a project, you are coding**, whether the plan is finished or not.

- Go server, PostgreSQL database, React interface
- Everything stays on your machine: no accounts, no cloud, no AI features
- Standard projects and hackathon projects (with a countdown clock)
- While you build, it keeps count of what the plan promised: scope added, dates moved,
  estimates against the hours they really took

![Project overview while building](docs/overview.png)

## Contents

- [Quick start](#quick-start)
- [Running it by hand](#running-it-by-hand): database, server, frontend
- [Everyday use](#everyday-use)
- [Where your data lives](#where-your-data-lives)
- [Settings](#settings)
- [How the planner works](#how-the-planner-works)
- [Backups, export and import](#backups-export-and-import)
- [From the terminal](#from-the-terminal)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

## Quick start

For Linux Mint 21 or 22 (also Ubuntu and Debian). Takes a few minutes; most of it is
downloads.

```bash
git clone https://github.com/Mohammed-Yousuf-creator/ProjectPlanner.git
cd ProjectPlanner
make setup     # one time: installs what is missing, creates the database, builds
make run       # every time: starts the planner
```

Then open **http://localhost:8080**. Stop it with `Ctrl+C`.

If `make` itself is missing, run `./scripts/setup.sh` instead of `make setup`; it installs it.

What `make setup` does, in order. It skips every step that is already done, so it is safe
to run again:

1. Installs PostgreSQL with `apt` if it is missing. This is the only step that asks for your
   password.
2. Checks for Go 1.22+ and Node.js 18+. If either is missing or too old (the versions in
   Mint 21's repositories are), it downloads the official build into `.tools/` inside this
   folder. Nothing is installed system-wide.
3. Starts PostgreSQL and creates a `planner` role and a `planner` database.
4. Creates `.env` from `.env.example`.
5. Builds the interface (`frontend/dist`) and the server (`bin/planner`).

## Running it by hand

The same steps without the setup script.

### Start the database

```bash
sudo apt update && sudo apt install -y postgresql
sudo systemctl enable --now postgresql      # starts it now and on every boot
make db                                     # creates the role and the database
```

`make db` runs `scripts/setup-db.sh`, which is equivalent to:

```bash
sudo -u postgres psql -c "create role planner login password 'planner'"
sudo -u postgres createdb --owner planner planner
```

Check that it works:

```bash
psql "postgres://planner:planner@127.0.0.1:5432/planner" -c "select 1"
```

The tables are created by the server the first time it starts.

### Build and start the server

You need Go 1.22 or newer (`go version`).

```bash
cd backend
go build -o ../bin/planner ./cmd/planner
cd ..
./bin/planner
```

It prints `ProjectPlanner is running at http://127.0.0.1:8080`. Start it from the project
folder so that it finds `.env`, `data/` and `frontend/dist`.

### Host the frontend

There is no separate web server to run. The Go server serves the built interface from
`frontend/dist` on the same address as the API. Build it once (Node.js 18 or newer):

```bash
cd frontend
npm ci
npm run build
```

Restart the server and open http://localhost:8080. If the interface has not been built, that
page says so and shows these commands.

`make build` does both builds, and only rebuilds what changed.

## Everyday use

| Command | What it does |
| --- | --- |
| `make run` | Start the planner at http://localhost:8080 |
| `make backup` | Save the database and uploads to `backups/` (the planner also does this once a day) |
| `bin/planner status` | Print where the current project stands, see [From the terminal](#from-the-terminal) |
| `make db` | Start PostgreSQL and make sure the database exists |
| `make build` | Rebuild after pulling changes |
| `make dev` | Development mode with hot reload |
| `make test` | Run the backend tests |

PostgreSQL starts with the computer, so after a reboot `make run` is all you need.

### Start it automatically when you log in (optional)

Create `~/.config/systemd/user/projectplanner.service`, adjusting the path if the project is
not in your home folder:

```ini
[Unit]
Description=ProjectPlanner

[Service]
WorkingDirectory=%h/ProjectPlanner
ExecStart=%h/ProjectPlanner/bin/planner
Restart=on-failure

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now projectplanner
journalctl --user -u projectplanner -f      # its log
```

This is worth doing: the planning deadline is enforced by the server, so a server that is
always running switches a project to "build" at the exact minute. If the server is off when
a deadline passes, the switch happens the moment it starts again.

## Where your data lives

| What | Where |
| --- | --- |
| Projects, plans, tasks, journal | PostgreSQL on this computer. `make db` prints the folder, usually `/var/lib/postgresql/<version>/main` |
| Uploaded files (compressed) | `data/uploads/` in this folder |
| Settings | `.env` in this folder |
| Backups | `backups/` in this folder |

Backups are covered in [Backups, export and import](#backups-export-and-import).

To remove everything: `sudo -u postgres dropdb planner`, then delete this folder.

## Settings

All optional. Put them in `.env`, or set them in the environment.

| Setting | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://planner:planner@127.0.0.1:5432/planner?sslmode=disable` | Where PostgreSQL is |
| `PLANNER_ADDR` | `127.0.0.1:8080` | Address the server listens on |
| `PLANNER_DATA_DIR` | `data` | Where uploads are stored |
| `PLANNER_STATIC_DIR` | `frontend/dist` | Built interface to serve |
| `PLANNER_BACKUP_DIR` | `backups`, next to the data folder | Where backups are written |
| `PLANNER_DATABASE_URL` | not set | Only for `planner status`: the database to read when it is not the one in `.env` |

The default address is reachable only from this computer. There is no login, so only change
it to `0.0.0.0:8080` on a network you trust.

Settings you change while using the planner are on the gear icon in the top bar: the
one-project rule and automatic backups. Per-project settings (ship date, the limit for a task
in progress, the repository) are on the project's Settings tab.

## How the planner works

### The two-week rule

When you create a project you have *decided* to do it, and the clock starts.

- Planning time depends on size: tiny 1 day, small 3, medium 7, hard 14. You can change it,
  but never past **14 days from the decision**.
- The limit is checked in three places: the interface, the server, and a constraint in the
  database (`two_week_rule`). There is no setting that raises it.
- You can start coding earlier at any time. Going back to planning is not possible.
- When the deadline passes, the server moves the project to the build phase on its own. It
  fills the board from whatever the blueprint contains and puts the first task in progress.
  Each essential step that is still open becomes a "Decide while building" task, so the
  decision still gets made, just not before the first line of code.
- Every planning step has its own "move on by" time, and its checklist is a guide, not a
  gate. "Good enough" is a button.
- The countdown is on the dashboard, in the project header and in the browser tab title.

### The template

Ten planning steps, combined from the four video transcripts in this repository. Sponsor
segments were left out, and the two example projects (a quiz app, a cloud tool) were treated
as illustrations only.

| # | Step | What you decide | Taken from |
| --- | --- | --- | --- |
| 1 | Goal & why | Why, for whom, what makes it valuable; outcome and journey goals; time budget; a "no matter what" resolve | Videos 1, 2 |
| 2 | Feasibility & unknowns | Open questions with answers; where to look when stuck | Videos 2, 3 |
| 3 | User stories | "A user can…" in plain language | Video 1 |
| 4 | Ruthless MVP cut | Each story: MVP, later, or cut. Aim to cut about half | Videos 1, 4 |
| 5 | Data models | Entities, fields, relations, with no database talk | Video 1 |
| 6 | Ugly wireframes | Photos of paper sketches or the built-in sketch pad; the user flow in words | Videos 1, 2 |
| 7 | Future & black boxes | How long it will live, how it is packaged, the few big modules and their interfaces | Videos 1, 4 |
| 8 | Stack & build-vs-buy | The simplest stack you can ship; per capability: build it, use a service, or not needed; the deploy path | Videos 1, 2, 4 |
| 9 | Core logic & data flows | One to three flows from trigger to data; core algorithm in pseudocode | Videos 3, 4 |
| 10 | Milestones & micro-challenges | Small tasks with hard deadlines, in build order | Videos 1, 2, 3 |

After planning:

- **Board.** Backlog, to do, doing, done. Tasks have sub-steps, an estimate and hard
  deadlines, and are grouped into milestones. Once coding has started, a new idea can be
  added to the MVP or parked for later with one click.
- **Focus.** One task, its sub-steps and a timer, with nothing else on the page. The time
  is added to the task.
- **Journal.** One entry per day, like a commit message for the day, with a streak. Link the
  project's local git folder and its commits show up and count too. The planner only reads
  from the repository.
- **Stuck?** Name the obstacle and its kind before searching for an answer: memory,
  knowledge, problem-solving or debugging. Each kind has its own protocol. For
  problem-solving you write down your own approaches and attempts first. Solved obstacles
  stay searchable.
- **Expansion pack.** Stories marked "later" wait here and unlock when the MVP ships.
- **Files.** Everything for the project in one place.
- **Export.** The whole blueprint as one `PLAN.md` to keep next to the code.

### Keeping the plan small

These are part of the planning steps.

- **Scope budget.** The MVP holds a fixed number of user stories by project size: tiny 3,
  small 5, medium 8, hard 12. A hackathon gets 2 to 6, by the length of the event. To add
  one more, move another out first.
- **Cut order.** In the MVP step you rank the MVP stories by what goes first when time runs
  short. You decide this while you are calm, so there is nothing to argue about later.
- **Not doing.** A list of things the project leaves out on purpose, each with a reason.
- **Decisions.** Each step has a short log: what you decided, why, and what you turned
  down. They are included in `PLAN.md`.
- **Time-boxed questions.** An open feasibility question gets a tenth of the planning
  window (15 minutes to a day). After that you answer it or mark it "learn while building",
  which turns it into a task.
- **Starter kits.** Optional when you create a project: command-line tool, web app, API,
  library or game. A kit fills in stack layers, capabilities, the usual open questions and
  a first set of milestones. Everything it adds can be edited or deleted.
- **One project at a time.** Starting a project while another is still being built gives a
  warning that names the unfinished one. You can switch this off or make it a refusal in
  the app settings. Hackathons are exempt.
- **Notes from past projects.** The new-project dialog shows what you wrote in earlier
  retrospectives and why you archived earlier projects.

### When planning time is up

The first time you open a project after its planning deadline, you get one screen: how many
tasks are on the board, which decisions are left to make while building, and your first
task. The plan as it stood is kept as a frozen copy. Later edits to the blueprint are
allowed, and the overview lists them against that copy.

### Keeping the build honest

![Board with a slipped milestone and the cut prompt](docs/board.png)

All of this is on the project overview, and the first two also show on the board.

- **A milestone slips.** When a milestone is overdue with tasks still open, the planner
  shows the next story on your cut list with two choices: cut it (its open tasks move to
  the expansion pack) or move the date.
- **Moving a date needs a reason.** Once coding has started, changing the ship date or a
  milestone date asks for one line saying why. The overview keeps the count and the list.
- **A task sits in progress too long.** After two days (a setting per project; a twelfth of
  the event in a hackathon) it is flagged "split it or cut it". Splitting a task does not
  count as added scope.
- **Scope since coding started.** Tasks added to the MVP, tasks cut, ideas parked.
- **Pace.** Open tasks over time, with the date you reach zero at the speed of the last
  seven days, next to the ship date.
- **Estimates against actuals.** Hours spent against hours estimated on finished tasks, as
  one ratio, applied to the work that is left. The dashboard shows the ratio across all
  projects.
- **Today's three.** Pick up to three tasks for the day.
- **Stuck timer.** An attempt at an obstacle lasts 20 minutes (10 in a hackathon). When it
  runs out the planner asks for a different approach or for outside help. For a
  problem-solving obstacle, outside help unlocks after two attempts and your own approaches
  written down.

### Finishing

- **Shipping** opens a retrospective: planned against actual for planning time, ship date,
  scope and estimates, per milestone, plus where you got stuck. You add three lines: what
  went well, what was harder than expected, what you will do differently.
- **Archiving** an unfinished project asks why you are stopping.
- Both show up in the new-project dialog next time.

### Linking the code repository

Set the project's local git folder on its Settings tab. The planner reads the commit log and
nothing else, with two optional additions:

- **Keep `PLAN.md` up to date.** The planner writes the blueprint to `PLAN.md` in that
  folder when the plan changes. It writes that one file and never commits.
- **Commits close tasks.** `closes #12` in a commit message marks task 12 done (`fixes`,
  `resolves`, `done` and `finishes` work too). `#12` alone links the commit to the task.

### Search, reminders and the calendar

- **Search** (the magnifier, or press `/` or Ctrl+K) covers projects, tasks, blueprint
  text, decisions, obstacles and journal entries in every project.
- **Reminders** (the bell) are browser notifications for the planning deadline, the ship
  date, milestones, the stuck timer, tasks in progress too long, and the freeze and submit
  times of a hackathon. They are off until you switch them on, and they only arrive while
  the planner is open in a browser tab.
- **Calendar.** Each project has a calendar file with its deadlines and milestones
  (Settings tab, "Calendar (.ics)"). A calendar app on the same computer can subscribe to
  its address and follow the dates as they move.
- The dashboard shows the last year of logged days across all projects.

### Building it yourself or using external services

This is a choice, per project and per capability. A project has a default, "build it
myself" or "fast-track with services". In the stack step every capability (authentication,
database, file storage, hosting, and any you add) is set to *build*, *service* or *not
needed*. Nothing forces either direction.

### Hackathon projects

![Hackathon page with countdown and schedule](docs/hackathon.png)

Pick "Hackathon" when creating a project and enter the start time and the submission
deadline.

- A countdown to the start, then to the submission deadline, on every page and in the tab
  title.
- The event is split into plan, build, polish & demo, and submit. Planning gets a tenth of
  the event by default (between 15 minutes and 4 hours) and never more than a quarter.
  Features freeze at 80%. The last stretch is reserved for submitting.
- Only five of the ten steps are required; the rest are optional.
- Judging criteria, a submission checklist (pre-filled, editable), a one-sentence pitch, a
  demo script, and a "cut in this order" list for when time runs short.
- A warning when the share of finished tasks falls well behind the share of build time used.
- If the organisers move the times, change them on the Hackathon tab.
- **Sleep and breaks.** Block off the time you will not be working. The page shows the real
  build time that is left after them.
- **Pitch rehearsal.** A timer against the time limit of the pitch, with the result of
  each run.

### Uploads

Each file can be up to **10 MB**. The limit is enforced by the server; the interface also
refuses larger files before uploading. Files are compressed with
[Zstandard](https://facebook.github.io/zstd/) before they are written to disk, using the
open-source Go library [klauspost/compress](https://github.com/klauspost/compress). A file
that does not get smaller (most photos, archives) is stored as it is. Downloads give back
the original bytes.

## Backups, export and import

**Automatic backups.** While the server runs it writes one backup a day to `backups/` and
keeps the last 7 (both can be changed in the app settings). `make backup` and "Back up now"
in the app settings write one immediately. A backup is one `.tar.gz` with a dump of the
database and all uploaded files.

Backups need the PostgreSQL client tools (`pg_dump` and `psql`). The app settings page says
so when they are missing: `sudo apt install -y postgresql-client`.

These backups are on the same disk as the data. Copy the `backups/` folder somewhere else
now and then.

**Restore.** In the app settings, pick a backup and choose Restore. It replaces all current
data with the backup. The planner first saves the current state as another backup, so a
restore can be undone the same way.

To restore by hand, with the planner stopped:

```bash
mkdir -p /tmp/restore && tar -xzf backups/planner-<date>.tar.gz -C /tmp/restore
sudo -u postgres dropdb planner
make db                                # recreates an empty database
psql "postgres://planner:planner@127.0.0.1:5432/planner" < /tmp/restore/planner.sql
rm -rf data/uploads && cp -r /tmp/restore/uploads data/uploads
```

**Move one project to another computer.** On the project's Settings tab, "Whole project
(.planner.zip)" downloads the plan, the board, the journal and every upload. On the other
computer, open the app settings and choose that file under "Import a project". It is added
as a new project and nothing existing is changed.

## From the terminal

`bin/planner status` prints where a project stands. It reads the database directly, so the
server does not need to be running.

```
$ bin/planner status
Link shortener — building
  Clock      Skeleton: one endpoint answers in 1d 9h (Wed 18 Nov 23:59)
  Progress   0 of 11 tasks done
  Milestone  Skeleton: one endpoint answers — due in 1d 9h
  Now        #141 Create the project skeleton (0 of 4 steps)

$ bin/planner status --short
Link shortener [build 1d 9h] · #141 Create the project skeleton
```

It picks the project whose linked repository folder you are in, otherwise the project you
touched last.

| Option | Meaning |
| --- | --- |
| `--short` | One line, for a shell prompt or a status bar. Prints nothing on an error |
| `--here` | Print nothing unless you are inside a linked repository |
| `--project N` | A specific project |
| `--json` | The same facts as JSON |

For a bash prompt, with `planner` on your `PATH`:

```bash
PS1='$(planner status --short --here 2>/dev/null) '$PS1
```

## Troubleshooting

**`database: … connection refused` when starting.** PostgreSQL is not running:
`sudo systemctl start postgresql`, or `make db`.

**`password authentication failed for user "planner"`.** Run `make db`; it resets the
password to the default. If you changed the password, put the new one in `DATABASE_URL` in
`.env`.

**PostgreSQL uses a different port.** A second PostgreSQL installation gets port 5433. Check
with `pg_lsclusters` and change the port in `DATABASE_URL`.

**`address already in use`.** Another program has port 8080. Set `PLANNER_ADDR=127.0.0.1:8090`
in `.env`.

**The page says the interface is not built.** Run `make build` and restart.

**`make setup` cannot download Go or Node.js.** Install them yourself (Go 1.22+, Node.js
18+), make sure `go` and `node` are on your `PATH`, and run `make setup` again.

**The app settings page says backups are not available.** Install the PostgreSQL client
tools: `sudo apt install -y postgresql-client`, then restart the planner.

**`planner status` cannot reach the database from another folder.** It reads the `.env`
next to the program. If the planner's database is somewhere else, set
`PLANNER_DATABASE_URL`.

## Development

```bash
make dev      # Go server on :8080, Vite with hot reload on http://localhost:5173
make test     # backend tests; creates and wipes a separate planner_test database
```

The Vite dev server listens on `127.0.0.1` only. To reach it from another machine, set
`PLANNER_DEV_HOST=0.0.0.0` and list the host names in `PLANNER_DEV_ALLOWED_HOSTS`.

```
backend/
  cmd/planner/            entry point: the server and `planner status`
  internal/planner/       the rules: deadlines, steps, scope and date tracking, hackathon
                          schedule, task generation, export
  internal/backup/        backups and restore
  internal/api/           HTTP routes (all under /api)
  internal/store/         SQL
  internal/database/      embedded migrations
  internal/filestore/     upload limit and compression
  internal/gitlog/        read-only git information
frontend/
  src/pages/              one file per tab
  src/steps/              the ten planning steps
  src/components/         clock, sketch pad, overview cards, search, shared UI
scripts/                  setup, database, run, dev, backup
```

More screenshots: [blueprint step](docs/blueprint.png), [focus](docs/focus.png).
