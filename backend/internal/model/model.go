// Package model holds the plain data types shared by every layer.
package model

import (
	"encoding/json"
	"time"
)

const (
	TypeStandard  = "standard"
	TypeHackathon = "hackathon"

	PhasePlan    = "plan"
	PhaseBuild   = "build"
	PhaseShipped = "shipped"
)

type Project struct {
	ID               int64             `json:"id"`
	Name             string            `json:"name"`
	Summary          string            `json:"summary"`
	Type             string            `json:"type"`
	Complexity       string            `json:"complexity"`
	VendorMode       string            `json:"vendor_mode"`
	Phase            string            `json:"phase"`
	Archived         bool              `json:"archived"`
	DecidedAt        time.Time         `json:"decided_at"`
	PlanningDeadline time.Time         `json:"planning_deadline"`
	BuildStartedAt   *time.Time        `json:"build_started_at"`
	ForcedStart      bool              `json:"forced_start"`
	ShippedAt        *time.Time        `json:"shipped_at"`
	TargetDate       *string           `json:"target_date"` // YYYY-MM-DD
	HackStart        *time.Time        `json:"hack_start"`
	HackEnd          *time.Time        `json:"hack_end"`
	RepoPath         string            `json:"repo_path"`
	Plan             map[string]string `json:"plan"`
	Steps            map[string]string `json:"steps"`
	CreatedAt        time.Time         `json:"created_at"`
	UpdatedAt        time.Time         `json:"updated_at"`
}

// ProjectSummary is a project plus the few numbers the dashboard shows.
type ProjectSummary struct {
	Project
	TasksTotal    int     `json:"tasks_total"`
	TasksDone     int     `json:"tasks_done"`
	OpenObstacles int     `json:"open_obstacles"`
	LastLogDay    *string `json:"last_log_day"`
	FocusTask     *string `json:"focus_task"`
}

type Story struct {
	ID        int64     `json:"id"`
	ProjectID int64     `json:"project_id"`
	Text      string    `json:"text"`
	Tier      string    `json:"tier"`
	Position  float64   `json:"position"`
	CreatedAt time.Time `json:"created_at"`
}

type PlanItem struct {
	ID        int64           `json:"id"`
	ProjectID int64           `json:"project_id"`
	Kind      string          `json:"kind"`
	Data      json.RawMessage `json:"data"`
	Position  float64         `json:"position"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

type Milestone struct {
	ID        int64      `json:"id"`
	ProjectID int64      `json:"project_id"`
	Title     string     `json:"title"`
	DueAt     *time.Time `json:"due_at"`
	Position  float64    `json:"position"`
	Origin    string     `json:"origin"`
	CreatedAt time.Time  `json:"created_at"`
}

type ChecklistItem struct {
	Text string `json:"text"`
	Done bool   `json:"done"`
}

type Task struct {
	ID          int64           `json:"id"`
	ProjectID   int64           `json:"project_id"`
	MilestoneID *int64          `json:"milestone_id"`
	StoryID     *int64          `json:"story_id"`
	Title       string          `json:"title"`
	Notes       string          `json:"notes"`
	Status      string          `json:"status"`
	Scope       string          `json:"scope"`
	DueAt       *time.Time      `json:"due_at"`
	Position    float64         `json:"position"`
	Checklist   []ChecklistItem `json:"checklist"`
	Origin      string          `json:"origin"`
	CreatedAt   time.Time       `json:"created_at"`
	StartedAt   *time.Time      `json:"started_at"`
	DoneAt      *time.Time      `json:"done_at"`
}

type DailyLog struct {
	ID        int64     `json:"id"`
	ProjectID int64     `json:"project_id"`
	Day       string    `json:"day"` // YYYY-MM-DD in the user's local time
	Summary   string    `json:"summary"`
	Hours     *float64  `json:"hours"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Obstacle struct {
	ID         int64      `json:"id"`
	ProjectID  int64      `json:"project_id"`
	TaskID     *int64     `json:"task_id"`
	Title      string     `json:"title"`
	Kind       string     `json:"kind"`
	Attempts   int        `json:"attempts"`
	Approaches string     `json:"approaches"`
	Resolution string     `json:"resolution"`
	Status     string     `json:"status"`
	CreatedAt  time.Time  `json:"created_at"`
	ResolvedAt *time.Time `json:"resolved_at"`
}

type File struct {
	ID           int64     `json:"id"`
	ProjectID    int64     `json:"project_id"`
	Category     string    `json:"category"`
	Name         string    `json:"name"`
	Mime         string    `json:"mime"`
	OriginalSize int64     `json:"original_size"`
	StoredSize   int64     `json:"stored_size"`
	Compression  string    `json:"compression"`
	StorageKey   string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}
