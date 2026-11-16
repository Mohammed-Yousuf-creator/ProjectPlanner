package main

import (
	"bytes"
	"compress/gzip"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// MaxUploadBytes is the 10 MB upload ceiling (video7 constraint).
const MaxUploadBytes = 10 * 1024 * 1024

// uploadsDir is where compressed uploads are stored on the user's computer.
var uploadsDir = os.Getenv("UPLOADS_DIR")

func init() {
	if uploadsDir == "" {
		uploadsDir = "uploads"
	}
}

// ensureUploadsDir creates the local uploads storage directory.
func ensureUploadsDir() error {
	return os.MkdirAll(uploadsDir, 0o755)
}

// newID generates a random hex identifier.
func newID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// handleUpload stores an uploaded file, gzip-compressed, on local disk.
// Files larger than 10 MB are rejected before storage.
func handleUpload(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := Params(r)
		projectID := params["id"]

		if err := ensureUploadsDir(); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "cannot prepare storage"})
			return
		}

		// Limit the request body to MaxUploadBytes + a small slack so we can
		// detect an over-limit upload and reject it cleanly.
		r.Body = http.MaxBytesReader(w, r.Body, MaxUploadBytes+1)
		if err := r.ParseMultipartForm(MaxUploadBytes + 1); err != nil {
			if strings.Contains(err.Error(), "too large") || strings.Contains(err.Error(), "exceeds") {
				writeJSON(w, http.StatusBadRequest, map[string]string{
					"error": fmt.Sprintf("file exceeds the 10 MB upload limit"),
				})
				return
			}
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "no file provided"})
			return
		}
		defer file.Close()

		if header.Size > MaxUploadBytes {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": fmt.Sprintf("file exceeds the 10 MB upload limit (%d bytes)", header.Size),
			})
			return
		}

		// Read original bytes, then gzip-compress before storing (free, no external service).
		original, err := io.ReadAll(file)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "cannot read upload"})
			return
		}

		var compressed bytes.Buffer
		gz := gzip.NewWriter(&compressed)
		if _, err := gz.Write(original); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "compression failed"})
			return
		}
		if err := gz.Close(); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "compression failed"})
			return
		}

		id, err := newID()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "cannot generate id"})
			return
		}

		ext := filepath.Ext(header.Filename)
		storedName := id + ext + ".gz"
		storedPath := filepath.Join(uploadsDir, storedName)

		if err := os.WriteFile(storedPath, compressed.Bytes(), 0o644); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "cannot store file"})
			return
		}

		contentType := header.Header.Get("Content-Type")
		if contentType == "" {
			contentType = mime.TypeByExtension(ext)
		}
		if contentType == "" {
			contentType = "application/octet-stream"
		}

		upload := FileUpload{
			ID:             id,
			ProjectID:      projectID,
			OriginalName:   header.Filename,
			StoredName:     storedName,
			Path:           storedPath,
			Size:           int64(len(original)),
			CompressedSize: int64(compressed.Len()),
			ContentType:    contentType,
			UploadedAt:     time.Now(),
		}

		const q = `INSERT INTO file_uploads
			(id, project_id, original_name, stored_name, path, size, compressed_size, content_type, uploaded_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`
		if _, err := db.Exec(q, upload.ID, upload.ProjectID, upload.OriginalName, upload.StoredName,
			upload.Path, upload.Size, upload.CompressedSize, upload.ContentType, upload.UploadedAt); err != nil {
			os.Remove(storedPath)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "cannot record upload"})
			return
		}

		writeJSON(w, http.StatusCreated, upload)
	}
}

// handleDownload serves a stored (compressed) upload, decompressing it on the fly.
func handleDownload(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := Params(r)
		id := params["id"]

		var u FileUpload
		const q = `SELECT id, project_id, original_name, stored_name, path, size, compressed_size,
			content_type, uploaded_at FROM file_uploads WHERE id = $1`
		row := db.QueryRow(q, id)
		var projectID, storedName, path, contentType string
		var size, compressedSize int64
		var uploadedAt time.Time
		if err := row.Scan(&u.ID, &projectID, &u.OriginalName, &storedName, &path, &size,
			&compressedSize, &contentType, &uploadedAt); err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "upload not found"})
			return
		}
		u.ProjectID = projectID
		u.Size = size
		u.CompressedSize = compressedSize
		u.ContentType = contentType
		u.UploadedAt = uploadedAt

		compressed, err := os.ReadFile(path)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "cannot read stored file"})
			return
		}

		gz, err := gzip.NewReader(bytes.NewReader(compressed))
		if err != nil {
			// File may not be gzipped; serve raw as a fallback.
			http.ServeContent(w, r, u.OriginalName, u.UploadedAt, bytes.NewReader(compressed))
			return
		}
		defer gz.Close()

		w.Header().Set("Content-Type", u.ContentType)
		w.Header().Set("Content-Disposition", `attachment; filename="`+u.OriginalName+`"`)
		w.Header().Set("Content-Length", fmt.Sprint(u.Size))
		_, _ = io.Copy(w, gz)
	}
}

// handleListUploads returns metadata for all uploads of a project.
func handleListUploads(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := Params(r)
		projectID := params["id"]

		rows, err := db.Query(`SELECT id, original_name, size, compressed_size, content_type, uploaded_at
			FROM file_uploads WHERE project_id = $1 ORDER BY uploaded_at DESC`, projectID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		defer rows.Close()

		type summary struct {
			ID            string    `json:"id"`
			OriginalName  string    `json:"original_name"`
			Size          int64     `json:"size"`
			CompressedSize int64    `json:"compressed_size"`
			ContentType   string    `json:"content_type"`
			UploadedAt    time.Time `json:"uploaded_at"`
		}
		var out []summary
		for rows.Next() {
			var s summary
			if err := rows.Scan(&s.ID, &s.OriginalName, &s.Size, &s.CompressedSize, &s.ContentType, &s.UploadedAt); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			out = append(out, s)
		}
		if out == nil {
			out = []summary{}
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// handleDeleteUpload removes an upload record and its stored file.
func handleDeleteUpload(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := Params(r)
		id := params["id"]

		var path string
		if err := db.QueryRow(`SELECT path FROM file_uploads WHERE id = $1`, id).Scan(&path); err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "upload not found"})
			return
		}
		if _, err := db.Exec(`DELETE FROM file_uploads WHERE id = $1`, id); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "cannot delete"})
			return
		}
		_ = os.Remove(path)
		w.WriteHeader(http.StatusNoContent)
	}
}
