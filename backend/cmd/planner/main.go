// Command planner runs the ProjectPlanner server: a JSON API plus (when built) the web UI.
//
//	planner            start the server
//	planner status     print the countdown and the current task (see status.go)
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
	"projectplanner/internal/backup"
	"projectplanner/internal/config"
	"projectplanner/internal/database"
	"projectplanner/internal/filestore"
	"projectplanner/internal/planner"
	"projectplanner/internal/store"
)

const usage = `ProjectPlanner

  planner                start the server (same as: planner serve)
  planner status         where am I? countdown, current task, next milestone
      --short            one line, for a shell prompt
      --json             the same facts as JSON
      --project N        a specific project (default: the project whose repository
                         folder you are in, else the one you touched last)
      --here             print nothing unless you are inside a linked repository
  planner help           this text

Shell prompt (bash):  PS1='$(planner status --short --here 2>/dev/null) '$PS1
`

func main() {
	log.SetFlags(log.Ltime)
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "status":
			os.Exit(runStatus(os.Args[2:]))
		case "help", "-h", "--help":
			os.Stdout.WriteString(usage)
			return
		case "serve":
		default:
			os.Stderr.WriteString("planner: unknown command " + os.Args[1] + "\n\n" + usage)
			os.Exit(2)
		}
	}
	serve()
}

func serve() {
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
	backups := &backup.Manager{
		Dir: cfg.BackupDir, DatabaseURL: cfg.DatabaseURL, UploadsDir: uploads,
		// A restored backup may come from an older version: bring it up to the current layout.
		AfterRestore: func(ctx context.Context) error { return database.Migrate(ctx, db) },
	}

	// The two-week rule does not depend on a browser tab being open: every 20 seconds, any
	// project whose planning time is up is moved into the build phase. The same tick keeps
	// PLAN.md in linked repositories current and closes tasks that a commit closed.
	go func() {
		ticker := time.NewTicker(20 * time.Second)
		defer ticker.Stop()
		for {
			svc.Sweep(ctx)
			svc.SyncRepositories(ctx)
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()

	// One automatic backup a day, if switched on (Settings on the projects page).
	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		defer ticker.Stop()
		for {
			dailyBackup(ctx, svc, backups)
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           api.New(svc, cfg.StaticDir, backups),
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

// dailyBackup writes today's automatic backup when backups are switched on and there is
// something to back up.
func dailyBackup(ctx context.Context, svc *planner.Service, backups *backup.Manager) {
	st := svc.Settings(ctx)
	if !st.BackupEnabled {
		backups.SetLastError(nil)
		return
	}
	projects, err := svc.ListProjects(ctx)
	if err != nil || len(projects) == 0 {
		return
	}
	made, err := backups.RunDaily(ctx, st.BackupKeep)
	backups.SetLastError(err)
	switch {
	case err != nil:
		log.Printf("automatic backup failed: %v", err)
	case made:
		log.Printf("automatic backup written to %s", backups.Dir)
	}
}
