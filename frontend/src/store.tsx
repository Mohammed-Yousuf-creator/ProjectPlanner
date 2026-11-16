// Project state: one bundle per open project, reloaded after every change.
// Mutations run one at a time, in order, so quick successive edits can never overwrite
// each other out of order.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import type { Bundle, PlanItem, Project } from './types';

// ---------- toasts ----------

interface Toast {
  id: number;
  kind: 'error' | 'ok';
  text: string;
}

interface ToastApi {
  error(text: string): void;
  ok(text: string): void;
}

const ToastContext = createContext<ToastApi>({ error: () => {}, ok: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = nextId.current++;
    setToasts((list) => [...list.filter((t) => t.text !== text), { id, kind, text }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 7000 : 2500);
  }, []);

  const value = useMemo<ToastApi>(() => ({ error: (t) => push('error', t), ok: (t) => push('ok', t) }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span>{t.text}</span>
            <button className="icon-btn" aria-label="Dismiss" onClick={() => setToasts((l) => l.filter((x) => x.id !== t.id))}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ---------- project ----------

interface ProjectApi {
  b: Bundle;
  p: Project;
  /** Runs a change, then reloads the project. Errors become toasts; returns undefined on failure. */
  run<T>(change: () => Promise<T>): Promise<T | undefined>;
  reload(): Promise<void>;
  savePlan(key: string, value: string): void;
  items<T>(kind: string): PlanItem<T>[];
  addItem(kind: string, data: object): Promise<unknown>;
  updateItem(item: PlanItem<any>, patch: object): void;
  /** The newest known data of an item, including edits that are still being saved. */
  fresh<T>(item: PlanItem<T>): T;
  removeItem(id: number): void;
}

const ProjectContext = createContext<ProjectApi | null>(null);

export function useProject(): ProjectApi {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject outside of a project page');
  return ctx;
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string; notFound: boolean } | { status: 'ready' };

export function ProjectProvider({ id, children, fallback }: {
  id: number;
  children: ReactNode;
  fallback: (state: Exclude<LoadState, { status: 'ready' }>, retry: () => void) => ReactNode;
}) {
  const toast = useToast();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);
  const drafts = useRef(new Map<number, object>()); // newest known data per plan item
  const alive = useRef(true);
  const currentId = useRef(id);
  currentId.current = id;

  const load = useCallback(async () => {
    try {
      const fresh = await api.bundle(id);
      if (!alive.current || currentId.current !== id) return;
      if (pending.current === 0) drafts.current.clear();
      setBundle(fresh);
      setState({ status: 'ready' });
    } catch (err) {
      if (!alive.current || currentId.current !== id) return;
      const e = err as ApiError;
      setState((prev) => {
        // Keep showing what we have if a background refresh fails.
        if (prev.status === 'ready') return prev;
        return { status: 'error', message: e.message, notFound: e.status === 404 };
      });
    }
  }, [id]);

  useEffect(() => {
    alive.current = true;
    setBundle(null);
    setState({ status: 'loading' });
    void load();
    // Refresh quietly once a minute and when the tab becomes visible again, so the phase
    // and the clocks never go stale.
    const timer = window.setInterval(() => { if (pending.current === 0) void load(); }, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible' && pending.current === 0) void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const run = useCallback(<T,>(change: () => Promise<T>): Promise<T | undefined> => {
    pending.current++;
    const result = queue.current.then(change).then(
      (value) => value,
      (err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Something went wrong.');
        return undefined;
      },
    );
    queue.current = result.then(async () => {
      pending.current--;
      if (pending.current === 0) await load(); // reload once the burst of changes is through
    });
    return queue.current.then(() => result);
  }, [load, toast]);

  const value = useMemo<ProjectApi | null>(() => {
    if (!bundle) return null;
    return {
      b: bundle,
      p: bundle.project,
      run,
      reload: load,
      savePlan: (key, text) => { void run(() => api.savePlan(id, { [key]: text })); },
      items: <T,>(kind: string) => bundle.items.filter((it) => it.kind === kind) as unknown as PlanItem<T>[],
      addItem: (kind, data) => run(() => api.create(id, 'items', { kind, data })),
      updateItem: (item, patch) => {
        const next = { ...(drafts.current.get(item.id) ?? item.data), ...patch };
        drafts.current.set(item.id, next);
        void run(() => api.patch('items', item.id, { data: next }));
      },
      fresh: <T,>(item: PlanItem<T>) => (drafts.current.get(item.id) ?? item.data) as T,
      removeItem: (itemId) => { void run(() => api.remove('items', itemId)); },
    };
  }, [bundle, id, load, run]);

  if (!value) {
    return <>{fallback(state.status === 'ready' ? { status: 'loading' } : state, () => { setState({ status: 'loading' }); void load(); })}</>;
  }
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}
