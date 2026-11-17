-- ProjectPlanner schema.
-- Everything hangs off a project; deleting a project removes all of its data.

CREATE TABLE projects (
    id                BIGSERIAL PRIMARY KEY,
    name              TEXT        NOT NULL CHECK (length(btrim(name)) > 0),
    summary           TEXT        NOT NULL DEFAULT '',
    type              TEXT        NOT NULL CHECK (type IN ('standard', 'hackathon')),
    complexity        TEXT        NOT NULL DEFAULT 'medium'
                                  CHECK (complexity IN ('tiny', 'small', 'medium', 'hard')),
    -- Default answer to "build it myself or use an external service?" (optional, per project).
    vendor_mode       TEXT        NOT NULL DEFAULT 'diy' CHECK (vendor_mode IN ('diy', 'fasttrack')),
    phase             TEXT        NOT NULL DEFAULT 'plan' CHECK (phase IN ('plan', 'build', 'shipped')),
    archived          BOOLEAN     NOT NULL DEFAULT FALSE,

    -- The moment you decided to do the project. Never changes.
    decided_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- The moment planning ends and coding starts, whether the plan is "finished" or not.
    planning_deadline TIMESTAMPTZ NOT NULL,
    build_started_at  TIMESTAMPTZ,
    forced_start      BOOLEAN     NOT NULL DEFAULT FALSE,
    shipped_at        TIMESTAMPTZ,
    target_date       DATE,

    hack_start        TIMESTAMPTZ,
    hack_end          TIMESTAMPTZ,

    repo_path         TEXT        NOT NULL DEFAULT '',
    plan              JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- free-text blueprint answers
    steps             JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- planning step -> todo|done|skipped
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT hackathon_window CHECK (
        type <> 'hackathon'
        OR (hack_start IS NOT NULL AND hack_end IS NOT NULL AND hack_end > hack_start)
    ),
    -- The anti-doom-perfectionism rule, enforced by the database itself:
    -- a standard project starts coding at most 14 days after it was decided on;
    -- a hackathon spends at most a quarter of the event (and never more than 14 days) planning.
    CONSTRAINT two_week_rule CHECK (
        (type = 'standard'
            AND planning_deadline <= decided_at + INTERVAL '14 days')
        OR (type = 'hackathon'
            AND planning_deadline <= hack_start + (hack_end - hack_start) / 4
            AND planning_deadline <= hack_start + INTERVAL '14 days')
    )
);

CREATE TABLE stories (
    id         BIGSERIAL PRIMARY KEY,
    project_id BIGINT           NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    text       TEXT             NOT NULL,
    tier       TEXT             NOT NULL DEFAULT 'unsorted'
                                CHECK (tier IN ('unsorted', 'mvp', 'later', 'cut')),
    position   DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ      NOT NULL DEFAULT now()
);
CREATE INDEX stories_project_idx ON stories (project_id);

-- Descriptive blueprint lists (questions, resources, data models, modules, stack choices,
-- build-vs-buy capabilities, data flows, judging criteria, submission checklist).
-- They are documents, not behaviour, so one table with a JSON payload per kind is enough.
CREATE TABLE plan_items (
    id         BIGSERIAL PRIMARY KEY,
    project_id BIGINT           NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    kind       TEXT             NOT NULL,
    data       JSONB            NOT NULL DEFAULT '{}'::jsonb,
    position   DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ      NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ      NOT NULL DEFAULT now()
);
CREATE INDEX plan_items_project_idx ON plan_items (project_id, kind);

CREATE TABLE milestones (
    id         BIGSERIAL PRIMARY KEY,
    project_id BIGINT           NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    title      TEXT             NOT NULL,
    due_at     TIMESTAMPTZ,
    position   DOUBLE PRECISION NOT NULL DEFAULT 0,
    origin     TEXT             NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ      NOT NULL DEFAULT now()
);
CREATE INDEX milestones_project_idx ON milestones (project_id);
CREATE UNIQUE INDEX milestones_origin_idx ON milestones (project_id, origin) WHERE origin <> '';

CREATE TABLE tasks (
    id           BIGSERIAL PRIMARY KEY,
    project_id   BIGINT           NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    milestone_id BIGINT           REFERENCES milestones (id) ON DELETE SET NULL,
    story_id     BIGINT           REFERENCES stories (id) ON DELETE SET NULL,
    title        TEXT             NOT NULL,
    notes        TEXT             NOT NULL DEFAULT '',
    status       TEXT             NOT NULL DEFAULT 'todo'
                                  CHECK (status IN ('backlog', 'todo', 'doing', 'done')),
    -- mvp: needed for the first working version. dlc: expansion pack, after the MVP ships.
    -- debt: a planning decision that was not made in time and must be made while building.
    scope        TEXT             NOT NULL DEFAULT 'mvp' CHECK (scope IN ('mvp', 'dlc', 'debt')),
    due_at       TIMESTAMPTZ,
    position     DOUBLE PRECISION NOT NULL DEFAULT 0,
    checklist    JSONB            NOT NULL DEFAULT '[]'::jsonb,   -- [{ "text": "...", "done": false }]
    origin       TEXT             NOT NULL DEFAULT '',            -- what generated this task, if anything
    created_at   TIMESTAMPTZ      NOT NULL DEFAULT now(),
    started_at   TIMESTAMPTZ,
    done_at      TIMESTAMPTZ
);
CREATE INDEX tasks_project_idx ON tasks (project_id);
CREATE UNIQUE INDEX tasks_origin_idx ON tasks (project_id, origin) WHERE origin <> '';

-- One entry per day: the "commit message for today".
CREATE TABLE daily_logs (
    id         BIGSERIAL PRIMARY KEY,
    project_id BIGINT       NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    day        DATE         NOT NULL,
    summary    TEXT         NOT NULL,
    hours      NUMERIC(4, 1),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (project_id, day)
);

CREATE TABLE obstacles (
    id          BIGSERIAL PRIMARY KEY,
    project_id  BIGINT      NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    task_id     BIGINT      REFERENCES tasks (id) ON DELETE SET NULL,
    title       TEXT        NOT NULL,
    kind        TEXT        NOT NULL DEFAULT 'unsorted'
                            CHECK (kind IN ('unsorted', 'memory', 'knowledge', 'problem', 'debug')),
    attempts    INTEGER     NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    approaches  TEXT        NOT NULL DEFAULT '',
    resolution  TEXT        NOT NULL DEFAULT '',
    status      TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX obstacles_project_idx ON obstacles (project_id);

-- File metadata. The bytes live compressed on disk under the data directory.
CREATE TABLE files (
    id            BIGSERIAL PRIMARY KEY,
    project_id    BIGINT      NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    category      TEXT        NOT NULL DEFAULT 'other'
                              CHECK (category IN ('wireframe', 'reference', 'other')),
    name          TEXT        NOT NULL,
    mime          TEXT        NOT NULL,
    original_size BIGINT      NOT NULL CHECK (original_size >= 0 AND original_size <= 10485760),
    stored_size   BIGINT      NOT NULL CHECK (stored_size >= 0),
    compression   TEXT        NOT NULL CHECK (compression IN ('zstd', 'none')),
    storage_key   TEXT        NOT NULL UNIQUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX files_project_idx ON files (project_id);
