package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"time"

	_ "github.com/lib/pq"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = "postgres://postgres:postgres@localhost:5432/projectplanner?sslmode=disable"
	}

	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	// Wait for Postgres to become available (it may still be starting up).
	for i := 0; i < 30; i++ {
		if err := db.Ping(); err == nil {
			break
		}
		log.Printf("waiting for postgres... (%v)", err)
		time.Sleep(1 * time.Second)
	}
	if err := db.Ping(); err != nil {
		log.Fatalf("ping db: %v", err)
	}
	log.Println("connected to postgres")

	if err := initSchema(db); err != nil {
		log.Fatalf("init schema: %v", err)
	}
	log.Println("schema ready")

	rt := &router{}

	// Health
	rt.handle("GET", "/api/health", handleHealth(db))
	rt.handle("GET", "/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"service": "projectplanner", "status": "ok"})
	})

	// Projects
	rt.handle("GET", "/api/projects", handleListProjects(db))
	rt.handle("POST", "/api/projects", handleCreateProject(db))
	rt.handle("GET", "/api/projects/:id", handleGetProject(db))
	rt.handle("PUT", "/api/projects/:id", handleUpdateProject(db))
	rt.handle("DELETE", "/api/projects/:id", handleDeleteProject(db))

	// 14-day coding deadline & hackathon countdown
	rt.handle("GET", "/api/projects/:id/deadline", handleDeadline(db))
	rt.handle("GET", "/api/projects/:id/countdown", handleHackathonCountdown(db))

	// User stories
	rt.handle("GET", "/api/projects/:id/stories", handleListStories(db))
	rt.handle("POST", "/api/projects/:id/stories", handleCreateStory(db))
	rt.handle("PUT", "/api/stories/:id", handleUpdateStory(db))
	rt.handle("DELETE", "/api/stories/:id", handleDeleteStory(db))

	// Tasks
	rt.handle("GET", "/api/projects/:id/tasks", handleListTasks(db))
	rt.handle("POST", "/api/projects/:id/tasks", handleCreateTask(db))
	rt.handle("PUT", "/api/tasks/:id", handleUpdateTask(db))
	rt.handle("DELETE", "/api/tasks/:id", handleDeleteTask(db))

	// Data models
	rt.handle("GET", "/api/projects/:id/datamodels", handleListDataModels(db))
	rt.handle("POST", "/api/projects/:id/datamodels", handleCreateDataModel(db))
	rt.handle("PUT", "/api/datamodels/:id", handleUpdateDataModel(db))
	rt.handle("DELETE", "/api/datamodels/:id", handleDeleteDataModel(db))

	// File uploads (max 10 MB, gzip-compressed before local storage)
	rt.handle("GET", "/api/projects/:id/uploads", handleListUploads(db))
	rt.handle("POST", "/api/projects/:id/uploads", handleUpload(db))
	rt.handle("GET", "/api/uploads/:id/download", handleDownload(db))
	rt.handle("DELETE", "/api/uploads/:id", handleDeleteUpload(db))

	handler := enableCORS(rt)
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Printf("server listening on :%s", port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server: %v", err)
	}
}
