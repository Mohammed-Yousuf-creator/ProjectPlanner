// Package planner is the logic layer — the brain of the backend.
// It owns every planning rule: the two-week limit, phase changes, the planning template,
// the hackathon schedule and what gets generated when coding starts.
package planner

import (
	"encoding/json"
	"fmt"
	"sort"
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
	// Hours you will not be coding (sleep, meals, travel), and what is left once they are taken out.
	Breaks           []Break `json:"breaks"`
	WorkMinutes      int     `json:"work_minutes"`       // the whole event minus breaks
	BuildWorkMinutes int     `json:"build_work_minutes"` // the build segment minus breaks
}

// Break is a stretch of a hackathon you will not be working in.
type Break struct {
	ID    int64     `json:"id"`
	Label string    `json:"label"`
	Start time.Time `json:"start"`
	End   time.Time `json:"end"`
}

// applyBreaks reads the "break" entries of the blueprint into the schedule and works out how
// much working time the event and its build segment really hold.
func (h *HackathonSchedule) applyBreaks(items []model.PlanItem) {
	h.Breaks = []Break{}
	for _, it := range items {
		if it.Kind != "break" {
			continue
		}
		var d struct {
			Label string    `json:"label"`
			Start time.Time `json:"start"`
			End   time.Time `json:"end"`
		}
		if json.Unmarshal(it.Data, &d) != nil || !d.End.After(d.Start) {
			continue
		}
		h.Breaks = append(h.Breaks, Break{ID: it.ID, Label: d.Label, Start: d.Start, End: d.End})
	}
	sort.Slice(h.Breaks, func(i, j int) bool { return h.Breaks[i].Start.Before(h.Breaks[j].Start) })
	h.WorkMinutes = int((h.End.Sub(h.Start) - offTime(h.Breaks, h.Start, h.End)) / time.Minute)
	for _, seg := range h.Segments {
		if seg.Key == "build" {
			h.BuildWorkMinutes = int((seg.End.Sub(seg.Start) - offTime(h.Breaks, seg.Start, seg.End)) / time.Minute)
		}
	}
}

// offTime is how much of the span from..to is covered by breaks; overlapping breaks count once.
func offTime(breaks []Break, from, to time.Time) time.Duration {
	var off time.Duration
	cursor := from
	for _, b := range breaks { // sorted by start
		start, end := b.Start, b.End
		if start.Before(cursor) {
			start = cursor
		}
		if end.After(to) {
			end = to
		}
		if end.After(start) {
			off += end.Sub(start)
			cursor = end
		}
	}
	return off
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

// ---------- scope and time honesty ----------

// scopeBudget caps how many user stories fit in the MVP of a standard project, by size.
var scopeBudget = map[string]int{"tiny": 3, "small": 5, "medium": 8, "hard": 12}

// ScopeBudget is the number of user stories the MVP of this project may hold. Adding one more
// means moving another out first. A hackathon's budget follows the length of the event.
func ScopeBudget(p model.Project) int {
	if p.Type == model.TypeHackathon && p.HackStart != nil && p.HackEnd != nil {
		switch dur := p.HackEnd.Sub(*p.HackStart); {
		case dur <= 12*time.Hour:
			return 2
		case dur <= 30*time.Hour:
			return 3
		case dur <= 3*day:
			return 4
		default:
			return 6
		}
	}
	if n, ok := scopeBudget[p.Complexity]; ok {
		return n
	}
	return scopeBudget["medium"]
}

// DefaultStaleHours is how long a task may sit in progress before it is flagged: two days for
// a normal project, a twelfth of the event (1 to 12 hours) in a hackathon.
func DefaultStaleHours(projectType string, hackStart, hackEnd *time.Time) int {
	if projectType == model.TypeHackathon && hackStart != nil && hackEnd != nil {
		return int(clamp(hackEnd.Sub(*hackStart)/12, time.Hour, 12*time.Hour) / time.Hour)
	}
	return 48
}

// StuckWindow is how long one attempt at an obstacle lasts before the planner asks for a
// different approach or outside help.
func StuckWindow(p model.Project) time.Duration {
	if p.Type == model.TypeHackathon {
		return 10 * time.Minute
	}
	return 20 * time.Minute
}

// QuestionBox is the time an open feasibility question gets before it has to be decided or
// pushed to "learn while building": a tenth of the planning window, 15 minutes to a day.
func QuestionBox(p model.Project) time.Duration {
	start, end := PlanningWindow(p)
	return clamp(end.Sub(start)/10, 15*time.Minute, day).Truncate(time.Minute)
}

// CutSnooze is how long the "cut or move the date" prompt of a slipped milestone stays quiet
// after something was cut for it.
func CutSnooze(p model.Project) time.Duration {
	if p.Type == model.TypeHackathon && p.HackStart != nil && p.HackEnd != nil {
		return clamp(p.HackEnd.Sub(*p.HackStart)/20, 15*time.Minute, 4*time.Hour)
	}
	return day
}
