package api

import (
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"

	"projectplanner/internal/filestore"
	"projectplanner/internal/model"
	"projectplanner/internal/planner"
)

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) meta(w http.ResponseWriter, r *http.Request) {
	meta, err := s.svc.Meta(r.Context())
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, meta)
}

// ---------- projects ----------

func (s *Server) listProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := s.svc.ListProjects(r.Context())
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, projects)
}

func (s *Server) createProject(w http.ResponseWriter, r *http.Request) {
	var in planner.CreateProjectInput
	if err := decode(w, r, &in); err != nil {
		fail(w, r, err)
		return
	}
	p, err := s.svc.CreateProject(r.Context(), in)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, p)
}

func (s *Server) getProject(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, r, err)
		return
	}
	bundle, err := s.svc.Bundle(r.Context(), id)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, bundle)
}

func (s *Server) patchProject(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, r, err)
		return
	}
	var in planner.ProjectPatch
	if err := decode(w, r, &in); err != nil {
		fail(w, r, err)
		return
	}
	p, err := s.svc.PatchProject(r.Context(), id, in)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (s *Server) deleteProject(w http.ResponseWriter, r *http.Request) {
	s.byID(w, r, s.svc.DeleteProject)
}

func (s *Server) startBuild(w http.ResponseWriter, r *http.Request) {
	s.byID(w, r, s.svc.StartBuild)
}

func (s *Server) ship(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, r, err)
		return
	}
	in := struct {
		Shipped *bool `json:"shipped"`
	}{}
	if err := decode(w, r, &in); err != nil {
		fail(w, r, err)
		return
	}
	shipped := in.Shipped == nil || *in.Shipped
	if err := s.svc.Ship(r.Context(), id, shipped); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) generate(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, r, err)
		return
	}
	created, err := s.svc.Generate(r.Context(), id)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"created": created})
}

func (s *Server) git(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, r, err)
		return
	}
	info, err := s.svc.Git(r.Context(), id)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (s *Server) export(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, r, err)
		return
	}
	name, body, err := s.svc.ExportMarkdown(r.Context(), id)
	if err != nil {
		fail(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
	w.Header().Set("Content-Disposition", contentDisposition("attachment", name))
	w.Write([]byte(body))
}

// ---------- blueprint ----------

func (s *Server) savePlan(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, r, err)
		return
	}
	var fields map[string]string
	if err := decode(w, r, &fields); err != nil {
		fail(w, r, err)
		return
	}
	if err := s.svc.SavePlan(r.Context(), id, fields); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) setStep(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, r, err)
		return
	}
	in := struct {
		Status string `json:"status"`
	}{}
	if err := decode(w, r, &in); err != nil {
		fail(w, r, err)
		return
	}
	if err := s.svc.SetStep(r.Context(), id, r.PathValue("key"), in.Status); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) createStory(w http.ResponseWriter, r *http.Request) {
	create(s, w, r, s.svc.CreateStory)
}
func (s *Server) updateStory(w http.ResponseWriter, r *http.Request) {
	update(s, w, r, s.svc.UpdateStory)
}
func (s *Server) deleteStory(w http.ResponseWriter, r *http.Request) { s.byID(w, r, s.svc.DeleteStory) }

func (s *Server) createItem(w http.ResponseWriter, r *http.Request) {
	create(s, w, r, s.svc.CreateItem)
}
func (s *Server) updateItem(w http.ResponseWriter, r *http.Request) {
	update(s, w, r, s.svc.UpdateItem)
}
func (s *Server) deleteItem(w http.ResponseWriter, r *http.Request) { s.byID(w, r, s.svc.DeleteItem) }

// ---------- build hub ----------

func (s *Server) createMilestone(w http.ResponseWriter, r *http.Request) {
	create(s, w, r, s.svc.CreateMilestone)
}
func (s *Server) updateMilestone(w http.ResponseWriter, r *http.Request) {
	update(s, w, r, s.svc.UpdateMilestone)
}
func (s *Server) deleteMilestone(w http.ResponseWriter, r *http.Request) {
	s.byID(w, r, s.svc.DeleteMilestone)
}

func (s *Server) createTask(w http.ResponseWriter, r *http.Request) {
	create(s, w, r, s.svc.CreateTask)
}
func (s *Server) updateTask(w http.ResponseWriter, r *http.Request) {
	update(s, w, r, s.svc.UpdateTask)
}
func (s *Server) deleteTask(w http.ResponseWriter, r *http.Request) { s.byID(w, r, s.svc.DeleteTask) }

func (s *Server) createObstacle(w http.ResponseWriter, r *http.Request) {
	create(s, w, r, s.svc.CreateObstacle)
}
func (s *Server) updateObstacle(w http.ResponseWriter, r *http.Request) {
	update(s, w, r, s.svc.UpdateObstacle)
}
func (s *Server) deleteObstacle(w http.ResponseWriter, r *http.Request) {
	s.byID(w, r, s.svc.DeleteObstacle)
}

func (s *Server) saveLog(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, r, err)
		return
	}
	var in model.DailyLog
	if err := decode(w, r, &in); err != nil {
		fail(w, r, err)
		return
	}
	saved, err := s.svc.SaveLog(r.Context(), id, r.PathValue("day"), in)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

func (s *Server) deleteLog(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, r, err)
		return
	}
	if err := s.svc.DeleteLog(r.Context(), id, r.PathValue("day")); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---------- files ----------

// uploadFile accepts one multipart file of at most 10 MB. The limit is enforced while the
// request is being read, so an oversized upload is cut off instead of being buffered.
func (s *Server) uploadFile(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, r, err)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, filestore.MaxUploadBytes+(1<<20)) // + room for multipart framing
	reader, err := r.MultipartReader()
	if err != nil {
		writeError(w, http.StatusBadRequest, "Send the file as multipart/form-data in a field named \"file\".")
		return
	}
	var (
		category, name string
		data           []byte
		gotFile        bool
	)
	for {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			fail(w, r, uploadError(err))
			return
		}
		switch part.FormName() {
		case "category":
			b, _ := io.ReadAll(io.LimitReader(part, 64))
			category = strings.TrimSpace(string(b))
		case "file":
			name = part.FileName()
			if data, err = filestore.ReadLimited(part); err != nil {
				fail(w, r, uploadError(err))
				return
			}
			gotFile = true
		}
		part.Close()
	}
	if !gotFile {
		writeError(w, http.StatusBadRequest, "No file was sent. Use a form field named \"file\".")
		return
	}
	f, err := s.svc.SaveFile(r.Context(), id, name, category, data)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, f)
}

func uploadError(err error) error {
	var tooBig *http.MaxBytesError
	if errors.As(err, &tooBig) {
		return filestore.ErrTooLarge
	}
	if errors.Is(err, filestore.ErrTooLarge) {
		return err
	}
	return &planner.InvalidError{Msg: "The upload was interrupted or malformed. Try again."}
}

// inlineTypes may be shown in the browser. Everything else (HTML, SVG, ...) is forced to
// download so an uploaded file can never run script in this app's origin.
var inlineTypes = map[string]bool{
	"image/png": true, "image/jpeg": true, "image/gif": true, "image/webp": true,
	"application/pdf": true, "text/plain": true,
}

func (s *Server) fileContent(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, r, err)
		return
	}
	f, content, err := s.svc.OpenFile(r.Context(), id)
	if err != nil {
		fail(w, r, err)
		return
	}
	defer content.Close()

	base, _, _ := mime.ParseMediaType(f.Mime)
	disposition := "attachment"
	if inlineTypes[base] && r.URL.Query().Get("download") == "" {
		disposition = "inline"
	}
	w.Header().Set("Content-Type", f.Mime)
	w.Header().Set("Content-Length", fmt.Sprint(f.OriginalSize))
	w.Header().Set("Content-Disposition", contentDisposition(disposition, f.Name))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox")
	w.Header().Set("Cache-Control", "private, max-age=3600")
	if _, err := io.Copy(w, content); err != nil {
		// The client went away mid-download; nothing useful to report.
		return
	}
}

func (s *Server) deleteFile(w http.ResponseWriter, r *http.Request) { s.byID(w, r, s.svc.DeleteFile) }

func contentDisposition(kind, name string) string {
	ascii := strings.Map(func(r rune) rune {
		if r < 32 || r > 126 || r == '"' || r == '\\' {
			return '_'
		}
		return r
	}, name)
	return fmt.Sprintf(`%s; filename="%s"; filename*=UTF-8''%s`, kind, ascii, url.PathEscape(name))
}
