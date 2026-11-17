package planner

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"projectplanner/internal/model"
	"projectplanner/internal/store"
)

// planSnapshot is the part of a project that makes up "the plan": what was decided before the
// first line of code. It is frozen when coding starts so later edits can be told apart from it.
type planSnapshot struct {
	Plan       map[string]string `json:"plan"`
	Steps      map[string]string `json:"steps"`
	TargetDate *string           `json:"target_date"`
	Stories    []model.Story     `json:"stories"`
	Items      []model.PlanItem  `json:"items"`
	Milestones []model.Milestone `json:"milestones"`
}

func takeSnapshot(p model.Project, stories []model.Story, items []model.PlanItem, milestones []model.Milestone) planSnapshot {
	return planSnapshot{Plan: p.Plan, Steps: p.Steps, TargetDate: p.TargetDate, Stories: stories, Items: items, Milestones: milestones}
}

// PlanChange is one difference between the frozen plan and the plan as it is now.
type PlanChange struct {
	Area   string `json:"area"`   // answers | stories | lists | milestones
	Kind   string `json:"kind"`   // added | removed | changed
	Label  string `json:"label"`  // what it is, in words
	Before string `json:"before"` // empty for "added"
	After  string `json:"after"`  // empty for "removed"
}

type SnapshotView struct {
	Exists  bool         `json:"exists"`
	TakenAt *time.Time   `json:"taken_at"`
	Changes []PlanChange `json:"changes"`
	Plan    planSnapshot `json:"plan"`
}

// Snapshot returns the plan as it was frozen when coding started, and what changed since.
func (s *Service) Snapshot(ctx context.Context, id int64) (SnapshotView, error) {
	view := SnapshotView{Changes: []PlanChange{}}
	p, err := s.store.GetProject(ctx, id)
	if err != nil {
		return view, err
	}
	sn, err := s.store.GetSnapshot(ctx, id)
	if errors.Is(err, store.ErrNotFound) {
		return view, nil
	}
	if err != nil {
		return view, err
	}
	var old planSnapshot
	if err := json.Unmarshal(sn.Data, &old); err != nil {
		return view, err
	}
	stories, err := s.store.ListStories(ctx, id)
	if err != nil {
		return view, err
	}
	items, err := s.store.ListItems(ctx, id)
	if err != nil {
		return view, err
	}
	milestones, err := s.store.ListMilestones(ctx, id)
	if err != nil {
		return view, err
	}
	view.Exists, view.TakenAt, view.Plan = true, &sn.TakenAt, old
	view.Changes = diffPlan(old, takeSnapshot(p, stories, items, milestones))
	return view, nil
}

// planKeyLabels names the blueprint answers in the words the interface uses.
var planKeyLabels = map[string]string{
	"why": "Why I'm building it", "who": "Who it is for", "value": "What makes it valuable",
	"outcome_goals": "Outcome goals", "journey_goals": "Journey goals", "time_budget": "Time and effort",
	"resolve": "My resolve", "feasibility_notes": "Feasibility notes", "mvp_statement": "The MVP in one sentence",
	"flow_notes": "User flow", "horizon": "How long it will live", "packaging": "Packaging",
	"deploy_path": "Deployment", "core_logic": "Core logic", "pitch": "Pitch", "demo_script": "Demo script",
	"cut_order": "Cut order notes", "judging_angle": "How it scores", "submission_url": "Where to submit",
	"rules_url": "Rules page",
}

// kindLabels names the blueprint lists.
var kindLabels = map[string]string{
	"question": "Unknown", "resource": "Resource", "entity": "Data model", "module": "Module",
	"stack": "Stack choice", "capability": "Capability", "flow": "Data flow", "criterion": "Judging criterion",
	"decision": "Decision", "notdoing": "Not doing",
}

func diffPlan(old, cur planSnapshot) []PlanChange {
	changes := []PlanChange{}
	add := func(area, kind, label, before, after string) {
		changes = append(changes, PlanChange{Area: area, Kind: kind, Label: label, Before: before, After: after})
	}

	// Free-text answers. Retrospective and rehearsal notes are written after the fact by design.
	keys := map[string]bool{}
	for k := range old.Plan {
		keys[k] = true
	}
	for k := range cur.Plan {
		keys[k] = true
	}
	sorted := make([]string, 0, len(keys))
	for k := range keys {
		if strings.HasPrefix(k, "retro_") || strings.HasPrefix(k, "pitch_") {
			continue
		}
		sorted = append(sorted, k)
	}
	sort.Strings(sorted)
	for _, k := range sorted {
		before, after := strings.TrimSpace(old.Plan[k]), strings.TrimSpace(cur.Plan[k])
		label := planKeyLabels[k]
		if label == "" {
			label = k
		}
		switch {
		case before == after:
		case before == "":
			add("answers", "added", label, "", after)
		case after == "":
			add("answers", "removed", label, before, "")
		default:
			add("answers", "changed", label, before, after)
		}
	}
	if before, after := deref(old.TargetDate), deref(cur.TargetDate); before != after {
		add("milestones", changeKind(before, after), "Ship date", before, after)
	}

	// Stories: by id.
	oldStories := map[int64]model.Story{}
	for _, st := range old.Stories {
		oldStories[st.ID] = st
	}
	seen := map[int64]bool{}
	for _, st := range cur.Stories {
		seen[st.ID] = true
		was, existed := oldStories[st.ID]
		switch {
		case !existed:
			add("stories", "added", "Story ("+tierName(st.Tier)+")", "", st.Text)
		case was.Tier != st.Tier:
			add("stories", "changed", "Story: "+st.Text, tierName(was.Tier), tierName(st.Tier))
		case was.Text != st.Text:
			add("stories", "changed", "Story reworded", was.Text, st.Text)
		}
	}
	for _, st := range old.Stories {
		if !seen[st.ID] {
			add("stories", "removed", "Story ("+tierName(st.Tier)+")", st.Text, "")
		}
	}

	// Blueprint lists: by id. Checklists that are meant to be ticked off while building are left out.
	skip := map[string]bool{"submission": true, "break": true}
	oldItems := map[int64]model.PlanItem{}
	for _, it := range old.Items {
		oldItems[it.ID] = it
	}
	seenItem := map[int64]bool{}
	for _, it := range cur.Items {
		if skip[it.Kind] {
			continue
		}
		seenItem[it.ID] = true
		label := kindLabels[it.Kind]
		if label == "" {
			label = it.Kind
		}
		was, existed := oldItems[it.ID]
		if !existed {
			add("lists", "added", label, "", itemText(it))
			continue
		}
		if before, after := itemText(was), itemText(it); before != after {
			add("lists", "changed", label, before, after)
		}
	}
	for _, it := range old.Items {
		if !skip[it.Kind] && !seenItem[it.ID] {
			label := kindLabels[it.Kind]
			if label == "" {
				label = it.Kind
			}
			add("lists", "removed", label, itemText(it), "")
		}
	}

	// Milestones that existed at lock: renamed, moved or removed. Milestones generated when
	// coding started are part of the start, not a change to the plan.
	curMs := map[int64]model.Milestone{}
	for _, m := range cur.Milestones {
		curMs[m.ID] = m
	}
	for _, m := range old.Milestones {
		now, exists := curMs[m.ID]
		switch {
		case !exists:
			add("milestones", "removed", "Milestone", m.Title, "")
		case stampOf(m.DueAt) != stampOf(now.DueAt):
			add("milestones", "changed", "Milestone date: "+now.Title, stampOf(m.DueAt), stampOf(now.DueAt))
		case m.Title != now.Title:
			add("milestones", "changed", "Milestone renamed", m.Title, now.Title)
		}
	}
	return changes
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func changeKind(before, after string) string {
	switch {
	case before == "":
		return "added"
	case after == "":
		return "removed"
	}
	return "changed"
}

func stampOf(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

func tierName(tier string) string {
	switch tier {
	case "mvp":
		return "MVP"
	case "later":
		return "Later"
	case "cut":
		return "Cut"
	}
	return "Not sorted"
}

// itemText flattens a blueprint list entry into one readable line, in a stable order.
func itemText(it model.PlanItem) string {
	var m map[string]any
	if json.Unmarshal(it.Data, &m) != nil {
		return string(it.Data)
	}
	order := []string{"name", "title", "text", "layer", "choice", "decision", "service", "status", "answer", "why",
		"responsibility", "interface", "files", "relations", "trigger", "controller", "logic", "data", "url", "note", "notes", "weight", "familiarity"}
	var parts []string
	used := map[string]bool{}
	for _, k := range order {
		used[k] = true
		if s, ok := m[k].(string); ok && strings.TrimSpace(s) != "" {
			parts = append(parts, strings.TrimSpace(s))
		}
	}
	if fields, ok := m["fields"].([]any); ok && len(fields) > 0 {
		var names []string
		for _, f := range fields {
			if fm, ok := f.(map[string]any); ok {
				name, _ := fm["name"].(string)
				typ, _ := fm["type"].(string)
				names = append(names, strings.TrimSpace(name+" "+typ))
			}
		}
		parts = append(parts, "fields: "+strings.Join(names, ", "))
	}
	if core, ok := m["core"].(bool); ok && core {
		parts = append(parts, "core")
	}
	if len(parts) == 0 {
		return fmt.Sprintf("(empty %s)", it.Kind)
	}
	return strings.Join(parts, " · ")
}
