package api_test

// End-to-end tests: real HTTP requests against the real router, service and a real Postgres.
// They run when PLANNER_TEST_DATABASE_URL points at a database that may be wiped, e.g.
//
//	PLANNER_TEST_DATABASE_URL=postgres://planner:planner@127.0.0.1:5432/planner_test?sslmode=disable go test ./...

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"projectplanner/internal/api"
	"projectplanner/internal/database"
	"projectplanner/internal/filestore"
	"projectplanner/internal/planner"
	"projectplanner/internal/store"
)

type env struct {
	t       *testing.T
	srv     *httptest.Server
	db      *sql.DB
	svc     *planner.Service
	dbURL   string
	dataDir string
	mu      sync.Mutex
	now     time.Time
}

func setup(t *testing.T) *env {
	t.Helper()
	url := os.Getenv("PLANNER_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("PLANNER_TEST_DATABASE_URL is not set; skipping database tests")
	}
	ctx := context.Background()
	db, err := database.Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`); err != nil {
		t.Fatal(err)
	}
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	// Migrating twice must be a no-op.
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	e := &env{t: t, db: db, dbURL: url, dataDir: t.TempDir(), now: time.Now().UTC().Truncate(time.Second)}
	files, err := filestore.New(e.dataDir)
	if err != nil {
		t.Fatal(err)
	}
	svc := planner.NewService(store.New(db), files)
	svc.SetClock(func() time.Time {
		e.mu.Lock()
		defer e.mu.Unlock()
		return e.now
	})
	e.svc = svc
	e.srv = httptest.NewServer(api.New(svc, "", nil))
	t.Cleanup(func() { e.srv.Close(); db.Close() })
	return e
}

func (e *env) advance(d time.Duration) {
	e.mu.Lock()
	e.now = e.now.Add(d)
	e.mu.Unlock()
}

// call makes a JSON request and decodes the response into out (if given).
func (e *env) call(method, path string, body any, wantStatus int, out any) map[string]any {
	e.t.Helper()
	var reader io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		reader = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, e.srv.URL+path, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode != wantStatus {
		e.t.Fatalf("%s %s: status %d, want %d\n%s", method, path, res.StatusCode, wantStatus, raw)
	}
	if out != nil {
		if err := json.Unmarshal(raw, out); err != nil {
			e.t.Fatalf("%s %s: bad JSON: %v\n%s", method, path, err, raw)
		}
	}
	var generic map[string]any
	_ = json.Unmarshal(raw, &generic)
	return generic
}

type bundle struct {
	Project struct {
		ID               int64      `json:"id"`
		Phase            string     `json:"phase"`
		ForcedStart      bool       `json:"forced_start"`
		PlanningDeadline time.Time  `json:"planning_deadline"`
		DecidedAt        time.Time  `json:"decided_at"`
		BuildStartedAt   *time.Time `json:"build_started_at"`
	} `json:"project"`
	Planning struct {
		ReadyToBuild bool   `json:"ready_to_build"`
		CurrentStep  string `json:"current_step"`
	} `json:"planning"`
	Tasks []struct {
		ID        int64      `json:"id"`
		Title     string     `json:"title"`
		Status    string     `json:"status"`
		Scope     string     `json:"scope"`
		Origin    string     `json:"origin"`
		StartedAt *time.Time `json:"started_at"`
		DoneAt    *time.Time `json:"done_at"`
	} `json:"tasks"`
	Milestones []struct {
		Title string     `json:"title"`
		DueAt *time.Time `json:"due_at"`
	} `json:"milestones"`
	Items []struct {
		Kind string `json:"kind"`
	} `json:"items"`
	Files []struct {
		ID           int64  `json:"id"`
		Compression  string `json:"compression"`
		OriginalSize int64  `json:"original_size"`
		StoredSize   int64  `json:"stored_size"`
	} `json:"files"`
}

func (e *env) createProject(body map[string]any) int64 {
	e.t.Helper()
	var p struct {
		ID int64 `json:"id"`
	}
	e.call("POST", "/api/projects", body, http.StatusCreated, &p)
	return p.ID
}

func (e *env) bundle(id int64) bundle {
	e.t.Helper()
	var b bundle
	e.call("GET", "/api/projects/"+itoa(id), nil, http.StatusOK, &b)
	return b
}

func itoa(n int64) string {
	b, _ := json.Marshal(n)
	return string(b)
}

func TestTwoWeekRule(t *testing.T) {
	e := setup(t)

	// 1. You cannot ask for more than 14 days of planning, at creation or later.
	for _, days := range []int{15, 30, 0} {
		res := e.call("POST", "/api/projects", map[string]any{"name": "Too slow", "planning_days": days}, http.StatusUnprocessableEntity, nil)
		if !strings.Contains(res["error"].(string), "14 days") {
			t.Fatalf("unhelpful error: %v", res["error"])
		}
	}
	id := e.createProject(map[string]any{"name": "Hard thing", "complexity": "hard"})
	b := e.bundle(id)
	if got := b.Project.PlanningDeadline.Sub(b.Project.DecidedAt); got != 14*24*time.Hour {
		t.Fatalf("a hard project plans for %v, want 14 days", got)
	}
	e.call("PATCH", "/api/projects/"+itoa(id), map[string]any{"planning_days": 15}, http.StatusUnprocessableEntity, nil)
	e.call("PATCH", "/api/projects/"+itoa(id), map[string]any{"planning_days": 10}, http.StatusOK, nil)

	// 2. Even bypassing the application, the database refuses a later deadline.
	_, err := e.db.Exec(`UPDATE projects SET planning_deadline = decided_at + interval '14 days 1 second' WHERE id = $1`, id)
	if err == nil || !strings.Contains(err.Error(), "two_week_rule") {
		t.Fatalf("database accepted a deadline past two weeks (err=%v)", err)
	}

	// 3. One second before the deadline: still planning.
	e.advance(10*24*time.Hour - time.Second)
	if b = e.bundle(id); b.Project.Phase != "plan" {
		t.Fatalf("phase is %q before the deadline", b.Project.Phase)
	}

	// 4. At the deadline: coding has started, finished plan or not.
	e.advance(time.Second)
	b = e.bundle(id)
	if b.Project.Phase != "build" || !b.Project.ForcedStart {
		t.Fatalf("after the deadline: phase=%q forced=%v", b.Project.Phase, b.Project.ForcedStart)
	}
	if b.Project.BuildStartedAt == nil || !b.Project.BuildStartedAt.Equal(b.Project.PlanningDeadline) {
		t.Fatalf("build should start exactly at the deadline, got %v", b.Project.BuildStartedAt)
	}
	debt, doing := 0, 0
	for _, task := range b.Tasks {
		if task.Scope == "debt" {
			debt++
		}
		if task.Status == "doing" {
			doing++
			if task.Origin != "skeleton" {
				t.Errorf("the first task in progress should be the skeleton, got %q", task.Title)
			}
		}
	}
	if debt != 4 {
		t.Errorf("expected the 4 unfinished essential steps to become tasks, got %d", debt)
	}
	if doing != 1 {
		t.Errorf("expected exactly one task in progress when coding starts, got %d", doing)
	}
	if len(b.Milestones) != 5 {
		t.Errorf("expected 5 generated milestones, got %d", len(b.Milestones))
	}

	// 5. There is no way back into planning.
	e.call("PATCH", "/api/projects/"+itoa(id), map[string]any{"planning_days": 14}, http.StatusUnprocessableEntity, nil)
	e.call("POST", "/api/projects/"+itoa(id)+"/start-build", nil, http.StatusUnprocessableEntity, nil)

	// 6. The project list also enforces the deadline (no need to open the project).
	id2 := e.createProject(map[string]any{"name": "Tiny thing", "complexity": "tiny"})
	e.advance(25 * time.Hour)
	var list []struct {
		ID    int64  `json:"id"`
		Phase string `json:"phase"`
	}
	e.call("GET", "/api/projects", nil, http.StatusOK, &list)
	for _, p := range list {
		if p.ID == id2 && p.Phase != "build" {
			t.Fatalf("listed project is still in phase %q a day after its deadline", p.Phase)
		}
	}
}

func TestStartEarlyAndGenerate(t *testing.T) {
	e := setup(t)
	id := e.createProject(map[string]any{"name": "Notes app", "complexity": "small", "target_date": e.now.Add(20 * 24 * time.Hour).Format("2006-01-02")})
	base := "/api/projects/" + itoa(id)

	e.call("PUT", base+"/plan", map[string]string{"why": "learn Go", "who": "me", "value": "fast notes"}, http.StatusNoContent, nil)
	e.call("PUT", base+"/plan", map[string]string{"Bad Key": "x"}, http.StatusUnprocessableEntity, nil)
	var story struct {
		ID int64 `json:"id"`
	}
	e.call("POST", base+"/stories", map[string]any{"text": "Create a note", "tier": "mvp"}, http.StatusCreated, &story)
	e.call("POST", base+"/stories", map[string]any{"text": "Share a note", "tier": "later"}, http.StatusCreated, nil)
	e.call("POST", base+"/stories", map[string]any{"text": "  "}, http.StatusUnprocessableEntity, nil)
	e.call("POST", base+"/items", map[string]any{"kind": "flow", "data": map[string]any{"name": "Save note", "core": true}}, http.StatusCreated, nil)
	e.call("POST", base+"/items", map[string]any{"kind": "nonsense", "data": map[string]any{}}, http.StatusUnprocessableEntity, nil)
	e.call("POST", base+"/items", map[string]any{"kind": "capability", "data": map[string]any{"name": "Auth", "decision": "maybe"}}, http.StatusUnprocessableEntity, nil)
	for _, step := range []string{"goal", "stories", "mvp"} {
		e.call("PUT", base+"/steps/"+step, map[string]string{"status": "done"}, http.StatusNoContent, nil)
	}
	e.call("PUT", base+"/steps/nope", map[string]string{"status": "done"}, http.StatusUnprocessableEntity, nil)

	// Generating during planning fills the board without starting the build.
	var gen struct {
		Created int `json:"created"`
	}
	e.call("POST", base+"/generate", nil, http.StatusOK, &gen)
	if gen.Created != 4 { // skeleton, flow, story, deploy
		t.Fatalf("generated %d tasks, want 4", gen.Created)
	}
	e.call("POST", base+"/generate", nil, http.StatusOK, &gen)
	if gen.Created != 0 {
		t.Fatalf("generating twice created %d duplicates", gen.Created)
	}
	e.call("PUT", base+"/steps/buildplan", map[string]string{"status": "done"}, http.StatusNoContent, nil)
	b := e.bundle(id)
	if b.Project.Phase != "plan" || !b.Planning.ReadyToBuild {
		t.Fatalf("phase=%q ready=%v", b.Project.Phase, b.Planning.ReadyToBuild)
	}

	// Start coding on day one instead of waiting for the deadline.
	e.advance(time.Hour)
	e.call("POST", base+"/start-build", nil, http.StatusNoContent, nil)
	b = e.bundle(id)
	if b.Project.Phase != "build" || b.Project.ForcedStart {
		t.Fatalf("phase=%q forced=%v", b.Project.Phase, b.Project.ForcedStart)
	}
	var skeleton int64
	for _, task := range b.Tasks {
		if task.Scope == "debt" {
			t.Errorf("no planning debt expected, got %q", task.Title)
		}
		if task.Origin == "skeleton" {
			skeleton = task.ID
			if task.Status != "doing" || task.StartedAt == nil {
				t.Errorf("skeleton task should be in progress")
			}
		}
	}
	if len(b.Tasks) != 4 {
		t.Fatalf("starting the build duplicated tasks: %d", len(b.Tasks))
	}

	// Task status changes keep their timestamps.
	var task struct {
		Status string     `json:"status"`
		DoneAt *time.Time `json:"done_at"`
		Title  string     `json:"title"`
	}
	e.call("PATCH", "/api/tasks/"+itoa(skeleton), map[string]any{"status": "done"}, http.StatusOK, &task)
	if task.DoneAt == nil || task.Title == "" {
		t.Fatalf("done task has no done_at or lost its title: %+v", task)
	}
	e.call("PATCH", "/api/tasks/"+itoa(skeleton), map[string]any{"status": "todo"}, http.StatusOK, &task)
	if task.DoneAt != nil {
		t.Fatalf("reopened task still has done_at")
	}
	e.call("PATCH", "/api/tasks/"+itoa(skeleton), map[string]any{"status": "flying"}, http.StatusUnprocessableEntity, nil)

	// A task cannot point at another project's story.
	other := e.createProject(map[string]any{"name": "Other"})
	e.call("POST", "/api/projects/"+itoa(other)+"/tasks", map[string]any{"title": "x", "story_id": story.ID}, http.StatusUnprocessableEntity, nil)

	// Daily log: one entry per day, saved again = replaced.
	e.call("PUT", base+"/logs/2026-03-02", map[string]any{"summary": "Set up the repo", "hours": 2.5}, http.StatusOK, nil)
	e.call("PUT", base+"/logs/2026-03-02", map[string]any{"summary": "Set up the repo and CI"}, http.StatusOK, nil)
	e.call("PUT", base+"/logs/not-a-day", map[string]any{"summary": "x"}, http.StatusUnprocessableEntity, nil)
	var count int
	if err := e.db.QueryRow(`SELECT count(*) FROM daily_logs WHERE project_id = $1`, id).Scan(&count); err != nil || count != 1 {
		t.Fatalf("expected one log row, got %d (%v)", count, err)
	}

	// Obstacles get a resolved timestamp.
	var ob struct {
		ID         int64      `json:"id"`
		ResolvedAt *time.Time `json:"resolved_at"`
	}
	e.call("POST", base+"/obstacles", map[string]any{"title": "CORS error", "kind": "debug"}, http.StatusCreated, &ob)
	e.call("PATCH", "/api/obstacles/"+itoa(ob.ID), map[string]any{"status": "resolved", "resolution": "proxy"}, http.StatusOK, &ob)
	if ob.ResolvedAt == nil {
		t.Fatal("resolved obstacle has no resolved_at")
	}

	// Ship, export.
	e.call("POST", base+"/ship", map[string]any{}, http.StatusNoContent, nil)
	if b = e.bundle(id); b.Project.Phase != "shipped" {
		t.Fatalf("phase=%q after shipping", b.Project.Phase)
	}
	res, err := http.Get(e.srv.URL + base + "/export.md")
	if err != nil {
		t.Fatal(err)
	}
	md, _ := io.ReadAll(res.Body)
	res.Body.Close()
	for _, want := range []string{"# Notes app", "learn Go", "Create a note", "Flow: Save note (core)", "Skeleton & first commit"} {
		if !strings.Contains(string(md), want) {
			t.Errorf("export is missing %q", want)
		}
	}
}

func TestHackathon(t *testing.T) {
	e := setup(t)
	start := e.now.Add(2 * time.Hour)
	end := start.Add(24 * time.Hour)

	e.call("POST", "/api/projects", map[string]any{"name": "No clock", "type": "hackathon"}, http.StatusUnprocessableEntity, nil)
	e.call("POST", "/api/projects", map[string]any{"name": "Backwards", "type": "hackathon", "hack_start": end, "hack_end": start}, http.StatusUnprocessableEntity, nil)

	id := e.createProject(map[string]any{"name": "Hack", "type": "hackathon", "hack_start": start, "hack_end": end})
	base := "/api/projects/" + itoa(id)
	b := e.bundle(id)
	if got := b.Project.PlanningDeadline.Sub(start); got != 144*time.Minute {
		t.Fatalf("24h hackathon plans for %v, want 2h24m", got)
	}
	submission := 0
	for _, it := range b.Items {
		if it.Kind == "submission" {
			submission++
		}
	}
	if submission == 0 {
		t.Fatal("a hackathon should come with a submission checklist")
	}

	// Planning time is capped at a quarter of the event.
	var p struct {
		PlanningDeadline time.Time `json:"planning_deadline"`
	}
	e.call("PATCH", base, map[string]any{"planning_minutes": 100000}, http.StatusOK, &p)
	if got := p.PlanningDeadline.Sub(start); got != 6*time.Hour {
		t.Fatalf("planning budget was not capped: %v", got)
	}
	e.call("PATCH", base, map[string]any{"planning_minutes": 60}, http.StatusOK, &p)

	// No coding before the clock starts.
	e.call("POST", base+"/start-build", nil, http.StatusUnprocessableEntity, nil)

	// Clock started, planning hour used up → build.
	e.advance(2*time.Hour + 59*time.Minute)
	if b = e.bundle(id); b.Project.Phase != "plan" {
		t.Fatalf("phase=%q with a minute of planning left", b.Project.Phase)
	}
	e.advance(time.Minute)
	b = e.bundle(id)
	if b.Project.Phase != "build" || !b.Project.ForcedStart {
		t.Fatalf("phase=%q forced=%v after the planning hour", b.Project.Phase, b.Project.ForcedStart)
	}
	last := b.Milestones[len(b.Milestones)-1]
	if last.DueAt == nil || !last.DueAt.Equal(end) {
		t.Fatalf("the last milestone should be the submission deadline, got %v", last.DueAt)
	}
}

func (e *env) upload(projectID int64, name string, data []byte, extra map[string]string) (*http.Response, []byte) {
	e.t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	_ = mw.WriteField("category", "reference")
	part, _ := mw.CreateFormFile("file", name)
	part.Write(data)
	mw.Close()
	req, _ := http.NewRequest("POST", e.srv.URL+"/api/projects/"+itoa(projectID)+"/files", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	for k, v := range extra {
		req.Header.Set(k, v)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	return res, body
}

func TestUploads(t *testing.T) {
	e := setup(t)
	id := e.createProject(map[string]any{"name": "Files"})

	// Text compresses well and comes back byte for byte.
	text := []byte(strings.Repeat("The user should be able to upload a file.\n", 5000))
	res, body := e.upload(id, "stories.txt", text, nil)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("upload: %d %s", res.StatusCode, body)
	}
	var f struct {
		ID           int64  `json:"id"`
		Compression  string `json:"compression"`
		OriginalSize int64  `json:"original_size"`
		StoredSize   int64  `json:"stored_size"`
	}
	json.Unmarshal(body, &f)
	if f.Compression != "zstd" || f.StoredSize >= f.OriginalSize/10 || f.OriginalSize != int64(len(text)) {
		t.Fatalf("text was not compressed properly: %+v", f)
	}
	got, err := http.Get(e.srv.URL + "/api/files/" + itoa(f.ID) + "/content")
	if err != nil {
		t.Fatal(err)
	}
	back, _ := io.ReadAll(got.Body)
	got.Body.Close()
	if !bytes.Equal(back, text) {
		t.Fatalf("downloaded file differs from the upload (%d vs %d bytes)", len(back), len(text))
	}

	// Incompressible data is stored as is rather than made bigger.
	noise := make([]byte, 200_000)
	rand.Read(noise)
	res, body = e.upload(id, "noise.bin", noise, nil)
	json.Unmarshal(body, &f)
	if res.StatusCode != http.StatusCreated || f.Compression != "none" || f.StoredSize != int64(len(noise)) {
		t.Fatalf("incompressible upload: %d %+v", res.StatusCode, f)
	}

	// Exactly 10 MB is fine, one byte more is refused.
	limit := make([]byte, filestore.MaxUploadBytes)
	if res, body = e.upload(id, "limit.bin", limit, nil); res.StatusCode != http.StatusCreated {
		t.Fatalf("10 MB upload refused: %d %s", res.StatusCode, body)
	}
	over := make([]byte, filestore.MaxUploadBytes+1)
	if res, body = e.upload(id, "over.bin", over, nil); res.StatusCode != http.StatusRequestEntityTooLarge {
		t.Fatalf("10 MB + 1 byte: status %d %s", res.StatusCode, body)
	}
	huge := make([]byte, 3*filestore.MaxUploadBytes)
	if res, _ = e.upload(id, "huge.bin", huge, nil); res.StatusCode != http.StatusRequestEntityTooLarge {
		t.Fatalf("30 MB: status %d", res.StatusCode)
	}

	// HTML is never rendered inline.
	res, body = e.upload(id, "evil.html", []byte("<html><script>alert(1)</script></html>"), nil)
	json.Unmarshal(body, &f)
	got, _ = http.Get(e.srv.URL + "/api/files/" + itoa(f.ID) + "/content")
	got.Body.Close()
	if !strings.HasPrefix(got.Header.Get("Content-Disposition"), "attachment") {
		t.Fatalf("HTML upload is served inline: %q", got.Header.Get("Content-Disposition"))
	}

	// Another website cannot post to the local server through the browser.
	if res, _ = e.upload(id, "x.txt", []byte("x"), map[string]string{"Sec-Fetch-Site": "cross-site"}); res.StatusCode != http.StatusForbidden {
		t.Fatalf("cross-site upload: status %d", res.StatusCode)
	}

	// Deleting the project removes its files from disk.
	stored, _ := filepath.Glob(filepath.Join(e.dataDir, itoa(id), "*"))
	if len(stored) != 4 {
		t.Fatalf("expected 4 stored files, found %d", len(stored))
	}
	e.call("DELETE", "/api/projects/"+itoa(id), nil, http.StatusNoContent, nil)
	if _, err := os.Stat(filepath.Join(e.dataDir, itoa(id))); !os.IsNotExist(err) {
		t.Fatalf("project files were left on disk")
	}
	e.call("GET", "/api/projects/"+itoa(id), nil, http.StatusNotFound, nil)
}
