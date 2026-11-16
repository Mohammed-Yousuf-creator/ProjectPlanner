package main

import (
	"database/sql"
	"encoding/json"
	"strings"
	"time"
)

// Project is the central hub record for a solo software project.
type Project struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	Description    string    `json:"description"`
	Type           string    `json:"type"`              // "standard" | "hackathon"
	Goal           string    `json:"goal"`              // why / who / value
	Status         string    `json:"status"`            // "planning" | "coding" | "done"
	CodingDeadline time.Time `json:"coding_deadline"`   // decision date + 14 days
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
	HackathonStart time.Time `json:"hackathon_start"`   // countdown start
	HackathonEnd   time.Time `json:"hackathon_end"`
	MVPOnly        bool      `json:"mvp_only"`          // hackathon MVP-only scope

	// Computed / read-only fields, populated by handlers.
	Overdue      bool   `json:"overdue"`           // coding deadline passed
	DaysLeft     int    `json:"days_left"`         // days until coding deadline
	CountdownSec int64  `json:"countdown_sec"`     // seconds until hackathon start (0 if none)
}

// UserStory is a non-technical user story (video1 step 2).
type UserStory struct {
	ID          string    `json:"id"`
	ProjectID   string    `json:"project_id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Priority    string    `json:"priority"`          // low | medium | high
	Status      string    `json:"status"`            // todo | in_progress | done
	StoryPoints int       `json:"story_points"`
	CreatedAt   time.Time `json:"created_at"`
}

// Task is a micro-task broken from a user story (video3 micro-challenges).
type Task struct {
	ID            string         `json:"id"`
	ProjectID     string         `json:"project_id"`
	UserStoryID   sql.NullString `json:"user_story_id"`
	Title         string         `json:"title"`
	Description   string         `json:"description"`
	Status        string         `json:"status"`            // todo | in_progress | done
	DueDate       sql.NullTime   `json:"due_date"`
	TimeBoxMin    int            `json:"time_box_min"`      // hackathon time-boxing
	CreatedAt     time.Time      `json:"created_at"`
}

// DataModel captures a data model (video1 step 3).
type DataModel struct {
	ID          string            `json:"id"`
	ProjectID   string            `json:"project_id"`
	Name        string            `json:"name"`
	Description string            `json:"description"`
	Fields      []DataModelField  `json:"fields"`
	CreatedAt   time.Time         `json:"created_at"`
}

type DataModelField struct {
	Name string `json:"name"`
	Type string `json:"type"` // e.g. string, int, bool, timestamp
}

// FileUpload metadata.
type FileUpload struct {
	ID             string    `json:"id"`
	ProjectID      string    `json:"project_id"`
	OriginalName   string    `json:"original_name"`
	StoredName     string    `json:"stored_name"`
	Path           string    `json:"path"`
	Size           int64     `json:"size"`               // original bytes
	CompressedSize int64     `json:"compressed_size"`    // stored bytes
	ContentType    string    `json:"content_type"`
	UploadedAt     time.Time `json:"uploaded_at"`
}

// DeadlineInfo describes the 14-day coding deadline state.
type DeadlineInfo struct {
	ProjectID   string    `json:"project_id"`
	Deadline    time.Time `json:"deadline"`
	Overdue     bool      `json:"overdue"`
	SecondsLeft int64     `json:"seconds_left"`
	DaysLeft    int       `json:"days_left"`
}

// HackathonCountdown is the live countdown clock for a hackathon project.
type HackathonCountdown struct {
	ProjectID   string    `json:"project_id"`
	Started     bool      `json:"started"`
	Start       time.Time `json:"start"`
	End         time.Time `json:"end"`
	SecondsLeft int64     `json:"seconds_left"`
	DaysLeft    int       `json:"days_left"`
	HoursLeft   int       `json:"hours_left"`
	MinutesLeft int       `json:"minutes_left"`
	Seconds     int       `json:"seconds"`
	MVPOnly     bool      `json:"mvp_only"`
}

func (p *Project) computeDerived() {
	now := time.Now()
	p.Overdue = now.After(p.CodingDeadline)
	d := now.Sub(p.CodingDeadline)
	if d < 0 {
		p.DaysLeft = int(-d.Hours()/24) + 1
	} else {
		p.DaysLeft = 0
	}
	if !p.HackathonStart.IsZero() {
		left := time.Until(p.HackathonStart)
		if left < 0 {
			left = 0
		}
		p.CountdownSec = int64(left.Seconds())
	}
}

func (h *HackathonCountdown) compute() {
	now := time.Now()
	h.Started = !h.Start.IsZero()
	if h.Started {
		left := time.Until(h.Start)
		if left < 0 {
			left = 0
		}
		h.SecondsLeft = int64(left.Seconds())
		totalSec := int(h.SecondsLeft)
		h.DaysLeft = totalSec / 86400
		totalSec %= 86400
		h.HoursLeft = totalSec / 3600
		totalSec %= 3600
		h.MinutesLeft = totalSec / 60
		h.Seconds = totalSec % 60
	}
}

func nullString(v string) sql.NullString {
	if v == "" {
		return sql.NullString{Valid: false}
	}
	return sql.NullString{String: v, Valid: true}
}

func nullTime(v time.Time) sql.NullTime {
	if v.IsZero() {
		return sql.NullTime{Valid: false}
	}
	return sql.NullTime{Time: v, Valid: true}
}

// parseTime accepts RFC3339 (with Z/offset) or a datetime-local string
// (YYYY-MM-DDTHH:MM) interpreted as local time. Returns zero time if unparsable.
func parseTime(s string) time.Time {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}
	}
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05.999999999Z07:00",
		"2006-01-02T15:04:05Z07:00",
		"2006-01-02T15:04", // datetime-local
	}
	for _, layout := range layouts {
		if t, err := time.ParseInLocation(layout, s, time.Local); err == nil {
			return t
		}
	}
	return time.Time{}
}

func marshalFields(fields []DataModelField) ([]byte, error) {
	return json.Marshal(fields)
}

func unmarshalFields(data []byte) ([]DataModelField, error) {
	var f []DataModelField
	if len(data) == 0 {
		return f, nil
	}
	err := json.Unmarshal(data, &f)
	return f, err
}
