package planner

import (
	"context"
	"encoding/json"
	"strings"
	"time"
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
	p, err := s.store.GetProject(ctx, projectID)
	if err != nil {
		return st, err
	}
	st.ProjectID, st.CutRank = projectID, nil
	if err := validateStory(&st); err != nil {
		return st, err
	}
	if st.Tier == "mvp" {
		if err := s.checkScopeBudget(ctx, p, 0); err != nil {
			return st, err
		}
	}
	defer s.store.Touch(ctx, projectID)
	return s.store.CreateStory(ctx, st)
}

// checkScopeBudget refuses one more MVP story when the MVP is full: something has to move out
// before something new moves in.
func (s *Service) checkScopeBudget(ctx context.Context, p model.Project, exceptStory int64) error {
	n, err := s.store.CountStories(ctx, p.ID, "mvp", exceptStory)
	if err != nil {
		return err
	}
	if budget := ScopeBudget(p); n >= budget {
		return invalid("The MVP is full: %d stories is the budget for this project. Move one to Later or Cut before adding another.", budget)
	}
	return nil
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
	st.ID, st.ProjectID, st.CreatedAt, st.CutRank = old.ID, old.ProjectID, old.CreatedAt, old.CutRank
	if err := validateStory(&st); err != nil {
		return old, err
	}
	if st.Tier == "mvp" && old.Tier != "mvp" {
		p, err := s.store.GetProject(ctx, old.ProjectID)
		if err != nil {
			return old, err
		}
		if err := s.checkScopeBudget(ctx, p, old.ID); err != nil {
			return old, err
		}
	}
	if st.Tier != "mvp" {
		st.CutRank = nil // only MVP stories are in the cut order
	}
	defer s.store.Touch(ctx, old.ProjectID)
	return s.store.UpdateStory(ctx, st)
}

func (s *Service) DeleteStory(ctx context.Context, id int64) error {
	return s.store.DeleteStory(ctx, id)
}

// ---------- plan items ----------

// itemKinds lists the blueprint lists and, per kind, the fields that only accept fixed values.
var itemKinds = map[string]map[string][]string{
	"question":   {"status": {"open", "answered", "learn"}},           // unknowns; learn = while building
	"resource":   {},                                                  // where to look when stuck
	"entity":     {},                                                  // data models
	"module":     {},                                                  // black boxes
	"stack":      {"familiarity": {"", "known", "learning"}},          // tech choices
	"capability": {"decision": {"undecided", "build", "buy", "skip"}}, // build vs buy
	"flow":       {},                                                  // data flows (vertical slices)
	"criterion":  {},                                                  // hackathon judging criteria
	"submission": {},                                                  // hackathon submission checklist
	"decision":   {},                                                  // decision log: what and why
	"notdoing":   {},                                                  // what this project will not do
	"break":      {},                                                  // hackathon hours off (sleep, meals)
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
	if kind == "break" {
		start, okStart := parseTime(obj["start"])
		end, okEnd := parseTime(obj["end"])
		if !okStart || !okEnd || !end.After(start) {
			return invalid("A break needs a start and an end, and the end must be later.")
		}
	}
	if kind == "question" {
		if v, present := obj["box_until"]; present && v != "" {
			if _, ok := parseTime(v); !ok {
				return invalid("The time box of a question must be a date and time.")
			}
		}
	}
	return nil
}

func parseTime(v any) (time.Time, bool) {
	str, _ := v.(string)
	t, err := time.Parse(time.RFC3339, str)
	return t, err == nil
}

// stampItem fills in what the server knows better than the browser: when a decision was made
// and how long a new open question may stay open.
func stampItem(kind string, data json.RawMessage, p model.Project, now time.Time) json.RawMessage {
	var obj map[string]any
	if json.Unmarshal(data, &obj) != nil {
		return data
	}
	switch kind {
	case "decision":
		if s, _ := obj["decided_at"].(string); s == "" {
			obj["decided_at"] = now.UTC().Format(time.RFC3339)
		}
	case "question":
		if s, _ := obj["box_until"].(string); s == "" && p.Phase == model.PhasePlan {
			from, _ := PlanningWindow(p)
			if from.Before(now) {
				from = now
			}
			obj["box_until"] = from.Add(QuestionBox(p)).UTC().Format(time.RFC3339)
		}
	}
	return mustJSON(obj)
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
	if it.Kind == "question" || it.Kind == "decision" {
		p, err := s.store.GetProject(ctx, projectID)
		if err != nil {
			return it, err
		}
		it.Data = stampItem(it.Kind, it.Data, p, s.now())
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
	defer s.store.Touch(ctx, old.ProjectID)
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
	m.ID, m.ProjectID, m.Origin, m.CreatedAt, m.OriginalDueAt = old.ID, old.ProjectID, old.Origin, old.CreatedAt, old.OriginalDueAt
	if m.Title, err = cleanText(m.Title, "A milestone title", 200); err != nil {
		return old, err
	}
	// Once coding has started, a milestone date that was set is a promise. It can move, but
	// each move is counted and needs its reason.
	var move *dateMove
	if old.DueAt != nil && (m.DueAt == nil || !m.DueAt.Equal(*old.DueAt)) {
		p, err := s.store.GetProject(ctx, old.ProjectID)
		if err != nil {
			return old, err
		}
		if p.Phase != model.PhasePlan {
			var body struct {
				Reason string `json:"reason"`
			}
			_ = json.Unmarshal(patch, &body)
			reason := strings.TrimSpace(body.Reason)
			if reason == "" {
				return old, invalid("Moving a milestone needs a reason — one line on why the date is moving.")
			}
			move = &dateMove{What: "milestone", ID: old.ID, Title: m.Title, From: old.DueAt.UTC().Format(time.RFC3339), Reason: reason}
			if m.DueAt != nil {
				move.To = m.DueAt.UTC().Format(time.RFC3339)
			}
		}
	}
	saved, err := s.store.UpdateMilestone(ctx, m)
	if err != nil {
		return saved, err
	}
	if move != nil {
		if err := s.store.AddEvent(ctx, old.ProjectID, "date_move", s.now(), move); err != nil {
			return saved, err
		}
	}
	s.store.Touch(ctx, old.ProjectID)
	return saved, nil
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
	if t.EstimateHours != nil && (*t.EstimateHours <= 0 || *t.EstimateHours > 999) {
		return invalid("An estimate is a number of hours above 0.")
	}
	if t.SpentMinutes < 0 || t.SpentMinutes > 600_000 {
		return invalid("Time spent must be a positive number of minutes.")
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
	p, err := s.store.GetProject(ctx, projectID)
	if err != nil {
		return t, err
	}
	t.ProjectID, t.Origin, t.StartedAt, t.DoneAt, t.ClosedCommit = projectID, "", nil, nil, ""
	if err := s.validateTask(ctx, nil, &t); err != nil {
		return t, err
	}
	defer s.store.Touch(ctx, projectID)
	created, _, err := s.store.CreateTask(ctx, t)
	if err != nil {
		return created, err
	}
	// After coding has started, every new task is a change of scope and is counted as one —
	// unless it is the other half of a task that was split, which adds no work.
	split := false
	if t.SplitFrom != nil {
		if from, err := s.store.GetTask(ctx, *t.SplitFrom); err == nil && from.ProjectID == projectID {
			split = true
		}
	}
	created.SplitFrom = nil
	if p.Phase == model.PhaseBuild && !split {
		kind := "scope_add"
		if created.Scope == "dlc" {
			kind = "scope_park"
		}
		if err := s.store.AddEvent(ctx, projectID, kind, s.now(), scopeChange{TaskID: created.ID, Title: created.Title, How: "new"}); err != nil {
			return created, err
		}
	}
	return created, nil
}

func (s *Service) UpdateTask(ctx context.Context, id int64, patch []byte) (model.Task, error) {
	old, err := s.store.GetTask(ctx, id)
	if err != nil {
		return old, err
	}
	// Decode onto a copy whose pointers and slices are detached from old.
	t := old
	t.MilestoneID, t.StoryID, t.DueAt, t.Checklist, t.EstimateHours = nil, nil, nil, nil, nil
	if err := applyPatch(patch, &t); err != nil {
		return old, err
	}
	if !patchHas(patch, "estimate_hours") {
		t.EstimateHours = old.EstimateHours
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
	t.StartedAt, t.DoneAt, t.ClosedCommit = old.StartedAt, old.DoneAt, old.ClosedCommit
	if err := s.validateTask(ctx, &old, &t); err != nil {
		return old, err
	}
	defer s.store.Touch(ctx, old.ProjectID)
	saved, err := s.store.UpdateTask(ctx, t)
	if err != nil {
		return saved, err
	}
	if wasMVP, isMVP := old.Scope != "dlc", saved.Scope != "dlc"; wasMVP != isMVP {
		if err := s.recordScope(ctx, saved, map[bool]string{true: "scope_add", false: "scope_park"}[isMVP], "moved"); err != nil {
			return saved, err
		}
	}
	return saved, nil
}

// DeleteTask removes a task. Deleting unfinished MVP work after coding started counts as a cut.
func (s *Service) DeleteTask(ctx context.Context, id int64) error {
	t, err := s.store.GetTask(ctx, id)
	if err != nil {
		return err
	}
	if err := s.store.DeleteTask(ctx, id); err != nil {
		return err
	}
	if t.Status != "done" && t.Scope != "dlc" {
		if err := s.recordScope(ctx, t, "scope_cut", "deleted"); err != nil {
			return err
		}
	}
	s.store.Touch(ctx, t.ProjectID)
	return nil
}

// recordScope notes a change of scope, but only once coding has started: while planning,
// shaping the board is the whole point.
func (s *Service) recordScope(ctx context.Context, t model.Task, kind, how string) error {
	p, err := s.store.GetProject(ctx, t.ProjectID)
	if err != nil {
		return err
	}
	if p.Phase != model.PhaseBuild {
		return nil
	}
	return s.store.AddEvent(ctx, t.ProjectID, kind, s.now(), scopeChange{TaskID: t.ID, Title: t.Title, How: how})
}

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
		o.ResolvedAt, o.TimerUntil = &now, nil
	case o.Status == "open":
		o.ResolvedAt = nil
		if (old == nil || wasResolved) && !o.NeedsHelp {
			// A fresh (or reopened) obstacle starts its first attempt window.
			p, err := s.store.GetProject(ctx, o.ProjectID)
			if err != nil {
				return err
			}
			until := s.now().Add(StuckWindow(p))
			o.TimerUntil = &until
		}
	}
	return nil
}

func (s *Service) CreateObstacle(ctx context.Context, projectID int64, o model.Obstacle) (model.Obstacle, error) {
	if err := s.requireProject(ctx, projectID); err != nil {
		return o, err
	}
	o.ProjectID, o.ResolvedAt, o.TimerUntil, o.NeedsHelp = projectID, nil, nil, false
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
	o.TimerUntil, o.NeedsHelp = old.TimerUntil, old.NeedsHelp
	if err := s.validateObstacle(ctx, &old, &o); err != nil {
		return old, err
	}
	defer s.store.Touch(ctx, old.ProjectID)
	return s.store.UpdateObstacle(ctx, o)
}

// StuckAction answers the question the stuck timer asks when an attempt window ends:
// "retry" starts another window with a different approach (which must be written down),
// "help" records that outside help is the plan now and stops the timer.
func (s *Service) StuckAction(ctx context.Context, id int64, action, approach string) (model.Obstacle, error) {
	o, err := s.store.GetObstacle(ctx, id)
	if err != nil {
		return o, err
	}
	if o.Status != "open" {
		return o, invalid("That obstacle is already solved.")
	}
	switch action {
	case "retry":
		approach = strings.TrimSpace(approach)
		if approach == "" {
			return o, invalid("Write down the different approach you are going to try.")
		}
		if len(approach) > 2000 {
			return o, invalid("Keep the approach short — a line or two.")
		}
		p, err := s.store.GetProject(ctx, o.ProjectID)
		if err != nil {
			return o, err
		}
		if strings.TrimSpace(o.Approaches) != "" {
			o.Approaches = strings.TrimRight(o.Approaches, "\n") + "\n"
		}
		o.Approaches += approach
		o.Attempts++
		until := s.now().Add(StuckWindow(p))
		o.TimerUntil, o.NeedsHelp = &until, false
	case "help":
		o.TimerUntil, o.NeedsHelp = nil, true
	default:
		return o, invalid("Choose to retry with another approach or to get outside help.")
	}
	defer s.store.Touch(ctx, o.ProjectID)
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
