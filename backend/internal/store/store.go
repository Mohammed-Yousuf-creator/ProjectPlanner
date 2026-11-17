// Package store is the data layer: the only code that talks SQL.
// It knows nothing about planning rules; it reads and writes rows.
package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
)

// ErrNotFound is returned when a row with the requested id does not exist.
var ErrNotFound = errors.New("not found")

// querier is satisfied by both *sql.DB and *sql.Tx, so every method works inside a transaction too.
type querier interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

type Store struct {
	db *sql.DB
	q  querier
}

func New(db *sql.DB) *Store { return &Store{db: db, q: db} }

// InTx runs fn with a Store bound to one transaction; it commits when fn returns nil.
func (s *Store) InTx(ctx context.Context, fn func(tx *Store) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := fn(&Store{db: s.db, q: tx}); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}

type scanner interface{ Scan(dest ...any) error }

func notFound(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

func affected(res sql.Result, err error) error {
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func toJSON(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return "null"
	}
	return string(b)
}
