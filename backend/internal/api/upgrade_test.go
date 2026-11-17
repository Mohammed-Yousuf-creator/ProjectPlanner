package api_test

// Tests for the honesty rules, daily rhythm, repository links and cross-project features.

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"projectplanner/internal/backup"
	"projectplanner/internal/database"
)

// full is a project bundle decoded loosely, for tests that look at many different parts.
type full struct {
	Project struct {
		ID                 int64      `json:"id"`
		Phase              string     `json:"phase"`
		Kit                string     `json:"kit"`
		Archived           bool       `json:"archived"`
		BuildAckAt         *time.Time `json:"build_ack_at"`
		TargetDate         *string    `json:"target_date"`
		OriginalTargetDate *string    `json:"original_target_date"`
		StaleHours         int        `json:"stale_hours"`
		RepoPath           string     `json:"repo_path"`
		Name               string     `json:"name"`
	} `json:"project"`
	Stories []struct {
		ID      int64  `json:"id"`
		Text    string `json:"text"`
		Tier    string `json:"tier"`
		CutRank *int   `json:"cut_rank"`
	} `json:"stories"`
	Items []struct {
		ID   int64          `json:"id"`
		Kind string         `json:"kind"`
		Data map[string]any `json:"data"`
	} `json:"items"`
	Milestones []struct {
		ID            int64      `json:"id"`
		Title         string     `json:"title"`
		DueAt         *time.Time `json:"due_at"`
		OriginalDueAt *time.Time `json:"original_due_at"`
	} `json:"milestones"`
	Tasks []struct {
		ID            int64    `json:"id"`
		Title         string   `json:"title"`
		Status        string   `json:"status"`
		Scope         string   `json:"scope"`
		Origin        string   `json:"origin"`
		StoryID       *int64   `json:"story_id"`
		MilestoneID   *int64   `json:"milestone_id"`
		EstimateHours *float64 `json:"estimate_hours"`
		SpentMinutes  int      `json:"spent_minutes"`
		ClosedCommit  string   `json:"closed_commit"`
	} `json:"tasks"`
	Obstacles []struct {
		ID         int64      `json:"id"`
		Attempts   int        `json:"attempts"`
		Approaches string     `json:"approaches"`
		TimerUntil *time.Time `json:"timer_until"`
		NeedsHelp  bool       `json:"needs_help"`
	} `json:"obstacles"`
	Events []struct {
		Kind string         `json:"kind"`
		Data map[string]any `json:"data"`
	} `json:"events"`
	Picks []struct {
		Day    string `json:"day"`
		TaskID *int64 `json:"task_id"`
		Title  string `json:"title"`
	} `json:"picks"`
	Files []struct {
		ID   int64  `json:"id"`
		Name string `json:"name"`
	} `json:"files"`
	Limits struct {
		ScopeBudget  int `json:"scope_budget"`
		StuckMinutes int `json:"stuck_minutes"`
	} `json:"limits"`
	Slips []struct {
		MilestoneID int64  `json:"milestone_id"`
		Title       string `json:"title"`
	} `json:"slips"`
	CutNext *struct {
		StoryID   int64 `json:"story_id"`
		OpenTasks int   `json:"open_tasks"`
	} `json:"cut_next"`
	HasSnapshot bool `json:"has_snapshot"`
	Hackathon   *struct {
		WorkMinutes      int `json:"work_minutes"`
		BuildWorkMinutes int `json:"build_work_minutes"`
		Breaks           []struct {
			Label string `json:"label"`
		} `json:"breaks"`
	} `json:"hackathon"`
	Retro *struct {
		TasksDone    int     `json:"tasks_done"`
		DateMoves    int     `json:"date_moves"`
		ScopeAdded   int     `json:"scope_added"`
		DaysVsTarget *int    `json:"days_vs_target"`
		Multiplier   float64 `json:"multiplier"`
		Obstacles    []struct {
			Title string `json:"title"`
		} `json:"obstacles"`
	} `json:"retro"`
	PlanSync *struct {
		Path  string `json:"path"`
		Error string `json:"error"`
	} `json:"plan_sync"`
}

func (e *env) full(id int64) full {
	e.t.Helper()
	var b full
	e.call("GET", "/api/projects/"+itoa(id), nil, http.StatusOK, &b)
	return b
}

func (e *env) raw(method, path string, body io.Reader, contentType string) (int, []byte, http.Header) {
	e.t.Helper()
	req, _ := http.NewRequest(method, e.srv.URL+path, body)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(res.Body)
	return res.StatusCode, data, res.Header
}

func (e *env) story(project int64, text, tier string, want int) int64 {
	e.t.Helper()
	var st struct {
		ID int64 `json:"id"`
	}
	e.call("POST", "/api/projects/"+itoa(project)+"/stories", map[string]any{"text": text, "tier": tier}, want, &st)
	return st.ID
}

func (e *env) count(b full, kind string) int {
	n := 0
	for _, ev := range b.Events {
		if ev.Kind == kind {
			n++
		}
	}
	return n
}

func TestScopeBudget(t *testing.T) {
	e := setup(t)
	id := e.createProject(map[string]any{"name": "Budget", "complexity": "tiny"})
	b := e.full(id)
	if b.Limits.ScopeBudget != 3 {
		t.Fatalf("tiny project budget = %d, want 3", b.Limits.ScopeBudget)
	}
	var ids []int64
	for _, s := range []string{"one", "two", "three"} {
		ids = append(ids, e.story(id, "As a user I can "+s, "mvp", http.StatusCreated))
	}
	// The fourth MVP story is refused, both as a new story and as a move into the MVP.
	e.story(id, "As a user I can four", "mvp", http.StatusUnprocessableEntity)
	later := e.story(id, "As a user I can four", "later", http.StatusCreated)
	e.call("PATCH", "/api/stories/"+itoa(later), map[string]any{"tier": "mvp"}, http.StatusUnprocessableEntity, nil)
	// Parking one makes room.
	e.call("PATCH", "/api/stories/"+itoa(ids[0]), map[string]any{"tier": "later"}, http.StatusOK, nil)
	e.call("PATCH", "/api/stories/"+itoa(later), map[string]any{"tier": "mvp"}, http.StatusOK, nil)
	// Editing an MVP story in place is always allowed.
	e.call("PATCH", "/api/stories/"+itoa(ids[1]), map[string]any{"text": "As a user I can two, reworded"}, http.StatusOK, nil)
}

func TestScopeCreepSnapshotAndCut(t *testing.T) {
	e := setup(t)
	id := e.createProject(map[string]any{"name": "Creep", "complexity": "small", "target_date": e.now.AddDate(0, 0, 30).Format("2006-01-02")})
	a := e.story(id, "As a user I can add a recipe", "mvp", http.StatusCreated)
	bID := e.story(id, "As a user I can search recipes", "mvp", http.StatusCreated)
	e.call("PUT", "/api/projects/"+itoa(id)+"/plan", map[string]string{"why": "Because I cook."}, http.StatusNoContent, nil)
	e.call("POST", "/api/projects/"+itoa(id)+"/items", map[string]any{"kind": "notdoing", "data": map[string]any{"text": "User accounts"}}, http.StatusCreated, nil)

	// Work added while planning is not creep.
	e.call("POST", "/api/projects/"+itoa(id)+"/tasks", map[string]any{"title": "Planned early"}, http.StatusCreated, nil)
	// Cut order: search goes first.
	e.call("PUT", "/api/projects/"+itoa(id)+"/cut-order", map[string]any{"story_ids": []int64{bID, a}}, http.StatusNoContent, nil)
	e.call("PUT", "/api/projects/"+itoa(id)+"/cut-order", map[string]any{"story_ids": []int64{bID, bID}}, http.StatusUnprocessableEntity, nil)
	e.call("POST", "/api/projects/"+itoa(id)+"/cut", map[string]any{"story_id": bID}, http.StatusUnprocessableEntity, nil) // still planning

	e.call("POST", "/api/projects/"+itoa(id)+"/start-build", nil, http.StatusNoContent, nil)
	b := e.full(id)
	if !b.HasSnapshot || len(b.Events) != 0 {
		t.Fatalf("after start: snapshot=%v events=%d, want snapshot and no events", b.HasSnapshot, len(b.Events))
	}
	if b.Project.OriginalTargetDate == nil || *b.Project.OriginalTargetDate != *b.Project.TargetDate {
		t.Fatalf("original target date not recorded: %+v", b.Project)
	}

	// Scope changes after the start are counted.
	var added struct {
		ID int64 `json:"id"`
	}
	e.call("POST", "/api/projects/"+itoa(id)+"/tasks", map[string]any{"title": "Dark mode"}, http.StatusCreated, &added)
	e.call("PATCH", "/api/tasks/"+itoa(added.ID), map[string]any{"scope": "dlc"}, http.StatusOK, nil)
	e.call("POST", "/api/projects/"+itoa(id)+"/tasks", map[string]any{"title": "Oops, forgot this"}, http.StatusCreated, &added)
	e.call("DELETE", "/api/tasks/"+itoa(added.ID), nil, http.StatusNoContent, nil)
	b = e.full(id)
	if e.count(b, "scope_add") != 2 || e.count(b, "scope_park") != 1 || e.count(b, "scope_cut") != 1 {
		t.Fatalf("scope events add=%d park=%d cut=%d, want 2/1/1", e.count(b, "scope_add"), e.count(b, "scope_park"), e.count(b, "scope_cut"))
	}

	// The cut order names the search story; cutting it parks its open tasks in one step.
	if b.CutNext == nil || b.CutNext.StoryID != bID || b.CutNext.OpenTasks == 0 {
		t.Fatalf("cut_next = %+v, want story %d with open tasks", b.CutNext, bID)
	}
	e.call("POST", "/api/projects/"+itoa(id)+"/cut", map[string]any{"story_id": bID}, http.StatusNoContent, nil)
	b = e.full(id)
	for _, st := range b.Stories {
		if st.ID == bID && st.Tier != "later" {
			t.Fatalf("cut story tier = %s, want later", st.Tier)
		}
	}
	for _, task := range b.Tasks {
		if task.StoryID != nil && *task.StoryID == bID && task.Scope != "dlc" {
			t.Fatalf("task %q of the cut story is still in the MVP", task.Title)
		}
	}
	if b.CutNext == nil || b.CutNext.StoryID != a {
		t.Fatalf("next cut candidate = %+v, want story %d", b.CutNext, a)
	}

	// Moving the ship date now needs a reason, and is counted.
	later := e.now.AddDate(0, 0, 40).Format("2006-01-02")
	e.call("PATCH", "/api/projects/"+itoa(id), map[string]any{"target_date": later}, http.StatusUnprocessableEntity, nil)
	e.call("PATCH", "/api/projects/"+itoa(id), map[string]any{"target_date": later, "reason": "Search took a week longer"}, http.StatusOK, nil)
	// So does moving a milestone.
	var ms int64
	for _, m := range b.Milestones {
		if m.DueAt != nil {
			ms = m.ID
			break
		}
	}
	if ms == 0 {
		t.Fatal("no generated milestone has a deadline")
	}
	due := e.now.AddDate(0, 0, 20).Format(time.RFC3339)
	e.call("PATCH", "/api/milestones/"+itoa(ms), map[string]any{"due_at": due}, http.StatusUnprocessableEntity, nil)
	e.call("PATCH", "/api/milestones/"+itoa(ms), map[string]any{"due_at": due, "reason": "Depends on search"}, http.StatusOK, nil)
	e.call("PATCH", "/api/milestones/"+itoa(ms), map[string]any{"title": "Renamed only"}, http.StatusOK, nil) // no date change, no reason
	b = e.full(id)
	if e.count(b, "date_move") != 2 {
		t.Fatalf("date moves = %d, want 2", e.count(b, "date_move"))
	}
	if b.Project.OriginalTargetDate == nil || *b.Project.OriginalTargetDate == later {
		t.Fatalf("the first ship date was overwritten: %v", b.Project.OriginalTargetDate)
	}

	// The frozen plan shows what changed since the lock.
	e.call("PUT", "/api/projects/"+itoa(id)+"/plan", map[string]string{"why": "Because I cook a lot."}, http.StatusNoContent, nil)
	var snap struct {
		Exists  bool `json:"exists"`
		Changes []struct {
			Area, Kind, Label, Before, After string
		} `json:"changes"`
	}
	e.call("GET", "/api/projects/"+itoa(id)+"/snapshot", nil, http.StatusOK, &snap)
	if !snap.Exists {
		t.Fatal("no snapshot")
	}
	found := map[string]bool{}
	for _, c := range snap.Changes {
		found[c.Area+"/"+c.Kind] = true
	}
	for _, want := range []string{"answers/changed", "stories/changed", "milestones/changed"} {
		if !found[want] {
			t.Errorf("snapshot diff lacks %s: %+v", want, snap.Changes)
		}
	}

	// The export mentions the not-doing list, task numbers and the moves.
	_, md, _ := e.raw("GET", "/api/projects/"+itoa(id)+"/export.md", nil, "")
	for _, want := range []string{"Not doing", "User accounts", "Search took a week longer", "Changes since coding started"} {
		if !strings.Contains(string(md), want) {
			t.Errorf("export lacks %q", want)
		}
	}
}

func TestDailyRhythm(t *testing.T) {
	e := setup(t)
	id := e.createProject(map[string]any{"name": "Rhythm"})
	e.story(id, "As a user I can do the thing", "mvp", http.StatusCreated)

	// An unknown gets a time box; pushing it to "learn while building" settles the step,
	// and it comes back as a task when coding starts.
	var q struct {
		ID   int64          `json:"id"`
		Data map[string]any `json:"data"`
	}
	e.call("POST", "/api/projects/"+itoa(id)+"/items", map[string]any{"kind": "question", "data": map[string]any{"text": "Can the API paginate?", "status": "open"}}, http.StatusCreated, &q)
	box, err := time.Parse(time.RFC3339, q.Data["box_until"].(string))
	if err != nil || !box.After(e.now) {
		t.Fatalf("question has no time box: %v", q.Data)
	}
	e.call("PATCH", "/api/items/"+itoa(q.ID), map[string]any{"data": map[string]any{"text": "Can the API paginate?", "status": "learn"}}, http.StatusOK, nil)

	e.call("POST", "/api/projects/"+itoa(id)+"/start-build", nil, http.StatusNoContent, nil)
	b := e.full(id)
	if b.Project.BuildAckAt != nil {
		t.Fatal("pencils-down screen marked as seen before it was shown")
	}
	e.call("POST", "/api/projects/"+itoa(id)+"/ack-build", nil, http.StatusNoContent, nil)
	learn := false
	var open []int64
	for _, task := range b.Tasks {
		if strings.HasPrefix(task.Origin, "learn:") {
			learn = true
		}
		if task.Status != "done" {
			open = append(open, task.ID)
		}
	}
	if !learn {
		t.Fatal("the unanswered question did not become a task")
	}
	if len(open) < 4 {
		t.Fatalf("need 4 open tasks for this test, have %d", len(open))
	}

	// Today's three: at most three.
	day := e.now.Format("2006-01-02")
	e.call("PUT", "/api/projects/"+itoa(id)+"/picks/"+day, map[string]any{"task_ids": open[:4]}, http.StatusUnprocessableEntity, nil)
	e.call("PUT", "/api/projects/"+itoa(id)+"/picks/"+day, map[string]any{"task_ids": open[:3]}, http.StatusNoContent, nil)
	e.call("PUT", "/api/projects/"+itoa(id)+"/picks/"+day, map[string]any{"task_ids": open[:2]}, http.StatusNoContent, nil)
	b = e.full(id)
	if len(b.Picks) != 2 || b.Project.BuildAckAt == nil {
		t.Fatalf("picks = %d (want 2), ack = %v", len(b.Picks), b.Project.BuildAckAt)
	}

	// Estimates and time spent.
	e.call("PATCH", "/api/tasks/"+itoa(open[0]), map[string]any{"estimate_hours": 2, "spent_minutes": 180, "status": "done"}, http.StatusOK, nil)
	e.call("PATCH", "/api/tasks/"+itoa(open[0]), map[string]any{"title": "Renamed"}, http.StatusOK, nil)
	e.call("PATCH", "/api/tasks/"+itoa(open[1]), map[string]any{"estimate_hours": -1}, http.StatusUnprocessableEntity, nil)
	b = e.full(id)
	for _, task := range b.Tasks {
		if task.ID == open[0] && (task.EstimateHours == nil || *task.EstimateHours != 2 || task.SpentMinutes != 180) {
			t.Fatalf("estimate was not kept across a patch: %+v", task)
		}
	}

	// Stuck timer: an obstacle starts a window; "retry" needs a new approach and restarts it;
	// "help" stops it.
	var o struct {
		ID         int64      `json:"id"`
		TimerUntil *time.Time `json:"timer_until"`
		Attempts   int        `json:"attempts"`
		NeedsHelp  bool       `json:"needs_help"`
	}
	e.call("POST", "/api/projects/"+itoa(id)+"/obstacles", map[string]any{"title": "CORS error", "kind": "debug"}, http.StatusCreated, &o)
	if o.TimerUntil == nil || o.TimerUntil.Sub(e.now) != 20*time.Minute {
		t.Fatalf("stuck timer = %v, want 20 minutes from now", o.TimerUntil)
	}
	e.advance(21 * time.Minute)
	e.call("POST", "/api/obstacles/"+itoa(o.ID)+"/stuck", map[string]any{"action": "retry"}, http.StatusUnprocessableEntity, nil)
	e.call("POST", "/api/obstacles/"+itoa(o.ID)+"/stuck", map[string]any{"action": "retry", "approach": "Read the proxy docs"}, http.StatusOK, &o)
	if o.Attempts != 1 || o.TimerUntil == nil || !o.TimerUntil.After(e.now) {
		t.Fatalf("after retry: %+v", o)
	}
	e.call("POST", "/api/obstacles/"+itoa(o.ID)+"/stuck", map[string]any{"action": "help"}, http.StatusOK, &o)
	if !o.NeedsHelp || o.TimerUntil != nil {
		t.Fatalf("after asking for help: %+v", o)
	}

	// The status report names the task in progress.
	st, err := e.svc.Status(context.Background(), id)
	if err != nil || st.Task == nil || st.Phase != "build" || st.Obstacles != 1 {
		t.Fatalf("status = %+v, err = %v", st, err)
	}
	if line := st.Line(); !strings.Contains(line, "Rhythm [build") || !strings.Contains(line, "1 stuck") {
		t.Fatalf("status line = %q", line)
	}
}

func git(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", dir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false"}, args...)...)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
}

func TestRepositoryLinks(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}
	e := setup(t)
	e.now = time.Now().UTC().Add(-time.Hour).Truncate(time.Second) // commits are stamped with the real clock
	repo := t.TempDir()
	git(t, repo, "init", "-q")

	id := e.createProject(map[string]any{"name": "Linked"})
	e.story(id, "As a user I can do the thing", "mvp", http.StatusCreated)
	e.call("POST", "/api/projects/"+itoa(id)+"/start-build", nil, http.StatusNoContent, nil)
	b := e.full(id)
	var first, second int64
	for _, task := range b.Tasks {
		if task.Status == "done" {
			continue
		}
		if first == 0 {
			first = task.ID
		} else if second == 0 {
			second = task.ID
		}
	}

	// PLAN.md is written into the repository and rewritten when the plan changes.
	e.call("PATCH", "/api/projects/"+itoa(id), map[string]any{"repo_path": repo, "plan_sync": true, "commit_close": true}, http.StatusOK, nil)
	plan, err := os.ReadFile(filepath.Join(repo, "PLAN.md"))
	if err != nil || !strings.Contains(string(plan), "# Linked") || !strings.HasPrefix(string(plan), "<!-- Written by ProjectPlanner") {
		t.Fatalf("PLAN.md not written: %v\n%.200s", err, plan)
	}
	e.call("PUT", "/api/projects/"+itoa(id)+"/plan", map[string]string{"why": "A reason worth syncing."}, http.StatusNoContent, nil)
	e.svc.SyncRepositories(context.Background())
	if plan, _ = os.ReadFile(filepath.Join(repo, "PLAN.md")); !strings.Contains(string(plan), "A reason worth syncing.") {
		t.Fatal("PLAN.md was not updated after the plan changed")
	}
	if b = e.full(id); b.PlanSync == nil || b.PlanSync.Error != "" {
		t.Fatalf("plan sync state = %+v", b.PlanSync)
	}

	// Commits that mention a task show up on it; "closes #N" finishes it.
	os.WriteFile(filepath.Join(repo, "a.txt"), []byte("a"), 0o644)
	git(t, repo, "add", "a.txt")
	git(t, repo, "commit", "-q", "-m", "Start on the skeleton #"+itoa(first))
	os.WriteFile(filepath.Join(repo, "b.txt"), []byte("b"), 0o644)
	git(t, repo, "add", "b.txt")
	git(t, repo, "commit", "-q", "-m", "Wire it up\n\nCloses #"+itoa(second)+" and mentions #999999.")
	var info struct {
		OK      bool `json:"ok"`
		Closed  int  `json:"closed"`
		Commits []struct {
			Subject string  `json:"subject"`
			Refs    []int64 `json:"refs"`
			Closes  []int64 `json:"closes"`
		} `json:"commits"`
	}
	e.call("GET", "/api/projects/"+itoa(id)+"/git", nil, http.StatusOK, &info)
	if !info.OK || len(info.Commits) != 2 || info.Closed != 1 {
		t.Fatalf("git info = %+v", info)
	}
	if c := info.Commits[0]; len(c.Refs) != 1 || c.Refs[0] != second || len(c.Closes) != 1 {
		t.Fatalf("newest commit refs = %+v (a number that is not a task of this project must be dropped)", c)
	}
	if c := info.Commits[1]; len(c.Refs) != 1 || c.Refs[0] != first || len(c.Closes) != 0 {
		t.Fatalf("first commit refs = %+v", c)
	}
	status := map[int64]string{}
	for _, task := range e.full(id).Tasks {
		status[task.ID] = task.Status
	}
	if status[second] != "done" || status[first] == "done" {
		t.Fatalf("task states: mentioned=%s closed=%s", status[first], status[second])
	}
	// Reopening by hand sticks: the same commit does not close it again.
	e.call("PATCH", "/api/tasks/"+itoa(second), map[string]any{"status": "todo"}, http.StatusOK, nil)
	e.svc.SyncRepositories(context.Background())
	for _, task := range e.full(id).Tasks {
		if task.ID == second && task.Status == "done" {
			t.Fatal("a task reopened by hand was closed again by the same commit")
		}
	}

	// A PLAN.md the planner did not write is left alone.
	other := t.TempDir()
	os.WriteFile(filepath.Join(other, "PLAN.md"), []byte("my own notes\n"), 0o644)
	e.call("PATCH", "/api/projects/"+itoa(id), map[string]any{"repo_path": other}, http.StatusOK, nil)
	if mine, _ := os.ReadFile(filepath.Join(other, "PLAN.md")); string(mine) != "my own notes\n" {
		t.Fatal("a hand-written PLAN.md was overwritten")
	}
	if b = e.full(id); b.PlanSync == nil || b.PlanSync.Error == "" {
		t.Fatalf("expected a plan sync error, got %+v", b.PlanSync)
	}

	// The status command finds the project by the folder you are in.
	e.call("PATCH", "/api/projects/"+itoa(id), map[string]any{"repo_path": repo}, http.StatusOK, nil)
	sub := filepath.Join(repo, "src", "deep")
	os.MkdirAll(sub, 0o755)
	if got, _ := e.svc.StatusFor(context.Background(), 0, sub, true); got != id {
		t.Fatalf("StatusFor(inside repo) = %d, want %d", got, id)
	}
	if got, _ := e.svc.StatusFor(context.Background(), 0, t.TempDir(), true); got != 0 {
		t.Fatalf("StatusFor(elsewhere, here only) = %d, want 0", got)
	}
}

func TestKitsLessonsAndOneBuild(t *testing.T) {
	e := setup(t)
	var meta struct {
		Kits []struct {
			Key string `json:"key"`
		} `json:"kits"`
		Building     []string            `json:"building"`
		OneBuildMode string              `json:"one_build_mode"`
		StepKeys     map[string][]string `json:"step_keys"`
	}
	e.call("GET", "/api/meta", nil, http.StatusOK, &meta)
	if len(meta.Kits) != 5 || meta.OneBuildMode != "warn" || len(meta.StepKeys["hackathon"]) != 5 || len(meta.StepKeys["standard"]) != 10 {
		t.Fatalf("meta = %+v", meta)
	}
	e.call("POST", "/api/projects", map[string]any{"name": "Bad kit", "kit": "spaceship"}, http.StatusUnprocessableEntity, nil)

	id := e.createProject(map[string]any{"name": "A CLI", "kit": "cli"})
	b := e.full(id)
	stack, questions := 0, 0
	for _, it := range b.Items {
		switch it.Kind {
		case "stack":
			stack++
		case "question":
			questions++
		}
	}
	if b.Project.Kit != "cli" || stack == 0 || questions == 0 {
		t.Fatalf("kit did not pre-fill the blueprint: kit=%q stack=%d questions=%d", b.Project.Kit, stack, questions)
	}
	e.story(id, "As a user I can run it", "mvp", http.StatusCreated)
	e.call("POST", "/api/projects/"+itoa(id)+"/start-build", nil, http.StatusNoContent, nil)
	if got := e.full(id).Milestones; len(got) != 5 || got[0].Title == "Skeleton & first commit" {
		t.Fatalf("kit milestones not used: %+v", got)
	}

	// One project in build: warn by default (creating is allowed), block when set.
	e.call("GET", "/api/meta", nil, http.StatusOK, &meta)
	if len(meta.Building) != 1 || meta.Building[0] != "A CLI" {
		t.Fatalf("building = %v", meta.Building)
	}
	second := e.createProject(map[string]any{"name": "Second"})
	e.call("PUT", "/api/settings", map[string]any{"one_build_mode": "nonsense"}, http.StatusUnprocessableEntity, nil)
	e.call("PUT", "/api/settings", map[string]any{"one_build_mode": "block"}, http.StatusOK, nil)
	e.call("POST", "/api/projects", map[string]any{"name": "Third"}, http.StatusUnprocessableEntity, nil)
	// A hackathon is an appointment and is never blocked.
	e.createProject(map[string]any{"name": "Hack", "type": "hackathon",
		"hack_start": e.now.Add(time.Hour).Format(time.RFC3339), "hack_end": e.now.Add(25 * time.Hour).Format(time.RFC3339)})

	// Dropping an unfinished project needs a reason; it comes back as a lesson.
	e.call("PATCH", "/api/projects/"+itoa(second), map[string]any{"archived": true}, http.StatusUnprocessableEntity, nil)
	e.call("PATCH", "/api/projects/"+itoa(second), map[string]any{"archived": true, "archive_reason": "Too big for evenings"}, http.StatusOK, nil)
	var lessons []struct {
		Project, Kind, Text string
	}
	e.call("GET", "/api/lessons", nil, http.StatusOK, &lessons)
	if len(lessons) != 1 || lessons[0].Text != "Too big for evenings" || lessons[0].Kind != "abandoned" {
		t.Fatalf("lessons = %+v", lessons)
	}
	// Archiving the one in build lifts the block.
	e.call("PATCH", "/api/projects/"+itoa(id), map[string]any{"archived": true, "archive_reason": "Lost interest"}, http.StatusOK, nil)
	e.createProject(map[string]any{"name": "Third"})
}

func TestHackathonBreaksCalendarAndLateStart(t *testing.T) {
	e := setup(t)
	start := e.now.Add(time.Hour)
	end := start.Add(24 * time.Hour)
	id := e.createProject(map[string]any{"name": "Night; shift, hack", "type": "hackathon",
		"hack_start": start.Format(time.RFC3339), "hack_end": end.Format(time.RFC3339)})

	// A break needs a real span; sleeping takes hours out of the schedule.
	e.call("POST", "/api/projects/"+itoa(id)+"/items", map[string]any{"kind": "break", "data": map[string]any{"label": "Sleep"}}, http.StatusUnprocessableEntity, nil)
	e.call("POST", "/api/projects/"+itoa(id)+"/items", map[string]any{"kind": "break", "data": map[string]any{
		"label": "Sleep", "start": start.Add(10 * time.Hour).Format(time.RFC3339), "end": start.Add(16 * time.Hour).Format(time.RFC3339)}}, http.StatusCreated, nil)
	e.call("POST", "/api/projects/"+itoa(id)+"/items", map[string]any{"kind": "break", "data": map[string]any{
		"label": "Breakfast", "start": start.Add(15 * time.Hour).Format(time.RFC3339), "end": start.Add(17 * time.Hour).Format(time.RFC3339)}}, http.StatusCreated, nil)
	b := e.full(id)
	if b.Hackathon == nil || len(b.Hackathon.Breaks) != 2 {
		t.Fatalf("breaks = %+v", b.Hackathon)
	}
	if b.Hackathon.WorkMinutes != (24-7)*60 { // the overlap of the two breaks counts once
		t.Fatalf("work minutes = %d, want %d", b.Hackathon.WorkMinutes, (24-7)*60)
	}

	// The calendar holds the deadlines, with text escaped and lines folded.
	status, ics, header := e.raw("GET", "/api/projects/"+itoa(id)+"/calendar.ics", nil, "")
	if status != http.StatusOK || !strings.HasPrefix(header.Get("Content-Type"), "text/calendar") {
		t.Fatalf("calendar: status %d, type %s", status, header.Get("Content-Type"))
	}
	cal := string(ics)
	for _, want := range []string{"BEGIN:VCALENDAR", "feature freeze", `Night\; shift\, hack`, "DTSTART:" + end.UTC().Format("20060102T150405Z"), "END:VCALENDAR"} {
		if !strings.Contains(cal, want) {
			t.Errorf("calendar lacks %q", want)
		}
	}
	for _, l := range strings.Split(cal, "\r\n") {
		if len(l) > 75 {
			t.Errorf("calendar line longer than 75 bytes: %q", l)
		}
	}

	// A hackathon whose planning slot is over when first opened still gets one task in progress.
	late := e.createProject(map[string]any{"name": "Late", "type": "hackathon",
		"hack_start": e.now.Add(-10 * time.Hour).Format(time.RFC3339), "hack_end": e.now.Add(14 * time.Hour).Format(time.RFC3339)})
	lb := e.full(late)
	doing := 0
	for _, task := range lb.Tasks {
		if task.Status == "doing" {
			doing++
		}
	}
	if lb.Project.Phase != "build" || doing != 1 {
		t.Fatalf("late hackathon: phase=%s, tasks in progress=%d (want build, 1)", lb.Project.Phase, doing)
	}
}

func TestSearchActivityRetroAndProjectFile(t *testing.T) {
	e := setup(t)
	target := e.now.AddDate(0, 0, 10).Format("2006-01-02")
	id := e.createProject(map[string]any{"name": "Portable", "target_date": target})
	st := e.story(id, "As a user I can export everything", "mvp", http.StatusCreated)
	_ = st
	e.call("PUT", "/api/projects/"+itoa(id)+"/plan", map[string]string{"why": "Zanzibar is the keyword."}, http.StatusNoContent, nil)
	e.call("POST", "/api/projects/"+itoa(id)+"/items", map[string]any{"kind": "decision", "data": map[string]any{
		"title": "Storage", "decision": "Plain files", "why": "Simplest thing that works", "step": "stack"}}, http.StatusCreated, nil)
	content := bytes.Repeat([]byte("wireframe bytes "), 2000)
	e.upload(id, "home screen.txt", content, nil)
	e.call("POST", "/api/projects/"+itoa(id)+"/start-build", nil, http.StatusNoContent, nil)

	b := e.full(id)
	var taskID int64
	for _, task := range b.Tasks {
		if task.Status != "done" {
			taskID = task.ID
			break
		}
	}
	e.call("PATCH", "/api/tasks/"+itoa(taskID), map[string]any{"estimate_hours": 1, "spent_minutes": 90, "status": "done"}, http.StatusOK, nil)
	day := e.now.Format("2006-01-02")
	e.call("PUT", "/api/projects/"+itoa(id)+"/logs/"+day, map[string]any{"summary": "Got the export working", "hours": 2.5}, http.StatusOK, nil)
	e.call("PUT", "/api/projects/"+itoa(id)+"/picks/"+day, map[string]any{"task_ids": []int64{taskID}}, http.StatusNoContent, nil)
	var o struct {
		ID int64 `json:"id"`
	}
	e.call("POST", "/api/projects/"+itoa(id)+"/obstacles", map[string]any{"title": "Zip paths break on Windows", "kind": "debug", "task_id": taskID}, http.StatusCreated, &o)
	e.call("PATCH", "/api/obstacles/"+itoa(o.ID), map[string]any{"attempts": 2, "approaches": "a\nb", "resolution": "Always use forward slashes", "status": "resolved"}, http.StatusOK, nil)
	e.call("POST", "/api/projects/"+itoa(id)+"/tasks", map[string]any{"title": "Late addition"}, http.StatusCreated, nil)

	// Search finds text in answers, obstacles and tasks, and treats % literally.
	var hits []struct {
		Kind      string `json:"kind"`
		ProjectID int64  `json:"project_id"`
		Title     string `json:"title"`
		Snippet   string `json:"snippet"`
	}
	e.call("GET", "/api/search?q=zanzibar", nil, http.StatusOK, &hits)
	if len(hits) != 1 || hits[0].Kind != "answer" || hits[0].Title != "Why I'm building it" {
		t.Fatalf("search zanzibar = %+v", hits)
	}
	e.call("GET", "/api/search?q=forward+slashes", nil, http.StatusOK, &hits)
	if len(hits) != 1 || hits[0].Kind != "obstacle" {
		t.Fatalf("search for the fix = %+v", hits)
	}
	e.call("GET", "/api/search?q=%25", nil, http.StatusOK, &hits)
	if len(hits) != 0 {
		t.Fatalf("a lone %% matched %d rows", len(hits))
	}

	// Activity: one day with an entry, hours and a finished task.
	var act struct {
		Days []struct {
			Day       string  `json:"day"`
			Hours     float64 `json:"hours"`
			TasksDone int     `json:"tasks_done"`
		} `json:"days"`
	}
	e.call("GET", "/api/activity", nil, http.StatusOK, &act)
	if len(act.Days) == 0 {
		t.Fatal("no activity")
	}
	var hours float64
	done := 0
	for _, d := range act.Days {
		hours += d.Hours
		done += d.TasksDone
	}
	if hours != 2.5 || done != 1 {
		t.Fatalf("activity: hours=%v done=%d, want 2.5 and 1", hours, done)
	}

	// Ship 12 days in: two days after the first target.
	e.advance(12 * 24 * time.Hour)
	e.call("POST", "/api/projects/"+itoa(id)+"/ship", map[string]any{"shipped": true}, http.StatusNoContent, nil)
	e.call("PUT", "/api/projects/"+itoa(id)+"/plan", map[string]string{"retro_change": "Estimate before starting"}, http.StatusNoContent, nil)
	b = e.full(id)
	if b.Retro == nil || b.Retro.TasksDone != 1 || b.Retro.ScopeAdded != 1 || len(b.Retro.Obstacles) != 1 || b.Retro.Multiplier != 1.5 {
		t.Fatalf("retro = %+v", b.Retro)
	}
	if b.Retro.DaysVsTarget == nil || *b.Retro.DaysVsTarget < 1 || *b.Retro.DaysVsTarget > 3 {
		t.Fatalf("days vs target = %v, want about 2", b.Retro.DaysVsTarget)
	}
	var lessons []struct{ Kind, Text string }
	e.call("GET", "/api/lessons", nil, http.StatusOK, &lessons)
	if len(lessons) != 1 || lessons[0].Kind != "shipped" {
		t.Fatalf("lessons = %+v", lessons)
	}
	_, md, _ := e.raw("GET", "/api/projects/"+itoa(id)+"/export.md", nil, "")
	for _, want := range []string{"## Decision log", "Plain files", "## Retrospective", "Always use forward slashes", "Estimate before starting"} {
		if !strings.Contains(string(md), want) {
			t.Errorf("export lacks %q", want)
		}
	}

	// Export to one file, import it back: a second, complete project.
	status, archive, header := e.raw("GET", "/api/projects/"+itoa(id)+"/export.zip", nil, "")
	if status != http.StatusOK || header.Get("Content-Type") != "application/zip" {
		t.Fatalf("export.zip: status %d type %s", status, header.Get("Content-Type"))
	}
	zr, err := zip.NewReader(bytes.NewReader(archive), int64(len(archive)))
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, f := range zr.File {
		names[f.Name] = true
	}
	if !names["project.json"] || !names["files/001-home screen.txt"] {
		t.Fatalf("archive entries = %v", names)
	}
	status, body, _ := e.raw("POST", "/api/import", bytes.NewReader(archive), "application/zip")
	if status != http.StatusCreated {
		t.Fatalf("import: status %d\n%s", status, body)
	}
	var imported struct {
		ID   int64  `json:"id"`
		Name string `json:"name"`
	}
	json.Unmarshal(body, &imported)
	if imported.ID == id || imported.Name != "Portable (imported)" {
		t.Fatalf("imported = %+v", imported)
	}
	c := e.full(imported.ID)
	if c.Project.Phase != "shipped" || len(c.Tasks) != len(b.Tasks) || len(c.Stories) != len(b.Stories) ||
		len(c.Items) != len(b.Items) || len(c.Milestones) != len(b.Milestones) || len(c.Obstacles) != 1 ||
		len(c.Events) != len(b.Events) || len(c.Picks) != 1 || len(c.Files) != 1 || !c.HasSnapshot || c.Project.RepoPath != "" {
		t.Fatalf("imported project is incomplete: tasks %d/%d stories %d/%d items %d/%d milestones %d/%d events %d/%d picks %d files %d snapshot %v",
			len(c.Tasks), len(b.Tasks), len(c.Stories), len(b.Stories), len(c.Items), len(b.Items),
			len(c.Milestones), len(b.Milestones), len(c.Events), len(b.Events), len(c.Picks), len(c.Files), c.HasSnapshot)
	}
	// Links between rows point at the new rows, not the old ones.
	own := map[int64]bool{}
	for _, m := range c.Milestones {
		own[m.ID] = true
	}
	linked := 0
	for _, task := range c.Tasks {
		if task.MilestoneID != nil {
			linked++
			if !own[*task.MilestoneID] {
				t.Fatalf("imported task %q points at a milestone of another project", task.Title)
			}
		}
	}
	if linked == 0 || c.Picks[0].TaskID == nil || *c.Picks[0].TaskID == taskID {
		t.Fatalf("links were not remapped: linked=%d pick=%v", linked, c.Picks[0].TaskID)
	}
	// The frozen plan still lines up with the imported rows: only real changes show.
	var snapA, snapB struct {
		Changes []any `json:"changes"`
	}
	e.call("GET", "/api/projects/"+itoa(id)+"/snapshot", nil, http.StatusOK, &snapA)
	e.call("GET", "/api/projects/"+itoa(imported.ID)+"/snapshot", nil, http.StatusOK, &snapB)
	if len(snapA.Changes) != len(snapB.Changes) {
		t.Fatalf("snapshot diff differs after import: %d vs %d changes", len(snapA.Changes), len(snapB.Changes))
	}
	// The upload came along, byte for byte.
	status, got, _ := e.raw("GET", "/api/files/"+itoa(c.Files[0].ID)+"/content", nil, "")
	if status != http.StatusOK || !bytes.Equal(got, content) {
		t.Fatalf("imported upload differs: status %d, %d bytes (want %d)", status, len(got), len(content))
	}

	// Rubbish is refused and changes nothing.
	status, _, _ = e.raw("POST", "/api/import", strings.NewReader("not a zip"), "application/zip")
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("importing rubbish: status %d, want 422", status)
	}
	var list []any
	e.call("GET", "/api/projects", nil, http.StatusOK, &list)
	if len(list) != 2 {
		t.Fatalf("projects after a failed import = %d, want 2", len(list))
	}
}

func TestBackupAndRestore(t *testing.T) {
	for _, tool := range []string{"pg_dump", "psql"} {
		if _, err := exec.LookPath(tool); err != nil {
			t.Skipf("%s is not installed", tool)
		}
	}
	e := setup(t)
	ctx := context.Background()
	id := e.createProject(map[string]any{"name": "Keep me"})
	e.upload(id, "notes.txt", bytes.Repeat([]byte("keep "), 500), nil)

	m := &backup.Manager{Dir: filepath.Join(t.TempDir(), "backups"), DatabaseURL: e.dbURL, UploadsDir: e.dataDir,
		AfterRestore: func(ctx context.Context) error { return database.Migrate(ctx, e.db) }}
	made, err := m.RunDaily(ctx, 2)
	if err != nil || !made {
		t.Fatalf("daily backup: made=%v err=%v", made, err)
	}
	if made, _ = m.RunDaily(ctx, 2); made {
		t.Fatal("a second automatic backup was written on the same day")
	}
	list, _ := m.List()
	if len(list) != 1 || !list[0].Auto || list[0].Size == 0 {
		t.Fatalf("backups = %+v", list)
	}

	// Lose everything, then restore.
	e.call("DELETE", "/api/projects/"+itoa(id), nil, http.StatusNoContent, nil)
	other := e.createProject(map[string]any{"name": "Made after the backup"})
	safety, err := m.Restore(ctx, list[0].Name)
	if err != nil {
		t.Fatal(err)
	}
	b := e.full(id)
	if b.Project.Name != "Keep me" || len(b.Files) != 1 {
		t.Fatalf("restored project = %+v, files = %d", b.Project, len(b.Files))
	}
	if status, got, _ := e.raw("GET", "/api/files/"+itoa(b.Files[0].ID)+"/content", nil, ""); status != http.StatusOK || len(got) != 2500 {
		t.Fatalf("restored upload: status %d, %d bytes", status, len(got))
	}
	e.call("GET", "/api/projects/"+itoa(other), nil, http.StatusNotFound, nil)
	// The state before the restore was saved too, and names outside the folder are refused.
	if _, err := m.Path(safety); err != nil || !strings.Contains(safety, "before-restore") {
		t.Fatalf("safety backup %q: %v", safety, err)
	}
	if _, err := m.Restore(ctx, "../../etc/passwd"); err == nil {
		t.Fatal("a path outside the backup folder was accepted")
	}
}

// A task split in two is the same work in smaller pieces, so it is not counted as scope
// creep; a brand-new task is. Deadline alerts list what is about to happen.
func TestSplitIsNotCreepAndAlerts(t *testing.T) {
	e := setup(t)
	id := e.createProject(map[string]any{"name": "Alerts"})
	e.story(id, "As a user I can do the thing", "mvp", http.StatusCreated)

	var alerts []struct {
		Key       string    `json:"key"`
		ProjectID int64     `json:"project_id"`
		At        time.Time `json:"at"`
		Title     string    `json:"title"`
		Path      string    `json:"path"`
	}
	has := func(prefix string) bool {
		for _, a := range alerts {
			if a.ProjectID == id && strings.HasPrefix(a.Key, itoa(id)+":"+prefix) {
				return true
			}
		}
		return false
	}

	// Far from the planning deadline nothing is due within a day.
	e.call("GET", "/api/alerts", nil, http.StatusOK, &alerts)
	if has("plan-") {
		t.Fatalf("planning alerts a week early: %+v", alerts)
	}
	// Half an hour before pencils-down both the warning and the deadline are listed.
	var proj struct {
		Project struct {
			PlanningDeadline time.Time `json:"planning_deadline"`
		} `json:"project"`
	}
	e.call("GET", "/api/projects/"+itoa(id), nil, http.StatusOK, &proj)
	e.advance(proj.Project.PlanningDeadline.Sub(e.now) - 30*time.Minute)
	e.call("GET", "/api/alerts", nil, http.StatusOK, &alerts)
	if !has("plan-end") {
		t.Fatalf("no pencils-down alert 30 minutes before the deadline: %+v", alerts)
	}

	e.call("POST", "/api/projects/"+itoa(id)+"/start-build", nil, http.StatusNoContent, nil)
	b := e.full(id)
	before := e.count(b, "scope_add")
	var first int64
	for _, task := range b.Tasks {
		if task.Status != "done" {
			first = task.ID
			break
		}
	}
	if first == 0 {
		t.Fatal("no open task to split")
	}

	e.call("POST", "/api/projects/"+itoa(id)+"/tasks", map[string]any{"title": "The other half", "status": "todo", "split_from": first}, http.StatusCreated, nil)
	if got := e.count(e.full(id), "scope_add"); got != before {
		t.Fatalf("a split was counted as new scope: %d → %d", before, got)
	}
	e.call("POST", "/api/projects/"+itoa(id)+"/tasks", map[string]any{"title": "A brand-new idea", "status": "todo"}, http.StatusCreated, nil)
	if got := e.count(e.full(id), "scope_add"); got != before+1 {
		t.Fatalf("a new task was not counted as new scope: %d → %d", before, got)
	}
	// Splitting from a task of another project does not launder new scope.
	other := e.createProject(map[string]any{"name": "Other"})
	e.call("POST", "/api/projects/"+itoa(other)+"/start-build", nil, http.StatusNoContent, nil)
	e.call("POST", "/api/projects/"+itoa(other)+"/tasks", map[string]any{"title": "Smuggled", "status": "todo", "split_from": first}, http.StatusCreated, nil)
	if got := e.count(e.full(other), "scope_add"); got != 1 {
		t.Fatalf("split_from another project should count as new scope, got %d", got)
	}

	// A task in progress shows up as a "too long" alert once its limit is within a day.
	e.call("PATCH", "/api/projects/"+itoa(id), map[string]any{"stale_hours": 2}, http.StatusOK, nil)
	e.call("PATCH", "/api/tasks/"+itoa(first), map[string]any{"status": "doing"}, http.StatusOK, nil)
	e.call("GET", "/api/alerts", nil, http.StatusOK, &alerts)
	if !has("stale-") {
		t.Fatalf("no stale alert for a task in progress: %+v", alerts)
	}
}
