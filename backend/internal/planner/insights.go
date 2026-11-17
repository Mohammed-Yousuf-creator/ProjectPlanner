package planner

import (
	"context"
	"math"
	"strings"
	"time"
	"unicode/utf8"

	"projectplanner/internal/store"
)

// Search looks for text across every project.
func (s *Service) Search(ctx context.Context, q string) ([]store.SearchHit, error) {
	q = strings.TrimSpace(q)
	if utf8.RuneCountInString(q) < 2 {
		return []store.SearchHit{}, nil
	}
	if utf8.RuneCountInString(q) > 100 {
		return nil, invalid("That is a long thing to search for. Try a few words.")
	}
	hits, err := s.store.Search(ctx, q, 60)
	if err != nil {
		return nil, err
	}
	for i := range hits {
		hits[i].Snippet = snippet(hits[i].Snippet, q, 160)
		if hits[i].Kind == "answer" {
			if label := planKeyLabels[hits[i].Title]; label != "" {
				hits[i].Title = label
			}
		}
		if hits[i].Kind == "item" {
			if label := kindLabels[hits[i].Sub]; label != "" {
				hits[i].Sub = label
			}
		}
	}
	return hits, nil
}

// snippet cuts a window of about max characters out of text, centred on the first match of q.
func snippet(text, q string, max int) string {
	text = strings.Join(strings.Fields(text), " ")
	runes := []rune(text)
	if len(runes) <= max {
		return text
	}
	at := strings.Index(strings.ToLower(text), strings.ToLower(q))
	start := 0
	if at > 0 {
		start = utf8.RuneCountInString(text[:at]) - max/3
		if start < 0 {
			start = 0
		}
	}
	end := start + max
	if end > len(runes) {
		end = len(runes)
		start = end - max
	}
	out := string(runes[start:end])
	if start > 0 {
		out = "…" + out
	}
	if end < len(runes) {
		out += "…"
	}
	return out
}

// ActivityDay is one day of work across all projects.
type ActivityDay struct {
	Day       string  `json:"day"` // YYYY-MM-DD, local time
	Entries   int     `json:"entries"`
	Hours     float64 `json:"hours"`
	TasksDone int     `json:"tasks_done"`
}

type Activity struct {
	From string        `json:"from"`
	To   string        `json:"to"`
	Days []ActivityDay `json:"days"` // only days on which something happened
	// Multiplier is actual over estimated time across every finished task that has both, and
	// Tasks is how many tasks it is based on. 0 = not enough data.
	Multiplier float64 `json:"multiplier"`
	Tasks      int     `json:"tasks"`
}

// Activity returns the last year of journal entries, logged hours and finished tasks per day,
// plus the personal estimate multiplier.
func (s *Service) Activity(ctx context.Context) (Activity, error) {
	now := s.now().Local()
	from := now.AddDate(0, 0, -371)
	a := Activity{From: from.Format("2006-01-02"), To: now.Format("2006-01-02"), Days: []ActivityDay{}}
	logs, err := s.store.LogDays(ctx, a.From)
	if err != nil {
		return a, err
	}
	done, err := s.store.TaskDoneTimes(ctx, from)
	if err != nil {
		return a, err
	}
	byDay := map[string]*ActivityDay{}
	get := func(day string) *ActivityDay {
		if d, ok := byDay[day]; ok {
			return d
		}
		d := &ActivityDay{Day: day}
		byDay[day] = d
		return d
	}
	for _, l := range logs {
		d := get(l.Day)
		d.Entries, d.Hours = l.Entries, l.Hours
	}
	for _, t := range done {
		get(t.Local().Format("2006-01-02")).TasksDone++
	}
	for day := from; !day.After(now); day = day.AddDate(0, 0, 1) {
		if d, ok := byDay[day.Format("2006-01-02")]; ok {
			a.Days = append(a.Days, *d)
		}
	}
	if a.Multiplier, a.Tasks, err = s.multiplier(ctx); err != nil {
		return a, err
	}
	return a, nil
}

// multiplier is how much longer finished tasks took than estimated, across all projects.
// It needs at least three tasks before it says anything.
func (s *Service) multiplier(ctx context.Context) (float64, int, error) {
	estimated, spent, tasks, err := s.store.EstimateTotals(ctx)
	if err != nil || tasks < 3 || estimated <= 0 {
		return 0, tasks, err
	}
	return math.Round(spent/estimated*100) / 100, tasks, nil
}

// since is a small helper for "how long ago", used by the status report.
func since(now, t time.Time) time.Duration {
	if t.After(now) {
		return 0
	}
	return now.Sub(t)
}
