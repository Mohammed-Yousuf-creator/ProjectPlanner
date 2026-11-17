package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	"projectplanner/internal/model"
)

// ---------- events ----------

func (s *Store) AddEvent(ctx context.Context, projectID int64, kind string, at time.Time, data any) error {
	_, err := s.q.ExecContext(ctx,
		`INSERT INTO events (project_id, kind, at, data) VALUES ($1, $2, $3, $4::jsonb)`, projectID, kind, at, toJSON(data))
	return err
}

func (s *Store) ListEvents(ctx context.Context, projectID int64) ([]model.Event, error) {
	rows, err := s.q.QueryContext(ctx,
		`SELECT id, project_id, kind, at, data FROM events WHERE project_id = $1 ORDER BY at, id`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.Event{}
	for rows.Next() {
		var (
			e    model.Event
			data []byte
		)
		if err := rows.Scan(&e.ID, &e.ProjectID, &e.Kind, &e.At, &data); err != nil {
			return nil, err
		}
		e.Data = json.RawMessage(data)
		out = append(out, e)
	}
	return out, rows.Err()
}

// ---------- today's three ----------

func (s *Store) ListPicks(ctx context.Context, projectID int64) ([]model.DayPick, error) {
	rows, err := s.q.QueryContext(ctx, `
		SELECT id, project_id, to_char(day, 'YYYY-MM-DD'), task_id, title, position
		FROM day_picks WHERE project_id = $1 ORDER BY day DESC, position, id`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.DayPick{}
	for rows.Next() {
		var (
			p    model.DayPick
			task sql.NullInt64
		)
		if err := rows.Scan(&p.ID, &p.ProjectID, &p.Day, &task, &p.Title, &p.Position); err != nil {
			return nil, err
		}
		if task.Valid {
			p.TaskID = &task.Int64
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ReplacePicks sets the picks of one day.
func (s *Store) ReplacePicks(ctx context.Context, projectID int64, day string, picks []model.DayPick) error {
	if _, err := s.q.ExecContext(ctx,
		`DELETE FROM day_picks WHERE project_id = $1 AND day = $2::date`, projectID, day); err != nil {
		return err
	}
	for i, p := range picks {
		if _, err := s.q.ExecContext(ctx,
			`INSERT INTO day_picks (project_id, day, task_id, title, position) VALUES ($1, $2::date, $3, $4, $5)`,
			projectID, day, p.TaskID, p.Title, i); err != nil {
			return err
		}
	}
	return nil
}

// ---------- plan snapshot ----------

// SaveSnapshot stores the blueprint as it is now. A project keeps its first snapshot.
func (s *Store) SaveSnapshot(ctx context.Context, projectID int64, at time.Time, data any) error {
	_, err := s.q.ExecContext(ctx, `
		INSERT INTO plan_snapshots (project_id, taken_at, data) VALUES ($1, $2, $3::jsonb)
		ON CONFLICT (project_id) DO NOTHING`, projectID, at, toJSON(data))
	return err
}

func (s *Store) GetSnapshot(ctx context.Context, projectID int64) (model.Snapshot, error) {
	var (
		sn   model.Snapshot
		data []byte
	)
	err := s.q.QueryRowContext(ctx,
		`SELECT project_id, taken_at, data FROM plan_snapshots WHERE project_id = $1`, projectID).Scan(&sn.ProjectID, &sn.TakenAt, &data)
	sn.Data = json.RawMessage(data)
	return sn, notFound(err)
}

// ---------- installation settings ----------

// GetSetting decodes a stored setting into v. It reports false when the key was never saved.
func (s *Store) GetSetting(ctx context.Context, key string, v any) (bool, error) {
	var data []byte
	err := s.q.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = $1`, key).Scan(&data)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, json.Unmarshal(data, v)
}

func (s *Store) SetSetting(ctx context.Context, key string, v any) error {
	_, err := s.q.ExecContext(ctx, `
		INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, key, toJSON(v))
	return err
}

// ---------- search ----------

type SearchHit struct {
	Kind        string `json:"kind"` // project | answer | story | item | task | obstacle | log
	ProjectID   int64  `json:"project_id"`
	ProjectName string `json:"project_name"`
	ID          int64  `json:"id"`
	Sub         string `json:"sub"` // plan key, item kind, day, task status ...
	Title       string `json:"title"`
	Snippet     string `json:"snippet"`
}

// likePattern turns user text into a pattern for ILIKE that matches it literally.
func likePattern(q string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return "%" + r.Replace(q) + "%"
}

// Search looks for text in every project: names, blueprint answers, stories, blueprint lists,
// tasks, obstacles (with their fixes) and journal entries.
func (s *Store) Search(ctx context.Context, q string, limit int) ([]SearchHit, error) {
	rows, err := s.q.QueryContext(ctx, `
		SELECT * FROM (
			SELECT 'project' AS kind, p.id AS project_id, p.name AS project_name, p.id AS id, '' AS sub,
				p.name AS title, p.summary AS snippet, p.updated_at AS at, 0 AS rank
			FROM projects p WHERE p.name ILIKE $1 OR p.summary ILIKE $1
			UNION ALL
			SELECT 'obstacle', p.id, p.name, o.id, o.status, o.title,
				CASE WHEN o.resolution <> '' THEN o.resolution ELSE o.approaches END, o.created_at, 1
			FROM obstacles o JOIN projects p ON p.id = o.project_id
			WHERE o.title ILIKE $1 OR o.resolution ILIKE $1 OR o.approaches ILIKE $1
			UNION ALL
			SELECT 'task', p.id, p.name, t.id, t.status, t.title, t.notes, t.created_at, 2
			FROM tasks t JOIN projects p ON p.id = t.project_id
			WHERE t.title ILIKE $1 OR t.notes ILIKE $1 OR t.checklist::text ILIKE $1
			UNION ALL
			SELECT 'answer', p.id, p.name, p.id, kv.key, kv.key, kv.value, p.updated_at, 3
			FROM projects p, jsonb_each_text(p.plan) kv WHERE kv.value ILIKE $1
			UNION ALL
			SELECT 'item', p.id, p.name, i.id, i.kind,
				COALESCE(NULLIF(i.data->>'name', ''), NULLIF(i.data->>'title', ''), NULLIF(i.data->>'text', ''),
					NULLIF(i.data->>'layer', ''), i.kind),
				COALESCE((SELECT kv.value FROM jsonb_each_text(i.data) kv WHERE kv.value ILIKE $1 LIMIT 1), ''),
				i.updated_at, 4
			FROM plan_items i JOIN projects p ON p.id = i.project_id
			WHERE EXISTS (SELECT 1 FROM jsonb_each_text(i.data) kv WHERE kv.value ILIKE $1)
			UNION ALL
			SELECT 'story', p.id, p.name, st.id, st.tier, st.text, '', st.created_at, 5
			FROM stories st JOIN projects p ON p.id = st.project_id WHERE st.text ILIKE $1
			UNION ALL
			SELECT 'log', p.id, p.name, l.id, to_char(l.day, 'YYYY-MM-DD'), to_char(l.day, 'YYYY-MM-DD'), l.summary, l.updated_at, 6
			FROM daily_logs l JOIN projects p ON p.id = l.project_id WHERE l.summary ILIKE $1
		) hits
		ORDER BY rank, at DESC
		LIMIT $2`, likePattern(q), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SearchHit{}
	for rows.Next() {
		var (
			h    SearchHit
			at   time.Time
			rank int
		)
		if err := rows.Scan(&h.Kind, &h.ProjectID, &h.ProjectName, &h.ID, &h.Sub, &h.Title, &h.Snippet, &at, &rank); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

// ---------- activity across projects ----------

type LogDay struct {
	Day     string
	Entries int
	Hours   float64
}

// LogDays sums the journal of every project per day, from a day (YYYY-MM-DD) on.
func (s *Store) LogDays(ctx context.Context, from string) ([]LogDay, error) {
	rows, err := s.q.QueryContext(ctx, `
		SELECT to_char(day, 'YYYY-MM-DD'), count(*), COALESCE(sum(hours), 0)::float8
		FROM daily_logs WHERE day >= $1::date GROUP BY day ORDER BY day`, from)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []LogDay
	for rows.Next() {
		var d LogDay
		if err := rows.Scan(&d.Day, &d.Entries, &d.Hours); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// TaskDoneTimes lists when tasks were finished, in every project, since a moment.
func (s *Store) TaskDoneTimes(ctx context.Context, since time.Time) ([]time.Time, error) {
	rows, err := s.q.QueryContext(ctx,
		`SELECT done_at FROM tasks WHERE status = 'done' AND done_at >= $1`, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []time.Time
	for rows.Next() {
		var t time.Time
		if err := rows.Scan(&t); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// EstimateTotals sums estimates and time actually spent over every finished task that has both.
func (s *Store) EstimateTotals(ctx context.Context) (estimated, spent float64, tasks int, err error) {
	err = s.q.QueryRowContext(ctx, `
		SELECT COALESCE(sum(estimate_hours), 0)::float8, COALESCE(sum(spent_minutes), 0)::float8 / 60, count(*)
		FROM tasks WHERE status = 'done' AND estimate_hours IS NOT NULL AND spent_minutes > 0`).Scan(&estimated, &spent, &tasks)
	return
}

type Lesson struct {
	ProjectID int64      `json:"project_id"`
	Project   string     `json:"project"`
	Kind      string     `json:"kind"` // abandoned | shipped
	Text      string     `json:"text"`
	At        *time.Time `json:"at"`
}

// Lessons collects what earlier projects taught: why unfinished ones were dropped, and what
// the retrospectives of shipped ones say to do differently.
func (s *Store) Lessons(ctx context.Context) ([]Lesson, error) {
	rows, err := s.q.QueryContext(ctx, `
		SELECT * FROM (
			SELECT id, name, 'abandoned' AS kind, archive_reason AS text, archived_at AS at
			FROM projects WHERE archived AND archive_reason <> ''
			UNION ALL
			SELECT id, name, 'shipped', plan->>'retro_change', shipped_at
			FROM projects WHERE COALESCE(plan->>'retro_change', '') <> ''
		) l ORDER BY at DESC NULLS LAST LIMIT 20`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Lesson{}
	for rows.Next() {
		var (
			l  Lesson
			at sql.NullTime
		)
		if err := rows.Scan(&l.ProjectID, &l.Project, &l.Kind, &l.Text, &at); err != nil {
			return nil, err
		}
		l.At = timePtr(at)
		out = append(out, l)
	}
	return out, rows.Err()
}

// ---------- import (rows keep their original timestamps) ----------

// ImportProject inserts a project exactly as it was exported, under a new id.
func (s *Store) ImportProject(ctx context.Context, p model.Project) (int64, error) {
	var id int64
	err := s.q.QueryRowContext(ctx, `
		INSERT INTO projects (name, summary, type, complexity, vendor_mode, phase, archived, decided_at,
			planning_deadline, build_started_at, forced_start, shipped_at, target_date, hack_start, hack_end,
			repo_path, plan, steps, created_at, updated_at, kit, archive_reason, archived_at, build_ack_at,
			original_target_date, stale_hours, plan_sync, commit_close)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::date, $14, $15, '', $16::jsonb, $17::jsonb,
			$18, $19, $20, $21, $22, $23, $24::date, $25, FALSE, FALSE)
		RETURNING id`,
		p.Name, p.Summary, p.Type, p.Complexity, p.VendorMode, p.Phase, p.Archived, p.DecidedAt,
		p.PlanningDeadline, p.BuildStartedAt, p.ForcedStart, p.ShippedAt, p.TargetDate, p.HackStart, p.HackEnd,
		toJSON(p.Plan), toJSON(p.Steps), p.CreatedAt, p.UpdatedAt, p.Kit, p.ArchiveReason, p.ArchivedAt,
		p.BuildAckAt, p.OriginalTargetDate, p.StaleHours).Scan(&id)
	return id, err
}

func (s *Store) ImportStory(ctx context.Context, st model.Story) (int64, error) {
	var id int64
	err := s.q.QueryRowContext(ctx, `
		INSERT INTO stories (project_id, text, tier, position, cut_rank, created_at)
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		st.ProjectID, st.Text, st.Tier, st.Position, st.CutRank, st.CreatedAt).Scan(&id)
	return id, err
}

func (s *Store) ImportItem(ctx context.Context, it model.PlanItem) (int64, error) {
	var id int64
	err := s.q.QueryRowContext(ctx, `
		INSERT INTO plan_items (project_id, kind, data, position, created_at, updated_at)
		VALUES ($1, $2, $3::jsonb, $4, $5, $6) RETURNING id`,
		it.ProjectID, it.Kind, string(it.Data), it.Position, it.CreatedAt, it.UpdatedAt).Scan(&id)
	return id, err
}

// ProjectNameTaken reports whether a project with exactly this name exists.
func (s *Store) ProjectNameTaken(ctx context.Context, name string) (bool, error) {
	var taken bool
	err := s.q.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM projects WHERE name = $1)`, name).Scan(&taken)
	return taken, err
}

func (s *Store) ImportMilestone(ctx context.Context, m model.Milestone) (int64, error) {
	var id int64
	err := s.q.QueryRowContext(ctx, `
		INSERT INTO milestones (project_id, title, due_at, position, origin, created_at, original_due_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
		m.ProjectID, m.Title, m.DueAt, m.Position, m.Origin, m.CreatedAt, m.OriginalDueAt).Scan(&id)
	return id, err
}

func (s *Store) ImportTask(ctx context.Context, t model.Task) (int64, error) {
	if t.Checklist == nil {
		t.Checklist = []model.ChecklistItem{}
	}
	var id int64
	err := s.q.QueryRowContext(ctx, `
		INSERT INTO tasks (project_id, milestone_id, story_id, title, notes, status, scope, due_at, position,
			checklist, origin, created_at, started_at, done_at, estimate_hours, spent_minutes)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16) RETURNING id`,
		t.ProjectID, t.MilestoneID, t.StoryID, t.Title, t.Notes, t.Status, t.Scope, t.DueAt, t.Position,
		toJSON(t.Checklist), t.Origin, t.CreatedAt, t.StartedAt, t.DoneAt, t.EstimateHours, t.SpentMinutes).Scan(&id)
	return id, err
}

func (s *Store) ImportLog(ctx context.Context, l model.DailyLog) error {
	_, err := s.q.ExecContext(ctx, `
		INSERT INTO daily_logs (project_id, day, summary, hours, updated_at) VALUES ($1, $2::date, $3, $4, $5)`,
		l.ProjectID, l.Day, l.Summary, l.Hours, l.UpdatedAt)
	return err
}

func (s *Store) ImportObstacle(ctx context.Context, o model.Obstacle) error {
	_, err := s.q.ExecContext(ctx, `
		INSERT INTO obstacles (project_id, task_id, title, kind, attempts, approaches, resolution, status,
			created_at, resolved_at, timer_until, needs_help)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
		o.ProjectID, o.TaskID, o.Title, o.Kind, o.Attempts, o.Approaches, o.Resolution, o.Status,
		o.CreatedAt, o.ResolvedAt, o.TimerUntil, o.NeedsHelp)
	return err
}

func (s *Store) ImportFile(ctx context.Context, f model.File) error {
	_, err := s.q.ExecContext(ctx, `
		INSERT INTO files (project_id, category, name, mime, original_size, stored_size, compression, storage_key, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		f.ProjectID, f.Category, f.Name, f.Mime, f.OriginalSize, f.StoredSize, f.Compression, f.StorageKey, f.CreatedAt)
	return err
}

func (s *Store) ImportPick(ctx context.Context, p model.DayPick) error {
	_, err := s.q.ExecContext(ctx,
		`INSERT INTO day_picks (project_id, day, task_id, title, position) VALUES ($1, $2::date, $3, $4, $5)`,
		p.ProjectID, p.Day, p.TaskID, p.Title, p.Position)
	return err
}

func (s *Store) ImportSnapshot(ctx context.Context, sn model.Snapshot) error {
	_, err := s.q.ExecContext(ctx,
		`INSERT INTO plan_snapshots (project_id, taken_at, data) VALUES ($1, $2, $3::jsonb)`,
		sn.ProjectID, sn.TakenAt, string(sn.Data))
	return err
}

// ParkStoryTasks moves the open tasks of a story into the expansion pack backlog and reports
// their titles.
func (s *Store) ParkStoryTasks(ctx context.Context, storyID int64) ([]string, error) {
	rows, err := s.q.QueryContext(ctx, `
		UPDATE tasks SET scope = 'dlc', status = 'backlog', done_at = NULL
		WHERE story_id = $1 AND status <> 'done' AND scope <> 'dlc' RETURNING title`, storyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	titles := []string{}
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return nil, err
		}
		titles = append(titles, t)
	}
	return titles, rows.Err()
}
