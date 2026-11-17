package planner

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"projectplanner/internal/gitlog"
	"projectplanner/internal/model"
)

// Status is the short answer to "where am I?" for one project: what `planner status` prints.
type Status struct {
	ProjectID int64  `json:"project_id"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	Phase     string `json:"phase"`
	// Countdown is the deadline that matters right now, and what it is.
	CountdownLabel string     `json:"countdown_label"`
	CountdownTo    *time.Time `json:"countdown_to"`
	Remaining      string     `json:"remaining"` // "3d 4h", or "2h 10m late"
	Late           bool       `json:"late"`

	StepsDone   int    `json:"steps_done"`
	StepsTotal  int    `json:"steps_total"`
	CurrentStep string `json:"current_step"`

	TasksDone  int         `json:"tasks_done"`
	TasksTotal int         `json:"tasks_total"`
	Task       *StatusTask `json:"task"` // the task in progress, or the next one to start
	Next       *StatusDue  `json:"next_milestone"`
	Picks      []string    `json:"picks"` // today's three
	Obstacles  int         `json:"open_obstacles"`
	StaleTasks int         `json:"stale_tasks"`
}

type StatusTask struct {
	ID         int64  `json:"id"`
	Title      string `json:"title"`
	InProgress bool   `json:"in_progress"`
	StepsDone  int    `json:"steps_done"`
	StepsTotal int    `json:"steps_total"`
}

type StatusDue struct {
	Title     string    `json:"title"`
	DueAt     time.Time `json:"due_at"`
	Remaining string    `json:"remaining"`
	Late      bool      `json:"late"`
}

// StatusFor picks the project a status report is about: the given id, else the project whose
// repository folder contains dir, else (unless onlyHere) the active project touched last.
// It reports 0 when there is nothing to show.
func (s *Service) StatusFor(ctx context.Context, id int64, dir string, onlyHere bool) (int64, error) {
	if id != 0 {
		return id, s.requireProject(ctx, id)
	}
	ids, err := s.store.ProjectIDs(ctx, "")
	if err != nil {
		return 0, err
	}
	var fallback int64
	best, bestLen := int64(0), -1
	for _, pid := range ids { // most recently touched first
		p, err := s.store.GetProject(ctx, pid)
		if err != nil {
			continue
		}
		if fallback == 0 && p.Phase != model.PhaseShipped {
			fallback = pid
		}
		repo := gitlog.ExpandPath(p.RepoPath)
		if dir == "" || repo == "" {
			continue
		}
		if rel, err := filepath.Rel(repo, dir); err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			if len(repo) > bestLen {
				best, bestLen = pid, len(repo)
			}
		}
	}
	switch {
	case best != 0:
		return best, nil
	case onlyHere:
		return 0, nil
	}
	return fallback, nil
}

// Status builds the report for one project.
func (s *Service) Status(ctx context.Context, id int64) (Status, error) {
	b, err := s.Bundle(ctx, id)
	if err != nil {
		return Status{}, err
	}
	p, now := b.Project, b.Now
	st := Status{ProjectID: p.ID, Name: p.Name, Type: p.Type, Phase: p.Phase, Picks: []string{}}
	countdown := func(label string, to time.Time) {
		st.CountdownLabel, st.CountdownTo = label, &to
		st.Remaining, st.Late = span(now, to)
	}

	for _, step := range b.Steps {
		if step.Optional {
			continue
		}
		st.StepsTotal++
		if step.Status != "todo" {
			st.StepsDone++
		}
		if step.Key == b.Planning.CurrentStep {
			st.CurrentStep = step.Title
		}
	}
	var doing, next *model.Task
	staleAfter := time.Duration(p.StaleHours) * time.Hour
	for i := range b.Tasks {
		t := &b.Tasks[i]
		if t.Scope == "dlc" {
			continue
		}
		st.TasksTotal++
		switch t.Status {
		case "done":
			st.TasksDone++
		case "doing":
			if doing == nil {
				doing = t
			}
			limit := staleAfter
			if t.EstimateHours != nil {
				if twice := time.Duration(*t.EstimateHours * 2 * float64(time.Hour)); twice > limit {
					limit = twice
				}
			}
			if t.StartedAt != nil && since(now, *t.StartedAt) > limit {
				st.StaleTasks++
			}
		default:
			if next == nil && t.Scope == "mvp" {
				next = t
			}
		}
	}
	if t := doing; t != nil || next != nil {
		if t == nil {
			t = next
		}
		st.Task = &StatusTask{ID: t.ID, Title: t.Title, InProgress: t.Status == "doing", StepsTotal: len(t.Checklist)}
		for _, c := range t.Checklist {
			if c.Done {
				st.Task.StepsDone++
			}
		}
	}
	for _, o := range b.Obstacles {
		if o.Status == "open" {
			st.Obstacles++
		}
	}
	today := now.Local().Format("2006-01-02")
	for _, pk := range b.Picks {
		if pk.Day == today {
			st.Picks = append(st.Picks, pk.Title)
		}
	}
	for _, m := range b.Milestones {
		if m.DueAt == nil {
			continue
		}
		open := false
		for _, t := range b.Tasks {
			if t.MilestoneID != nil && *t.MilestoneID == m.ID && t.Status != "done" && t.Scope != "dlc" {
				open = true
				break
			}
		}
		if open && (st.Next == nil || m.DueAt.Before(st.Next.DueAt)) {
			d := StatusDue{Title: m.Title, DueAt: *m.DueAt}
			d.Remaining, d.Late = span(now, *m.DueAt)
			st.Next = &d
		}
	}

	switch {
	case p.Phase == model.PhasePlan && p.HackStart != nil && now.Before(*p.HackStart):
		countdown("hackathon starts", *p.HackStart)
	case p.Phase == model.PhasePlan:
		countdown("coding starts", p.PlanningDeadline)
	case p.Phase == model.PhaseShipped:
		st.CountdownLabel = "shipped"
		if p.ShippedAt != nil {
			st.CountdownTo = p.ShippedAt
		}
	case b.Hackathon != nil && now.Before(b.Hackathon.FreezeAt):
		countdown("feature freeze", b.Hackathon.FreezeAt)
	case b.Hackathon != nil && now.Before(b.Hackathon.SubmitFrom):
		countdown("submit", b.Hackathon.SubmitFrom)
	case b.Hackathon != nil:
		countdown("deadline", b.Hackathon.End)
	case p.TargetDate != nil:
		if day, err := time.ParseInLocation("2006-01-02", *p.TargetDate, time.Local); err == nil {
			countdown("ship date", day.Add(24*time.Hour-time.Second))
		}
	case st.Next != nil:
		countdown(st.Next.Title, st.Next.DueAt)
	}
	return st, nil
}

// span words the distance between now and a deadline: "3d 4h", "2h 10m", "45m", or the same
// with late = true when the deadline has passed.
func span(now, to time.Time) (string, bool) {
	d := to.Sub(now)
	late := d < 0
	if late {
		d = -d
	}
	d = d.Round(time.Minute)
	days, hours, mins := int(d/(24*time.Hour)), int(d/time.Hour)%24, int(d/time.Minute)%60
	switch {
	case days > 0:
		return fmt.Sprintf("%dd %dh", days, hours), late
	case hours > 0:
		return fmt.Sprintf("%dh %dm", hours, mins), late
	}
	return fmt.Sprintf("%dm", mins), late
}

// Line is the one-line form of the report, meant for a shell prompt.
func (st Status) Line() string {
	var parts []string
	head := st.Phase
	switch st.Phase {
	case model.PhasePlan:
		head = "plan"
	case model.PhaseBuild:
		head = "build"
	}
	if st.Remaining != "" {
		if st.Late {
			head += " " + st.Remaining + " late"
		} else {
			head += " " + st.Remaining
		}
	}
	parts = append(parts, st.Name+" ["+head+"]")
	switch {
	case st.Phase == model.PhasePlan && st.CurrentStep != "":
		parts = append(parts, st.CurrentStep)
	case st.Task != nil && st.Phase != model.PhasePlan:
		title := []rune(st.Task.Title)
		if len(title) > 40 {
			title = append(title[:39], '…')
		}
		parts = append(parts, fmt.Sprintf("#%d %s", st.Task.ID, string(title)))
	}
	if st.Obstacles > 0 {
		parts = append(parts, fmt.Sprintf("%d stuck", st.Obstacles))
	}
	return strings.Join(parts, " · ")
}

// Text is the full report, a few lines for a terminal.
func (st Status) Text() string {
	var w strings.Builder
	row := func(label, format string, args ...any) {
		fmt.Fprintf(&w, "  %-10s %s\n", label, fmt.Sprintf(format, args...))
	}
	phase := map[string]string{model.PhasePlan: "planning", model.PhaseBuild: "building", model.PhaseShipped: "shipped"}[st.Phase]
	fmt.Fprintf(&w, "%s — %s\n", st.Name, phase)
	if st.CountdownTo != nil {
		at := st.CountdownTo.Local().Format("Mon 2 Jan 15:04")
		switch {
		case st.Phase == model.PhaseShipped:
			row("Shipped", "%s", at)
		case st.Late:
			row("Clock", "%s was %s ago (%s)", st.CountdownLabel, st.Remaining, at)
		default:
			row("Clock", "%s in %s (%s)", st.CountdownLabel, st.Remaining, at)
		}
	}
	if st.Phase == model.PhasePlan {
		row("Plan", "%d of %d steps done", st.StepsDone, st.StepsTotal)
		if st.CurrentStep != "" {
			row("Now", "%s", st.CurrentStep)
		}
		return w.String()
	}
	row("Progress", "%d of %d tasks done", st.TasksDone, st.TasksTotal)
	if n := st.Next; n != nil {
		if n.Late {
			row("Milestone", "%s — %s late", n.Title, n.Remaining)
		} else {
			row("Milestone", "%s — due in %s", n.Title, n.Remaining)
		}
	}
	if t := st.Task; t != nil {
		label, steps := "Now", ""
		if !t.InProgress {
			label = "Next"
		}
		if t.StepsTotal > 0 {
			steps = fmt.Sprintf(" (%d of %d steps)", t.StepsDone, t.StepsTotal)
		}
		row(label, "#%d %s%s", t.ID, t.Title, steps)
	}
	if len(st.Picks) > 0 {
		row("Today", "%s", strings.Join(st.Picks, " · "))
	}
	if st.StaleTasks > 0 {
		row("Stale", "%d task(s) in progress too long — split or cut", st.StaleTasks)
	}
	if st.Obstacles > 0 {
		row("Stuck", "%d open obstacle(s)", st.Obstacles)
	}
	return w.String()
}
