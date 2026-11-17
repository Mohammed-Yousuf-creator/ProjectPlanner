package store

import (
	"context"
	"database/sql"
	"encoding/json"

	"projectplanner/internal/model"
)

// ---------- milestones ----------

const milestoneCols = `id, project_id, title, due_at, position, origin, created_at`

func scanMilestone(row scanner) (model.Milestone, error) {
	var (
		m   model.Milestone
		due sql.NullTime
	)
	err := row.Scan(&m.ID, &m.ProjectID, &m.Title, &due, &m.Position, &m.Origin, &m.CreatedAt)
	m.DueAt = timePtr(due)
	return m, notFound(err)
}

func (s *Store) ListMilestones(ctx context.Context, projectID int64) ([]model.Milestone, error) {
	rows, err := s.q.QueryContext(ctx,
		`SELECT `+milestoneCols+` FROM milestones WHERE project_id = $1 ORDER BY position, id`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.Milestone{}
	for rows.Next() {
		m, err := scanMilestone(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Store) GetMilestone(ctx context.Context, id int64) (model.Milestone, error) {
	return scanMilestone(s.q.QueryRowContext(ctx, `SELECT `+milestoneCols+` FROM milestones WHERE id = $1`, id))
}

// CreateMilestone inserts a milestone. When origin is set and a milestone with that origin
// already exists in the project, the existing one is returned instead (generation is idempotent).
func (s *Store) CreateMilestone(ctx context.Context, m model.Milestone) (model.Milestone, error) {
	if m.Origin != "" {
		existing, err := scanMilestone(s.q.QueryRowContext(ctx,
			`SELECT `+milestoneCols+` FROM milestones WHERE project_id = $1 AND origin = $2`, m.ProjectID, m.Origin))
		if err == nil {
			return existing, nil
		}
		if err != ErrNotFound {
			return m, err
		}
	}
	return scanMilestone(s.q.QueryRowContext(ctx, `
		INSERT INTO milestones (project_id, title, due_at, origin, position)
		VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(position), 0) + 1 FROM milestones WHERE project_id = $1))
		RETURNING `+milestoneCols, m.ProjectID, m.Title, m.DueAt, m.Origin))
}

func (s *Store) UpdateMilestone(ctx context.Context, m model.Milestone) (model.Milestone, error) {
	return scanMilestone(s.q.QueryRowContext(ctx, `
		UPDATE milestones SET title = $2, due_at = $3, position = $4 WHERE id = $1
		RETURNING `+milestoneCols, m.ID, m.Title, m.DueAt, m.Position))
}

func (s *Store) DeleteMilestone(ctx context.Context, id int64) error {
	return affected(s.q.ExecContext(ctx, `DELETE FROM milestones WHERE id = $1`, id))
}

// ---------- tasks ----------

const taskCols = `id, project_id, milestone_id, story_id, title, notes, status, scope, due_at, position,
	checklist, origin, created_at, started_at, done_at`

func scanTask(row scanner) (model.Task, error) {
	var (
		t                  model.Task
		ms, story          sql.NullInt64
		due, started, done sql.NullTime
		checklist          []byte
	)
	err := row.Scan(&t.ID, &t.ProjectID, &ms, &story, &t.Title, &t.Notes, &t.Status, &t.Scope, &due,
		&t.Position, &checklist, &t.Origin, &t.CreatedAt, &started, &done)
	if err != nil {
		return t, notFound(err)
	}
	if ms.Valid {
		t.MilestoneID = &ms.Int64
	}
	if story.Valid {
		t.StoryID = &story.Int64
	}
	t.DueAt, t.StartedAt, t.DoneAt = timePtr(due), timePtr(started), timePtr(done)
	t.Checklist = []model.ChecklistItem{}
	_ = json.Unmarshal(checklist, &t.Checklist)
	return t, nil
}

func (s *Store) ListTasks(ctx context.Context, projectID int64) ([]model.Task, error) {
	rows, err := s.q.QueryContext(ctx,
		`SELECT `+taskCols+` FROM tasks WHERE project_id = $1 ORDER BY position, id`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.Task{}
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) GetTask(ctx context.Context, id int64) (model.Task, error) {
	return scanTask(s.q.QueryRowContext(ctx, `SELECT `+taskCols+` FROM tasks WHERE id = $1`, id))
}

// CreateTask appends a task to the end of its project. A task whose origin already exists in
// the project is skipped; created reports whether a row was actually inserted.
func (s *Store) CreateTask(ctx context.Context, t model.Task) (task model.Task, created bool, err error) {
	if t.Checklist == nil {
		t.Checklist = []model.ChecklistItem{}
	}
	task, err = scanTask(s.q.QueryRowContext(ctx, `
		INSERT INTO tasks (project_id, milestone_id, story_id, title, notes, status, scope, due_at,
			checklist, origin, started_at, done_at, position)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12,
			(SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = $1))
		ON CONFLICT (project_id, origin) WHERE origin <> '' DO NOTHING
		RETURNING `+taskCols,
		t.ProjectID, t.MilestoneID, t.StoryID, t.Title, t.Notes, t.Status, t.Scope, t.DueAt,
		toJSON(t.Checklist), t.Origin, t.StartedAt, t.DoneAt))
	if err == ErrNotFound { // conflict: nothing inserted
		return t, false, nil
	}
	return task, err == nil, err
}

func (s *Store) UpdateTask(ctx context.Context, t model.Task) (model.Task, error) {
	if t.Checklist == nil {
		t.Checklist = []model.ChecklistItem{}
	}
	return scanTask(s.q.QueryRowContext(ctx, `
		UPDATE tasks SET milestone_id = $2, story_id = $3, title = $4, notes = $5, status = $6,
			scope = $7, due_at = $8, position = $9, checklist = $10::jsonb, started_at = $11, done_at = $12
		WHERE id = $1
		RETURNING `+taskCols,
		t.ID, t.MilestoneID, t.StoryID, t.Title, t.Notes, t.Status, t.Scope, t.DueAt, t.Position,
		toJSON(t.Checklist), t.StartedAt, t.DoneAt))
}

func (s *Store) DeleteTask(ctx context.Context, id int64) error {
	return affected(s.q.ExecContext(ctx, `DELETE FROM tasks WHERE id = $1`, id))
}

// ---------- daily logs ----------

const logCols = `id, project_id, to_char(day, 'YYYY-MM-DD'), summary, hours::float8, updated_at`

func scanLog(row scanner) (model.DailyLog, error) {
	var (
		l     model.DailyLog
		hours sql.NullFloat64
	)
	err := row.Scan(&l.ID, &l.ProjectID, &l.Day, &l.Summary, &hours, &l.UpdatedAt)
	if hours.Valid {
		l.Hours = &hours.Float64
	}
	return l, notFound(err)
}

func (s *Store) ListLogs(ctx context.Context, projectID int64) ([]model.DailyLog, error) {
	rows, err := s.q.QueryContext(ctx,
		`SELECT `+logCols+` FROM daily_logs WHERE project_id = $1 ORDER BY day DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.DailyLog{}
	for rows.Next() {
		l, err := scanLog(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (s *Store) UpsertLog(ctx context.Context, l model.DailyLog) (model.DailyLog, error) {
	return scanLog(s.q.QueryRowContext(ctx, `
		INSERT INTO daily_logs (project_id, day, summary, hours) VALUES ($1, $2::date, $3, $4)
		ON CONFLICT (project_id, day)
		DO UPDATE SET summary = EXCLUDED.summary, hours = EXCLUDED.hours, updated_at = now()
		RETURNING `+logCols, l.ProjectID, l.Day, l.Summary, l.Hours))
}

func (s *Store) DeleteLog(ctx context.Context, projectID int64, day string) error {
	return affected(s.q.ExecContext(ctx,
		`DELETE FROM daily_logs WHERE project_id = $1 AND day = $2::date`, projectID, day))
}

// ---------- obstacles ----------

const obstacleCols = `id, project_id, task_id, title, kind, attempts, approaches, resolution, status,
	created_at, resolved_at`

func scanObstacle(row scanner) (model.Obstacle, error) {
	var (
		o        model.Obstacle
		task     sql.NullInt64
		resolved sql.NullTime
	)
	err := row.Scan(&o.ID, &o.ProjectID, &task, &o.Title, &o.Kind, &o.Attempts, &o.Approaches,
		&o.Resolution, &o.Status, &o.CreatedAt, &resolved)
	if task.Valid {
		o.TaskID = &task.Int64
	}
	o.ResolvedAt = timePtr(resolved)
	return o, notFound(err)
}

func (s *Store) ListObstacles(ctx context.Context, projectID int64) ([]model.Obstacle, error) {
	rows, err := s.q.QueryContext(ctx,
		`SELECT `+obstacleCols+` FROM obstacles WHERE project_id = $1 ORDER BY status, created_at DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.Obstacle{}
	for rows.Next() {
		o, err := scanObstacle(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

func (s *Store) GetObstacle(ctx context.Context, id int64) (model.Obstacle, error) {
	return scanObstacle(s.q.QueryRowContext(ctx, `SELECT `+obstacleCols+` FROM obstacles WHERE id = $1`, id))
}

func (s *Store) CreateObstacle(ctx context.Context, o model.Obstacle) (model.Obstacle, error) {
	return scanObstacle(s.q.QueryRowContext(ctx, `
		INSERT INTO obstacles (project_id, task_id, title, kind, attempts, approaches, resolution, status, resolved_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING `+obstacleCols,
		o.ProjectID, o.TaskID, o.Title, o.Kind, o.Attempts, o.Approaches, o.Resolution, o.Status, o.ResolvedAt))
}

func (s *Store) UpdateObstacle(ctx context.Context, o model.Obstacle) (model.Obstacle, error) {
	return scanObstacle(s.q.QueryRowContext(ctx, `
		UPDATE obstacles SET task_id = $2, title = $3, kind = $4, attempts = $5, approaches = $6,
			resolution = $7, status = $8, resolved_at = $9
		WHERE id = $1
		RETURNING `+obstacleCols,
		o.ID, o.TaskID, o.Title, o.Kind, o.Attempts, o.Approaches, o.Resolution, o.Status, o.ResolvedAt))
}

func (s *Store) DeleteObstacle(ctx context.Context, id int64) error {
	return affected(s.q.ExecContext(ctx, `DELETE FROM obstacles WHERE id = $1`, id))
}

// ---------- files (metadata only) ----------

const fileCols = `id, project_id, category, name, mime, original_size, stored_size, compression,
	storage_key, created_at`

func scanFile(row scanner) (model.File, error) {
	var f model.File
	err := row.Scan(&f.ID, &f.ProjectID, &f.Category, &f.Name, &f.Mime, &f.OriginalSize, &f.StoredSize,
		&f.Compression, &f.StorageKey, &f.CreatedAt)
	return f, notFound(err)
}

func (s *Store) ListFiles(ctx context.Context, projectID int64) ([]model.File, error) {
	rows, err := s.q.QueryContext(ctx,
		`SELECT `+fileCols+` FROM files WHERE project_id = $1 ORDER BY created_at DESC, id DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.File{}
	for rows.Next() {
		f, err := scanFile(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func (s *Store) GetFile(ctx context.Context, id int64) (model.File, error) {
	return scanFile(s.q.QueryRowContext(ctx, `SELECT `+fileCols+` FROM files WHERE id = $1`, id))
}

func (s *Store) CreateFile(ctx context.Context, f model.File) (model.File, error) {
	return scanFile(s.q.QueryRowContext(ctx, `
		INSERT INTO files (project_id, category, name, mime, original_size, stored_size, compression, storage_key)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING `+fileCols,
		f.ProjectID, f.Category, f.Name, f.Mime, f.OriginalSize, f.StoredSize, f.Compression, f.StorageKey))
}

func (s *Store) DeleteFile(ctx context.Context, id int64) error {
	return affected(s.q.ExecContext(ctx, `DELETE FROM files WHERE id = $1`, id))
}
