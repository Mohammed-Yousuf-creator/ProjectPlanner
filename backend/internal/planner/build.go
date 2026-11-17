package planner

import (
	"context"
	"encoding/json"
	"sort"
	"strconv"
	"strings"
	"time"

	"projectplanner/internal/model"
	"projectplanner/internal/store"
)

// StartBuild ends planning because the user chose to ("Start coding now").
func (s *Service) StartBuild(ctx context.Context, id int64) error {
	return s.startBuild(ctx, id, false)
}

// startBuild moves a project from plan to build. forced is true when the planning deadline did
// it instead of the user. Either way the board is filled so there is something to code right now:
// generated milestones and tasks, plus a "decide while building" task for every essential
// planning step that was left open — unfinished planning is carried along, never waited for.
func (s *Service) startBuild(ctx context.Context, id int64, forced bool) error {
	now := s.now()
	return s.store.InTx(ctx, func(tx *store.Store) error {
		p, err := tx.GetProject(ctx, id)
		if err != nil {
			return err
		}
		if p.Phase != model.PhasePlan {
			if forced {
				return nil
			}
			return invalid("This project is already past planning.")
		}
		if !forced && p.Type == model.TypeHackathon && p.HackStart != nil && now.Before(*p.HackStart) {
			return invalid("The hackathon has not started yet. Keep planning — coding starts with the clock.")
		}
		at := now
		if forced {
			at = p.PlanningDeadline
		}
		started, err := tx.MarkBuildStarted(ctx, id, at, forced)
		if err != nil || !started {
			return err
		}
		if _, err := s.generate(ctx, tx, p, at, true); err != nil {
			return err
		}
		return nil
	})
}

// Generate fills the board from the blueprint. It is safe to run again: tasks and milestones
// that were generated before are not duplicated.
func (s *Service) Generate(ctx context.Context, id int64) (int, error) {
	created := 0
	err := s.store.InTx(ctx, func(tx *store.Store) error {
		p, err := tx.GetProject(ctx, id)
		if err != nil {
			return err
		}
		anchor := s.now()
		if p.Phase == model.PhasePlan {
			anchor = p.PlanningDeadline // coding starts no later than this
		} else if p.BuildStartedAt != nil {
			anchor = *p.BuildStartedAt
		}
		created, err = s.generate(ctx, tx, p, anchor, false)
		return err
	})
	return created, err
}

func (s *Service) generate(ctx context.Context, tx *store.Store, p model.Project, anchor time.Time, starting bool) (int, error) {
	stories, err := tx.ListStories(ctx, p.ID)
	if err != nil {
		return 0, err
	}
	items, err := tx.ListItems(ctx, p.ID)
	if err != nil {
		return 0, err
	}
	milestones, tasks := buildSeeds(p, stories, items, anchor)
	if starting {
		existing, err := tx.ListTasks(ctx, p.ID)
		if err != nil {
			return 0, err
		}
		existingMs, err := tx.ListMilestones(ctx, p.ID)
		if err != nil {
			return 0, err
		}
		files, err := tx.ListFiles(ctx, p.ID)
		if err != nil {
			return 0, err
		}
		steps := ComputeSteps(p, planData{stories, items, existingMs, existing, files})
		tasks = append(debtSeeds(steps), tasks...)
	}

	msIDs := map[string]int64{}
	for _, m := range milestones {
		saved, err := tx.CreateMilestone(ctx, model.Milestone{ProjectID: p.ID, Title: m.Title, DueAt: m.DueAt, Origin: m.Origin})
		if err != nil {
			return 0, err
		}
		msIDs[m.Origin] = saved.ID
	}

	created := 0
	for _, seed := range tasks {
		t := model.Task{
			ProjectID: p.ID, Title: seed.Title, Notes: seed.Notes, Status: "todo",
			Scope: seed.Scope, StoryID: seed.StoryID, Origin: seed.Origin,
		}
		if id, ok := msIDs[seed.Milestone]; ok {
			t.MilestoneID = &id
		}
		for _, c := range seed.Checklist {
			t.Checklist = append(t.Checklist, model.ChecklistItem{Text: c})
		}
		if _, ok, err := tx.CreateTask(ctx, t); err != nil {
			return 0, err
		} else if ok {
			created++
		}
	}

	if starting {
		// Coding has started, so something must be in progress: the first thing to do.
		all, err := tx.ListTasks(ctx, p.ID)
		if err != nil {
			return 0, err
		}
		if first := firstTaskToStart(all); first != nil {
			first.Status, first.StartedAt = "doing", &anchor
			if _, err := tx.UpdateTask(ctx, *first); err != nil {
				return 0, err
			}
		}
	}
	return created, nil
}

// firstTaskToStart picks the task to put in progress when coding starts, unless one already is:
// the skeleton task if it is still open, otherwise the first open MVP task.
func firstTaskToStart(tasks []model.Task) *model.Task {
	var candidate *model.Task
	for i := range tasks {
		t := &tasks[i]
		if t.Status == "doing" {
			return nil
		}
		if t.Status == "done" || t.Scope != "mvp" {
			continue
		}
		if candidate == nil || t.Origin == "skeleton" {
			candidate = t
		}
	}
	return candidate
}

type milestoneSeed struct {
	Origin string
	Title  string
	DueAt  *time.Time
}

type taskSeed struct {
	Origin    string
	Title     string
	Notes     string
	Milestone string // origin of the milestone it belongs to
	Scope     string
	StoryID   *int64
	Checklist []string
}

// debtSeeds turns every essential planning step that is still open into a task, so the missing
// decision gets made while building instead of blocking the start.
func debtSeeds(steps []Step) []taskSeed {
	var seeds []taskSeed
	for _, st := range steps {
		if !st.Essential || st.Status != "todo" {
			continue
		}
		seeds = append(seeds, taskSeed{
			Origin: "debt:" + st.Key,
			Title:  "Decide while building: " + st.Title,
			Notes: "Planning time ran out before this step was finished. Make the smallest decision that " +
				"unblocks you, write it into the blueprint, and get back to the code.",
			Scope: "debt",
		})
	}
	return seeds
}

// buildSeeds derives milestones and tasks from the blueprint, in the order that keeps a solo
// developer unblocked: skeleton → data layer → core logic / data flows → the MVP stories → deploy.
func buildSeeds(p model.Project, stories []model.Story, items []model.PlanItem, anchor time.Time) ([]milestoneSeed, []taskSeed) {
	var entities []string
	type flow struct {
		name, trigger, controller, logic, data string
		core                                   bool
	}
	var flows []flow
	for _, it := range items {
		var m map[string]any
		_ = json.Unmarshal(it.Data, &m)
		str := func(k string) string { v, _ := m[k].(string); return strings.TrimSpace(v) }
		switch it.Kind {
		case "entity":
			if n := str("name"); n != "" {
				entities = append(entities, n)
			}
		case "flow":
			if n := str("name"); n != "" {
				core, _ := m["core"].(bool)
				flows = append(flows, flow{n, str("trigger"), str("controller"), str("logic"), str("data"), core})
			}
		}
	}
	sort.SliceStable(flows, func(i, j int) bool { return flows[i].core && !flows[j].core })

	var ms []milestoneSeed
	var tasks []taskSeed
	hack := p.Type == model.TypeHackathon && p.HackStart != nil && p.HackEnd != nil

	// Where each group of tasks goes.
	var msSkeleton, msData, msCore, msStories, msShip string

	if hack {
		sched := Schedule(p)
		start, dur := sched.Start, sched.End.Sub(sched.Start)
		at := func(t time.Time) *time.Time { return &t }
		ms = []milestoneSeed{
			{"hk:plan", "Plan locked — coding started", at(p.PlanningDeadline)},
			{"hk:core", "Core demo path works end to end", at(start.Add(dur * 55 / 100))},
			{"hk:freeze", "Feature freeze", at(sched.FreezeAt)},
			{"hk:demo", "Demo ready, submission drafted", at(sched.SubmitFrom)},
			{"hk:submit", "Submitted", at(sched.End)},
		}
		msSkeleton, msData, msCore, msStories, msShip = "hk:core", "hk:core", "hk:core", "hk:freeze", "hk:submit"
		tasks = append(tasks, taskSeed{
			Origin: "skeleton", Title: "Scaffold the project and get a hello-world running", Milestone: msSkeleton, Scope: "mvp",
			Checklist: []string{"Repository created, first commit pushed", "Stack scaffolded and running locally", "Hello-world deployed (or one command to run it)"},
		})
	} else {
		span := time.Duration(mvpDays[p.Complexity]) * day
		if p.TargetDate != nil {
			if target, err := time.ParseInLocation("2006-01-02", *p.TargetDate, anchor.Location()); err == nil && target.After(anchor) {
				span = target.Sub(anchor)
			}
		}
		at := func(percent int) *time.Time {
			t := endOfDay(anchor.Add(span * time.Duration(percent) / 100))
			return &t
		}
		ms = []milestoneSeed{
			{"ms:skeleton", "Skeleton & first commit", at(5)},
			{"ms:data", "Data layer works", at(25)},
			{"ms:core", "Core logic works", at(55)},
			{"ms:stories", "MVP stories done", at(85)},
			{"ms:ship", "MVP shipped", at(100)},
		}
		msSkeleton, msData, msCore, msStories, msShip = "ms:skeleton", "ms:data", "ms:core", "ms:stories", "ms:ship"
		tasks = append(tasks, taskSeed{
			Origin: "skeleton", Title: "Create the project skeleton", Milestone: msSkeleton, Scope: "mvp",
			Checklist: []string{"Folder structure (one folder per module)", "Development environment runs", "git init and first commit"},
		})
	}

	if len(entities) > 0 {
		tasks = append(tasks, taskSeed{
			Origin: "data", Title: "Set up the data layer and create the data models", Milestone: msData, Scope: "mvp",
			Notes:     "Get the data layer working before anything that depends on it.",
			Checklist: entities,
		})
	}
	for i, f := range flows {
		checklist := []string{
			"Entry point: " + orDefault(f.controller, "endpoint / command / screen that triggers it"),
			"Logic: " + orDefault(f.logic, "the actual work"),
			"Data access: " + orDefault(f.data, "what it reads and writes"),
			"Tested end to end",
		}
		title := "Data flow: " + f.name
		if f.core {
			title = "Core data flow: " + f.name
		}
		tasks = append(tasks, taskSeed{
			Origin: "flow:" + slug(f.name, i), Title: title, Notes: f.trigger, Milestone: msCore, Scope: "mvp", Checklist: checklist,
		})
	}
	for _, st := range stories {
		if st.Tier != "mvp" {
			continue
		}
		id := st.ID
		tasks = append(tasks, taskSeed{
			Origin: "story:" + strconv.FormatInt(st.ID, 10), Title: st.Text, Milestone: msStories, Scope: "mvp", StoryID: &id,
		})
	}

	if hack {
		tasks = append(tasks,
			taskSeed{Origin: "polish", Title: "Polish only the path the demo shows", Milestone: "hk:demo", Scope: "mvp",
				Notes: "Feature freeze is over. No new features — fix what the judges will see."},
			taskSeed{Origin: "demo", Title: "Record the demo / rehearse the pitch", Milestone: "hk:demo", Scope: "mvp",
				Checklist: []string{"Problem in one sentence", "Show the core flow working", "What makes it valuable", "What comes next"}},
			taskSeed{Origin: "submit", Title: "Submit before the deadline", Milestone: msShip, Scope: "mvp",
				Notes: "Work through the submission checklist on the Hackathon tab. Submit early; you can usually update it."},
		)
	} else {
		tasks = append(tasks, taskSeed{
			Origin: "deploy", Title: "Deploy the first working version", Milestone: msShip, Scope: "mvp",
			Notes: "Deploy early and often, even if the app is not 100% complete.",
		})
	}
	return ms, tasks
}

func orDefault(v, fallback string) string {
	if v == "" {
		return fallback
	}
	if len(v) > 120 {
		return v[:117] + "..."
	}
	return v
}

// slug makes a stable identifier for a generated flow task from the flow's name.
func slug(name string, index int) string {
	var b strings.Builder
	for _, r := range strings.ToLower(name) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case b.Len() > 0 && !strings.HasSuffix(b.String(), "-"):
			b.WriteByte('-')
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "n" + strconv.Itoa(index)
	}
	if len(out) > 60 {
		out = out[:60]
	}
	return out
}

func endOfDay(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 23, 59, 0, 0, t.Location())
}

// ---------- shipping ----------

// Ship marks the MVP as shipped (or takes that back). After shipping, the "Later" stories
// become the expansion pack.
func (s *Service) Ship(ctx context.Context, id int64, shipped bool) error {
	p, err := s.store.GetProject(ctx, id)
	if err != nil {
		return err
	}
	switch {
	case shipped && p.Phase == model.PhasePlan:
		return invalid("You cannot ship a plan. Start coding first.")
	case shipped && p.Phase == model.PhaseShipped, !shipped && p.Phase != model.PhaseShipped:
		return nil
	}
	return s.store.SetShipped(ctx, id, shipped, s.now())
}
