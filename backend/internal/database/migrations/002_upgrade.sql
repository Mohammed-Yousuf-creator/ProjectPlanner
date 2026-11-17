-- Upgrade: scope and time honesty, daily rhythm, repository links, hackathon extras,
-- cross-project features. Existing rows keep working; every new column has a default.

ALTER TABLE projects
    ADD COLUMN kit                  TEXT        NOT NULL DEFAULT '',   -- starter kit used at creation
    ADD COLUMN archive_reason       TEXT        NOT NULL DEFAULT '',   -- why an unfinished project was dropped
    ADD COLUMN archived_at          TIMESTAMPTZ,
    -- When the "pencils down" screen was dismissed. NULL while a project that has moved to
    -- building has not been opened since.
    ADD COLUMN build_ack_at         TIMESTAMPTZ,
    ADD COLUMN original_target_date DATE,                              -- the first ship date ever set
    -- A task in progress for longer than this is flagged "split it or cut it".
    ADD COLUMN stale_hours          INTEGER     NOT NULL DEFAULT 48 CHECK (stale_hours BETWEEN 1 AND 720),
    ADD COLUMN plan_sync            BOOLEAN     NOT NULL DEFAULT FALSE, -- write PLAN.md into the repository
    ADD COLUMN commit_close         BOOLEAN     NOT NULL DEFAULT FALSE; -- "closes #12" marks task 12 done

UPDATE projects SET build_ack_at = COALESCE(build_started_at, now()) WHERE phase <> 'plan';
UPDATE projects SET original_target_date = target_date WHERE target_date IS NOT NULL;
UPDATE projects SET archived_at = updated_at WHERE archived;

-- 1 = the first story to cut when time runs short. NULL = not ranked yet.
ALTER TABLE stories ADD COLUMN cut_rank INTEGER;

ALTER TABLE milestones ADD COLUMN original_due_at TIMESTAMPTZ;         -- the first deadline ever set
UPDATE milestones SET original_due_at = due_at WHERE due_at IS NOT NULL;

ALTER TABLE tasks
    ADD COLUMN estimate_hours NUMERIC(5, 1) CHECK (estimate_hours IS NULL OR (estimate_hours > 0 AND estimate_hours <= 999)),
    ADD COLUMN spent_minutes  INTEGER NOT NULL DEFAULT 0 CHECK (spent_minutes >= 0 AND spent_minutes <= 600000),
    ADD COLUMN closed_commit  TEXT    NOT NULL DEFAULT '';             -- last commit that marked it done

ALTER TABLE obstacles
    ADD COLUMN timer_until TIMESTAMPTZ,                                -- end of the current attempt window
    ADD COLUMN needs_help  BOOLEAN NOT NULL DEFAULT FALSE;             -- outside help was chosen

-- Things that happened to a project and cannot be derived from its current rows:
-- scope changes after coding started, deadline moves with their reason, cuts.
CREATE TABLE events (
    id         BIGSERIAL PRIMARY KEY,
    project_id BIGINT      NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    kind       TEXT        NOT NULL CHECK (kind IN ('scope_add', 'scope_park', 'scope_cut', 'date_move')),
    at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    data       JSONB       NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX events_project_idx ON events (project_id, at);

-- "Today's three": the tasks picked for a day. The title is kept so the journal can still
-- say what was picked after a task is deleted.
CREATE TABLE day_picks (
    id         BIGSERIAL PRIMARY KEY,
    project_id BIGINT      NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    day        DATE        NOT NULL,
    task_id    BIGINT      REFERENCES tasks (id) ON DELETE SET NULL,
    title      TEXT        NOT NULL,
    position   INTEGER     NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX day_picks_project_idx ON day_picks (project_id, day);

-- A read-only copy of the blueprint, taken at the moment coding started.
CREATE TABLE plan_snapshots (
    project_id BIGINT      PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
    taken_at   TIMESTAMPTZ NOT NULL,
    data       JSONB       NOT NULL
);

-- Settings of the whole installation (not of one project).
CREATE TABLE settings (
    key   TEXT  PRIMARY KEY,
    value JSONB NOT NULL
);
