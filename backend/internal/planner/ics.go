package planner

import (
	"context"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"projectplanner/internal/model"
)

// ExportCalendar renders the deadlines of a project as an iCalendar file that any calendar
// application can import: end of planning, milestones, the ship date and, for a hackathon,
// the start, the feature freeze and the submission deadline.
func (s *Service) ExportCalendar(ctx context.Context, id int64) (name string, body string, err error) {
	b, err := s.Bundle(ctx, id)
	if err != nil {
		return "", "", err
	}
	return fileSlug(b.Project.Name) + "-deadlines.ics", renderCalendar(b), nil
}

type calEvent struct {
	uid         string
	summary     string
	description string
	at          time.Time // a moment; ignored when day is set
	day         string    // YYYY-MM-DD for an all-day event
	alarm       string    // e.g. "-PT1H"; empty for none
}

func renderCalendar(b *Bundle) string {
	p := b.Project
	var events []calEvent
	add := func(key, summary, description string, at time.Time, alarm string) {
		events = append(events, calEvent{uid: fmt.Sprintf("project-%d-%s@projectplanner", p.ID, key),
			summary: p.Name + ": " + summary, description: description, at: at, alarm: alarm})
	}

	if p.Phase == model.PhasePlan {
		add("planning-end", "planning ends — start coding",
			"Planning stops here, finished or not. Whatever is still open becomes a task on the board.", p.PlanningDeadline, "-PT1H")
	}
	if h := b.Hackathon; h != nil {
		add("hack-start", "hackathon starts", "", h.Start, "-PT30M")
		add("hack-freeze", "feature freeze", "No new features after this. Polish, fix and prepare the demo.", h.FreezeAt, "-PT30M")
		add("hack-submit", "start submitting", "Stop coding. Submit now, then improve the write-up if time is left.", h.SubmitFrom, "-PT10M")
		add("hack-end", "submission deadline", "", h.End, "-PT1H")
	}
	for _, m := range b.Milestones {
		if m.DueAt != nil {
			add(fmt.Sprintf("milestone-%d", m.ID), m.Title, "Milestone deadline.", *m.DueAt, "-PT2H")
		}
	}
	if p.TargetDate != nil && p.Phase != model.PhaseShipped {
		events = append(events, calEvent{uid: fmt.Sprintf("project-%d-ship@projectplanner", p.ID),
			summary: p.Name + ": ship the MVP", description: "The ship date set in the planner.", day: *p.TargetDate})
	}

	var w strings.Builder
	line := func(s string) { w.WriteString(foldLine(s) + "\r\n") }
	line("BEGIN:VCALENDAR")
	line("VERSION:2.0")
	line("PRODID:-//ProjectPlanner//Deadlines//EN")
	line("CALSCALE:GREGORIAN")
	line("METHOD:PUBLISH")
	line("X-WR-CALNAME:" + icsText(p.Name+" deadlines"))
	const stampFmt = "20060102T150405Z"
	for _, e := range events {
		var day time.Time
		if e.day != "" {
			var err error
			if day, err = time.Parse("2006-01-02", e.day); err != nil {
				continue // skip it whole: a half-written event would break the file
			}
		}
		line("BEGIN:VEVENT")
		line("UID:" + e.uid)
		line("DTSTAMP:" + b.Now.UTC().Format(stampFmt))
		if e.day != "" {
			line("DTSTART;VALUE=DATE:" + day.Format("20060102"))
			line("DTEND;VALUE=DATE:" + day.AddDate(0, 0, 1).Format("20060102"))
		} else {
			line("DTSTART:" + e.at.UTC().Format(stampFmt))
			line("DTEND:" + e.at.Add(15*time.Minute).UTC().Format(stampFmt))
		}
		line("SUMMARY:" + icsText(e.summary))
		if e.description != "" {
			line("DESCRIPTION:" + icsText(e.description))
		}
		line("TRANSP:TRANSPARENT")
		if e.alarm != "" {
			line("BEGIN:VALARM")
			line("ACTION:DISPLAY")
			line("DESCRIPTION:" + icsText(e.summary))
			line("TRIGGER:" + e.alarm)
			line("END:VALARM")
		}
		line("END:VEVENT")
	}
	line("END:VCALENDAR")
	return w.String()
}

// icsText escapes text for an iCalendar property value.
func icsText(s string) string {
	r := strings.NewReplacer(`\`, `\\`, ";", `\;`, ",", `\,`, "\r\n", `\n`, "\n", `\n`, "\r", "")
	return r.Replace(s)
}

// foldLine wraps a content line at 75 bytes, as the format requires, without splitting a
// character in two.
func foldLine(s string) string {
	const limit = 75
	if len(s) <= limit {
		return s
	}
	var w strings.Builder
	width := 0
	for len(s) > 0 {
		r, size := utf8.DecodeRuneInString(s)
		_ = r
		if width+size > limit {
			w.WriteString("\r\n ")
			width = 1
		}
		w.WriteString(s[:size])
		width += size
		s = s[size:]
	}
	return w.String()
}
