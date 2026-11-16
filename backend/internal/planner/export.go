package planner

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"projectplanner/internal/model"
)

// ExportMarkdown renders the blueprint as a PLAN.md you can drop into the project's repository.
func (s *Service) ExportMarkdown(ctx context.Context, id int64) (name string, body string, err error) {
	b, err := s.Bundle(ctx, id)
	if err != nil {
		return "", "", err
	}
	return "PLAN-" + fileSlug(b.Project.Name) + ".md", renderMarkdown(b), nil
}

func fileSlug(name string) string {
	out := slug(name, 0)
	if out == "n0" {
		return "project"
	}
	return out
}

func renderMarkdown(b *Bundle) string {
	p := b.Project
	var w strings.Builder
	line := func(format string, args ...any) { fmt.Fprintf(&w, format+"\n", args...) }
	text := func(title, key string) {
		if v := strings.TrimSpace(p.Plan[key]); v != "" {
			line("**%s**\n\n%s\n", title, v)
		}
	}
	stamp := func(t time.Time) string { return t.Local().Format("Mon 2 Jan 2006, 15:04") }

	items := map[string][]map[string]any{}
	for _, it := range b.Items {
		var m map[string]any
		_ = json.Unmarshal(it.Data, &m)
		items[it.Kind] = append(items[it.Kind], m)
	}
	str := func(m map[string]any, k string) string { v, _ := m[k].(string); return strings.TrimSpace(v) }

	line("# %s", p.Name)
	if p.Summary != "" {
		line("\n> %s", p.Summary)
	}
	line("")
	line("- Type: %s · Size: %s · Approach: %s", p.Type, p.Complexity, map[string]string{"diy": "build it myself", "fasttrack": "fast-track with external services"}[p.VendorMode])
	line("- Decided: %s", stamp(p.DecidedAt))
	line("- Coding starts no later than: %s", stamp(p.PlanningDeadline))
	if p.BuildStartedAt != nil {
		line("- Coding started: %s", stamp(*p.BuildStartedAt))
	}
	if p.HackStart != nil && p.HackEnd != nil {
		line("- Hackathon: %s → %s", stamp(*p.HackStart), stamp(*p.HackEnd))
	}
	if p.TargetDate != nil {
		line("- Target date: %s", *p.TargetDate)
	}

	line("\n## 1. Goal & why\n")
	text("Why am I building this?", "why")
	text("Who is it for?", "who")
	text("What makes it valuable?", "value")
	text("Outcome goals", "outcome_goals")
	text("Journey goals", "journey_goals")
	text("Time and effort I can realistically put in", "time_budget")
	text("My resolve", "resolve")
	if hc := items["criterion"]; len(hc) > 0 {
		line("**Judging criteria**\n")
		for _, c := range hc {
			line("- %s%s", str(c, "text"), paren(str(c, "weight")))
		}
		line("")
	}

	line("## 2. Feasibility & unknowns\n")
	text("Feasibility notes", "feasibility_notes")
	for _, q := range items["question"] {
		mark := " "
		if str(q, "status") == "answered" {
			mark = "x"
		}
		line("- [%s] %s", mark, str(q, "text"))
		if a := str(q, "answer"); a != "" {
			line("  - %s", strings.ReplaceAll(a, "\n", "\n    "))
		}
	}
	if rs := items["resource"]; len(rs) > 0 {
		line("\n**Where I look when I'm stuck**\n")
		for _, r := range rs {
			line("- %s%s%s", str(r, "title"), paren(str(r, "url")), dash(str(r, "note")))
		}
	}

	line("\n## 3. User stories & MVP\n")
	text("The MVP in one sentence", "mvp_statement")
	for _, tier := range []struct{ key, title string }{
		{"mvp", "MVP"}, {"later", "Later (expansion pack)"}, {"cut", "Cut"}, {"unsorted", "Not sorted yet"},
	} {
		var list []model.Story
		for _, st := range b.Stories {
			if st.Tier == tier.key {
				list = append(list, st)
			}
		}
		if len(list) == 0 {
			continue
		}
		line("**%s**\n", tier.title)
		for _, st := range list {
			line("- %s", st.Text)
		}
		line("")
	}

	line("## 4. Data models\n")
	for _, e := range items["entity"] {
		line("### %s\n", str(e, "name"))
		if fields, _ := e["fields"].([]any); len(fields) > 0 {
			line("| Field | Type | Notes |\n|---|---|---|")
			for _, f := range fields {
				fm, _ := f.(map[string]any)
				line("| %s | %s | %s |", cell(str(fm, "name")), cell(str(fm, "type")), cell(str(fm, "note")))
			}
			line("")
		}
		if r := str(e, "relations"); r != "" {
			line("Relationships: %s\n", r)
		}
	}
	text("Notes", "data_notes")

	line("## 5. Wireframes & user flow\n")
	text("User flow", "flow_notes")
	for _, f := range b.Files {
		if f.Category == "wireframe" {
			line("- Sketch: %s", f.Name)
		}
	}

	line("\n## 6. Future & architecture\n")
	text("How long will this live?", "horizon")
	text("How is it packaged?", "packaging")
	text("Architecture notes", "architecture_notes")
	for _, m := range items["module"] {
		line("### Module: %s\n", str(m, "name"))
		kv(&w, "Responsibility", str(m, "responsibility"))
		kv(&w, "Interface (what others may call)", str(m, "interface"))
		kv(&w, "Files", str(m, "files"))
		line("")
	}

	line("## 7. Stack & build-vs-buy\n")
	if st := items["stack"]; len(st) > 0 {
		line("| Layer | Choice | Why | Familiarity |\n|---|---|---|---|")
		for _, c := range st {
			line("| %s | %s | %s | %s |", cell(str(c, "layer")), cell(str(c, "choice")), cell(str(c, "why")), cell(str(c, "familiarity")))
		}
		line("")
	}
	if caps := items["capability"]; len(caps) > 0 {
		line("| Capability | Decision | Service | Notes |\n|---|---|---|---|")
		labels := map[string]string{"build": "build it myself", "buy": "external service", "skip": "not needed", "undecided": "undecided"}
		for _, c := range caps {
			line("| %s | %s | %s | %s |", cell(str(c, "name")), labels[str(c, "decision")], cell(str(c, "service")), cell(str(c, "notes")))
		}
		line("")
	}
	text("Deployment path", "deploy_path")

	line("## 8. Core logic & data flows\n")
	text("Core logic", "core_algorithm")
	for _, f := range items["flow"] {
		core := ""
		if c, _ := f["core"].(bool); c {
			core = " (core)"
		}
		line("### Flow: %s%s\n", str(f, "name"), core)
		kv(&w, "Trigger", str(f, "trigger"))
		kv(&w, "Entry point", str(f, "controller"))
		kv(&w, "Logic", str(f, "logic"))
		kv(&w, "Data access", str(f, "data"))
		line("")
	}

	line("## 9. Milestones & micro-challenges\n")
	byMilestone := map[int64][]model.Task{}
	var loose []model.Task
	for _, t := range b.Tasks {
		if t.MilestoneID != nil {
			byMilestone[*t.MilestoneID] = append(byMilestone[*t.MilestoneID], t)
		} else {
			loose = append(loose, t)
		}
	}
	writeTasks := func(tasks []model.Task) {
		for _, t := range tasks {
			mark := " "
			if t.Status == "done" {
				mark = "x"
			}
			line("- [%s] %s", mark, t.Title)
			for _, c := range t.Checklist {
				sub := " "
				if c.Done {
					sub = "x"
				}
				line("  - [%s] %s", sub, c.Text)
			}
		}
	}
	for _, m := range b.Milestones {
		due := ""
		if m.DueAt != nil {
			due = " — due " + stamp(*m.DueAt)
		}
		line("### %s%s\n", m.Title, due)
		writeTasks(byMilestone[m.ID])
		line("")
	}
	if len(loose) > 0 {
		line("### No milestone\n")
		writeTasks(loose)
		line("")
	}
	return w.String()
}

func kv(w *strings.Builder, key, value string) {
	if value != "" {
		fmt.Fprintf(w, "- **%s:** %s\n", key, strings.ReplaceAll(value, "\n", "\n  "))
	}
}

func paren(s string) string {
	if s == "" {
		return ""
	}
	return " (" + s + ")"
}

func dash(s string) string {
	if s == "" {
		return ""
	}
	return " — " + s
}

// cell makes text safe inside a Markdown table cell.
func cell(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, "|", "\\|"), "\n", " ")
}
