package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"projectplanner/internal/model"
)

const projectCols = `p.id, p.name, p.summary, p.type, p.complexity, p.vendor_mode, p.phase, p.archived,
	p.decided_at, p.planning_deadline, p.build_started_at, p.forced_start, p.shipped_at,
	to_char(p.target_date, 'YYYY-MM-DD'), p.hack_start, p.hack_end, p.repo_path, p.plan, p.steps,
	p.created_at, p.updated_at`

func scanProject(row scanner, extra ...any) (model.Project, error) {
	var (
		p                             model.Project
		buildStarted, shipped, hs, he sql.NullTime
		target                        sql.NullString
		plan, steps                   []byte
	)
	dest := []any{&p.ID, &p.Name, &p.Summary, &p.Type, &p.Complexity, &p.VendorMode, &p.Phase, &p.Archived,
		&p.DecidedAt, &p.PlanningDeadline, &buildStarted, &p.ForcedStart, &shipped,
		&target, &hs, &he, &p.RepoPath, &plan, &steps, &p.CreatedAt, &p.UpdatedAt}
	if err := row.Scan(append(dest, extra...)...); err != nil {
		return p, notFound(err)
	}
	p.BuildStartedAt = timePtr(buildStarted)
	p.ShippedAt = timePtr(shipped)
	p.HackStart = timePtr(hs)
	p.HackEnd = timePtr(he)
	if target.Valid {
		p.TargetDate = &target.String
	}
	p.Plan = map[string]string{}
	p.Steps = map[string]string{}
	_ = json.Unmarshal(plan, &p.Plan)
	_ = json.Unmarshal(steps, &p.Steps)
	return p, nil
}

func timePtr(t sql.NullTime) *time.Time {
	if !t.Valid {
		return nil
	}
	return &t.Time
}

func (s *Store) CreateProject(ctx context.Context, p model.Project) (model.Project, error) {
	row := s.q.QueryRowContext(ctx, `
		INSERT INTO projects AS p (name, summary, type, complexity, vendor_mode, decided_at,
			planning_deadline, target_date, hack_start, hack_end, repo_path)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, $10, $11)
		RETURNING `+projectCols,
		p.Name, p.Summary, p.Type, p.Complexity, p.VendorMode, p.DecidedAt,
		p.PlanningDeadline, p.TargetDate, p.HackStart, p.HackEnd, p.RepoPath)
	return scanProject(row)
}

func (s *Store) GetProject(ctx context.Context, id int64) (model.Project, error) {
	return scanProject(s.q.QueryRowContext(ctx, `SELECT `+projectCols+` FROM projects p WHERE p.id = $1`, id))
}

func (s *Store) ListProjects(ctx context.Context) ([]model.ProjectSummary, error) {
	rows, err := s.q.QueryContext(ctx, `
		SELECT `+projectCols+`,
			(SELECT count(*) FROM tasks t WHERE t.project_id = p.id AND t.scope <> 'dlc'),
			(SELECT count(*) FROM tasks t WHERE t.project_id = p.id AND t.scope <> 'dlc' AND t.status = 'done'),
			(SELECT count(*) FROM obstacles o WHERE o.project_id = p.id AND o.status = 'open'),
			(SELECT to_char(max(l.day), 'YYYY-MM-DD') FROM daily_logs l WHERE l.project_id = p.id),
			(SELECT t.title FROM tasks t WHERE t.project_id = p.id AND t.status = 'doing'
				ORDER BY t.position LIMIT 1)
		FROM projects p
		ORDER BY p.archived, p.updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.ProjectSummary{}
	for rows.Next() {
		var (
			ps         model.ProjectSummary
			last, task sql.NullString
		)
		p, err := scanProject(rows, &ps.TasksTotal, &ps.TasksDone, &ps.OpenObstacles, &last, &task)
		if err != nil {
			return nil, err
		}
		ps.Project = p
		if last.Valid {
			ps.LastLogDay = &last.String
		}
		if task.Valid {
			ps.FocusTask = &task.String
		}
		out = append(out, ps)
	}
	return out, rows.Err()
}

// UpdateProject saves the editable settings of a project. Phase changes have their own methods.
func (s *Store) UpdateProject(ctx context.Context, p model.Project) (model.Project, error) {
	row := s.q.QueryRowContext(ctx, `
		UPDATE projects AS p SET name = $2, summary = $3, complexity = $4, vendor_mode = $5,
			archived = $6, planning_deadline = $7, target_date = $8::date, hack_start = $9,
			hack_end = $10, repo_path = $11, updated_at = now()
		WHERE p.id = $1
		RETURNING `+projectCols,
		p.ID, p.Name, p.Summary, p.Complexity, p.VendorMode, p.Archived, p.PlanningDeadline,
		p.TargetDate, p.HackStart, p.HackEnd, p.RepoPath)
	return scanProject(row)
}

func (s *Store) DeleteProject(ctx context.Context, id int64) error {
	return affected(s.q.ExecContext(ctx, `DELETE FROM projects WHERE id = $1`, id))
}

// MergePlan writes the given blueprint answers, leaving the other answers untouched.
func (s *Store) MergePlan(ctx context.Context, id int64, fields map[string]string) error {
	return affected(s.q.ExecContext(ctx,
		`UPDATE projects SET plan = plan || $2::jsonb, updated_at = now() WHERE id = $1`, id, toJSON(fields)))
}

func (s *Store) SetStep(ctx context.Context, id int64, key, status string) error {
	return affected(s.q.ExecContext(ctx,
		`UPDATE projects SET steps = steps || jsonb_build_object($2::text, $3::text), updated_at = now()
		 WHERE id = $1`, id, key, status))
}

// MarkBuildStarted moves a project from plan to build. It reports false when the project was
// not in the plan phase any more (someone else, or the background sweep, got there first).
func (s *Store) MarkBuildStarted(ctx context.Context, id int64, at time.Time, forced bool) (bool, error) {
	res, err := s.q.ExecContext(ctx, `
		UPDATE projects SET phase = 'build', build_started_at = $2, forced_start = $3, updated_at = now()
		WHERE id = $1 AND phase = 'plan'`, id, at, forced)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n > 0, err
}

func (s *Store) SetShipped(ctx context.Context, id int64, shipped bool, at time.Time) error {
	if shipped {
		return affected(s.q.ExecContext(ctx, `
			UPDATE projects SET phase = 'shipped', shipped_at = $2, updated_at = now()
			WHERE id = $1 AND phase = 'build'`, id, at))
	}
	return affected(s.q.ExecContext(ctx, `
		UPDATE projects SET phase = 'build', shipped_at = NULL, updated_at = now()
		WHERE id = $1 AND phase = 'shipped'`, id))
}

// ProjectsPastPlanningDeadline lists projects that are still planning although their time is up.
func (s *Store) ProjectsPastPlanningDeadline(ctx context.Context, now time.Time) ([]int64, error) {
	rows, err := s.q.QueryContext(ctx,
		`SELECT id FROM projects WHERE phase = 'plan' AND planning_deadline <= $1`, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (s *Store) Touch(ctx context.Context, id int64) {
	_, _ = s.q.ExecContext(ctx, `UPDATE projects SET updated_at = now() WHERE id = $1`, id)
}
