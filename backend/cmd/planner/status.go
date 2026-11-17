package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	_ "github.com/lib/pq"

	"projectplanner/internal/config"
	"projectplanner/internal/filestore"
	"projectplanner/internal/planner"
	"projectplanner/internal/store"
)

// runStatus implements `planner status`. It reads the database directly, so it works whether
// or not the server is running, and it is quick enough to sit in a shell prompt. With --short
// it never prints an error: a prompt must not break because the database is down.
func runStatus(args []string) int {
	fs := flag.NewFlagSet("status", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	short := fs.Bool("short", false, "")
	asJSON := fs.Bool("json", false, "")
	project := fs.Int64("project", 0, "")
	here := fs.Bool("here", false, "")
	if err := fs.Parse(args); err != nil || fs.NArg() > 0 {
		os.Stderr.WriteString(usage)
		return 2
	}
	fail := func(format string, a ...any) int {
		if *short {
			return 0
		}
		fmt.Fprintf(os.Stderr, "planner: "+format+"\n", a...)
		return 1
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	db, err := sql.Open("postgres", config.DatabaseURLForCLI())
	if err != nil {
		return fail("%v", err)
	}
	defer db.Close()
	db.SetMaxOpenConns(2)
	if err := db.PingContext(ctx); err != nil {
		return fail("cannot reach the planner's database (is PostgreSQL running?): %v", err)
	}
	// Uploads are not touched by a status report; the file store only needs to exist.
	files, err := filestore.New(filepath.Join(os.TempDir(), "planner-status"))
	if err != nil {
		return fail("%v", err)
	}
	svc := planner.NewService(store.New(db), files)

	dir, _ := os.Getwd()
	if real, err := filepath.EvalSymlinks(dir); err == nil {
		dir = real
	}
	id, err := svc.StatusFor(ctx, *project, dir, *here)
	if err != nil {
		return fail("no such project (or the database is older than this program — start the server once): %v", err)
	}
	if id == 0 {
		if !*short && !*here {
			fmt.Println("No active project. Create one in the planner.")
		}
		return 0
	}
	st, err := svc.Status(ctx, id)
	if err != nil {
		return fail("%v", err)
	}
	switch {
	case *asJSON:
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		enc.Encode(st)
	case *short:
		fmt.Println(st.Line())
	default:
		fmt.Print(st.Text())
	}
	return 0
}
