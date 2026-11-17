package store

import (
	"context"
	"database/sql"
	"encoding/json"

	"projectplanner/internal/model"
)

// ---------- stories ----------

const storyCols = `id, project_id, text, tier, position, cut_rank, created_at`

func scanStory(row scanner) (model.Story, error) {
	var (
		s    model.Story
		rank sql.NullInt64
	)
	err := row.Scan(&s.ID, &s.ProjectID, &s.Text, &s.Tier, &s.Position, &rank, &s.CreatedAt)
	if rank.Valid {
		r := int(rank.Int64)
		s.CutRank = &r
	}
	return s, notFound(err)
}

func (s *Store) ListStories(ctx context.Context, projectID int64) ([]model.Story, error) {
	rows, err := s.q.QueryContext(ctx,
		`SELECT `+storyCols+` FROM stories WHERE project_id = $1 ORDER BY position, id`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.Story{}
	for rows.Next() {
		st, err := scanStory(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	return out, rows.Err()
}

func (s *Store) GetStory(ctx context.Context, id int64) (model.Story, error) {
	return scanStory(s.q.QueryRowContext(ctx, `SELECT `+storyCols+` FROM stories WHERE id = $1`, id))
}

func (s *Store) CreateStory(ctx context.Context, st model.Story) (model.Story, error) {
	return scanStory(s.q.QueryRowContext(ctx, `
		INSERT INTO stories (project_id, text, tier, position)
		VALUES ($1, $2, $3, (SELECT COALESCE(MAX(position), 0) + 1 FROM stories WHERE project_id = $1))
		RETURNING `+storyCols, st.ProjectID, st.Text, st.Tier))
}

func (s *Store) UpdateStory(ctx context.Context, st model.Story) (model.Story, error) {
	return scanStory(s.q.QueryRowContext(ctx, `
		UPDATE stories SET text = $2, tier = $3, position = $4, cut_rank = $5 WHERE id = $1
		RETURNING `+storyCols, st.ID, st.Text, st.Tier, st.Position, st.CutRank))
}

func (s *Store) DeleteStory(ctx context.Context, id int64) error {
	return affected(s.q.ExecContext(ctx, `DELETE FROM stories WHERE id = $1`, id))
}

// ---------- plan items ----------

const itemCols = `id, project_id, kind, data, position, created_at, updated_at`

func scanItem(row scanner) (model.PlanItem, error) {
	var (
		it   model.PlanItem
		data []byte
	)
	err := row.Scan(&it.ID, &it.ProjectID, &it.Kind, &data, &it.Position, &it.CreatedAt, &it.UpdatedAt)
	it.Data = json.RawMessage(data)
	return it, notFound(err)
}

func (s *Store) ListItems(ctx context.Context, projectID int64) ([]model.PlanItem, error) {
	rows, err := s.q.QueryContext(ctx,
		`SELECT `+itemCols+` FROM plan_items WHERE project_id = $1 ORDER BY kind, position, id`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.PlanItem{}
	for rows.Next() {
		it, err := scanItem(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func (s *Store) GetItem(ctx context.Context, id int64) (model.PlanItem, error) {
	return scanItem(s.q.QueryRowContext(ctx, `SELECT `+itemCols+` FROM plan_items WHERE id = $1`, id))
}

func (s *Store) CreateItem(ctx context.Context, it model.PlanItem) (model.PlanItem, error) {
	return scanItem(s.q.QueryRowContext(ctx, `
		INSERT INTO plan_items (project_id, kind, data, position)
		VALUES ($1, $2, $3::jsonb,
			(SELECT COALESCE(MAX(position), 0) + 1 FROM plan_items WHERE project_id = $1 AND kind = $2))
		RETURNING `+itemCols, it.ProjectID, it.Kind, string(it.Data)))
}

func (s *Store) UpdateItem(ctx context.Context, it model.PlanItem) (model.PlanItem, error) {
	return scanItem(s.q.QueryRowContext(ctx, `
		UPDATE plan_items SET data = $2::jsonb, position = $3, updated_at = now() WHERE id = $1
		RETURNING `+itemCols, it.ID, string(it.Data), it.Position))
}

func (s *Store) DeleteItem(ctx context.Context, id int64) error {
	return affected(s.q.ExecContext(ctx, `DELETE FROM plan_items WHERE id = $1`, id))
}

// CountStories counts the stories of a project in one tier, leaving out one story id.
func (s *Store) CountStories(ctx context.Context, projectID int64, tier string, exceptID int64) (int, error) {
	var n int
	err := s.q.QueryRowContext(ctx,
		`SELECT count(*) FROM stories WHERE project_id = $1 AND tier = $2 AND id <> $3`, projectID, tier, exceptID).Scan(&n)
	return n, err
}

// SetCutOrder ranks the given stories 1..n (first to cut first) and clears every other rank.
func (s *Store) SetCutOrder(ctx context.Context, projectID int64, storyIDs []int64) error {
	if _, err := s.q.ExecContext(ctx, `UPDATE stories SET cut_rank = NULL WHERE project_id = $1`, projectID); err != nil {
		return err
	}
	for i, id := range storyIDs {
		if _, err := s.q.ExecContext(ctx,
			`UPDATE stories SET cut_rank = $3 WHERE id = $1 AND project_id = $2`, id, projectID, i+1); err != nil {
			return err
		}
	}
	return nil
}
