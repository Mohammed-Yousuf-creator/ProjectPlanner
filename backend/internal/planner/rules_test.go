package planner

import (
	"errors"
	"testing"
	"time"

	"projectplanner/internal/model"
)

var t0 = time.Date(2026, 3, 2, 9, 0, 0, 0, time.UTC)

func TestStandardDeadlineNeverExceedsTwoWeeks(t *testing.T) {
	for days := 1; days <= MaxPlanningDays; days++ {
		got, err := StandardDeadline(t0, days)
		if err != nil {
			t.Fatalf("%d days: unexpected error %v", days, err)
		}
		if got.Sub(t0) > 14*24*time.Hour {
			t.Fatalf("%d days: deadline %v is more than two weeks out", days, got)
		}
	}
	for _, days := range []int{0, -3, 15, 30, 365} {
		_, err := StandardDeadline(t0, days)
		var invalid *InvalidError
		if !errors.As(err, &invalid) {
			t.Fatalf("%d days: expected the request to be rejected, got %v", days, err)
		}
	}
}

func TestEverySizePresetFitsInTwoWeeks(t *testing.T) {
	for size, days := range PlanningDays {
		if days < 1 || days > MaxPlanningDays {
			t.Errorf("size %q plans for %d days", size, days)
		}
	}
	if PlanningDays["hard"] != MaxPlanningDays {
		t.Errorf("the hardest project should get the full %d days", MaxPlanningDays)
	}
}

func TestHackathonBudget(t *testing.T) {
	cases := []struct {
		name     string
		duration time.Duration
		def, max time.Duration
	}{
		{"1 hour sprint", time.Hour, 15 * time.Minute, 15 * time.Minute},
		{"24 hours", 24 * time.Hour, 144 * time.Minute, 6 * time.Hour},
		{"48 hours", 48 * time.Hour, 4 * time.Hour, 12 * time.Hour},
		{"month long", 30 * 24 * time.Hour, 4 * time.Hour, 180 * time.Hour},
		{"90 days", 90 * 24 * time.Hour, 4 * time.Hour, 14 * 24 * time.Hour},
	}
	for _, c := range cases {
		def, max := HackathonBudget(t0, t0.Add(c.duration))
		if def != c.def || max != c.max {
			t.Errorf("%s: got default %v max %v, want %v / %v", c.name, def, max, c.def, c.max)
		}
		// Asking for more than the maximum is cut down to the maximum.
		deadline := HackathonDeadline(t0, t0.Add(c.duration), 1000*time.Hour)
		if deadline.Sub(t0) != c.max {
			t.Errorf("%s: oversized budget gave %v, want %v", c.name, deadline.Sub(t0), c.max)
		}
	}
}

func TestScheduleIsOrdered(t *testing.T) {
	for _, dur := range []time.Duration{30 * time.Minute, time.Hour, 6 * time.Hour, 24 * time.Hour, 48 * time.Hour, 14 * 24 * time.Hour} {
		start, end := t0, t0.Add(dur)
		budget, _ := HackathonBudget(start, end)
		p := model.Project{Type: model.TypeHackathon, HackStart: &start, HackEnd: &end,
			DecidedAt: start, PlanningDeadline: HackathonDeadline(start, end, budget)}
		s := Schedule(p)
		if s == nil || len(s.Segments) != 4 {
			t.Fatalf("%v: expected 4 segments", dur)
		}
		prev := start
		for _, seg := range s.Segments {
			if !seg.Start.Equal(prev) || seg.End.Before(seg.Start) {
				t.Fatalf("%v: segment %s is out of order (%v → %v, previous end %v)", dur, seg.Key, seg.Start, seg.End, prev)
			}
			prev = seg.End
		}
		if !prev.Equal(end) {
			t.Fatalf("%v: schedule ends at %v, want %v", dur, prev, end)
		}
		if !s.SubmitFrom.Before(end) {
			t.Fatalf("%v: no time reserved for submitting", dur)
		}
	}
}

func TestStepsSpreadOverPlanningWindow(t *testing.T) {
	for _, typ := range []string{model.TypeStandard, model.TypeHackathon} {
		start, end := t0, t0.Add(48*time.Hour)
		p := model.Project{Type: typ, DecidedAt: t0, PlanningDeadline: t0.Add(7 * 24 * time.Hour), Steps: map[string]string{"goal": "done"}}
		if typ == model.TypeHackathon {
			p.HackStart, p.HackEnd = &start, &end
			p.PlanningDeadline = t0.Add(4 * time.Hour)
		}
		steps := ComputeSteps(p, planData{})
		if len(steps) != len(stepDefs) {
			t.Fatalf("%s: got %d steps", typ, len(steps))
		}
		if steps[0].Status != "done" || steps[1].Status != "todo" {
			t.Fatalf("%s: step status not carried over", typ)
		}
		prev := p.DecidedAt
		for _, s := range steps {
			if s.MoveOnBy.Before(prev) {
				t.Fatalf("%s: step %s is scheduled before the previous one", typ, s.Key)
			}
			prev = s.MoveOnBy
		}
		// The last step must end exactly when planning ends — the schedule never overruns.
		if !prev.Equal(p.PlanningDeadline) {
			t.Fatalf("%s: schedule ends %v, planning ends %v", typ, prev, p.PlanningDeadline)
		}
	}
}

func TestDebtSeedsOnlyForOpenEssentialSteps(t *testing.T) {
	p := model.Project{Type: model.TypeStandard, DecidedAt: t0, PlanningDeadline: t0.Add(24 * time.Hour),
		Steps: map[string]string{"goal": "done", "stories": "skipped"}}
	seeds := debtSeeds(ComputeSteps(p, planData{}))
	got := map[string]bool{}
	for _, s := range seeds {
		got[s.Origin] = true
		if s.Scope != "debt" {
			t.Errorf("%s has scope %q", s.Origin, s.Scope)
		}
	}
	want := map[string]bool{"debt:mvp": true, "debt:buildplan": true}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for k := range want {
		if !got[k] {
			t.Errorf("missing %s", k)
		}
	}
}

func TestBuildSeedsFollowTheBlueprint(t *testing.T) {
	p := model.Project{ID: 1, Type: model.TypeStandard, Complexity: "small", DecidedAt: t0, PlanningDeadline: t0.Add(72 * time.Hour)}
	stories := []model.Story{{ID: 10, Text: "Upload a file", Tier: "mvp"}, {ID: 11, Text: "Share a link", Tier: "later"}, {ID: 12, Text: "Dark mode", Tier: "cut"}}
	items := []model.PlanItem{
		{Kind: "entity", Data: []byte(`{"name":"User","fields":[{"name":"email"}]}`)},
		{Kind: "flow", Data: []byte(`{"name":"Export report","core":false}`)},
		{Kind: "flow", Data: []byte(`{"name":"Upload file","core":true,"controller":"POST /files"}`)},
	}
	ms, tasks := buildSeeds(p, stories, items, t0)
	if len(ms) != 5 {
		t.Fatalf("got %d milestones", len(ms))
	}
	for i := 1; i < len(ms); i++ {
		if ms[i].DueAt.Before(*ms[i-1].DueAt) {
			t.Fatalf("milestone %q is due before %q", ms[i].Title, ms[i-1].Title)
		}
	}
	var origins []string
	for _, task := range tasks {
		origins = append(origins, task.Origin)
	}
	want := []string{"skeleton", "data", "flow:upload-file", "flow:export-report", "story:10", "deploy"}
	if len(origins) != len(want) {
		t.Fatalf("got %v, want %v", origins, want)
	}
	for i := range want {
		if origins[i] != want[i] {
			t.Fatalf("got %v, want %v", origins, want)
		}
	}
}
