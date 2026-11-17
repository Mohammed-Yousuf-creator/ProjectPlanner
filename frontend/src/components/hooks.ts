import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useProject } from '../store';
import type { GitInfo, Task, TaskStatus } from '../types';
import { dayKey } from '../time';

/** Commit activity of the linked repository, or null when none is linked / still loading. */
export function useGit(): { git: GitInfo | null; commitDays: string[] } {
  const { p, b } = useProject();
  const [git, setGit] = useState<GitInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!p.repo_path) {
      setGit(null);
      return;
    }
    api.git(p.id).then((g) => { if (!cancelled) setGit(g); }).catch(() => { if (!cancelled) setGit(null); });
    return () => { cancelled = true; };
    // b.now changes on every reload, so commits refresh along with the project.
  }, [p.id, p.repo_path, b.now]);
  const commitDays = useMemo(() => (git?.ok ? git.commits.map((c) => dayKey(c.at)) : []), [git]);
  return { git, commitDays };
}

export function useTaskActions() {
  const { run } = useProject();
  return useMemo(() => ({
    setStatus: (t: Task, status: TaskStatus) => run(() => api.patch('tasks', t.id, { status })),
    toggleCheck: (t: Task, index: number) =>
      run(() => api.patch('tasks', t.id, { checklist: t.checklist.map((c, i) => (i === index ? { ...c, done: !c.done } : c)) })),
    patch: (t: Task, body: Record<string, unknown>) => run(() => api.patch('tasks', t.id, body)),
    remove: (t: Task) => run(() => api.remove('tasks', t.id)),
  }), [run]);
}
