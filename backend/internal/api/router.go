// Package api is the controller layer: it maps HTTP requests onto the planner service and
// turns results into JSON. It contains no planning rules and no SQL.
package api

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"projectplanner/internal/planner"
)

type Server struct {
	svc       *planner.Service
	staticDir string
}

func New(svc *planner.Service, staticDir string) http.Handler {
	s := &Server{svc: svc, staticDir: staticDir}
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", s.health)
	mux.HandleFunc("GET /api/meta", s.meta)

	// Projects and their lifecycle.
	mux.HandleFunc("GET /api/projects", s.listProjects)
	mux.HandleFunc("POST /api/projects", s.createProject)
	mux.HandleFunc("GET /api/projects/{id}", s.getProject)
	mux.HandleFunc("PATCH /api/projects/{id}", s.patchProject)
	mux.HandleFunc("DELETE /api/projects/{id}", s.deleteProject)
	mux.HandleFunc("POST /api/projects/{id}/start-build", s.startBuild)
	mux.HandleFunc("POST /api/projects/{id}/ship", s.ship)
	mux.HandleFunc("POST /api/projects/{id}/generate", s.generate)
	mux.HandleFunc("GET /api/projects/{id}/git", s.git)
	mux.HandleFunc("GET /api/projects/{id}/export.md", s.export)

	// Blueprint.
	mux.HandleFunc("PUT /api/projects/{id}/plan", s.savePlan)
	mux.HandleFunc("PUT /api/projects/{id}/steps/{key}", s.setStep)
	mux.HandleFunc("POST /api/projects/{id}/stories", s.createStory)
	mux.HandleFunc("PATCH /api/stories/{id}", s.updateStory)
	mux.HandleFunc("DELETE /api/stories/{id}", s.deleteStory)
	mux.HandleFunc("POST /api/projects/{id}/items", s.createItem)
	mux.HandleFunc("PATCH /api/items/{id}", s.updateItem)
	mux.HandleFunc("DELETE /api/items/{id}", s.deleteItem)

	// Build hub.
	mux.HandleFunc("POST /api/projects/{id}/milestones", s.createMilestone)
	mux.HandleFunc("PATCH /api/milestones/{id}", s.updateMilestone)
	mux.HandleFunc("DELETE /api/milestones/{id}", s.deleteMilestone)
	mux.HandleFunc("POST /api/projects/{id}/tasks", s.createTask)
	mux.HandleFunc("PATCH /api/tasks/{id}", s.updateTask)
	mux.HandleFunc("DELETE /api/tasks/{id}", s.deleteTask)
	mux.HandleFunc("PUT /api/projects/{id}/logs/{day}", s.saveLog)
	mux.HandleFunc("DELETE /api/projects/{id}/logs/{day}", s.deleteLog)
	mux.HandleFunc("POST /api/projects/{id}/obstacles", s.createObstacle)
	mux.HandleFunc("PATCH /api/obstacles/{id}", s.updateObstacle)
	mux.HandleFunc("DELETE /api/obstacles/{id}", s.deleteObstacle)

	// Files.
	mux.HandleFunc("POST /api/projects/{id}/files", s.uploadFile)
	mux.HandleFunc("GET /api/files/{id}/content", s.fileContent)
	mux.HandleFunc("DELETE /api/files/{id}", s.deleteFile)

	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, "No such API endpoint.")
	})
	mux.HandleFunc("/", s.static)

	return recoverPanics(sameSiteOnly(mux))
}

// sameSiteOnly rejects state-changing requests that another website tries to make to this
// local server from the user's browser.
func sameSiteOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Header.Get("Sec-Fetch-Site") == "cross-site" {
			writeError(w, http.StatusForbidden, "Cross-site requests are not allowed.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func recoverPanics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("panic in %s %s: %v", r.Method, r.URL.Path, rec)
				writeError(w, http.StatusInternalServerError, "Something went wrong on the server. Check the server log.")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// static serves the built frontend. Unknown paths get index.html so client-side routes work
// on reload.
func (s *Server) static(w http.ResponseWriter, r *http.Request) {
	if s.staticDir == "" {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte("ProjectPlanner API is running, but the frontend has not been built.\n" +
			"Run `make build` (or `cd frontend && npm install && npm run build`) and restart,\n" +
			"or use the dev server: `cd frontend && npm run dev`.\n"))
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}
	clean := filepath.Clean("/" + r.URL.Path)
	path := filepath.Join(s.staticDir, filepath.FromSlash(clean))
	if st, err := os.Stat(path); err == nil && !st.IsDir() {
		if strings.HasPrefix(clean, "/assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		http.ServeFile(w, r, path)
		return
	}
	if strings.HasPrefix(clean, "/assets/") {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "no-cache")
	http.ServeFile(w, r, filepath.Join(s.staticDir, "index.html"))
}
