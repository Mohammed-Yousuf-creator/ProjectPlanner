package main

import (
	"database/sql"
	"net/http"
	"strings"
	"time"
)

// =====================================================================
// Projects
// =====================================================================

type createProjectRequest struct {
	Name          string `json:"name"`
	Description   string `json:"description"`
	Type          string `json:"type"`           // standard | hackathon
	Goal          string `json:"goal"`           // why / who / value
	MVPOnly       bool   `json:"mvp_only"`       // hackathon MVP-only scope
	HackathonStart string `json:"hackathon_start"` // RFC3339 or datetime-local
	HackathonEnd   string `json:"hackathon_end"`   // RFC3339 or datetime-local
}

func handleListProjects(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.Query(`SELECT id, name, description, type, goal, status, coding_deadline,
			created_at, updated_at, hackathon_start, hackathon_end, mvp_only
		 FROM projects ORDER BY created_at DESC`)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		defer rows.Close()
		var out []Project
		for rows.Next() {
			var p Project
			var hs, he sql.NullTime
			if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.Type, &p.Goal, &p.Status,
				&p.CodingDeadline, &p.CreatedAt, &p.UpdatedAt, &hs, &he, &p.MVPOnly); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			if hs.Valid {
				p.HackathonStart = hs.Time
			}
			if he.Valid {
				p.HackathonEnd = he.Time
			}
			p.computeDerived()
			out = append(out, p)
		}
		if out == nil {
			out = []Project{}
		}
		writeJSON(w, http.StatusOK, out)
	}
}

func handleGetProject(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := Params(r)
		id := params["id"]
		var p Project
		var hs, he sql.NullTime
		err := db.QueryRow(`SELECT id, name, description, type, goal, status, coding_deadline,
			created_at, updated_at, hackathon_start, hackathon_end, mvp_only
		 FROM projects WHERE id = $1`, id).
			Scan(&p.ID, &p.Name, &p.Description, &p.Type, &p.Goal, &p.Status, &p.CodingDeadline,
				&p.CreatedAt, &p.UpdatedAt, &hs, &he, &p.MVPOnly)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "project not found"})
			return
		}
		if hs.Valid {
			p.HackathonStart = hs.Time
		}
		if he.Valid {
			p.HackathonEnd = he.Time
		}
		p.computeDerived()
		writeJSON(w, http.StatusOK, p)
	}
}

func handleCreateProject(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req createProjectRequest
		if err := readJSON(r, &req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if strings.TrimSpace(req.Name) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
			return
		}
		ptype := strings.ToLower(strings.TrimSpace(req.Type))
		if ptype != "standard" && ptype != "hackathon" {
			ptype = "standard"
		}
		id, err := newID()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "cannot generate id"})
			return
		}
		now := time.Now()
		deadline := now.Add(14 * 24 * time.Hour) // decision date + 14 days (video2 anti-doom-perfectionist)

		var hs, he sql.NullTime
		if t := parseTime(req.HackathonStart); !t.IsZero() {
			hs = sql.NullTime{Time: t, Valid: true}
		}
		if t := parseTime(req.HackathonEnd); !t.IsZero() {
			he = sql.NullTime{Time: t, Valid: true}
		}

		const q = `INSERT INTO projects
			(id, name, description, type, goal, status, coding_deadline, created_at, updated_at,
			 hackathon_start, hackathon_end, mvp_only)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`
		if _, err := db.Exec(q, id, req.Name, req.Description, ptype, req.Goal, "planning",
			deadline, now, now, hs, he, req.MVPOnly); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		p := Project{
			ID:             id,
			Name:           req.Name,
			Description:    req.Description,
			Type:           ptype,
			Goal:           req.Goal,
			Status:         "planning",
			CodingDeadline: deadline,
			CreatedAt:      now,
			UpdatedAt:      now,
			MVPOnly:        req.MVPOnly,
			HackathonStart: hs.Time,
			HackathonEnd:   he.Time,
		}
		p.computeDerived()
		writeJSON(w, http.StatusCreated, p)
	}
}

func handleUpdateProject(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := Params(r)
		id := params["id"]
		var req createProjectRequest
		if err := readJSON(r, &req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		ptype := strings.ToLower(strings.TrimSpace(req.Type))
		if ptype != "standard" && ptype != "hackathon" {
			ptype = "standard"
		}
		now := time.Now()
		const q = `UPDATE projects SET name=$1, description=$2, type=$3, goal=$4,
			updated_at=$5, hackathon_start=$6, hackathon_end=$7, mvp_only=$8 WHERE id=$9`
		var hs, he sql.NullTime
		if t := parseTime(req.HackathonStart); !t.IsZero() {
			hs = sql.NullTime{Time: t, Valid: true}
		}
		if t := parseTime(req.HackathonEnd); !t.IsZero() {
			he = sql.NullTime{Time: t, Valid: true}
		}
		if _, err := db.Exec(q, req.Name, req.Description, ptype, req.Goal, now, hs, he, req.MVPOnly, id); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
	}
}

func handleDeleteProject(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := Params(r)
		id := params["id"]
		if _, err := db.Exec(`DELETE FROM projects WHERE id = $1`, id); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// =====================================================================
// Deadline (14-day coding deadline) & hackathon countdown
// =====================================================================

func handleDeadline(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := Params(r)
		id := params["id"]
		var p Project
		if err := db.QueryRow(`SELECT coding_deadline FROM projects WHERE id = $1`, id).
			Scan(&p.CodingDeadline); err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "project not found"})
			return
		}
		info := DeadlineInfo{ProjectID: id, Deadline: p.CodingDeadline}
		now := time.Now()
		info.Overdue = now.After(p.CodingDeadline)
		left := time.Until(p.CodingDeadline)
		if left < 0 {
			left = 0
			info.DaysLeft = 0
		} else {
			info.SecondsLeft = int64(left.Seconds())
			info.DaysLeft = int(left.Hours()/24) + 1
		}
		writeJSON(w, http.StatusOK, info)
	}
}

func handleHackathonCountdown(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := Params(r)
		id := params["id"]
		var p Project
		var hs, he sql.NullTime
		if err := db.QueryRow(`SELECT hackathon_start, hackathon_end, mvp_only FROM projects WHERE id = $1`, id).
			Scan(&hs, &he, &p.MVPOnly); err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "project not found"})
			return
		}
		h := HackathonCountdown{ProjectID: id, MVPOnly: p.MVPOnly}
		if hs.Valid {
			h.Start = hs.Time
		}
		if he.Valid {
			h.End = he.Time
		}
		h.compute()
		writeJSON(w, http.StatusOK, h)
	}
}

// =====================================================================
// User stories
// =====================================================================

type createStoryRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Priority    string `json:"priority"`
	StoryPoints int    `json:"story_points"`
}

func handleListStories(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := Params(r)
		rows, err := db.Query(`SELECT id, project_id, title, description, priority, status, story_points, created_at
		 FROM user_stories WHERE project_id = $1 ORDER BY created_at`, params["id"])
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		defer rows.Close()
		var out []UserStory
		for rows.Next() {
			var s UserStory
			if err := rows.Scan(&s.ID, &s.ProjectID, &s.Title, &s.Description, &s.Priority, &s.Status, &s.StoryPoints, &s.CreatedAt); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			out = append(out, s)
		}
		if out == nil {
			out = []UserStory{}
		}
		writeJSON(w, http.StatusOK, out)
	}
}

func handleCreateStory(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := Params(r)
		var req createStoryRequest
		if err := readJSON(r, &req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if strings.TrimSpace(req.Title) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "title is required"})
			return
		}
		priority := strings.ToLower(strings.TrimSpace(req.Priority))
		if priority != "low" && priority != "medium" && priority != "high" {
			priority = "medium"
		}
		id, err := newID()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "cannot generate id"})
			return
		}
		now := time.Now()
		const q = `INSERT INTO user_stories (id, project_id, title, description, priority, status, story_points, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`
		if _, err := db.Exec(q, id, params["id"], req.Title, req.Description, priority, "todo", req.StoryPoints, now); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusCreated, UserStory{ID: id, ProjectID: params["id"], Title: req.Title, Description: req.Description, Priority: priority, Status: "todo", StoryPoints: req.StoryPoints, CreatedAt: now})
	}
}

func handleUpdateStory(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := Params(r)
		var req createStoryRequest
		if err := readJSON(r, &req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		const q = `UPDATE user_stories SET title=$1, description=$2, priority=$3, story_points=$4 WHERE id=$5`
		if _, err := db.Exec(q, req.Title, req.Description, req.Priority, req.StoryPoints, params["id"]); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
	}
}

func handleDeleteStory(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := Params(r)
		if _, err := db.Exec(`DELETE FROM user_stories WHERE id = $1`, params["id"]); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// =====================================================================
// Tasks
// =====================================================================

type createTaskRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	UserStoryID string `json:"user_story_id"`
	DueDate     string `json:"due_date"`
	TimeBoxMin  int    `json:"time_box_min"`
}

func handleListTasks(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := Params(r)
		rows, err := db.Query(`SELECT id, project_id, user_story_id, title, description, status, due_date, time_box_min, created_at
		 FROM tasks WHERE project_id = $1 ORDER BY created_at`, params["id"])
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		defer rows.Close()
		var out []Task
		for rows.Next() {
			var t Task
			var us sql.NullString
			var dd sql.NullTime
			if err := rows.Scan(&t.ID, &t.ProjectID, &us, &t.Title, &t.Description, &t.Status, &dd, &t.TimeBoxMin, &t.CreatedAt); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			t.UserStoryID = us
			t.DueDate = dd
			out = append(out, t)
		}
		if out == nil {
			out = []Task{}
		}
		writeJSON(w, http.StatusOK, out)
	}
}

func handleCreateTask(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := Params(r)
		var req createTaskRequest
		if err := readJSON(r, &req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if strings.TrimSpace(req.Title) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "title is required"})
			return
		}
		id, err := newID()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "cannot generate id"})
			return
		}
		now := time.Now()
		var dd sql.NullTime
		if t := parseTime(req.DueDate); !t.IsZero() {
			dd = sql.NullTime{Time: t, Valid: true}
		}
		const q = `INSERT INTO tasks (id, project_id, user_story_id, title, description, status, due_date, time_box_min, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`
		if _, err := db.Exec(q, id, params["id"], nullString(req.UserStoryID), req.Title, req.Description, "todo", dd, req.TimeBoxMin, now); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusCreated, Task{ID: id, ProjectID: params["id"], UserStoryID: nullString(req.UserStoryID), Title: req.Title, Description: req.Description, Status: "todo", DueDate: dd, TimeBoxMin: req.TimeBoxMin, CreatedAt: now})
	}
}

func handleUpdateTask(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := Params(r)
		var req createTaskRequest
		if err := readJSON(r, &req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		var dd sql.NullTime
		if t := parseTime(req.DueDate); !t.IsZero() {
			dd = sql.NullTime{Time: t, Valid: true}
		}
		const q = `UPDATE tasks SET title=$1, description=$2, user_story_id=$3, due_date=$4, time_box_min=$5 WHERE id=$6`
		if _, err := db.Exec(q, req.Title, req.Description, nullString(req.UserStoryID), dd, req.TimeBoxMin, params["id"]); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
	}
}

func handleDeleteTask(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := Params(r)
		if _, err := db.Exec(`DELETE FROM tasks WHERE id = $1`, params["id"]); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// =====================================================================
// Data models
// =====================================================================

type createDataModelRequest struct {
	Name        string             `json:"name"`
	Description string             `json:"description"`
	Fields      []DataModelField   `json:"fields"`
}

func handleListDataModels(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := Params(r)
		rows, err := db.Query(`SELECT id, project_id, name, description, fields, created_at
		 FROM data_models WHERE project_id = $1 ORDER BY created_at`, params["id"])
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		defer rows.Close()
		var out []DataModel
		for rows.Next() {
			var m DataModel
			var raw []byte
			if err := rows.Scan(&m.ID, &m.ProjectID, &m.Name, &m.Description, &raw, &m.CreatedAt); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			m.Fields, _ = unmarshalFields(raw)
			out = append(out, m)
		}
		if out == nil {
			out = []DataModel{}
		}
		writeJSON(w, http.StatusOK, out)
	}
}

func handleCreateDataModel(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := Params(r)
		var req createDataModelRequest
		if err := readJSON(r, &req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if strings.TrimSpace(req.Name) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
			return
		}
		id, err := newID()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "cannot generate id"})
			return
		}
		now := time.Now()
		raw, err := marshalFields(req.Fields)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid fields"})
			return
		}
		const q = `INSERT INTO data_models (id, project_id, name, description, fields, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`
		if _, err := db.Exec(q, id, params["id"], req.Name, req.Description, raw, now); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusCreated, DataModel{ID: id, ProjectID: params["id"], Name: req.Name, Description: req.Description, Fields: req.Fields, CreatedAt: now})
	}
}

func handleUpdateDataModel(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := Params(r)
		var req createDataModelRequest
		if err := readJSON(r, &req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		raw, err := marshalFields(req.Fields)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid fields"})
			return
		}
		const q = `UPDATE data_models SET name=$1, description=$2, fields=$3 WHERE id=$4`
		if _, err := db.Exec(q, req.Name, req.Description, raw, params["id"]); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
	}
}

func handleDeleteDataModel(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := Params(r)
		if _, err := db.Exec(`DELETE FROM data_models WHERE id = $1`, params["id"]); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// =====================================================================
// Health
// =====================================================================

func handleHealth(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := db.Ping(); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "db_unreachable", "error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}
