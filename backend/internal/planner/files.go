package planner

import (
	"context"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"projectplanner/internal/filestore"
	"projectplanner/internal/model"
)

// SaveFile compresses an upload, writes it to disk and records it.
func (s *Service) SaveFile(ctx context.Context, projectID int64, name, category string, data []byte) (model.File, error) {
	if err := s.requireProject(ctx, projectID); err != nil {
		return model.File{}, err
	}
	if len(data) == 0 {
		return model.File{}, invalid("That file is empty.")
	}
	if len(data) > filestore.MaxUploadBytes {
		return model.File{}, filestore.ErrTooLarge
	}
	if category == "" {
		category = "other"
	}
	if !oneOf(category, "wireframe", "reference", "other") {
		return model.File{}, invalid("A file is a wireframe, a reference or other.")
	}
	name = cleanFileName(name)

	saved, err := s.files.Save(projectID, data)
	if err != nil {
		return model.File{}, err
	}
	f, err := s.store.CreateFile(ctx, model.File{
		ProjectID: projectID, Category: category, Name: name, Mime: detectMime(name, data),
		OriginalSize: saved.OriginalSize, StoredSize: saved.StoredSize,
		Compression: saved.Compression, StorageKey: saved.Key,
	})
	if err != nil {
		_ = s.files.Delete(saved.Key) // do not leave bytes behind without a record
		return model.File{}, err
	}
	s.store.Touch(ctx, projectID)
	return f, nil
}

// OpenFile returns a file's record and its original bytes.
func (s *Service) OpenFile(ctx context.Context, id int64) (model.File, io.ReadCloser, error) {
	f, err := s.store.GetFile(ctx, id)
	if err != nil {
		return f, nil, err
	}
	rc, err := s.files.Open(f.StorageKey, f.Compression)
	return f, rc, err
}

func (s *Service) DeleteFile(ctx context.Context, id int64) error {
	f, err := s.store.GetFile(ctx, id)
	if err != nil {
		return err
	}
	if err := s.store.DeleteFile(ctx, id); err != nil {
		return err
	}
	return s.files.Delete(f.StorageKey)
}

func cleanFileName(name string) string {
	name = filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	name = strings.Map(func(r rune) rune {
		if r < 32 || r == 127 {
			return -1
		}
		return r
	}, name)
	name = strings.TrimSpace(name)
	if name == "" || name == "." || name == "/" {
		name = "file"
	}
	for utf8.RuneCountInString(name) > 200 {
		_, size := utf8.DecodeLastRuneInString(name)
		name = name[:len(name)-size]
	}
	return name
}

// detectMime trusts the content first and falls back to the extension for text-like formats.
func detectMime(name string, data []byte) string {
	sniffed := http.DetectContentType(data)
	base, _, _ := mime.ParseMediaType(sniffed)
	if base == "application/octet-stream" || base == "text/plain" {
		if byExt := mime.TypeByExtension(strings.ToLower(filepath.Ext(name))); byExt != "" {
			return byExt
		}
	}
	return sniffed
}
