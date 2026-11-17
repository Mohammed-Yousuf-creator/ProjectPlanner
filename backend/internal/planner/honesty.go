package planner

import (
	"context"
	"sort"
	"strings"

	"projectplanner/internal/model"
	"projectplanner/internal/store"
)

// dateMove is the payload of a "date_move" event: a deadline that was moved after coding started.
type dateMove struct {
	What   string `json:"what"` // milestone | target
	ID     int64  `json:"id,omitempty"`
	Title  string `json:"title"`
	From   string `json:"from"`
	To     string `json:"to"` // empty when the date was removed
	Reason string `json:"reason"`
}

// scopeChange is the payload of the scope events: work added to, parked from or cut out of
// the MVP after coding started.
type scopeChange struct {
	TaskID      int64    `json:"task_id,omitempty"`
	StoryID     int64    `json:"story_id,omitempty"`
	MilestoneID int64    `json:"milestone_id,omitempty"` // the slipped milestone a cut was made for
	Title       string   `json:"title"`
	How         string   `json:"how"` // new | moved | deleted | cut
	Tasks       []string `json:"tasks,omitempty"`
}

// ---------- cut order ----------

// SetCutOrder saves the order in which MVP stories get cut when time runs short
// (first id = first to go). Only stories that are in the MVP can be ranked.
func (s *Service) SetCutOrder(ctx context.Context, projectID int64, storyIDs []int64) error {
	stories, err := s.store.ListStories(ctx, projectID)
	if err != nil {
		return err
	}
	if err := s.requireProject(ctx, projectID); err != nil {
		return err
	}
	mvp := map[int64]bool{}
	for _, st := range stories {
		if st.Tier == "mvp" {
			mvp[st.ID] = true
		}
	}
	seen := map[int64]bool{}
	for _, id := range storyIDs {
		if !mvp[id] || seen[id] {
			return invalid("The cut order can only list each MVP story once.")
		}
		seen[id] = true
	}
	defer s.store.Touch(ctx, projectID)
	return s.store.InTx(ctx, func(tx *store.Store) error { return tx.SetCutOrder(ctx, projectID, storyIDs) })
}

// CutOrder returns the MVP stories in the order they should be cut: ranked ones first by rank,
// then the unranked ones from the bottom of the list up (what was written last goes first).
func CutOrder(stories []model.Story) []model.Story {
	var mvp []model.Story
	for _, st := range stories {
		if st.Tier == "mvp" {
			mvp = append(mvp, st)
		}
	}
	sort.SliceStable(mvp, func(i, j int) bool {
		a, b := mvp[i], mvp[j]
		switch {
		case a.CutRank != nil && b.CutRank != nil:
			return *a.CutRank < *b.CutRank
		case a.CutRank != nil:
			return true
		case b.CutRank != nil:
			return false
		}
		return a.Position > b.Position
	})
	return mvp
}

type CutInput struct {
	StoryID     int64 `json:"story_id"`
	TaskID      int64 `json:"task_id"`
	MilestoneID int64 `json:"milestone_id"` // the slipped milestone this cut answers, if any
}

// Cut takes work out of the MVP in one step: a story moves to "Later" and its open tasks go to
// the expansion-pack backlog, or a single task is parked. The cut is recorded once.
func (s *Service) Cut(ctx context.Context, projectID int64, in CutInput) error {
	p, err := s.store.GetProject(ctx, projectID)
	if err != nil {
		return err
	}
	if p.Phase == model.PhasePlan {
		return invalid("Nothing to cut yet — while planning, sort stories in the MVP step instead.")
	}
	now := s.now()
	defer s.store.Touch(ctx, projectID)
	return s.store.InTx(ctx, func(tx *store.Store) error {
		change := scopeChange{MilestoneID: in.MilestoneID, How: "cut"}
		switch {
		case in.StoryID != 0:
			st, err := tx.GetStory(ctx, in.StoryID)
			if err != nil || st.ProjectID != projectID {
				return invalid("That user story does not belong to this project.")
			}
			if st.Tier != "mvp" {
				return invalid("That story is not in the MVP any more.")
			}
			st.Tier, st.CutRank = "later", nil
			if _, err := tx.UpdateStory(ctx, st); err != nil {
				return err
			}
			titles, err := tx.ParkStoryTasks(ctx, st.ID)
			if err != nil {
				return err
			}
			change.StoryID, change.Title, change.Tasks = st.ID, st.Text, titles
		case in.TaskID != 0:
			t, err := tx.GetTask(ctx, in.TaskID)
			if err != nil || t.ProjectID != projectID {
				return invalid("That task does not belong to this project.")
			}
			if t.Status == "done" || t.Scope == "dlc" {
				return invalid("That task is already done or parked.")
			}
			t.Scope, t.Status, t.DoneAt = "dlc", "backlog", nil
			if _, err := tx.UpdateTask(ctx, t); err != nil {
				return err
			}
			change.TaskID, change.Title = t.ID, t.Title
		default:
			return invalid("Say which story or task to cut.")
		}
		return tx.AddEvent(ctx, projectID, "scope_cut", now, change)
	})
}

// ---------- today's three ----------

const maxPicks = 3

// SetPicks chooses the (at most three) tasks for a day.
func (s *Service) SetPicks(ctx context.Context, projectID int64, day string, taskIDs []int64) error {
	if err := s.requireProject(ctx, projectID); err != nil {
		return err
	}
	if !validDate(day) {
		return invalid("The day must look like 2026-12-31.")
	}
	if len(taskIDs) > maxPicks {
		return invalid("Three tasks a day is the limit. Finishing three beats starting six.")
	}
	tasks, err := s.store.ListTasks(ctx, projectID)
	if err != nil {
		return err
	}
	byID := map[int64]model.Task{}
	for _, t := range tasks {
		byID[t.ID] = t
	}
	picks := make([]model.DayPick, 0, len(taskIDs))
	seen := map[int64]bool{}
	for _, id := range taskIDs {
		t, ok := byID[id]
		if !ok {
			return invalid("That task does not belong to this project.")
		}
		if seen[id] {
			continue
		}
		seen[id] = true
		id := id
		picks = append(picks, model.DayPick{TaskID: &id, Title: t.Title})
	}
	defer s.store.Touch(ctx, projectID)
	return s.store.InTx(ctx, func(tx *store.Store) error { return tx.ReplacePicks(ctx, projectID, day, picks) })
}

// ---------- pencils down ----------

// AckBuild records that the "planning is over" screen was seen, so it is shown only once.
func (s *Service) AckBuild(ctx context.Context, id int64) error {
	return s.store.AckBuild(ctx, id, s.now())
}

// ---------- lessons from earlier projects ----------

func (s *Service) Lessons(ctx context.Context) ([]store.Lesson, error) {
	lessons, err := s.store.Lessons(ctx)
	if err != nil {
		return nil, err
	}
	for i := range lessons {
		lessons[i].Text = strings.TrimSpace(lessons[i].Text)
	}
	return lessons, nil
}
