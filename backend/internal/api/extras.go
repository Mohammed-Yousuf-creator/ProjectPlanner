package api

import (
	"errors"
	"io"
	"net/http"
	"os"

	"projectplanner/internal/backup"
	"projectplanner/internal/planner"
)

// ---------- settings, lessons, search, activity ----------

func (s *Server) getSettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.svc.Settings(r.Context()))
}

func (s *Server) putSettings(w http.ResponseWriter, r *http.Request) {
	var in planner.SettingsPatch
	if err := decode(w, r, &in); err != nil {
		fail(w, r, err)
		return
	}
	st, err := s.svc.UpdateSettings(r.Context(), in)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, st)
}

func (s *Server) lessons(w http.ResponseWriter, r *http.Request) {
	out, err := s.svc.Lessons(r.Context())
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) search(w http.ResponseWriter, r *http.Request) {
	hits, err := s.svc.Search(r.Context(), r.URL.Query().Get("q"))
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, hits)
}

func (s *Server) activity(w http.ResponseWriter, r *http.Request) {
	a, err := s.svc.Activity(r.Context())
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func (s *Server) alerts(w http.ResponseWriter, r *http.Request) {
	out, err := s.svc.Alerts(r.Context())
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// ---------- project file: export and import ----------

// exportArchive sends a whole project as one file. It is written to a temporary file first so
// a failure half-way produces an error instead of a truncated download.
func (s *Server) exportArchive(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, r, err)
		return
	}
	name, err := s.svc.ArchiveName(r.Context(), id)
	if err != nil {
		fail(w, r, err)
		return
	}
	tmp, err := os.CreateTemp("", "planner-export-*.zip")
	if err != nil {
		fail(w, r, err)
		return
	}
	defer os.Remove(tmp.Name())
	defer tmp.Close()
	if err := s.svc.ExportArchive(r.Context(), id, tmp); err != nil {
		fail(w, r, err)
		return
	}
	size, err := tmp.Seek(0, io.SeekCurrent)
	if err == nil {
		_, err = tmp.Seek(0, io.SeekStart)
	}
	if err != nil {
		fail(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Length", itoa(size))
	w.Header().Set("Content-Disposition", contentDisposition("attachment", name))
	io.Copy(w, tmp)
}

// importProject accepts an exported project file as the raw request body.
func (s *Server) importProject(w http.ResponseWriter, r *http.Request) {
	tmp, err := os.CreateTemp("", "planner-import-*.zip")
	if err != nil {
		fail(w, r, err)
		return
	}
	defer os.Remove(tmp.Name())
	defer tmp.Close()
	size, err := io.Copy(tmp, http.MaxBytesReader(w, r.Body, planner.MaxImportBytes))
	if err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeError(w, http.StatusRequestEntityTooLarge, "That project file is larger than 512 MB.")
			return
		}
		fail(w, r, &planner.InvalidError{Msg: "The upload was interrupted. Try again."})
		return
	}
	if size == 0 {
		fail(w, r, &planner.InvalidError{Msg: "No file was sent."})
		return
	}
	p, err := s.svc.ImportArchive(r.Context(), tmp, size)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, p)
}

func (s *Server) calendar(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, r, err)
		return
	}
	name, body, err := s.svc.ExportCalendar(r.Context(), id)
	if err != nil {
		fail(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("Content-Disposition", contentDisposition("attachment", name))
	w.Write([]byte(body))
}

// ---------- honesty: snapshot, picks, cut order, stuck timer ----------

func (s *Server) snapshot(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, r, err)
		return
	}
	view, err := s.svc.Snapshot(r.Context(), id)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

func (s *Server) status(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, r, err)
		return
	}
	st, err := s.svc.Status(r.Context(), id)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, st)
}

func (s *Server) ackBuild(w http.ResponseWriter, r *http.Request) { s.byID(w, r, s.svc.AckBuild) }

func (s *Server) setPicks(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, r, err)
		return
	}
	in := struct {
		TaskIDs []int64 `json:"task_ids"`
	}{}
	if err := decode(w, r, &in); err != nil {
		fail(w, r, err)
		return
	}
	if err := s.svc.SetPicks(r.Context(), id, r.PathValue("day"), in.TaskIDs); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) setCutOrder(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, r, err)
		return
	}
	in := struct {
		StoryIDs []int64 `json:"story_ids"`
	}{}
	if err := decode(w, r, &in); err != nil {
		fail(w, r, err)
		return
	}
	if err := s.svc.SetCutOrder(r.Context(), id, in.StoryIDs); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) cut(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, r, err)
		return
	}
	var in planner.CutInput
	if err := decode(w, r, &in); err != nil {
		fail(w, r, err)
		return
	}
	if err := s.svc.Cut(r.Context(), id, in); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) stuck(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, r, err)
		return
	}
	in := struct {
		Action   string `json:"action"`
		Approach string `json:"approach"`
	}{}
	if err := decode(w, r, &in); err != nil {
		fail(w, r, err)
		return
	}
	o, err := s.svc.StuckAction(r.Context(), id, in.Action, in.Approach)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, o)
}

// ---------- backups ----------

type backupList struct {
	Dir       string        `json:"dir"`
	Available bool          `json:"available"`  // the PostgreSQL client tools are installed
	Missing   string        `json:"missing"`    // which tools are not
	LastError string        `json:"last_error"` // why the last automatic backup failed
	Items     []backup.Info `json:"items"`
}

func (s *Server) backupsOrFail(w http.ResponseWriter) bool {
	if s.backups == nil {
		writeError(w, http.StatusServiceUnavailable, "Backups are not available in this setup.")
		return false
	}
	return true
}

func (s *Server) listBackups(w http.ResponseWriter, r *http.Request) {
	if !s.backupsOrFail(w) {
		return
	}
	items, err := s.backups.List()
	if err != nil {
		fail(w, r, err)
		return
	}
	missing := s.backups.Missing()
	writeJSON(w, http.StatusOK, backupList{Dir: absPath(s.backups.Dir), Available: missing == "", Missing: missing,
		LastError: s.backups.LastError(), Items: items})
}

func (s *Server) createBackup(w http.ResponseWriter, r *http.Request) {
	if !s.backupsOrFail(w) {
		return
	}
	info, err := s.backups.Create(r.Context(), "")
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "The backup failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, info)
}

func (s *Server) restoreBackup(w http.ResponseWriter, r *http.Request) {
	if !s.backupsOrFail(w) {
		return
	}
	safety, err := s.backups.Restore(r.Context(), r.PathValue("name"))
	switch {
	case errors.Is(err, backup.ErrBadName), errors.Is(err, os.ErrNotExist):
		writeError(w, http.StatusNotFound, "That backup does not exist.")
	case err != nil:
		writeError(w, http.StatusUnprocessableEntity, "Restore failed: "+err.Error())
	default:
		writeJSON(w, http.StatusOK, map[string]string{"safety_backup": safety})
	}
}

func (s *Server) deleteBackup(w http.ResponseWriter, r *http.Request) {
	if !s.backupsOrFail(w) {
		return
	}
	err := s.backups.Delete(r.PathValue("name"))
	switch {
	case errors.Is(err, backup.ErrBadName), errors.Is(err, os.ErrNotExist):
		writeError(w, http.StatusNotFound, "That backup does not exist.")
	case err != nil:
		fail(w, r, err)
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}
