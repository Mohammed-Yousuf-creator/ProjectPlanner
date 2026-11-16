package main

import (
	"bytes"
	"database/sql"
	"os"
	"path/filepath"
)

// initSchema runs the on-disk migration SQL against the database.
// This keeps the database local to the user's computer and requires no
// external provisioning service (video4: external vendors are optional).
func initSchema(db *sql.DB) error {
	migrationPath := filepath.Join("backend", "migrations", "0001_initial.sql")
	if override := os.Getenv("MIGRATION_PATH"); override != "" {
		migrationPath = override
	}
	data, err := os.ReadFile(migrationPath)
	if err != nil {
		return err
	}
	// Split on ";" and execute each statement naively (migration is DDL-only).
	for _, stmt := range bytes.Split(data, []byte(";")) {
		trimmed := bytes.TrimSpace(stmt)
		if len(trimmed) == 0 {
			continue
		}
		if _, err := db.Exec(string(trimmed)); err != nil {
			return err
		}
	}
	return nil
}
