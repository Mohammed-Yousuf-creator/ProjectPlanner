package planner

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"projectplanner/internal/model"
)

// stepDef is one step of the planning template. The template merges the planning processes
// from the source material into a single pass that fits inside the planning window.
type stepDef struct {
	Key     string
	Title   string
	Tagline string
	// Share of the planning window, in percent, for normal projects and for hackathons.
	// A share of 0 means the step is optional for that project type.
	Share, HackShare int
	// Essential steps become "decide while building" tasks if they are not done in time.
	Essential, HackEssential bool
}

var stepDefs = []stepDef{
	{"goal", "Goal & why", "Why am I building this, who is it for, what makes it valuable?", 10, 15, true, true},
	{"research", "Feasibility & unknowns", "Is this even doable? What don't I know yet, and where do I go when stuck?", 10, 0, false, false},
	{"stories", "User stories", "Everything a user should be able to do — plain language, nothing technical.", 10, 15, true, true},
	{"mvp", "Ruthless MVP cut", "Do I absolutely need this for the app to function? If not, cut it.", 5, 20, true, true},
	{"data", "Data models", "What information is stored and how it relates. No database talk yet.", 10, 0, false, false},
	{"wireframe", "Ugly wireframes", "Boxes and arrows. Paper is cheap, code is expensive.", 10, 0, false, false},
	{"architecture", "Future & black boxes", "How long will this live, how is it packaged, and which modules is it made of?", 10, 0, false, false},
	{"stack", "Stack & build-vs-buy", "The simplest tools I can ship with — and what I build myself versus outsource.", 10, 20, false, true},
	{"flows", "Core logic & data flows", "The core functionality as one to three deep, separate data flows.", 15, 0, false, false},
	{"buildplan", "Milestones & micro-challenges", "Divide the work into small challenges with hard deadlines.", 10, 30, true, true},
}

type Check struct {
	Label string `json:"label"`
	OK    bool   `json:"ok"`
}

// Step is a planning step with its live state for one project.
type Step struct {
	Key       string    `json:"key"`
	Title     string    `json:"title"`
	Tagline   string    `json:"tagline"`
	Essential bool      `json:"essential"`
	Optional  bool      `json:"optional"`
	Status    string    `json:"status"` // todo | done | skipped
	MoveOnBy  time.Time `json:"move_on_by"`
	Checks    []Check   `json:"checks"`
}

func stepKeyValid(key string) bool {
	for _, d := range stepDefs {
		if d.Key == key {
			return true
		}
	}
	return false
}

// planData is everything the "good enough" checks look at.
type planData struct {
	Stories    []model.Story
	Items      []model.PlanItem
	Milestones []model.Milestone
	Tasks      []model.Task
	Files      []model.File
}

// ComputeSteps returns the planning steps of a project: their status, a suggested "move on by"
// time that spreads the steps over the planning window, and the good-enough checks.
// The checks are deliberately small — they describe "enough to start", not "perfect".
func ComputeSteps(p model.Project, d planData) []Step {
	hack := p.Type == model.TypeHackathon
	winStart, winEnd := PlanningWindow(p)
	window := winEnd.Sub(winStart)

	items := map[string][]map[string]any{}
	for _, it := range d.Items {
		var m map[string]any
		_ = json.Unmarshal(it.Data, &m)
		items[it.Kind] = append(items[it.Kind], m)
	}
	filled := func(key string) bool { return strings.TrimSpace(p.Plan[key]) != "" }

	tier := map[string]int{}
	for _, s := range d.Stories {
		tier[s.Tier]++
	}
	nStories := len(d.Stories)
	minStories := 5
	if hack {
		minStories = 3
	}

	checks := map[string][]Check{
		"goal": {
			{"Why I'm building it is written down", filled("why")},
			{"I know who it is for", filled("who")},
			{"I know what makes it valuable", filled("value")},
		},
		"research": {
			{"Every unknown I logged has an answer", countWhere(items["question"], "status", "open") == 0},
			{"I know where to look when I'm stuck", len(items["resource"]) > 0},
		},
		"stories": {
			{pluralCheck(minStories, "user story", "user stories") + " written", nStories >= minStories},
		},
		"mvp": {
			{"Every story is sorted: MVP, Later or Cut", nStories > 0 && tier["unsorted"] == 0},
			{"The MVP has at least one story", tier["mvp"] > 0},
			{"The MVP is at most half of the stories", nStories > 0 && tier["mvp"]*2 <= nStories},
		},
		"data": {
			{"At least one data model with its fields", countWith(items["entity"], "fields") > 0},
		},
		"wireframe": {
			{"A sketch or a written user flow exists", countFiles(d.Files, "wireframe") > 0 || filled("flow_notes")},
		},
		"architecture": {
			{"I decided how long this project will live", filled("horizon")},
			{"I know how it is packaged", filled("packaging")},
			{"At least two modules (black boxes) are named", len(items["module"]) >= 2},
		},
		"stack": {
			{"The stack is written down", len(items["stack"]) > 0},
			{"Every capability is decided: build, buy or skip", countWhere(items["capability"], "decision", "undecided") == 0},
			{"I know how this gets deployed", filled("deploy_path")},
		},
		"flows": {
			{"One to three core data flows are defined", between(countTrue(items["flow"], "core"), 1, 3)},
		},
		"buildplan": {
			{"At least three micro-challenges on the board", len(d.Tasks) >= 3},
			{"At least one milestone with a hard deadline", countMilestonesWithDeadline(d.Milestones) > 0},
		},
	}

	steps := make([]Step, 0, len(stepDefs))
	elapsed := 0
	for _, def := range stepDefs {
		share, essential := def.Share, def.Essential
		if hack {
			share, essential = def.HackShare, def.HackEssential
		}
		elapsed += share
		status := p.Steps[def.Key]
		if status != "done" && status != "skipped" {
			status = "todo"
		}
		steps = append(steps, Step{
			Key: def.Key, Title: def.Title, Tagline: def.Tagline,
			Essential: essential, Optional: share == 0,
			Status:   status,
			MoveOnBy: winStart.Add(window * time.Duration(elapsed) / 100),
			Checks:   checks[def.Key],
		})
	}
	return steps
}

func pluralCheck(n int, one, many string) string {
	if n == 1 {
		return "At least 1 " + one
	}
	return "At least " + strconv.Itoa(n) + " " + many
}

func between(n, lo, hi int) bool { return n >= lo && n <= hi }

func countWhere(items []map[string]any, key, value string) int {
	n := 0
	for _, it := range items {
		if s, _ := it[key].(string); s == value {
			n++
		}
	}
	return n
}

func countTrue(items []map[string]any, key string) int {
	n := 0
	for _, it := range items {
		if b, _ := it[key].(bool); b {
			n++
		}
	}
	return n
}

// countWith counts items whose key holds a non-empty list.
func countWith(items []map[string]any, key string) int {
	n := 0
	for _, it := range items {
		if list, _ := it[key].([]any); len(list) > 0 {
			n++
		}
	}
	return n
}

func countFiles(files []model.File, category string) int {
	n := 0
	for _, f := range files {
		if f.Category == category {
			n++
		}
	}
	return n
}

func countMilestonesWithDeadline(ms []model.Milestone) int {
	n := 0
	for _, m := range ms {
		if m.DueAt != nil {
			n++
		}
	}
	return n
}
