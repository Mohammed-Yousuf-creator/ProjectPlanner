package planner

import (
	"strings"
	"testing"
	"time"

	"projectplanner/internal/model"
)

func TestScopeBudget(t *testing.T) {
	for size, want := range map[string]int{"tiny": 3, "small": 5, "medium": 8, "hard": 12} {
		if got := ScopeBudget(model.Project{Type: model.TypeStandard, Complexity: size}); got != want {
			t.Errorf("budget for a %s project = %d, want %d", size, got, want)
		}
	}
	start := time.Date(2026, 1, 1, 9, 0, 0, 0, time.UTC)
	short, long := start.Add(6*time.Hour), start.Add(72*time.Hour)
	a := ScopeBudget(model.Project{Type: model.TypeHackathon, Complexity: "hard", HackStart: &start, HackEnd: &short})
	b := ScopeBudget(model.Project{Type: model.TypeHackathon, Complexity: "hard", HackStart: &start, HackEnd: &long})
	if a >= b || a < 1 || b > 6 {
		t.Errorf("hackathon budgets: 6 h = %d, 72 h = %d; want a small number that grows with the event", a, b)
	}
}

func TestCutOrder(t *testing.T) {
	rank := func(n int) *int { return &n }
	stories := []model.Story{
		{ID: 1, Tier: "mvp", Position: 1},
		{ID: 2, Tier: "mvp", Position: 2, CutRank: rank(1)},
		{ID: 3, Tier: "later", Position: 3, CutRank: rank(0)},
		{ID: 4, Tier: "mvp", Position: 4},
		{ID: 5, Tier: "mvp", Position: 5, CutRank: rank(0)},
	}
	var got []int64
	for _, st := range CutOrder(stories) {
		got = append(got, st.ID)
	}
	// Ranked first (5, then 2), then unranked from the bottom of the list up (4, then 1).
	want := []int64{5, 2, 4, 1}
	if len(got) != len(want) {
		t.Fatalf("cut order = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("cut order = %v, want %v", got, want)
		}
	}
}

func TestOffTimeCountsOverlapOnce(t *testing.T) {
	t0 := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	h := func(n int) time.Time { return t0.Add(time.Duration(n) * time.Hour) }
	breaks := []Break{{Start: h(-2), End: h(1)}, {Start: h(4), End: h(8)}, {Start: h(6), End: h(9)}, {Start: h(23), End: h(30)}}
	if got := offTime(breaks, h(0), h(24)); got != (1+5+1)*time.Hour {
		t.Errorf("off time = %v, want 7h", got)
	}
}

func TestFoldLine(t *testing.T) {
	long := "SUMMARY:" + strings.Repeat("é", 100)
	folded := foldLine(long)
	for _, l := range strings.Split(folded, "\r\n") {
		if len(l) > 75 {
			t.Errorf("folded line has %d bytes", len(l))
		}
	}
	if strings.ReplaceAll(folded, "\r\n ", "") != long {
		t.Error("unfolding does not give the original line back")
	}
	if icsText("a,b;c\\d\ne") != `a\,b\;c\\d\ne` {
		t.Errorf("icsText = %q", icsText("a,b;c\\d\ne"))
	}
}

func TestSpan(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	for _, c := range []struct {
		d    time.Duration
		want string
		late bool
	}{
		{76 * time.Hour, "3d 4h", false}, {130 * time.Minute, "2h 10m", false}, {45 * time.Minute, "45m", false},
		{-90 * time.Minute, "1h 30m", true},
	} {
		got, late := span(now, now.Add(c.d))
		if got != c.want || late != c.late {
			t.Errorf("span(%v) = %q, %v; want %q, %v", c.d, got, late, c.want, c.late)
		}
	}
}
