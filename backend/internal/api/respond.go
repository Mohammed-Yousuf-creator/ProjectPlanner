package api

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"net/http"
	"strconv"
	"strings"

	"github.com/lib/pq"

	"projectplanner/internal/filestore"
	"projectplanner/internal/planner"
	"projectplanner/internal/store"
)

const maxJSONBody = 1 << 20 // 1 MB is plenty for any form in this app

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if v != nil {
		if err := json.NewEncoder(w).Encode(v); err != nil {
			log.Printf("write response: %v", err)
		}
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// fail turns an error from the logic or data layer into the right HTTP response.
func fail(w http.ResponseWriter, r *http.Request, err error) {
	var invalid *planner.InvalidError
	var tooBig *http.MaxBytesError
	var pqErr *pq.Error
	switch {
	case errors.As(err, &invalid):
		writeError(w, http.StatusUnprocessableEntity, invalid.Msg)
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "Not found.")
	case errors.Is(err, filestore.ErrTooLarge), errors.As(err, &tooBig):
		writeError(w, http.StatusRequestEntityTooLarge, "That file is larger than 10 MB. Shrink it or link to it instead.")
	case errors.As(err, &pqErr) && pqErr.Constraint == "two_week_rule":
		// Last line of defence: the database itself refuses a planning deadline past the limit.
		writeError(w, http.StatusUnprocessableEntity, "Planning cannot run past the limit. Coding starts at most 14 days after deciding.")
	default:
		log.Printf("%s %s: %v", r.Method, r.URL.Path, err)
		writeError(w, http.StatusInternalServerError, "Something went wrong on the server. Check the server log.")
	}
}

// readBody returns the raw JSON body of a request.
func readBody(w http.ResponseWriter, r *http.Request) ([]byte, error) {
	if ct, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type")); ct != "application/json" {
		return nil, &planner.InvalidError{Msg: "Send JSON with Content-Type: application/json."}
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxJSONBody))
	if err != nil {
		return nil, &planner.InvalidError{Msg: "The request body is too large or could not be read."}
	}
	if len(strings.TrimSpace(string(body))) == 0 {
		body = []byte("{}")
	}
	return body, nil
}

// decode reads the JSON body of a request into v.
func decode(w http.ResponseWriter, r *http.Request, v any) error {
	body, err := readBody(w, r)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(body, v); err != nil {
		return &planner.InvalidError{Msg: "The request body is not valid JSON for this endpoint."}
	}
	return nil
}

func pathID(r *http.Request, name string) (int64, error) {
	id, err := strconv.ParseInt(r.PathValue(name), 10, 64)
	if err != nil || id <= 0 {
		return 0, store.ErrNotFound
	}
	return id, nil
}
