package planner

import (
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"strings"
	"time"

	"projectplanner/internal/filestore"
	"projectplanner/internal/model"
	"projectplanner/internal/store"
)

const (
	archiveFormat  = "projectplanner-project"
	archiveVersion = 1
	archiveDocName = "project.json"
	// MaxImportBytes bounds a project file that is uploaded for import.
	MaxImportBytes = 512 << 20
	maxArchiveDoc  = 64 << 20
)

// archiveDoc is project.json inside an exported project file. Uploaded files travel next to it
// in the same zip, uncompressed, under files/.
type archiveDoc struct {
	Format     string            `json:"format"`
	Version    int               `json:"version"`
	ExportedAt time.Time         `json:"exported_at"`
	Project    model.Project     `json:"project"`
	Stories    []model.Story     `json:"stories"`
	Items      []model.PlanItem  `json:"items"`
	Milestones []model.Milestone `json:"milestones"`
	Tasks      []model.Task      `json:"tasks"`
	Logs       []model.DailyLog  `json:"logs"`
	Obstacles  []model.Obstacle  `json:"obstacles"`
	Events     []model.Event     `json:"events"`
	Picks      []model.DayPick   `json:"picks"`
	Snapshot   *model.Snapshot   `json:"snapshot"`
	Files      []archiveFile     `json:"files"`
}

type archiveFile struct {
	Path      string    `json:"path"` // name of the entry inside the zip
	Category  string    `json:"category"`
	Name      string    `json:"name"`
	Mime      string    `json:"mime"`
	CreatedAt time.Time `json:"created_at"`
}

// ExportArchive writes one file that holds a whole project: its plan, board, journal,
// obstacles, history and every uploaded file. Import it on any ProjectPlanner installation.
func (s *Service) ExportArchive(ctx context.Context, id int64, w io.Writer) error {
	b, err := s.Bundle(ctx, id)
	if err != nil {
		return err
	}
	doc := archiveDoc{
		Format: archiveFormat, Version: archiveVersion, ExportedAt: s.now().UTC(), Project: b.Project,
		Stories: b.Stories, Items: b.Items, Milestones: b.Milestones, Tasks: b.Tasks, Logs: b.Logs,
		Obstacles: b.Obstacles, Events: b.Events, Picks: b.Picks, Files: []archiveFile{},
	}
	if sn, err := s.store.GetSnapshot(ctx, id); err == nil {
		doc.Snapshot = &sn
	}

	zw := zip.NewWriter(w)
	for i, f := range b.Files {
		path := fmt.Sprintf("files/%03d-%s", i+1, strings.ReplaceAll(f.Name, "/", "_"))
		full, err := s.store.GetFile(ctx, f.ID) // the bundle omits where the bytes are kept
		if err != nil {
			return err
		}
		rc, err := s.files.Open(full.StorageKey, full.Compression)
		if err != nil {
			return fmt.Errorf("open upload %q: %w", f.Name, err)
		}
		// Stored without compression inside the zip: most uploads are images, which do not shrink.
		entry, err := zw.CreateHeader(&zip.FileHeader{Name: path, Method: zip.Store, Modified: f.CreatedAt})
		if err == nil {
			_, err = io.Copy(entry, rc)
		}
		rc.Close()
		if err != nil {
			return err
		}
		doc.Files = append(doc.Files, archiveFile{Path: path, Category: f.Category, Name: f.Name, Mime: f.Mime, CreatedAt: f.CreatedAt})
	}
	entry, err := zw.CreateHeader(&zip.FileHeader{Name: archiveDocName, Method: zip.Deflate, Modified: doc.ExportedAt})
	if err != nil {
		return err
	}
	enc := json.NewEncoder(entry)
	enc.SetIndent("", "  ")
	if err := enc.Encode(doc); err != nil {
		return err
	}
	return zw.Close()
}

// ArchiveName is the download name of a project export.
func (s *Service) ArchiveName(ctx context.Context, id int64) (string, error) {
	p, err := s.store.GetProject(ctx, id)
	if err != nil {
		return "", err
	}
	return fileSlug(p.Name) + ".planner.zip", nil
}

// ImportArchive creates a new project from an exported project file. Nothing existing is
// touched: the project arrives under a new id, with its dates, history and uploads intact.
// The link to a repository folder is not carried over, because it belongs to one computer.
func (s *Service) ImportArchive(ctx context.Context, r io.ReaderAt, size int64) (model.Project, error) {
	notOurs := invalid("That is not a ProjectPlanner project file. Export one with “Export project file” in a project's settings.")
	zr, err := zip.NewReader(r, size)
	if err != nil {
		return model.Project{}, notOurs
	}
	entries := map[string]*zip.File{}
	for _, f := range zr.File {
		entries[f.Name] = f
	}
	docFile, ok := entries[archiveDocName]
	if !ok {
		return model.Project{}, notOurs
	}
	raw, err := readZipEntry(docFile, maxArchiveDoc)
	if err != nil {
		return model.Project{}, notOurs
	}
	var doc archiveDoc
	if err := json.Unmarshal(raw, &doc); err != nil || doc.Format != archiveFormat {
		return model.Project{}, notOurs
	}
	if doc.Version > archiveVersion {
		return model.Project{}, invalid("That file was written by a newer ProjectPlanner. Update this installation, then import it.")
	}
	p := doc.Project
	if strings.TrimSpace(p.Name) == "" || !oneOf(p.Type, model.TypeStandard, model.TypeHackathon) ||
		!oneOf(p.Phase, model.PhasePlan, model.PhaseBuild, model.PhaseShipped) || p.DecidedAt.IsZero() || p.PlanningDeadline.IsZero() {
		return model.Project{}, invalid("That project file is damaged: the project record is incomplete.")
	}
	if p.StaleHours < 1 || p.StaleHours > 720 {
		p.StaleHours = DefaultStaleHours(p.Type, p.HackStart, p.HackEnd)
	}
	if _, known := kitByKey(p.Kit); !known {
		p.Kit = ""
	}

	// Keep names apart so two copies can be told from each other on the projects page.
	base := p.Name
	for n := 1; ; n++ {
		taken, err := s.store.ProjectNameTaken(ctx, p.Name)
		if err != nil {
			return model.Project{}, err
		}
		if !taken {
			break
		}
		if n == 1 {
			p.Name = base + " (imported)"
		} else {
			p.Name = fmt.Sprintf("%s (imported %d)", base, n)
		}
	}

	var (
		newID int64
		saved []string // storage keys written so far, to clean up if the import fails
	)
	err = s.store.InTx(ctx, func(tx *store.Store) error {
		var err error
		if newID, err = tx.ImportProject(ctx, p); err != nil {
			return err
		}
		storyIDs, itemIDs, msIDs, taskIDs := map[int64]int64{}, map[int64]int64{}, map[int64]int64{}, map[int64]int64{}
		remap := func(ids map[int64]int64, old *int64) *int64 {
			if old == nil {
				return nil
			}
			if id, ok := ids[*old]; ok {
				return &id
			}
			return nil
		}
		for _, st := range doc.Stories {
			old := st.ID
			st.ProjectID = newID
			if storyIDs[old], err = tx.ImportStory(ctx, st); err != nil {
				return err
			}
		}
		for _, it := range doc.Items {
			old := it.ID
			it.ProjectID = newID
			if len(it.Data) == 0 {
				it.Data = json.RawMessage(`{}`)
			}
			if itemIDs[old], err = tx.ImportItem(ctx, it); err != nil {
				return err
			}
		}
		for _, m := range doc.Milestones {
			old := m.ID
			m.ProjectID = newID
			if msIDs[old], err = tx.ImportMilestone(ctx, m); err != nil {
				return err
			}
		}
		for _, t := range doc.Tasks {
			old := t.ID
			t.ProjectID, t.MilestoneID, t.StoryID = newID, remap(msIDs, t.MilestoneID), remap(storyIDs, t.StoryID)
			if taskIDs[old], err = tx.ImportTask(ctx, t); err != nil {
				return err
			}
		}
		for _, l := range doc.Logs {
			l.ProjectID = newID
			if err := tx.ImportLog(ctx, l); err != nil {
				return err
			}
		}
		for _, o := range doc.Obstacles {
			o.ProjectID, o.TaskID = newID, remap(taskIDs, o.TaskID)
			if err := tx.ImportObstacle(ctx, o); err != nil {
				return err
			}
		}
		for _, pk := range doc.Picks {
			pk.ProjectID, pk.TaskID = newID, remap(taskIDs, pk.TaskID)
			if err := tx.ImportPick(ctx, pk); err != nil {
				return err
			}
		}
		for _, e := range doc.Events {
			if !oneOf(e.Kind, "scope_add", "scope_park", "scope_cut", "date_move") {
				continue
			}
			if err := tx.AddEvent(ctx, newID, e.Kind, e.At, remapEvent(e.Data, taskIDs, storyIDs, msIDs)); err != nil {
				return err
			}
		}
		if doc.Snapshot != nil {
			var sn planSnapshot
			if json.Unmarshal(doc.Snapshot.Data, &sn) == nil {
				for i := range sn.Stories {
					sn.Stories[i].ID, sn.Stories[i].ProjectID = mapped(storyIDs, sn.Stories[i].ID), newID
				}
				for i := range sn.Items {
					sn.Items[i].ID, sn.Items[i].ProjectID = mapped(itemIDs, sn.Items[i].ID), newID
				}
				for i := range sn.Milestones {
					sn.Milestones[i].ID, sn.Milestones[i].ProjectID = mapped(msIDs, sn.Milestones[i].ID), newID
				}
				if err := tx.ImportSnapshot(ctx, model.Snapshot{ProjectID: newID, TakenAt: doc.Snapshot.TakenAt, Data: mustJSON(sn)}); err != nil {
					return err
				}
			}
		}
		for _, f := range doc.Files {
			entry, ok := entries[f.Path]
			if !ok {
				return invalid("That project file is damaged: the upload “%s” is missing from it.", f.Name)
			}
			data, err := readZipEntry(entry, filestore.MaxUploadBytes)
			if err != nil {
				return invalid("That project file is damaged: the upload “%s” could not be read.", f.Name)
			}
			if len(data) == 0 {
				continue
			}
			st, err := s.files.Save(newID, data)
			if err != nil {
				return err
			}
			saved = append(saved, st.Key)
			category := f.Category
			if !oneOf(category, "wireframe", "reference", "other") {
				category = "other"
			}
			name := cleanFileName(f.Name)
			if err := tx.ImportFile(ctx, model.File{
				ProjectID: newID, Category: category, Name: name, Mime: detectMime(name, data),
				OriginalSize: st.OriginalSize, StoredSize: st.StoredSize, Compression: st.Compression,
				StorageKey: st.Key, CreatedAt: f.CreatedAt,
			}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		for _, key := range saved {
			_ = s.files.Delete(key)
		}
		if _, isInvalid := err.(*InvalidError); isInvalid {
			return model.Project{}, err
		}
		// A row the database refuses means the file does not hold what a real export holds.
		log.Printf("import project: %v", err)
		return model.Project{}, invalid("That project file could not be imported: some of its content is not valid. Nothing was changed.")
	}
	return s.store.GetProject(ctx, newID)
}

func mapped(ids map[int64]int64, old int64) int64 {
	if id, ok := ids[old]; ok {
		return id
	}
	return -old // something that no longer exists: keep it distinct from every real id
}

// remapEvent rewrites the ids inside a history entry to the ids the rows have after import.
func remapEvent(data json.RawMessage, tasks, stories, milestones map[int64]int64) map[string]any {
	var m map[string]any
	if json.Unmarshal(data, &m) != nil || m == nil {
		return map[string]any{}
	}
	fix := func(key string, ids map[int64]int64) {
		if v, ok := m[key].(float64); ok {
			if id, ok := ids[int64(v)]; ok {
				m[key] = id
			} else {
				delete(m, key)
			}
		}
	}
	fix("task_id", tasks)
	fix("story_id", stories)
	fix("milestone_id", milestones)
	if what, _ := m["what"].(string); what == "milestone" {
		fix("id", milestones)
	}
	return m
}

// readZipEntry reads one entry of a zip, refusing anything that unpacks to more than max bytes.
func readZipEntry(f *zip.File, max int64) ([]byte, error) {
	if f.UncompressedSize64 > uint64(max) {
		return nil, fmt.Errorf("entry %q is too large", f.Name)
	}
	rc, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	data, err := io.ReadAll(io.LimitReader(rc, max+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > max {
		return nil, fmt.Errorf("entry %q is too large", f.Name)
	}
	return data, nil
}
