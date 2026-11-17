// Package planner is the logic layer — the brain of the backend.
// It owns every planning rule: the two-week limit, phase changes, the planning template,
// the hackathon schedule and what gets generated when coding starts.
package planner

import (
	"fmt"
	"time"

	"projectplanner/internal/model"
)

// MaxPlanningDays is the rule the whole tool is built around: no matter how hard the project
// is, coding starts at most 14 days after deciding to do it.
const MaxPlanningDays = 14

const day = 24 * time.Hour

// PlanningDays is the default planning budget for each project size.
var PlanningDays = map[string]int{"tiny": 1, "small": 3, "medium": 7, "hard": 14}

// mvpDays is a first guess for how long the MVP takes to build once coding starts. It is only
// used to put deadlines on generated milestones when no target date was set.
var mvpDays = map[string]int{"tiny": 3, "small": 10, "medium": 28, "hard": 56}

// InvalidError is a request that breaks a rule; its message is shown to the user as is.
type InvalidError struct{ Msg string }

func (e *InvalidError) Error() string { return e.Msg }

func invalid(format string, args ...any) error {
	return &InvalidError{Msg: fmt.Sprintf(format, args...)}
}

// StandardDeadline is when planning ends for a normal project.
func StandardDeadline(decidedAt time.Time, days int) (time.Time, error) {
	if days < 1 || days > MaxPlanningDays {
		return time.Time{}, invalid(
			"Planning can take 1 to %d days. %d days after deciding to do a project you are coding — that limit cannot be raised.",
			MaxPlanningDays, MaxPlanningDays)
	}
	return decidedAt.Add(time.Duration(days) * day), nil
}

// HackathonBudget returns the default and the maximum planning time for a hackathon:
// about 10% of the event by default, never more than a quarter of it.
func HackathonBudget(start, end time.Time) (def, max time.Duration) {
	dur := end.Sub(start)
	max = dur / 4
	if max > MaxPlanningDays*day {
		max = MaxPlanningDays * day
	}
	def = clamp(dur/10, 15*time.Minute, 4*time.Hour)
	if def > max {
		def = max
	}
	return def.Truncate(time.Minute), max.Truncate(time.Minute)
}

// HackathonDeadline is when planning ends in a hackathon; budget is cut down to the maximum.
func HackathonDeadline(start, end time.Time, budget time.Duration) time.Time {
	_, max := HackathonBudget(start, end)
	if budget > max {
		budget = max
	}
	if budget < time.Minute {
		budget = time.Minute
	}
	return start.Add(budget)
}

// PlanningWindow is the span planning is allowed to take: from deciding (or from the start of
// the hackathon, if that is later) until the planning deadline.
func PlanningWindow(p model.Project) (start, end time.Time) {
	start, end = p.DecidedAt, p.PlanningDeadline
	if p.Type == model.TypeHackathon && p.HackStart != nil && p.HackStart.After(start) {
		start = *p.HackStart
	}
	if start.After(end) {
		start = end
	}
	return start, end
}

// LatestPlanningDeadline is the furthest the planning deadline of this project could ever be moved.
func LatestPlanningDeadline(p model.Project) time.Time {
	if p.Type == model.TypeHackathon && p.HackStart != nil && p.HackEnd != nil {
		_, max := HackathonBudget(*p.HackStart, *p.HackEnd)
		return p.HackStart.Add(max)
	}
	return p.DecidedAt.Add(MaxPlanningDays * day)
}

// ---------- hackathon schedule ----------

type Segment struct {
	Key   string    `json:"key"`
	Label string    `json:"label"`
	Hint  string    `json:"hint"`
	Start time.Time `json:"start"`
	End   time.Time `json:"end"`
}

type HackathonSchedule struct {
	Start              time.Time `json:"start"`
	End                time.Time `json:"end"`
	FreezeAt           time.Time `json:"freeze_at"`
	SubmitFrom         time.Time `json:"submit_from"`
	Segments           []Segment `json:"segments"`
	PlanningMinutes    int       `json:"planning_minutes"`
	MaxPlanningMinutes int       `json:"max_planning_minutes"`
}

// Schedule splits a hackathon into plan → build → polish → submit.
// Features freeze at 80% of the event; the last ~5% (15 minutes to 2 hours) is reserved for submitting.
func Schedule(p model.Project) *HackathonSchedule {
	if p.Type != model.TypeHackathon || p.HackStart == nil || p.HackEnd == nil {
		return nil
	}
	start, end := *p.HackStart, *p.HackEnd
	dur := end.Sub(start)
	freeze := start.Add(dur * 8 / 10)
	buffer := clamp(dur/20, 15*time.Minute, 2*time.Hour)
	if buffer > dur*15/100 {
		buffer = dur * 15 / 100
	}
	submitFrom := end.Add(-buffer)
	planEnd := p.PlanningDeadline
	if planEnd.Before(start) {
		planEnd = start
	}
	_, max := HackathonBudget(start, end)
	return &HackathonSchedule{
		Start: start, End: end, FreezeAt: freeze, SubmitFrom: submitFrom,
		PlanningMinutes:    int(planEnd.Sub(start) / time.Minute),
		MaxPlanningMinutes: int(max / time.Minute),
		Segments: []Segment{
			{Key: "plan", Label: "Plan", Hint: "Lock the idea, the MVP and the stack. Nothing else.", Start: start, End: planEnd},
			{Key: "build", Label: "Build", Hint: "Get the core demo path working end to end first.", Start: planEnd, End: freeze},
			{Key: "polish", Label: "Polish & demo", Hint: "Feature freeze. Fix what the judges will see, prepare the demo.", Start: freeze, End: submitFrom},
			{Key: "submit", Label: "Submit", Hint: "Stop coding. Submit now, not in the last minute.", Start: submitFrom, End: end},
		},
	}
}

func clamp(d, lo, hi time.Duration) time.Duration {
	if d < lo {
		return lo
	}
	if d > hi {
		return hi
	}
	return d
}
