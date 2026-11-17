package planner

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"projectplanner/internal/filestore"
	"projectplanner/internal/model"
	"projectplanner/internal/store"
)

// Service exposes every use case of the application. The HTTP layer calls nothing else.
type Service struct {
	store *store.Store
	files *filestore.Store
	now   func() time.Time

	// What happened the last time PLAN.md was written into each project's repository.
	syncMu sync.Mutex
	synced map[int64]PlanSyncState
}

func NewService(st *store.Store, files *filestore.Store) *Service {
	return &Service{store: st, files: files, now: time.Now, synced: map[int64]PlanSyncState{}}
}

// SetClock replaces the clock; tests use it to travel in time.
func (s *Service) SetClock(now func() time.Time) { s.now = now }

// ---------- meta ----------

type Meta struct {
	MaxPlanningDays int            `json:"max_planning_days"`
	PlanningDays    map[string]int `json:"planning_days"`
	MaxUploadBytes  int64          `json:"max_upload_bytes"`
	ScopeBudget     map[string]int `json:"scope_budget"`
	Kits            []Kit          `json:"kits"`
	// Standard projects that are being built right now, and what the installation does about
	// starting another one: "off", "warn" or "block".
	Building     []string `json:"building"`
	OneBuildMode string   `json:"one_build_mode"`
	// The planning steps that count for each project type (optional ones are left out).
	StepKeys map[string][]string `json:"step_keys"`
	// How much longer finished tasks took than estimated, across all projects; 0 = unknown yet.
	Multiplier      float64 `json:"multiplier"`
	MultiplierTasks int     `json:"multiplier_tasks"`
	MaxPicks        int     `json:"max_picks"`
}

func (s *Service) Meta(ctx context.Context) (Meta, error) {
	m := Meta{MaxPlanningDays: MaxPlanningDays, PlanningDays: PlanningDays, MaxUploadBytes: filestore.MaxUploadBytes,
		ScopeBudget: scopeBudget, Kits: Kits()}
	var err error
	if m.Building, err = s.store.ProjectsBuilding(ctx); err != nil {
		return m, err
	}
	m.OneBuildMode = s.Settings(ctx).OneBuildMode
	m.StepKeys = map[string][]string{model.TypeStandard: {}, model.TypeHackathon: {}}
	for _, d := range stepDefs {
		if d.Share > 0 {
			m.StepKeys[model.TypeStandard] = append(m.StepKeys[model.TypeStandard], d.Key)
		}
		if d.HackShare > 0 {
			m.StepKeys[model.TypeHackathon] = append(m.StepKeys[model.TypeHackathon], d.Key)
		}
	}
	m.MaxPicks = maxPicks
	if m.Multiplier, m.MultiplierTasks, err = s.multiplier(ctx); err != nil {
		return m, err
	}
	return m, nil
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
	Kit             string     `json:"kit"`
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

	var kit Kit
	if in.Kit != "" {
		var ok bool
		if kit, ok = kitByKey(in.Kit); !ok {
			return p, invalid("Unknown starter kit %q.", in.Kit)
		}
		p.Kit = kit.Key
	}
	// One project in build at a time, if the installation is set to enforce it. A hackathon is
	// an appointment, not a choice, so it is never blocked.
	if p.Type == model.TypeStandard && s.Settings(ctx).OneBuildMode == "block" {
		building, err := s.store.ProjectsBuilding(ctx)
		if err != nil {
			return p, err
		}
		if len(building) > 0 {
			return p, invalid("“%s” is still being built. Ship it or archive it before starting another project — or change this rule under Settings on the projects page.", building[0])
		}
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
	p.StaleHours = DefaultStaleHours(p.Type, p.HackStart, p.HackEnd)

	var created model.Project
	err := s.store.InTx(ctx, func(tx *store.Store) error {
		var err error
		if created, err = tx.CreateProject(ctx, p); err != nil {
			return err
		}
		for _, seed := range defaultItems(created, kit, now) {
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
func defaultItems(p model.Project, kit Kit, now time.Time) []itemSeed {
	var seeds []itemSeed
	capabilities := []string{"Authentication", "Database", "File storage", "Hosting / deployment"}
	if kit.Key != "" {
		capabilities = kit.Capabilities
	}
	for _, name := range capabilities {
		seeds = append(seeds, itemSeed{"capability", map[string]any{"name": name, "decision": "undecided", "service": "", "notes": ""}})
	}
	for _, layer := range kit.StackLayers {
		seeds = append(seeds, itemSeed{"stack", map[string]any{"layer": layer, "choice": "", "why": "", "familiarity": ""}})
	}
	start, _ := PlanningWindow(p)
	if start.Before(now) {
		start = now
	}
	for _, q := range kit.Questions {
		seeds = append(seeds, itemSeed{"question", map[string]any{
			"text": q, "status": "open", "answer": "", "box_until": start.Add(QuestionBox(p)).UTC().Format(time.RFC3339),
		}})
	}
	if p.Type == model.TypeHackathon {
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
	ArchiveReason   *string    `json:"archive_reason"`
	StaleHours      *int       `json:"stale_hours"`
	PlanSync        *bool      `json:"plan_sync"`
	CommitClose     *bool      `json:"commit_close"`
	// Reason is required to move a ship date that was already set, once coding has started.
	Reason string `json:"reason"`
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
	if in.Archived != nil && *in.Archived != p.Archived {
		p.Archived = *in.Archived
		if p.Archived {
			// Dropping an unfinished project costs one honest sentence. It is shown again when
			// the next project is created.
			reason := ""
			if in.ArchiveReason != nil {
				reason = strings.TrimSpace(*in.ArchiveReason)
			}
			if p.Phase != model.PhaseShipped && reason == "" {
				return p, invalid("Say in one line why you are dropping this project. You will see it again when you start the next one.")
			}
			if utf8.RuneCountInString(reason) > 500 {
				return p, invalid("Keep the reason under 500 characters.")
			}
			p.ArchiveReason, p.ArchivedAt = reason, &now
		} else {
			p.ArchiveReason, p.ArchivedAt = "", nil
		}
	}
	if in.StaleHours != nil {
		if *in.StaleHours < 1 || *in.StaleHours > 720 {
			return p, invalid("The limit for a task in progress must be between 1 hour and 30 days.")
		}
		p.StaleHours = *in.StaleHours
	}
	if in.PlanSync != nil {
		p.PlanSync = *in.PlanSync
	}
	if in.CommitClose != nil {
		p.CommitClose = *in.CommitClose
	}
	var move *dateMove
	if in.TargetDate != nil {
		old := ""
		if p.TargetDate != nil {
			old = *p.TargetDate
		}
		if *in.TargetDate == "" {
			p.TargetDate = nil
		} else if !validDate(*in.TargetDate) {
			return p, invalid("The target date must look like 2026-12-31.")
		} else {
			p.TargetDate = in.TargetDate
		}
		// Once coding has started, a ship date that was set is a promise: it can move, but the
		// move is written down with its reason.
		if p.Phase != model.PhasePlan && old != "" && *in.TargetDate != old {
			reason := strings.TrimSpace(in.Reason)
			if reason == "" {
				return p, invalid("Moving the ship date needs a reason — one line on why it is moving.")
			}
			move = &dateMove{What: "target", Title: "Ship date", From: old, To: *in.TargetDate, Reason: reason}
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

	saved, err := s.store.UpdateProject(ctx, p)
	if err != nil {
		return saved, err
	}
	if move != nil {
		if err := s.store.AddEvent(ctx, id, "date_move", now, move); err != nil {
			return saved, err
		}
	}
	if in.PlanSync != nil || in.RepoPath != nil {
		s.syncPlan(ctx, saved)
	}
	return saved, nil
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
	Events     []model.Event      `json:"events"`
	Picks      []model.DayPick    `json:"picks"`
	Limits     Limits             `json:"limits"`
	PlanSync   *PlanSyncState     `json:"plan_sync"`
	// Milestones that slipped with open work, and what the cut order says to drop next.
	Slips   []Slip        `json:"slips"`
	CutNext *CutCandidate `json:"cut_next"`
	// Whether a frozen copy of the plan exists, and the retrospective once the project shipped.
	HasSnapshot bool   `json:"has_snapshot"`
	Retro       *Retro `json:"retro"`
}

// Limits are the numbers the honesty rules work with for this project.
type Limits struct {
	ScopeBudget  int `json:"scope_budget"`  // most user stories the MVP may hold
	StuckMinutes int `json:"stuck_minutes"` // length of one attempt at an obstacle
	CutSnoozeMin int `json:"cut_snooze_minutes"`
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

	if b.Events, err = s.store.ListEvents(ctx, id); err != nil {
		return nil, err
	}
	if b.Picks, err = s.store.ListPicks(ctx, id); err != nil {
		return nil, err
	}

	b.Steps = ComputeSteps(p, planData{b.Stories, b.Items, b.Milestones, b.Tasks, b.Files})
	b.Planning = planningState(p, b.Steps, now)
	b.Limits = Limits{ScopeBudget: ScopeBudget(p), StuckMinutes: int(StuckWindow(p) / time.Minute), CutSnoozeMin: int(CutSnooze(p) / time.Minute)}
	if b.Hackathon != nil {
		b.Hackathon.applyBreaks(b.Items)
	}
	if p.PlanSync {
		st := s.planSyncState(id)
		b.PlanSync = &st
	}
	b.Slips, b.CutNext = slips(b), nextCut(b)
	if p.Phase != model.PhasePlan {
		sn, err := s.store.GetSnapshot(ctx, id)
		switch {
		case errors.Is(err, store.ErrNotFound):
		case err != nil:
			return nil, err
		default:
			b.HasSnapshot = true
			if p.Phase == model.PhaseShipped {
				changes := 0
				var old planSnapshot
				if json.Unmarshal(sn.Data, &old) == nil {
					changes = len(diffPlan(old, takeSnapshot(p, b.Stories, b.Items, b.Milestones)))
				}
				b.Retro = buildRetro(b, changes)
			}
		}
		if b.Retro == nil && p.Phase == model.PhaseShipped {
			b.Retro = buildRetro(b, 0)
		}
	}
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
