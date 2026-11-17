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
	BackupDir   string // where backups are written and looked for
}

func Load() Config {
	for _, p := range []string{".env", filepath.Join("..", ".env")} {
		loadDotEnv(p)
	}
	cfg := Config{
		DatabaseURL: env("DATABASE_URL", defaultDatabaseURL),
		Addr:        env("PLANNER_ADDR", "127.0.0.1:8080"),
		DataDir:     env("PLANNER_DATA_DIR", ""),
		StaticDir:   env("PLANNER_STATIC_DIR", ""),
	}
	if cfg.DataDir == "" {
		cfg.DataDir = firstExistingParent("data")
	}
	if cfg.BackupDir = env("PLANNER_BACKUP_DIR", ""); cfg.BackupDir == "" {
		// Next to the data directory: ./backups when the data lives in ./data.
		cfg.BackupDir = filepath.Join(filepath.Dir(filepath.Clean(cfg.DataDir)), "backups")
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

// DatabaseURLForCLI finds the planner's database for commands that run from any directory
// (`planner status` in a shell prompt). It deliberately ignores a .env in the current directory
// and a plain DATABASE_URL in the environment: inside one of your own projects those belong to
// that project, not to the planner. It reads, in order: PLANNER_DATABASE_URL, the .env of the
// planner installation the executable belongs to, then the default.
func DatabaseURLForCLI() string {
	if v := strings.TrimSpace(os.Getenv("PLANNER_DATABASE_URL")); v != "" {
		return v
	}
	for _, path := range installEnvFiles() {
		vars := readDotEnv(path)
		if vars == nil {
			continue
		}
		if v := vars["PLANNER_DATABASE_URL"]; v != "" {
			return v
		}
		if v := vars["DATABASE_URL"]; v != "" {
			return v
		}
	}
	return defaultDatabaseURL
}

const defaultDatabaseURL = "postgres://planner:planner@127.0.0.1:5432/planner?sslmode=disable"

// installEnvFiles lists where the installation's .env can be: PLANNER_ENV_FILE if set, else
// beside the folder the executable is in (<repo>/bin/planner → <repo>/.env), following a symlink.
func installEnvFiles() []string {
	var out []string
	if v := strings.TrimSpace(os.Getenv("PLANNER_ENV_FILE")); v != "" {
		out = append(out, v)
	}
	if exe, err := os.Executable(); err == nil {
		if real, err := filepath.EvalSymlinks(exe); err == nil {
			exe = real
		}
		dir := filepath.Dir(exe)
		out = append(out, filepath.Join(dir, "..", ".env"), filepath.Join(dir, ".env"))
	}
	return out
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
	for key, val := range readDotEnv(path) {
		if _, set := os.LookupEnv(key); !set {
			os.Setenv(key, val)
		}
	}
}

// readDotEnv parses KEY=VALUE pairs from a file; nil when the file cannot be read.
func readDotEnv(path string) map[string]string {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	out := map[string]string{}
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
		if key != "" {
			out[key] = val
		}
	}
	return out
}
