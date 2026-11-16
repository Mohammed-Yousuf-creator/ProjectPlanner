package planner

import (
	"context"
	"encoding/json"
	"strings"
	"unicode/utf8"

	"projectplanner/internal/model"
)

// The update methods take the raw JSON body of a PATCH request and apply it on top of the
// stored row, so a request only needs to carry the fields it wants to change.

func applyPatch(patch []byte, into any) error {
	if err := json.Unmarshal(patch, into); err != nil {
		return invalid("The request body is not valid: %v", err)
	}
	return nil
}

func cleanText(s string, what string, max int) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return s, invalid("%s cannot be empty.", what)
	}
	if utf8.RuneCountInString(s) > max {
		return s, invalid("%s is too long (max %d characters).", what, max)
	}
	return s, nil
}

func oneOf(v string, allowed ...string) bool {
	for _, a := range allowed {
		if v == a {
			return true
		}
	}
	return false
}

func (s *Service) requireProject(ctx context.Context, id int64) error {
	_, err := s.store.GetProject(ctx, id)
	return err
}

// ---------- stories ----------

func validateStory(st *model.Story) (err error) {
	if st.Text, err = cleanText(st.Text, "A user story", 500); err != nil {
		return err
	}
	if st.Tier == "" {
		st.Tier = "unsorted"
	}
	if !oneOf(st.Tier, "unsorted", "mvp", "later", "cut") {
		return invalid("A story is unsorted, mvp, later or cut.")
	}
	return nil
}

func (s *Service) CreateStory(ctx context.Context, projectID int64, st model.Story) (model.Story, error) {
	if err := s.requireProject(ctx, projectID); err != nil {
		return st, err
	}
	st.ProjectID = projectID
	if err := validateStory(&st); err != nil {
		return st, err
	}
	defer s.store.Touch(ctx, projectID)
	return s.store.CreateStory(ctx, st)
}

func (s *Service) UpdateStory(ctx context.Context, id int64, patch []byte) (model.Story, error) {
	old, err := s.store.GetStory(ctx, id)
	if err != nil {
		return old, err
	}
	st := old
	if err := applyPatch(patch, &st); err != nil {
		return old, err
	}
	st.ID, st.ProjectID, st.CreatedAt = old.ID, old.ProjectID, old.CreatedAt
	if err := validateStory(&st); err != nil {
		return old, err
	}
	return s.store.UpdateStory(ctx, st)
}

func (s *Service) DeleteStory(ctx context.Context, id int64) error {
	return s.store.DeleteStory(ctx, id)
}

// ---------- plan items ----------

// itemKinds lists the blueprint lists and, per kind, the fields that only accept fixed values.
var itemKinds = map[string]map[string][]string{
	"question":   {"status": {"open", "answered"}},                    // unknowns & decisions
	"resource":   {},                                                  // where to look when stuck
	"entity":     {},                                                  // data models
	"module":     {},                                                  // black boxes
	"stack":      {"familiarity": {"", "known", "learning"}},          // tech choices
	"capability": {"decision": {"undecided", "build", "buy", "skip"}}, // build vs buy
	"flow":       {},                                                  // data flows (vertical slices)
	"criterion":  {},                                                  // hackathon judging criteria
	"submission": {},                                                  // hackathon submission checklist
}

func validateItem(kind string, data json.RawMessage) error {
	enums, ok := itemKinds[kind]
	if !ok {
		return invalid("Unknown blueprint list %q.", kind)
	}
	if len(data) > 64_000 {
		return invalid("That entry is too large.")
	}
	var obj map[string]any
	if err := json.Unmarshal(data, &obj); err != nil || obj == nil {
		return invalid("An entry must be a JSON object.")
	}
	for field, allowed := range enums {
		v, present := obj[field]
		if !present {
			continue
		}
		str, isString := v.(string)
		if !isString || !oneOf(str, allowed...) {
			return invalid("%s.%s must be one of: %s.", kind, field, strings.Join(allowed, ", "))
		}
	}
	return nil
}

func (s *Service) CreateItem(ctx context.Context, projectID int64, it model.PlanItem) (model.PlanItem, error) {
	if err := s.requireProject(ctx, projectID); err != nil {
		return it, err
	}
	it.ProjectID = projectID
	if len(it.Data) == 0 {
		it.Data = json.RawMessage(`{}`)
	}
	if err := validateItem(it.Kind, it.Data); err != nil {
		return it, err
	}
	defer s.store.Touch(ctx, projectID)
	return s.store.CreateItem(ctx, it)
}

func (s *Service) UpdateItem(ctx context.Context, id int64, patch []byte) (model.PlanItem, error) {
	old, err := s.store.GetItem(ctx, id)
	if err != nil {
		return old, err
	}
	it := old
	if err := applyPatch(patch, &it); err != nil {
		return old, err
	}
	it.ID, it.ProjectID, it.Kind = old.ID, old.ProjectID, old.Kind
	if err := validateItem(it.Kind, it.Data); err != nil {
		return old, err
	}
	return s.store.UpdateItem(ctx, it)
}

func (s *Service) DeleteItem(ctx context.Context, id int64) error { return s.store.DeleteItem(ctx, id) }

// ---------- milestones ----------

func (s *Service) CreateMilestone(ctx context.Context, projectID int64, m model.Milestone) (model.Milestone, error) {
	if err := s.requireProject(ctx, projectID); err != nil {
		return m, err
	}
	var err error
	if m.Title, err = cleanText(m.Title, "A milestone title", 200); err != nil {
		return m, err
	}
	m.ProjectID, m.Origin = projectID, ""
	defer s.store.Touch(ctx, projectID)
	return s.store.CreateMilestone(ctx, m)
}

func (s *Service) UpdateMilestone(ctx context.Context, id int64, patch []byte) (model.Milestone, error) {
	old, err := s.store.GetMilestone(ctx, id)
	if err != nil {
		return old, err
	}
	m := old
	m.DueAt = nil // decode into a fresh pointer; restored below if the patch does not mention it
	if err := applyPatch(patch, &m); err != nil {
		return old, err
	}
	if !patchHas(patch, "due_at") {
		m.DueAt = old.DueAt
	}
	m.ID, m.ProjectID, m.Origin, m.CreatedAt = old.ID, old.ProjectID, old.Origin, old.CreatedAt
	if m.Title, err = cleanText(m.Title, "A milestone title", 200); err != nil {
		return old, err
	}
	return s.store.UpdateMilestone(ctx, m)
}

func (s *Service) DeleteMilestone(ctx context.Context, id int64) error {
	return s.store.DeleteMilestone(ctx, id)
}

// ---------- tasks ----------

func (s *Service) validateTask(ctx context.Context, old *model.Task, t *model.Task) (err error) {
	if t.Title, err = cleanText(t.Title, "A task title", 300); err != nil {
		return err
	}
	if t.Status == "" {
		t.Status = "todo"
	}
	if !oneOf(t.Status, "backlog", "todo", "doing", "done") {
		return invalid("A task is in backlog, todo, doing or done.")
	}
	if t.Scope == "" {
		t.Scope = "mvp"
	}
	if !oneOf(t.Scope, "mvp", "dlc", "debt") {
		return invalid("A task's scope is mvp, dlc or debt.")
	}
	if len(t.Notes) > 50_000 {
		return invalid("Those notes are too long.")
	}
	checklist := make([]model.ChecklistItem, 0, len(t.Checklist))
	for _, c := range t.Checklist {
		if c.Text = strings.TrimSpace(c.Text); c.Text != "" {
			checklist = append(checklist, c)
		}
	}
	t.Checklist = checklist

	if t.MilestoneID != nil {
		m, err := s.store.GetMilestone(ctx, *t.MilestoneID)
		if err != nil || m.ProjectID != t.ProjectID {
			return invalid("That milestone does not belong to this project.")
		}
	}
	if t.StoryID != nil {
		st, err := s.store.GetStory(ctx, *t.StoryID)
		if err != nil || st.ProjectID != t.ProjectID {
			return invalid("That user story does not belong to this project.")
		}
	}

	// Keep the timestamps in step with the status.
	now := s.now()
	previous := ""
	if old != nil {
		previous = old.Status
	}
	if t.Status != previous {
		switch t.Status {
		case "doing":
			if t.StartedAt == nil {
				t.StartedAt = &now
			}
			t.DoneAt = nil
		case "done":
			if t.StartedAt == nil {
				t.StartedAt = &now
			}
			t.DoneAt = &now
		default:
			t.DoneAt = nil
		}
	}
	return nil
}

func (s *Service) CreateTask(ctx context.Context, projectID int64, t model.Task) (model.Task, error) {
	if err := s.requireProject(ctx, projectID); err != nil {
		return t, err
	}
	t.ProjectID, t.Origin, t.StartedAt, t.DoneAt = projectID, "", nil, nil
	if err := s.validateTask(ctx, nil, &t); err != nil {
		return t, err
	}
	defer s.store.Touch(ctx, projectID)
	created, _, err := s.store.CreateTask(ctx, t)
	return created, err
}

func (s *Service) UpdateTask(ctx context.Context, id int64, patch []byte) (model.Task, error) {
	old, err := s.store.GetTask(ctx, id)
	if err != nil {
		return old, err
	}
	// Decode onto a copy whose pointers and slices are detached from old.
	t := old
	t.MilestoneID, t.StoryID, t.DueAt, t.Checklist = nil, nil, nil, nil
	if err := applyPatch(patch, &t); err != nil {
		return old, err
	}
	if !patchHas(patch, "milestone_id") {
		t.MilestoneID = old.MilestoneID
	}
	if !patchHas(patch, "story_id") {
		t.StoryID = old.StoryID
	}
	if !patchHas(patch, "due_at") {
		t.DueAt = old.DueAt
	}
	if !patchHas(patch, "checklist") {
		t.Checklist = old.Checklist
	}
	t.ID, t.ProjectID, t.Origin, t.CreatedAt = old.ID, old.ProjectID, old.Origin, old.CreatedAt
	t.StartedAt, t.DoneAt = old.StartedAt, old.DoneAt
	if err := s.validateTask(ctx, &old, &t); err != nil {
		return old, err
	}
	defer s.store.Touch(ctx, old.ProjectID)
	return s.store.UpdateTask(ctx, t)
}

func (s *Service) DeleteTask(ctx context.Context, id int64) error { return s.store.DeleteTask(ctx, id) }

// ---------- daily log ----------

func (s *Service) SaveLog(ctx context.Context, projectID int64, day string, l model.DailyLog) (model.DailyLog, error) {
	if err := s.requireProject(ctx, projectID); err != nil {
		return l, err
	}
	if !validDate(day) {
		return l, invalid("The day must look like 2026-12-31.")
	}
	var err error
	if l.Summary, err = cleanText(l.Summary, "The log entry", 5000); err != nil {
		return l, err
	}
	if l.Hours != nil && (*l.Hours < 0 || *l.Hours > 24) {
		return l, invalid("Hours must be between 0 and 24.")
	}
	l.ProjectID, l.Day = projectID, day
	defer s.store.Touch(ctx, projectID)
	return s.store.UpsertLog(ctx, l)
}

func (s *Service) DeleteLog(ctx context.Context, projectID int64, day string) error {
	if !validDate(day) {
		return invalid("The day must look like 2026-12-31.")
	}
	return s.store.DeleteLog(ctx, projectID, day)
}

// ---------- obstacles ----------

func (s *Service) validateObstacle(ctx context.Context, old *model.Obstacle, o *model.Obstacle) (err error) {
	if o.Title, err = cleanText(o.Title, "The obstacle", 300); err != nil {
		return err
	}
	if o.Kind == "" {
		o.Kind = "unsorted"
	}
	if !oneOf(o.Kind, "unsorted", "memory", "knowledge", "problem", "debug") {
		return invalid("An obstacle is a memory, knowledge, problem or debug obstacle.")
	}
	if o.Status == "" {
		o.Status = "open"
	}
	if !oneOf(o.Status, "open", "resolved") {
		return invalid("An obstacle is open or resolved.")
	}
	if o.Attempts < 0 {
		o.Attempts = 0
	}
	if o.TaskID != nil {
		t, err := s.store.GetTask(ctx, *o.TaskID)
		if err != nil || t.ProjectID != o.ProjectID {
			return invalid("That task does not belong to this project.")
		}
	}
	wasResolved := old != nil && old.Status == "resolved"
	switch {
	case o.Status == "resolved" && !wasResolved:
		now := s.now()
		o.ResolvedAt = &now
	case o.Status == "open":
		o.ResolvedAt = nil
	}
	return nil
}

func (s *Service) CreateObstacle(ctx context.Context, projectID int64, o model.Obstacle) (model.Obstacle, error) {
	if err := s.requireProject(ctx, projectID); err != nil {
		return o, err
	}
	o.ProjectID, o.ResolvedAt = projectID, nil
	if err := s.validateObstacle(ctx, nil, &o); err != nil {
		return o, err
	}
	defer s.store.Touch(ctx, projectID)
	return s.store.CreateObstacle(ctx, o)
}

func (s *Service) UpdateObstacle(ctx context.Context, id int64, patch []byte) (model.Obstacle, error) {
	old, err := s.store.GetObstacle(ctx, id)
	if err != nil {
		return old, err
	}
	o := old
	o.TaskID = nil
	if err := applyPatch(patch, &o); err != nil {
		return old, err
	}
	if !patchHas(patch, "task_id") {
		o.TaskID = old.TaskID
	}
	o.ID, o.ProjectID, o.CreatedAt, o.ResolvedAt = old.ID, old.ProjectID, old.CreatedAt, old.ResolvedAt
	if err := s.validateObstacle(ctx, &old, &o); err != nil {
		return old, err
	}
	return s.store.UpdateObstacle(ctx, o)
}

func (s *Service) DeleteObstacle(ctx context.Context, id int64) error {
	return s.store.DeleteObstacle(ctx, id)
}

// patchHas reports whether a JSON object mentions a key at its top level.
func patchHas(patch []byte, key string) bool {
	var obj map[string]json.RawMessage
	if json.Unmarshal(patch, &obj) != nil {
		return false
	}
	_, ok := obj[key]
	return ok
}
