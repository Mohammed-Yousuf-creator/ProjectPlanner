// Package filestore is a black box for uploaded files: hand it bytes, get a key back.
// Files are compressed with Zstandard (free, open source, runs in-process — nothing leaves
// the machine) before they are written to disk.
package filestore

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/klauspost/compress/zstd"
)

// MaxUploadBytes is the hard limit for a single uploaded file: 10 MB.
const MaxUploadBytes = 10 << 20

const (
	CompressionZstd = "zstd"
	CompressionNone = "none"
)

var ErrTooLarge = errors.New("file is larger than 10 MB")

type Store struct {
	dir string
	enc *zstd.Encoder
}

// Saved describes how a file ended up on disk.
type Saved struct {
	Key          string
	OriginalSize int64
	StoredSize   int64
	Compression  string
}

func New(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	enc, err := zstd.NewWriter(nil, zstd.WithEncoderLevel(zstd.SpeedBetterCompression))
	if err != nil {
		return nil, err
	}
	return &Store{dir: dir, enc: enc}, nil
}

// Save compresses data and writes it under the project's folder.
// Already-compressed formats (JPEG, PNG, zip...) can grow when compressed again; in that case
// the original bytes are kept and Compression is "none".
func (s *Store) Save(projectID int64, data []byte) (Saved, error) {
	if len(data) > MaxUploadBytes {
		return Saved{}, ErrTooLarge
	}
	payload, compression, ext := s.enc.EncodeAll(data, nil), CompressionZstd, ".zst"
	if len(payload) >= len(data) {
		payload, compression, ext = data, CompressionNone, ".bin"
	}

	name := make([]byte, 16)
	if _, err := rand.Read(name); err != nil {
		return Saved{}, err
	}
	key := fmt.Sprintf("%d/%s%s", projectID, hex.EncodeToString(name), ext)
	path, err := s.path(key)
	if err != nil {
		return Saved{}, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return Saved{}, err
	}
	// Write to a temp file first so a crash never leaves a half-written upload behind.
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, payload, 0o644); err != nil {
		return Saved{}, err
	}
	if err := os.Rename(tmp, path); err != nil {
		os.Remove(tmp)
		return Saved{}, err
	}
	return Saved{Key: key, OriginalSize: int64(len(data)), StoredSize: int64(len(payload)), Compression: compression}, nil
}

// Open returns the original (decompressed) bytes of a stored file as a stream.
func (s *Store) Open(key, compression string) (io.ReadCloser, error) {
	path, err := s.path(key)
	if err != nil {
		return nil, err
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	if compression != CompressionZstd {
		return f, nil
	}
	dec, err := zstd.NewReader(f)
	if err != nil {
		f.Close()
		return nil, err
	}
	return &zstdFile{dec: dec, f: f}, nil
}

func (s *Store) Delete(key string) error {
	path, err := s.path(key)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

// DeleteProject removes every stored file of a project.
func (s *Store) DeleteProject(projectID int64) error {
	return os.RemoveAll(filepath.Join(s.dir, fmt.Sprintf("%d", projectID)))
}

// path resolves a storage key and refuses anything that would escape the storage directory.
func (s *Store) path(key string) (string, error) {
	clean := filepath.Clean(filepath.FromSlash(key))
	if key == "" || filepath.IsAbs(clean) || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("invalid storage key %q", key)
	}
	return filepath.Join(s.dir, clean), nil
}

type zstdFile struct {
	dec *zstd.Decoder
	f   *os.File
}

func (z *zstdFile) Read(p []byte) (int, error) { return z.dec.Read(p) }
func (z *zstdFile) Close() error {
	z.dec.Close()
	return z.f.Close()
}

// ReadLimited reads at most MaxUploadBytes from r and reports ErrTooLarge if there is more.
func ReadLimited(r io.Reader) ([]byte, error) {
	var buf bytes.Buffer
	n, err := io.Copy(&buf, io.LimitReader(r, MaxUploadBytes+1))
	if err != nil {
		return nil, err
	}
	if n > MaxUploadBytes {
		return nil, ErrTooLarge
	}
	return buf.Bytes(), nil
}
