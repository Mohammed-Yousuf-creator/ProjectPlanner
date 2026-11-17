package planner

import (
	"context"
	"fmt"
	"sort"
	"time"

	"projectplanner/internal/model"
)

// Alert is a moment worth a desktop notification: a deadline that is close or has arrived.
type Alert struct {
	Key       string    `json:"key"` // stable, so the same alert is never shown twice
	ProjectID int64     `json:"project_id"`
	Project   string    `json:"project"`
	At        time.Time `json:"at"`
	Title     string    `json:"title"`
	Body      string    `json:"body"`
	Path      string    `json:"path"` // where in the app the alert leads
}

// Alerts lists the deadline moments of every active project from two minutes ago to a day
// ahead. The browser schedules a notification for each; nothing is sent anywhere else.
func (s *Service) Alerts(ctx context.Context) ([]Alert, error) {
	now := s.now()
	from, to := now.Add(-2*time.Minute), now.Add(24*time.Hour)
	ids, err := s.store.ProjectIDs(ctx, "phase <> 'shipped'")
	if err != nil {
		return nil, err
	}
	out := []Alert{}
	for _, id := range ids {
		p, err := s.store.GetProject(ctx, id)
		if err != nil {
			continue
		}
		base := fmt.Sprintf("/p/%d", p.ID)
		add := func(key string, at time.Time, title, body, path string) {
			if at.Before(from) || at.After(to) {
				return
			}
			out = append(out, Alert{Key: fmt.Sprintf("%d:%s:%d", p.ID, key, at.Unix()), ProjectID: p.ID, Project: p.Name,
				At: at, Title: title, Body: body, Path: base + path})
		}

		if p.Phase == model.PhasePlan {
			start, end := PlanningWindow(p)
			lead := clamp(end.Sub(start)/4, 5*time.Minute, time.Hour)
			add("plan-soon", end.Add(-lead), "Planning ends in "+words(lead),
				"Finish the step you are on. Whatever is still open becomes a task on the board.", "/blueprint")
			add("plan-end", end, "Pencils down — start coding", "Planning is over. The board is filled and the first task is waiting.", "")
		}
		if h := Schedule(p); h != nil {
			add("hack-start", h.Start, "The hackathon has started", "The planning clock is running.", "")
			add("freeze-soon", h.FreezeAt.Add(-15*time.Minute), "Feature freeze in 15 minutes", "Finish what you are on. After the freeze: polish, fix, prepare the demo.", "/hackathon")
			add("freeze", h.FreezeAt, "Feature freeze", "No new features from here. Make what exists work from a clean start.", "/hackathon")
			add("submit", h.SubmitFrom, "Submit now", "Stop coding and submit. Improve the write-up afterwards if time is left.", "/hackathon")
			add("end-soon", h.End.Add(-10*time.Minute), "10 minutes to the deadline", "If it is not submitted yet, submit what you have.", "/hackathon")
		}
		if p.Phase != model.PhaseBuild {
			continue
		}
		if p.TargetDate != nil {
			if day, err := time.ParseInLocation("2006-01-02", *p.TargetDate, time.Local); err == nil {
				add("ship-eve", day.Add(-15*time.Hour), "Ship date is tomorrow", "Decide tonight what does not make it.", "")
				add("ship-day", day.Add(9*time.Hour), "Ship date is today", "Ship what works. The rest is the expansion pack.", "")
			}
		}
		milestones, err := s.store.ListMilestones(ctx, id)
		if err != nil {
			return nil, err
		}
		tasks, err := s.store.ListTasks(ctx, id)
		if err != nil {
			return nil, err
		}
		for _, m := range milestones {
			if m.DueAt == nil {
				continue
			}
			open := 0
			for _, t := range tasks {
				if t.MilestoneID != nil && *t.MilestoneID == m.ID && t.Status != "done" && t.Scope != "dlc" {
					open++
				}
			}
			if open == 0 {
				continue
			}
			add(fmt.Sprintf("ms-soon-%d", m.ID), m.DueAt.Add(-time.Hour), "Milestone due in 1 hour: "+m.Title,
				fmt.Sprintf("%d task(s) still open.", open), "/board")
			add(fmt.Sprintf("ms-%d", m.ID), *m.DueAt, "Milestone due: "+m.Title,
				fmt.Sprintf("%d task(s) still open. Cut scope or move the date — and say why.", open), "")
		}
		obstacles, err := s.store.ListObstacles(ctx, id)
		if err != nil {
			return nil, err
		}
		for _, o := range obstacles {
			if o.Status == "open" && o.TimerUntil != nil {
				add(fmt.Sprintf("stuck-%d", o.ID), *o.TimerUntil, "Still stuck? Time is up for this attempt",
					o.Title+" — try a different approach, or get outside help.", "/obstacles")
			}
		}
		for _, t := range tasks {
			if t.Status != "doing" || t.StartedAt == nil {
				continue
			}
			limit := time.Duration(p.StaleHours) * time.Hour
			if t.EstimateHours != nil {
				if twice := time.Duration(*t.EstimateHours * 2 * float64(time.Hour)); twice > limit {
					limit = twice
				}
			}
			add(fmt.Sprintf("stale-%d", t.ID), t.StartedAt.Add(limit), "In progress too long: "+t.Title,
				"Split it into something you can finish today, or cut it.", "/board")
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].At.Before(out[j].At) })
	return out, nil
}

// words says a duration the way a notification should: "1 hour", "15 minutes".
func words(d time.Duration) string {
	if d >= time.Hour && d%time.Hour == 0 {
		if h := int(d / time.Hour); h == 1 {
			return "1 hour"
		} else {
			return fmt.Sprintf("%d hours", h)
		}
	}
	return fmt.Sprintf("%d minutes", int(d.Round(time.Minute)/time.Minute))
}
