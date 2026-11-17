// Package config reads the handful of settings the server needs.
// Values come from the environment; a .env file in the working directory (or one level up)
// is loaded first so a plain `go run` works without exporting anything.
package config

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

type Config struct {
	DatabaseURL string // Postgres connection string
	Addr        string // host:port the HTTP server listens on
	DataDir     string // where uploaded files are stored (compressed)
	StaticDir   string // built frontend to serve; empty = API only
}

func Load() Config {
	for _, p := range []string{".env", filepath.Join("..", ".env")} {
		loadDotEnv(p)
	}
	cfg := Config{
		DatabaseURL: env("DATABASE_URL", "postgres://planner:planner@127.0.0.1:5432/planner?sslmode=disable"),
		Addr:        env("PLANNER_ADDR", "127.0.0.1:8080"),
		DataDir:     env("PLANNER_DATA_DIR", ""),
		StaticDir:   env("PLANNER_STATIC_DIR", ""),
	}
	if cfg.DataDir == "" {
		cfg.DataDir = firstExistingParent("data")
	}
	if cfg.StaticDir == "" {
		// Works from the repo root and from ./backend.
		for _, p := range []string{filepath.Join("frontend", "dist"), filepath.Join("..", "frontend", "dist")} {
			if st, err := os.Stat(filepath.Join(p, "index.html")); err == nil && !st.IsDir() {
				cfg.StaticDir = p
				break
			}
		}
	}
	return cfg
}

// firstExistingParent keeps the data directory at the repository root no matter whether the
// server is started from the root or from ./backend.
func firstExistingParent(name string) string {
	if _, err := os.Stat("go.mod"); err == nil {
		if _, err := os.Stat(filepath.Join("..", "frontend")); err == nil {
			return filepath.Join("..", name)
		}
	}
	return name
}

func env(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

// loadDotEnv sets KEY=VALUE pairs from a file without overriding real environment variables.
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		key, val, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		val = strings.Trim(strings.TrimSpace(val), `"'`)
		if _, set := os.LookupEnv(key); !set && key != "" {
			os.Setenv(key, val)
		}
	}
}
