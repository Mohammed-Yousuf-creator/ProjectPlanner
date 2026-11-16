-- Project Planner - initial schema
-- Data stored locally on the user's computer (Postgres).

CREATE TABLE IF NOT EXISTS projects (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    description    TEXT,
    type           TEXT NOT NULL DEFAULT 'standard',      -- 'standard' | 'hackathon'
    goal           TEXT,                                   -- why / who / value (video1)
    status         TEXT NOT NULL DEFAULT 'planning',      -- 'planning' | 'coding' | 'done'
    coding_deadline TIMESTAMPTZ,                          -- decision date + 14 days (video2 anti-doom)
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hackathon_start TIMESTAMPTZ,                          -- hackathon countdown start
    hackathon_end   TIMESTAMPTZ,
    mvp_only        BOOLEAN NOT NULL DEFAULT FALSE        -- hackathon MVP-only scope
);

CREATE TABLE IF NOT EXISTS user_stories (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT,
    priority    TEXT NOT NULL DEFAULT 'medium',           -- low | medium | high
    status      TEXT NOT NULL DEFAULT 'todo',             -- todo | in_progress | done
    story_points INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_stories_project ON user_stories(project_id);

CREATE TABLE IF NOT EXISTS tasks (
    id             TEXT PRIMARY KEY,
    project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_story_id  TEXT REFERENCES user_stories(id) ON DELETE SET NULL,
    title          TEXT NOT NULL,
    description    TEXT,
    status         TEXT NOT NULL DEFAULT 'todo',          -- todo | in_progress | done
    due_date       TIMESTAMPTZ,
    time_box_min   INTEGER,                                -- hackathon time-boxing
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_story ON tasks(user_story_id);

CREATE TABLE IF NOT EXISTS data_models (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    fields      JSONB NOT NULL DEFAULT '[]'::jsonb,       -- {name, type}[]
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_models_project ON data_models(project_id);

CREATE TABLE IF NOT EXISTS file_uploads (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    original_name   TEXT NOT NULL,
    stored_name     TEXT NOT NULL,                        -- compressed file on disk
    path            TEXT NOT NULL,
    size            BIGINT NOT NULL,                      -- original size (bytes)
    compressed_size BIGINT NOT NULL,                      -- stored size (bytes)
    content_type    TEXT NOT NULL,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_uploads_project ON file_uploads(project_id);
