package planner

import (
	"encoding/json"
	"math"
	"sort"
	"time"

	"projectplanner/internal/model"
)

// Retro compares what was planned with what happened. It is filled in once a project ships
// and is built only from facts already recorded: nothing here is typed in by hand.
type Retro struct {
	// Planning: how much of the allowed time was used, and whether the deadline had to end it.
	PlanningAllowedHours float64 `json:"planning_allowed_hours"`
	PlanningUsedHours    float64 `json:"planning_used_hours"`
	ForcedStart          bool    `json:"forced_start"`
	StepsDone            int     `json:"steps_done"`
	StepsTotal           int     `json:"steps_total"`

	// Building: how long it took against the date that was first promised.
	BuildDays     float64 `json:"build_days"`
	FirstTarget   *string `json:"first_target"` // YYYY-MM-DD
	FinalTarget   *string `json:"final_target"`
	DaysVsTarget  *int    `json:"days_vs_target"` // shipped day minus first target; positive = late
	DateMoves     int     `json:"date_moves"`
	DaysLogged    int     `json:"days_logged"`
	HoursLogged   float64 `json:"hours_logged"`
	TasksDone     int     `json:"tasks_done"`
	TasksOpen     int     `json:"tasks_open"`   // MVP work still open at shipping
	TasksParked   int     `json:"tasks_parked"` // sitting in the expansion pack
	ScopeAdded    int     `json:"scope_added"`
	ScopeParked   int     `json:"scope_parked"`
	ScopeCut      int     `json:"scope_cut"`
	PlanChanges   int     `json:"plan_changes"` // differences between the frozen plan and now
	EstimateHours float64 `json:"estimate_hours"`
	SpentHours    float64 `json:"spent_hours"`
	// Multiplier is actual over estimated time for finished tasks that have both; 0 = unknown.
	Multiplier float64 `json:"multiplier"`

	Milestones []RetroMilestone `json:"milestones"`
	Obstacles  []RetroObstacle  `json:"obstacles"`
}

type RetroMilestone struct {
	Title         string     `json:"title"`
	FirstDue      *time.Time `json:"first_due"`
	Due           *time.Time `json:"due"`
	FinishedAt    *time.Time `json:"finished_at"` // when its last task was done; nil if still open
	DaysLate      *float64   `json:"days_late"`   // against the first deadline; negative = early
	TasksDone     int        `json:"tasks_done"`
	TasksTotal    int        `json:"tasks_total"`
	EstimateHours float64    `json:"estimate_hours"`
	SpentHours    float64    `json:"spent_hours"`
}

type RetroObstacle struct {
	Title      string  `json:"title"`
	Kind       string  `json:"kind"`
	Attempts   int     `json:"attempts"`
	Resolution string  `json:"resolution"`
	Solved     bool    `json:"solved"`
	NeededHelp bool    `json:"needed_help"`
	HoursOpen  float64 `json:"hours_open"`
}

func round1(v float64) float64 { return math.Round(v*10) / 10 }

// buildRetro works out the retrospective of a shipped project. planChanges is the number of
// differences between the frozen plan and the current one.
func buildRetro(b *Bundle, planChanges int) *Retro {
	p := b.Project
	if p.BuildStartedAt == nil {
		return nil
	}
	end := b.Now
	if p.ShippedAt != nil {
		end = *p.ShippedAt
	}
	start, deadline := PlanningWindow(p)
	r := &Retro{
		PlanningAllowedHours: round1(deadline.Sub(start).Hours()),
		PlanningUsedHours:    round1(math.Max(0, p.BuildStartedAt.Sub(start).Hours())),
		ForcedStart:          p.ForcedStart,
		BuildDays:            round1(end.Sub(*p.BuildStartedAt).Hours() / 24),
		FirstTarget:          p.OriginalTargetDate,
		FinalTarget:          p.TargetDate,
		PlanChanges:          planChanges,
		Milestones:           []RetroMilestone{},
		Obstacles:            []RetroObstacle{},
	}
	for _, st := range b.Steps {
		if st.Optional {
			continue
		}
		r.StepsTotal++
		if st.Status != "todo" {
			r.StepsDone++
		}
	}
	if p.OriginalTargetDate != nil {
		if target, err := time.ParseInLocation("2006-01-02", *p.OriginalTargetDate, time.Local); err == nil {
			y, m, d := end.Local().Date()
			shipDay := time.Date(y, m, d, 0, 0, 0, 0, time.Local)
			days := int(math.Round(shipDay.Sub(target).Hours() / 24))
			r.DaysVsTarget = &days
		}
	}
	for _, e := range b.Events {
		switch e.Kind {
		case "scope_add":
			r.ScopeAdded++
		case "scope_park":
			r.ScopeParked++
		case "scope_cut":
			r.ScopeCut++
		case "date_move":
			var m dateMove
			if json.Unmarshal(e.Data, &m) == nil {
				r.DateMoves++
			}
		}
	}
	for _, l := range b.Logs {
		r.DaysLogged++
		if l.Hours != nil {
			r.HoursLogged += *l.Hours
		}
	}
	r.HoursLogged = round1(r.HoursLogged)

	type agg struct {
		done, total int
		est, spent  float64
		last        *time.Time
	}
	perMs := map[int64]*agg{}
	var bothEst, bothSpent float64
	for _, t := range b.Tasks {
		if t.Scope == "dlc" {
			if t.Status != "done" {
				r.TasksParked++
			}
			continue
		}
		spent := float64(t.SpentMinutes) / 60
		if t.EstimateHours != nil {
			r.EstimateHours += *t.EstimateHours
		}
		r.SpentHours += spent
		if t.Status == "done" {
			r.TasksDone++
			if t.EstimateHours != nil && t.SpentMinutes > 0 {
				bothEst += *t.EstimateHours
				bothSpent += spent
			}
		} else {
			r.TasksOpen++
		}
		if t.MilestoneID == nil {
			continue
		}
		a := perMs[*t.MilestoneID]
		if a == nil {
			a = &agg{}
			perMs[*t.MilestoneID] = a
		}
		a.total++
		a.spent += spent
		if t.EstimateHours != nil {
			a.est += *t.EstimateHours
		}
		if t.Status == "done" {
			a.done++
			if t.DoneAt != nil && (a.last == nil || t.DoneAt.After(*a.last)) {
				a.last = t.DoneAt
			}
		}
	}
	r.EstimateHours, r.SpentHours = round1(r.EstimateHours), round1(r.SpentHours)
	if bothEst > 0 {
		r.Multiplier = math.Round(bothSpent/bothEst*100) / 100
	}
	for _, m := range b.Milestones {
		a := perMs[m.ID]
		if a == nil {
			a = &agg{}
		}
		rm := RetroMilestone{Title: m.Title, FirstDue: m.OriginalDueAt, Due: m.DueAt, TasksDone: a.done, TasksTotal: a.total,
			EstimateHours: round1(a.est), SpentHours: round1(a.spent)}
		if a.total > 0 && a.done == a.total {
			rm.FinishedAt = a.last
		}
		first := m.OriginalDueAt
		if first == nil {
			first = m.DueAt
		}
		if rm.FinishedAt != nil && first != nil {
			late := round1(rm.FinishedAt.Sub(*first).Hours() / 24)
			rm.DaysLate = &late
		}
		r.Milestones = append(r.Milestones, rm)
	}
	for _, o := range b.Obstacles {
		until := end
		if o.ResolvedAt != nil {
			until = *o.ResolvedAt
		}
		r.Obstacles = append(r.Obstacles, RetroObstacle{
			Title: o.Title, Kind: o.Kind, Attempts: o.Attempts, Resolution: o.Resolution, Solved: o.Status == "resolved",
			NeededHelp: o.NeedsHelp, HoursOpen: round1(math.Max(0, until.Sub(o.CreatedAt).Hours())),
		})
	}
	sort.SliceStable(r.Obstacles, func(i, j int) bool { return r.Obstacles[i].HoursOpen > r.Obstacles[j].HoursOpen })
	return r
}

// ---------- slipped milestones and the cut order ----------

// Slip is a milestone whose date has passed while MVP work under it is still open.
type Slip struct {
	MilestoneID int64      `json:"milestone_id"`
	Title       string     `json:"title"`
	DueAt       time.Time  `json:"due_at"`
	OpenTasks   []SlipTask `json:"open_tasks"`
}

type SlipTask struct {
	ID    int64  `json:"id"`
	Title string `json:"title"`
}

// CutCandidate is the next thing the cut order says to drop.
type CutCandidate struct {
	StoryID   int64  `json:"story_id"`
	Text      string `json:"text"`
	OpenTasks int    `json:"open_tasks"`
}

func slips(b *Bundle) []Slip {
	out := []Slip{}
	if b.Project.Phase != model.PhaseBuild {
		return out
	}
	for _, m := range b.Milestones {
		if m.DueAt == nil || m.DueAt.After(b.Now) {
			continue
		}
		s := Slip{MilestoneID: m.ID, Title: m.Title, DueAt: *m.DueAt, OpenTasks: []SlipTask{}}
		for _, t := range b.Tasks {
			if t.MilestoneID != nil && *t.MilestoneID == m.ID && t.Status != "done" && t.Scope != "dlc" {
				s.OpenTasks = append(s.OpenTasks, SlipTask{ID: t.ID, Title: t.Title})
			}
		}
		if len(s.OpenTasks) > 0 {
			out = append(out, s)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].DueAt.Before(out[j].DueAt) })
	return out
}

// nextCut is the first story in the cut order that still has open work to save by cutting it.
func nextCut(b *Bundle) *CutCandidate {
	open := map[int64]int{}
	for _, t := range b.Tasks {
		if t.StoryID != nil && t.Status != "done" && t.Scope != "dlc" {
			open[*t.StoryID]++
		}
	}
	for _, st := range CutOrder(b.Stories) {
		if open[st.ID] > 0 {
			return &CutCandidate{StoryID: st.ID, Text: st.Text, OpenTasks: open[st.ID]}
		}
	}
	return nil
}
