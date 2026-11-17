package planner

import (
	"context"
	"encoding/json"
	"log"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"projectplanner/internal/filestore"
	"projectplanner/internal/gitlog"
	"projectplanner/internal/model"
	"projectplanner/internal/store"
)

// Service exposes every use case of the application. The HTTP layer calls nothing else.
type Service struct {
	store *store.Store
	files *filestore.Store
	now   func() time.Time
}

func NewService(st *store.Store, files *filestore.Store) *Service {
	return &Service{store: st, files: files, now: time.Now}
}

// SetClock replaces the clock; tests use it to travel in time.
func (s *Service) SetClock(now func() time.Time) { s.now = now }

// ---------- meta ----------

type Meta struct {
	MaxPlanningDays int            `json:"max_planning_days"`
	PlanningDays    map[string]int `json:"planning_days"`
	MaxUploadBytes  int64          `json:"max_upload_bytes"`
}

func (s *Service) Meta() Meta {
	return Meta{MaxPlanningDays: MaxPlanningDays, PlanningDays: PlanningDays, MaxUploadBytes: filestore.MaxUploadBytes}
}

// ---------- projects ----------

type CreateProjectInput struct {
	Name            string     `json:"name"`
	Summary         string     `json:"summary"`
	Type            string     `json:"type"`
	Complexity      string     `json:"complexity"`
	VendorMode      string     `json:"vendor_mode"`
	PlanningDays    *int       `json:"planning_days"`
	PlanningMinutes *int       `json:"planning_minutes"`
	HackStart       *time.Time `json:"hack_start"`
	HackEnd         *time.Time `json:"hack_end"`
	TargetDate      *string    `json:"target_date"`
}

var dateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

func (s *Service) CreateProject(ctx context.Context, in CreateProjectInput) (model.Project, error) {
	now := s.now()
	p := model.Project{
		Name:       strings.TrimSpace(in.Name),
		Summary:    strings.TrimSpace(in.Summary),
		Type:       in.Type,
		Complexity: in.Complexity,
		VendorMode: in.VendorMode,
		DecidedAt:  now,
	}
	if p.Name == "" {
		return p, invalid("Give the project a name.")
	}
	if utf8.RuneCountInString(p.Name) > 120 {
		return p, invalid("Keep the project name under 120 characters.")
	}
	if p.Type == "" {
		p.Type = model.TypeStandard
	}
	if p.Type != model.TypeStandard && p.Type != model.TypeHackathon {
		return p, invalid("Project type must be standard or hackathon.")
	}
	if p.Complexity == "" {
		p.Complexity = "medium"
	}
	if _, ok := PlanningDays[p.Complexity]; !ok {
		return p, invalid("Project size must be tiny, small, medium or hard.")
	}
	if p.VendorMode == "" {
		p.VendorMode = "diy"
		if p.Type == model.TypeHackathon {
			p.VendorMode = "fasttrack"
		}
	}
	if p.VendorMode != "diy" && p.VendorMode != "fasttrack" {
		return p, invalid("Approach must be diy or fasttrack.")
	}
	if in.TargetDate != nil && *in.TargetDate != "" {
		if !validDate(*in.TargetDate) {
			return p, invalid("The target date must look like 2026-12-31.")
		}
		p.TargetDate = in.TargetDate
	}

	if p.Type == model.TypeHackathon {
		if in.HackStart == nil || in.HackEnd == nil {
			return p, invalid("A hackathon needs a start time and a submission deadline.")
		}
		if err := validHackWindow(*in.HackStart, *in.HackEnd); err != nil {
			return p, err
		}
		p.HackStart, p.HackEnd = in.HackStart, in.HackEnd
		budget, _ := HackathonBudget(*in.HackStart, *in.HackEnd)
		if in.PlanningMinutes != nil {
			budget = time.Duration(*in.PlanningMinutes) * time.Minute
		}
		p.PlanningDeadline = HackathonDeadline(*in.HackStart, *in.HackEnd, budget)
	} else {
		days := PlanningDays[p.Complexity]
		if in.PlanningDays != nil {
			days = *in.PlanningDays
		}
		deadline, err := StandardDeadline(now, days)
		if err != nil {
			return p, err
		}
		p.PlanningDeadline = deadline
	}

	var created model.Project
	err := s.store.InTx(ctx, func(tx *store.Store) error {
		var err error
		if created, err = tx.CreateProject(ctx, p); err != nil {
			return err
		}
		for _, seed := range defaultItems(created.Type) {
			if _, err := tx.CreateItem(ctx, model.PlanItem{ProjectID: created.ID, Kind: seed.kind, Data: mustJSON(seed.data)}); err != nil {
				return err
			}
		}
		return nil
	})
	return created, err
}

type itemSeed struct {
	kind string
	data map[string]any
}

// defaultItems pre-fills the lists nobody should have to type: the usual build-vs-buy
// questions and, for hackathons, the usual submission checklist.
func defaultItems(projectType string) []itemSeed {
	var seeds []itemSeed
	for _, name := range []string{"Authentication", "Database", "File storage", "Hosting / deployment"} {
		seeds = append(seeds, itemSeed{"capability", map[string]any{"name": name, "decision": "undecided", "service": "", "notes": ""}})
	}
	if projectType == model.TypeHackathon {
		for _, text := range []string{
			"Read the rules and the judging criteria",
			"Code is pushed to a public repository",
			"The demo works from a clean start (live URL or run instructions)",
			"Demo video recorded / pitch rehearsed",
			"Write-up and README are done",
			"Submitted on the hackathon platform",
		} {
			seeds = append(seeds, itemSeed{"submission", map[string]any{"text": text, "done": false}})
		}
	}
	return seeds
}

// ProjectPatch lists the settings that can be changed after creation. Nil means "leave as is".
type ProjectPatch struct {
	Name            *string    `json:"name"`
	Summary         *string    `json:"summary"`
	Complexity      *string    `json:"complexity"`
	VendorMode      *string    `json:"vendor_mode"`
	RepoPath        *string    `json:"repo_path"`
	Archived        *bool      `json:"archived"`
	TargetDate      *string    `json:"target_date"` // "" clears it
	PlanningDays    *int       `json:"planning_days"`
	PlanningMinutes *int       `json:"planning_minutes"`
	HackStart       *time.Time `json:"hack_start"`
	HackEnd         *time.Time `json:"hack_end"`
}

func (s *Service) PatchProject(ctx context.Context, id int64, in ProjectPatch) (model.Project, error) {
	p, err := s.store.GetProject(ctx, id)
	if err != nil {
		return p, err
	}
	now := s.now()

	if in.Name != nil {
		p.Name = strings.TrimSpace(*in.Name)
		if p.Name == "" || utf8.RuneCountInString(p.Name) > 120 {
			return p, invalid("The project name must be 1 to 120 characters.")
		}
	}
	if in.Summary != nil {
		p.Summary = strings.TrimSpace(*in.Summary)
	}
	if in.Complexity != nil {
		if _, ok := PlanningDays[*in.Complexity]; !ok {
			return p, invalid("Project size must be tiny, small, medium or hard.")
		}
		p.Complexity = *in.Complexity
	}
	if in.VendorMode != nil {
		if *in.VendorMode != "diy" && *in.VendorMode != "fasttrack" {
			return p, invalid("Approach must be diy or fasttrack.")
		}
		p.VendorMode = *in.VendorMode
	}
	if in.RepoPath != nil {
		p.RepoPath = strings.TrimSpace(*in.RepoPath)
	}
	if in.Archived != nil {
		p.Archived = *in.Archived
	}
	if in.TargetDate != nil {
		if *in.TargetDate == "" {
			p.TargetDate = nil
		} else if !validDate(*in.TargetDate) {
			return p, invalid("The target date must look like 2026-12-31.")
		} else {
			p.TargetDate = in.TargetDate
		}
	}

	if in.PlanningDays != nil {
		if p.Type != model.TypeStandard {
			return p, invalid("A hackathon plans in minutes, not days.")
		}
		if p.Phase != model.PhasePlan {
			return p, invalid("Planning is over for this project. There is no going back.")
		}
		deadline, err := StandardDeadline(p.DecidedAt, *in.PlanningDays)
		if err != nil {
			return p, err
		}
		if !deadline.After(now) {
			return p, invalid("That deadline has already passed. If you are ready, press “Start coding now” instead.")
		}
		p.PlanningDeadline = deadline
	}

	if in.HackStart != nil || in.HackEnd != nil || in.PlanningMinutes != nil {
		if p.Type != model.TypeHackathon {
			return p, invalid("Only hackathon projects have a hackathon clock.")
		}
		budget := p.PlanningDeadline.Sub(*p.HackStart)
		if in.PlanningMinutes != nil {
			if p.Phase != model.PhasePlan {
				return p, invalid("Planning is over for this project. There is no going back.")
			}
			budget = time.Duration(*in.PlanningMinutes) * time.Minute
		}
		if in.HackStart != nil {
			p.HackStart = in.HackStart
		}
		if in.HackEnd != nil {
			p.HackEnd = in.HackEnd
		}
		if err := validHackWindow(*p.HackStart, *p.HackEnd); err != nil {
			return p, err
		}
		p.PlanningDeadline = HackathonDeadline(*p.HackStart, *p.HackEnd, budget)
	}

	return s.store.UpdateProject(ctx, p)
}

func (s *Service) DeleteProject(ctx context.Context, id int64) error {
	if err := s.store.DeleteProject(ctx, id); err != nil {
		return err
	}
	if err := s.files.DeleteProject(id); err != nil {
		log.Printf("delete files of project %d: %v", id, err)
	}
	return nil
}

func (s *Service) ListProjects(ctx context.Context) ([]model.ProjectSummary, error) {
	s.Sweep(ctx)
	return s.store.ListProjects(ctx)
}

// Sweep moves every project whose planning time is up into the build phase.
// It runs on a timer and before reads, so the rule holds even if no page is open.
func (s *Service) Sweep(ctx context.Context) {
	ids, err := s.store.ProjectsPastPlanningDeadline(ctx, s.now())
	if err != nil {
		log.Printf("sweep: %v", err)
		return
	}
	for _, id := range ids {
		if err := s.startBuild(ctx, id, true); err != nil {
			log.Printf("sweep: start build of project %d: %v", id, err)
		}
	}
}

// ---------- bundle: everything about one project in one read ----------

type PlanningState struct {
	WindowStart    time.Time `json:"window_start"`
	Deadline       time.Time `json:"deadline"`
	LatestDeadline time.Time `json:"latest_deadline"` // the furthest the deadline can ever move
	EssentialDone  int       `json:"essential_done"`
	EssentialTotal int       `json:"essential_total"`
	ReadyToBuild   bool      `json:"ready_to_build"`
	CurrentStep    string    `json:"current_step"` // where the schedule says you should be now
}

type Bundle struct {
	Now        time.Time          `json:"now"`
	Project    model.Project      `json:"project"`
	Planning   PlanningState      `json:"planning"`
	Steps      []Step             `json:"steps"`
	Hackathon  *HackathonSchedule `json:"hackathon"`
	Stories    []model.Story      `json:"stories"`
	Items      []model.PlanItem   `json:"items"`
	Milestones []model.Milestone  `json:"milestones"`
	Tasks      []model.Task       `json:"tasks"`
	Logs       []model.DailyLog   `json:"logs"`
	Obstacles  []model.Obstacle   `json:"obstacles"`
	Files      []model.File       `json:"files"`
}

func (s *Service) Bundle(ctx context.Context, id int64) (*Bundle, error) {
	p, err := s.store.GetProject(ctx, id)
	if err != nil {
		return nil, err
	}
	now := s.now()
	if p.Phase == model.PhasePlan && !now.Before(p.PlanningDeadline) {
		// Time is up: planning ends here, finished or not.
		if err := s.startBuild(ctx, id, true); err != nil {
			return nil, err
		}
		if p, err = s.store.GetProject(ctx, id); err != nil {
			return nil, err
		}
	}

	b := &Bundle{Now: now, Project: p, Hackathon: Schedule(p)}
	if b.Stories, err = s.store.ListStories(ctx, id); err != nil {
		return nil, err
	}
	if b.Items, err = s.store.ListItems(ctx, id); err != nil {
		return nil, err
	}
	if b.Milestones, err = s.store.ListMilestones(ctx, id); err != nil {
		return nil, err
	}
	if b.Tasks, err = s.store.ListTasks(ctx, id); err != nil {
		return nil, err
	}
	if b.Logs, err = s.store.ListLogs(ctx, id); err != nil {
		return nil, err
	}
	if b.Obstacles, err = s.store.ListObstacles(ctx, id); err != nil {
		return nil, err
	}
	if b.Files, err = s.store.ListFiles(ctx, id); err != nil {
		return nil, err
	}

	b.Steps = ComputeSteps(p, planData{b.Stories, b.Items, b.Milestones, b.Tasks, b.Files})
	b.Planning = planningState(p, b.Steps, now)
	return b, nil
}

func planningState(p model.Project, steps []Step, now time.Time) PlanningState {
	start, end := PlanningWindow(p)
	st := PlanningState{WindowStart: start, Deadline: end, LatestDeadline: LatestPlanningDeadline(p)}
	for _, step := range steps {
		if step.Essential {
			st.EssentialTotal++
			if step.Status != "todo" {
				st.EssentialDone++
			}
		}
	}
	st.ReadyToBuild = st.EssentialDone == st.EssentialTotal
	// The step the schedule expects you to be on: the first unfinished, non-optional step
	// whose "move on by" time has not passed yet (or the last unfinished one if all have).
	for _, step := range steps {
		if step.Status != "todo" || step.Optional {
			continue
		}
		st.CurrentStep = step.Key
		if step.MoveOnBy.After(now) {
			break
		}
	}
	return st
}

// ---------- blueprint answers and step status ----------

var planKeyRe = regexp.MustCompile(`^[a-z][a-z0-9_]{0,40}$`)

// SavePlan stores free-text blueprint answers (why, who, value, deploy path, ...).
func (s *Service) SavePlan(ctx context.Context, id int64, fields map[string]string) error {
	if len(fields) == 0 {
		return nil
	}
	if len(fields) > 50 {
		return invalid("Too many fields in one save.")
	}
	for k, v := range fields {
		if !planKeyRe.MatchString(k) {
			return invalid("Unknown blueprint field %q.", k)
		}
		if len(v) > 50_000 {
			return invalid("That answer is too long. A plan is a reference, not a novel — trim it.")
		}
	}
	return s.store.MergePlan(ctx, id, fields)
}

func (s *Service) SetStep(ctx context.Context, id int64, key, status string) error {
	if !stepKeyValid(key) {
		return invalid("Unknown planning step %q.", key)
	}
	if status != "todo" && status != "done" && status != "skipped" {
		return invalid("A step is todo, done or skipped.")
	}
	return s.store.SetStep(ctx, id, key, status)
}

// ---------- git ----------

func (s *Service) Git(ctx context.Context, id int64) (gitlog.Info, error) {
	p, err := s.store.GetProject(ctx, id)
	if err != nil {
		return gitlog.Info{}, err
	}
	return gitlog.Read(ctx, p.RepoPath, 300), nil
}

// ---------- helpers ----------

func validDate(s string) bool {
	if !dateRe.MatchString(s) {
		return false
	}
	_, err := time.Parse("2006-01-02", s)
	return err == nil
}

func validHackWindow(start, end time.Time) error {
	if !end.After(start) {
		return invalid("The submission deadline must be after the start.")
	}
	if end.Sub(start) < 30*time.Minute {
		return invalid("A hackathon lasts at least 30 minutes.")
	}
	if end.Sub(start) > 90*day {
		return invalid("That is longer than 90 days — use a standard project instead.")
	}
	return nil
}

func mustJSON(v any) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return b
}
