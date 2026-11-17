package planner

import (
	"bytes"
	"context"
	"log"
	"os"
	"path/filepath"
	"time"

	"projectplanner/internal/gitlog"
	"projectplanner/internal/model"
)

// planMarker is the first line of a PLAN.md written by the planner. A PLAN.md without it was
// written by someone else and is never overwritten.
const planMarker = "<!-- Written by ProjectPlanner. Edit the plan in the planner: changes made in this file are overwritten. -->"

// PlanSyncState says what happened the last time PLAN.md was written into a repository.
type PlanSyncState struct {
	Path      string     `json:"path"`       // the file that is kept up to date
	WrittenAt *time.Time `json:"written_at"` // last time its content changed
	Error     string     `json:"error"`      // why it could not be written, if it could not
}

func (s *Service) planSyncState(id int64) PlanSyncState {
	s.syncMu.Lock()
	defer s.syncMu.Unlock()
	return s.synced[id]
}

// SyncRepositories keeps the linked repositories in step with the planner: it rewrites PLAN.md
// where the plan changed and marks tasks done that a commit message closed. It runs on a timer.
func (s *Service) SyncRepositories(ctx context.Context) {
	ids, err := s.store.ProjectIDs(ctx, "repo_path <> '' AND (plan_sync OR commit_close)")
	if err != nil {
		log.Printf("repository sync: %v", err)
		return
	}
	for _, id := range ids {
		p, err := s.store.GetProject(ctx, id)
		if err != nil {
			continue
		}
		if p.PlanSync {
			s.syncPlan(ctx, p)
		}
		if p.CommitClose {
			if _, err := s.closeFromCommits(ctx, p, gitlog.Read(ctx, p.RepoPath, 300)); err != nil {
				log.Printf("closing tasks from commits of project %d: %v", id, err)
			}
		}
	}
}

// syncPlan writes the project's plan to PLAN.md in its repository folder, if that is switched
// on and the content differs from what is there.
func (s *Service) syncPlan(ctx context.Context, p model.Project) {
	set := func(st PlanSyncState) {
		s.syncMu.Lock()
		defer s.syncMu.Unlock()
		if prev, ok := s.synced[p.ID]; ok && st.WrittenAt == nil {
			st.WrittenAt = prev.WrittenAt
		}
		s.synced[p.ID] = st
	}
	if !p.PlanSync {
		s.syncMu.Lock()
		delete(s.synced, p.ID)
		s.syncMu.Unlock()
		return
	}
	dir := gitlog.ExpandPath(p.RepoPath)
	if dir == "" {
		set(PlanSyncState{Error: "Link the project's folder first (Code repository, above)."})
		return
	}
	target := filepath.Join(dir, "PLAN.md")
	if !filepath.IsAbs(dir) {
		set(PlanSyncState{Path: target, Error: "The repository path must be absolute."})
		return
	}
	if st, err := os.Stat(dir); err != nil || !st.IsDir() {
		set(PlanSyncState{Path: target, Error: "That folder does not exist yet."})
		return
	}
	b, err := s.Bundle(ctx, p.ID)
	if err != nil {
		set(PlanSyncState{Path: target, Error: "The plan could not be read."})
		return
	}
	content := []byte(planMarker + "\n\n" + renderMarkdown(b))

	existing, err := os.ReadFile(target)
	switch {
	case err == nil && !bytes.HasPrefix(existing, []byte(planMarker)):
		set(PlanSyncState{Path: target, Error: "A PLAN.md that the planner did not write is already there. Rename or delete it, then switch this on again."})
		return
	case err == nil && bytes.Equal(existing, content):
		st := PlanSyncState{Path: target}
		if info, err := os.Stat(target); err == nil {
			mod := info.ModTime()
			st.WrittenAt = &mod
		}
		set(st)
		return
	case err != nil && !os.IsNotExist(err):
		set(PlanSyncState{Path: target, Error: "PLAN.md could not be read: " + err.Error()})
		return
	}

	// Write to a temporary file in the same folder and rename, so a crash never leaves half a file.
	tmp, err := os.CreateTemp(dir, ".PLAN.md.*")
	if err != nil {
		set(PlanSyncState{Path: target, Error: "The folder is not writable: " + err.Error()})
		return
	}
	_, werr := tmp.Write(content)
	cerr := tmp.Close()
	if werr == nil && cerr == nil {
		_ = os.Chmod(tmp.Name(), 0o644)
		werr = os.Rename(tmp.Name(), target)
	}
	if werr != nil || cerr != nil {
		_ = os.Remove(tmp.Name())
		set(PlanSyncState{Path: target, Error: "PLAN.md could not be written."})
		return
	}
	now := s.now()
	set(PlanSyncState{Path: target, WrittenAt: &now})
}

// GitInfo is the commit activity of a project's repository, with the commits tied to its tasks.
type GitInfo struct {
	gitlog.Info
	// Closed is the number of tasks this read marked done because a commit closed them.
	Closed int `json:"closed"`
}

// Git reads the linked repository. Commit messages that mention a task number of this project
// ("#12") are linked to that task; with "commits close tasks" switched on, "closes #12" also
// marks the task done.
func (s *Service) Git(ctx context.Context, id int64) (GitInfo, error) {
	p, err := s.store.GetProject(ctx, id)
	if err != nil {
		return GitInfo{}, err
	}
	info := gitlog.Read(ctx, p.RepoPath, 300)
	out := GitInfo{Info: info}
	if !info.OK {
		return out, nil
	}
	tasks, err := s.store.ListTasks(ctx, id)
	if err != nil {
		return out, err
	}
	mine := map[int64]bool{}
	for _, t := range tasks {
		mine[t.ID] = true
	}
	keep := func(ids []int64) []int64 {
		kept := []int64{}
		for _, n := range ids {
			if mine[n] {
				kept = append(kept, n)
			}
		}
		return kept
	}
	for i := range out.Commits {
		out.Commits[i].Refs = keep(out.Commits[i].Refs)
		out.Commits[i].Closes = keep(out.Commits[i].Closes)
	}
	if p.CommitClose {
		if out.Closed, err = s.closeFromCommits(ctx, p, out.Info); err != nil {
			return out, err
		}
	}
	return out, nil
}

// closeFromCommits marks tasks done that the newest commit mentioning them closes. A task that
// was reopened by hand is not closed again by the same commit.
func (s *Service) closeFromCommits(ctx context.Context, p model.Project, info gitlog.Info) (int, error) {
	if !info.OK || p.Phase == model.PhasePlan {
		return 0, nil
	}
	newest := map[int64]gitlog.Commit{} // commits come newest first
	for _, c := range info.Commits {
		for _, n := range c.Closes {
			if _, ok := newest[n]; !ok {
				newest[n] = c
			}
		}
	}
	if len(newest) == 0 {
		return 0, nil
	}
	tasks, err := s.store.ListTasks(ctx, p.ID)
	if err != nil {
		return 0, err
	}
	closed := 0
	for _, t := range tasks {
		c, ok := newest[t.ID]
		// A commit older than the task cannot be about it: in a repository with history, "#3"
		// may have meant something else. (Commit times have whole seconds, hence the truncation.)
		if !ok || t.Status == "done" || t.ClosedCommit == c.Hash || c.At.Before(t.CreatedAt.Truncate(time.Second)) {
			continue
		}
		at := c.At
		if t.StartedAt == nil {
			t.StartedAt = &at
		}
		t.Status, t.DoneAt, t.ClosedCommit = "done", &at, c.Hash
		if _, err := s.store.UpdateTask(ctx, t); err != nil {
			return closed, err
		}
		closed++
	}
	if closed > 0 {
		s.store.Touch(ctx, p.ID)
	}
	return closed, nil
}
