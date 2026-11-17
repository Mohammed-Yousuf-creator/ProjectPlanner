package api

import (
	"context"
	"net/http"
)

// Most child resources (stories, tasks, milestones, ...) share three request shapes.
// These helpers implement each shape once.

// create handles POST /api/projects/{id}/<things>: decode a T, hand it to the service.
func create[T any](s *Server, w http.ResponseWriter, r *http.Request,
	fn func(ctx context.Context, projectID int64, in T) (T, error)) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, r, err)
		return
	}
	var in T
	if err := decode(w, r, &in); err != nil {
		fail(w, r, err)
		return
	}
	out, err := fn(r.Context(), id, in)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

// update handles PATCH /api/<things>/{id}: the service applies the raw JSON patch.
func update[T any](s *Server, w http.ResponseWriter, r *http.Request,
	fn func(ctx context.Context, id int64, patch []byte) (T, error)) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, r, err)
		return
	}
	body, err := readBody(w, r)
	if err != nil {
		fail(w, r, err)
		return
	}
	out, err := fn(r.Context(), id, body)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// byID handles requests that act on one id and return nothing (DELETE, start-build).
func (s *Server) byID(w http.ResponseWriter, r *http.Request, fn func(ctx context.Context, id int64) error) {
	id, err := pathID(r, "id")
	if err != nil {
		fail(w, r, err)
		return
	}
	if err := fn(r.Context(), id); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
