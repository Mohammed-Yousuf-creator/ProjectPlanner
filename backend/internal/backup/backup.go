// Package backup writes and restores full backups of the planner: one .tar.gz that holds a
// dump of the database (planner.sql) and the uploaded files (uploads/). It is the same format
// scripts/backup.sh writes, so backups made either way can be restored from the app.
package backup

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

type Manager struct {
	Dir         string // where backups are kept
	DatabaseURL string
	UploadsDir  string
	// AfterRestore runs once the database has been replaced (to bring an older backup up to
	// the current schema).
	AfterRestore func(ctx context.Context) error
	Now          func() time.Time

	mu sync.Mutex // one backup or restore at a time

	errMu   sync.Mutex
	lastErr string // why the last automatic backup failed; empty when it worked
}

// SetLastError records the outcome of the last automatic backup (nil clears it).
func (m *Manager) SetLastError(err error) {
	m.errMu.Lock()
	defer m.errMu.Unlock()
	m.lastErr = ""
	if err != nil {
		m.lastErr = err.Error()
	}
}

func (m *Manager) LastError() string {
	m.errMu.Lock()
	defer m.errMu.Unlock()
	return m.lastErr
}

// Info describes one backup file.
type Info struct {
	Name      string    `json:"name"`
	Size      int64     `json:"size"`
	CreatedAt time.Time `json:"created_at"`
	Auto      bool      `json:"auto"` // made by the daily schedule (and pruned by it)
}

// ErrBadName is returned for a backup name that is not one of ours.
var ErrBadName = errors.New("not a backup file name")

var nameRe = regexp.MustCompile(`^planner-[A-Za-z0-9-]{1,60}\.tar\.gz$`)

const autoPrefix = "planner-auto-"

func (m *Manager) now() time.Time {
	if m.Now != nil {
		return m.Now()
	}
	return time.Now()
}

// Missing names the PostgreSQL client tools a backup or restore needs but cannot find.
func (m *Manager) Missing() string {
	var missing []string
	for _, tool := range []string{"pg_dump", "psql"} {
		if _, err := exec.LookPath(tool); err != nil {
			missing = append(missing, tool)
		}
	}
	return strings.Join(missing, ", ")
}

// List returns the backups in the folder, newest first.
func (m *Manager) List() ([]Info, error) {
	entries, err := os.ReadDir(m.Dir)
	if errors.Is(err, os.ErrNotExist) {
		return []Info{}, nil
	}
	if err != nil {
		return nil, err
	}
	out := []Info{}
	for _, e := range entries {
		if e.IsDir() || !nameRe.MatchString(e.Name()) {
			continue
		}
		st, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, Info{Name: e.Name(), Size: st.Size(), CreatedAt: st.ModTime(), Auto: strings.HasPrefix(e.Name(), autoPrefix)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out, nil
}

// Path resolves a backup name to its file, refusing anything that is not a backup of ours.
func (m *Manager) Path(name string) (string, error) {
	if !nameRe.MatchString(name) {
		return "", ErrBadName
	}
	path := filepath.Join(m.Dir, name)
	if st, err := os.Stat(path); err != nil || st.IsDir() {
		return "", os.ErrNotExist
	}
	return path, nil
}

func (m *Manager) Delete(name string) error {
	path, err := m.Path(name)
	if err != nil {
		return err
	}
	return os.Remove(path)
}

// Create writes a new backup. kind is "" for one made by hand, "auto" for the daily one and
// "before-restore" for the safety copy taken before a restore.
func (m *Manager) Create(ctx context.Context, kind string) (Info, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.create(ctx, kind)
}

func (m *Manager) create(ctx context.Context, kind string) (Info, error) {
	if _, err := exec.LookPath("pg_dump"); err != nil {
		return Info{}, errors.New("pg_dump is not installed (sudo apt install -y postgresql-client)")
	}
	if err := os.MkdirAll(m.Dir, 0o755); err != nil {
		return Info{}, err
	}
	name := "planner-"
	if kind != "" {
		name += kind + "-"
	}
	name += m.now().Format("2006-01-02-150405") + ".tar.gz"
	final := filepath.Join(m.Dir, name)
	tmp, err := os.CreateTemp(m.Dir, ".backup-*.tmp")
	if err != nil {
		return Info{}, err
	}
	defer os.Remove(tmp.Name())

	err = func() error {
		defer tmp.Close()
		gz := gzip.NewWriter(tmp)
		tw := tar.NewWriter(gz)

		// The dump goes to a temporary file first because tar needs to know its size up front.
		dump, err := os.CreateTemp(m.Dir, ".dump-*.sql")
		if err != nil {
			return err
		}
		defer os.Remove(dump.Name())
		defer dump.Close()
		cmd := exec.CommandContext(ctx, "pg_dump", "--no-owner", "--no-privileges", "--dbname="+m.DatabaseURL)
		var stderr strings.Builder
		cmd.Stdout, cmd.Stderr = dump, &stderr
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("pg_dump failed: %s", firstLine(stderr.String(), err))
		}
		if err := addFile(tw, dump.Name(), "planner.sql"); err != nil {
			return err
		}
		if err := tw.WriteHeader(&tar.Header{Name: "uploads/", Typeflag: tar.TypeDir, Mode: 0o755, ModTime: m.now()}); err != nil {
			return err
		}
		err = filepath.WalkDir(m.UploadsDir, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				if errors.Is(err, os.ErrNotExist) {
					return nil
				}
				return err
			}
			rel, err := filepath.Rel(m.UploadsDir, path)
			if err != nil || rel == "." {
				return err
			}
			name := "uploads/" + filepath.ToSlash(rel)
			if d.IsDir() {
				return tw.WriteHeader(&tar.Header{Name: name + "/", Typeflag: tar.TypeDir, Mode: 0o755, ModTime: m.now()})
			}
			if !d.Type().IsRegular() || strings.HasSuffix(name, ".tmp") {
				return nil
			}
			return addFile(tw, path, name)
		})
		if err != nil {
			return err
		}
		if err := tw.Close(); err != nil {
			return err
		}
		return gz.Close()
	}()
	if err != nil {
		return Info{}, err
	}
	if err := os.Chmod(tmp.Name(), 0o600); err != nil {
		return Info{}, err
	}
	if err := os.Rename(tmp.Name(), final); err != nil {
		return Info{}, err
	}
	st, err := os.Stat(final)
	if err != nil {
		return Info{}, err
	}
	return Info{Name: name, Size: st.Size(), CreatedAt: st.ModTime(), Auto: kind == "auto"}, nil
}

func addFile(tw *tar.Writer, path, name string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return err
	}
	if err := tw.WriteHeader(&tar.Header{Name: name, Typeflag: tar.TypeReg, Mode: 0o644, Size: st.Size(), ModTime: st.ModTime()}); err != nil {
		return err
	}
	_, err = io.CopyN(tw, f, st.Size())
	return err
}

func firstLine(stderr string, err error) string {
	for _, l := range strings.Split(stderr, "\n") {
		if l = strings.TrimSpace(l); l != "" {
			return l
		}
	}
	return err.Error()
}

// RunDaily makes today's automatic backup if there is none yet, then deletes the oldest
// automatic backups beyond keep. Backups made by hand are never deleted.
func (m *Manager) RunDaily(ctx context.Context, keep int) (made bool, err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	list, err := m.List()
	if err != nil {
		return false, err
	}
	today := autoPrefix + m.now().Format("2006-01-02")
	have := false
	for _, b := range list {
		if strings.HasPrefix(b.Name, today) {
			have = true
			break
		}
	}
	if !have {
		if _, err := m.create(ctx, "auto"); err != nil {
			return false, err
		}
		made = true
		if list, err = m.List(); err != nil {
			return made, err
		}
	}
	kept := 0
	for _, b := range list { // newest first
		if !b.Auto {
			continue
		}
		kept++
		if kept > keep {
			_ = os.Remove(filepath.Join(m.Dir, b.Name))
		}
	}
	return made, nil
}

// dropAll removes every table and sequence of the planner, so a dump can be loaded into the
// database it came from. It runs in the same transaction as the dump: if loading fails, the
// database is left exactly as it was.
const dropAll = `
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
  END LOOP;
  FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP SEQUENCE IF EXISTS public.%I CASCADE', r.sequencename);
  END LOOP;
END $$;
`

// Restore replaces the database and the uploads with the content of a backup. A safety backup
// of the current state is written first and its name returned, so a restore can be undone.
func (m *Manager) Restore(ctx context.Context, name string) (safety string, err error) {
	path, err := m.Path(name)
	if err != nil {
		return "", err
	}
	if _, err := exec.LookPath("psql"); err != nil {
		return "", errors.New("psql is not installed (sudo apt install -y postgresql-client)")
	}
	m.mu.Lock()
	defer m.mu.Unlock()

	work, err := os.MkdirTemp(m.Dir, ".restore-*")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(work)
	if err := extract(path, work); err != nil {
		return "", fmt.Errorf("the backup could not be read: %w", err)
	}
	dump := filepath.Join(work, "planner.sql")
	if _, err := os.Stat(dump); err != nil {
		return "", errors.New("the backup holds no planner.sql")
	}

	before, err := m.create(ctx, "before-restore")
	if err != nil {
		return "", fmt.Errorf("the safety backup failed, so nothing was restored: %w", err)
	}

	script := filepath.Join(work, "restore.sql")
	// \i paths are read by psql itself; quote the path for it.
	body := dropAll + "\n\\i '" + strings.ReplaceAll(dump, "'", "''") + "'\n"
	if err := os.WriteFile(script, []byte(body), 0o600); err != nil {
		return before.Name, err
	}
	cmd := exec.CommandContext(ctx, "psql", "--no-psqlrc", "--quiet", "--single-transaction",
		"--set", "ON_ERROR_STOP=1", "--dbname="+m.DatabaseURL, "--file="+script)
	var stderr strings.Builder
	cmd.Stdout, cmd.Stderr = io.Discard, &stderr
	if err := cmd.Run(); err != nil {
		return before.Name, fmt.Errorf("the database was left as it was — loading the backup failed: %s", firstLine(stderr.String(), err))
	}

	// Swap the uploads: move the current folder aside, move the restored one in.
	restored := filepath.Join(work, "uploads")
	if err := os.MkdirAll(restored, 0o755); err != nil {
		return before.Name, err
	}
	old := m.UploadsDir + ".replaced-" + m.now().Format("20060102-150405")
	if err := os.Rename(m.UploadsDir, old); err != nil && !errors.Is(err, os.ErrNotExist) {
		return before.Name, fmt.Errorf("the database was restored, but the uploads folder could not be replaced: %w", err)
	}
	if err := os.Rename(restored, m.UploadsDir); err != nil {
		_ = os.Rename(old, m.UploadsDir)
		return before.Name, fmt.Errorf("the database was restored, but the uploads folder could not be replaced: %w", err)
	}
	_ = os.RemoveAll(old)

	if m.AfterRestore != nil {
		if err := m.AfterRestore(ctx); err != nil {
			return before.Name, fmt.Errorf("restored, but updating the database layout failed: %w", err)
		}
	}
	return before.Name, nil
}

// extract unpacks a backup into dir. Only planner.sql and regular files under uploads/ are
// accepted, and nothing may land outside dir.
func extract(archive, dir string) error {
	f, err := os.Open(archive)
	if err != nil {
		return err
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	tr := tar.NewReader(gz)
	for {
		h, err := tr.Next()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
		name := filepath.Clean(filepath.FromSlash(strings.TrimPrefix(h.Name, "./")))
		if name != "planner.sql" && name != "uploads" && !strings.HasPrefix(name, "uploads"+string(filepath.Separator)) {
			continue
		}
		if strings.Contains(name, "..") {
			return fmt.Errorf("unsafe path %q in backup", h.Name)
		}
		target := filepath.Join(dir, name)
		switch h.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
			if err != nil {
				return err
			}
			_, err = io.Copy(out, tr)
			if cerr := out.Close(); err == nil {
				err = cerr
			}
			if err != nil {
				return err
			}
		}
	}
}
