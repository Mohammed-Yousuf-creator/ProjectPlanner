// Command planner runs the ProjectPlanner server: a JSON API plus (when built) the web UI.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"projectplanner/internal/api"
	"projectplanner/internal/config"
	"projectplanner/internal/database"
	"projectplanner/internal/filestore"
	"projectplanner/internal/planner"
	"projectplanner/internal/store"
)

func main() {
	log.SetFlags(log.Ltime)
	cfg := config.Load()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v\n\nIs Postgres running and was the database created? See README.md → \"Start the database\".", err)
	}
	defer db.Close()
	if err := database.Migrate(ctx, db); err != nil {
		log.Fatalf("migrations: %v", err)
	}

	uploads := filepath.Join(cfg.DataDir, "uploads")
	files, err := filestore.New(uploads)
	if err != nil {
		log.Fatalf("upload directory %s: %v", uploads, err)
	}

	svc := planner.NewService(store.New(db), files)

	// The two-week rule does not depend on a browser tab being open: every 20 seconds, any
	// project whose planning time is up is moved into the build phase.
	go func() {
		ticker := time.NewTicker(20 * time.Second)
		defer ticker.Stop()
		for {
			svc.Sweep(ctx)
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           api.New(svc, cfg.StaticDir),
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		srv.Shutdown(shutdownCtx)
	}()

	abs, _ := filepath.Abs(uploads)
	log.Printf("uploads are stored (compressed) in %s", abs)
	if cfg.StaticDir == "" {
		log.Printf("frontend build not found — serving the API only")
	}
	log.Printf("ProjectPlanner is running at http://%s", cfg.Addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("server: %v", err)
	}
}
