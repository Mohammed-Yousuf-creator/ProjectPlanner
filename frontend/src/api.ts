// Thin client for the Go API. Every call goes to the same origin under /api.

import type {
  Activity, Alert, AppSettings, BackupInfo, BackupList, Bundle, GitInfo, Lesson, Meta, Obstacle, Project, ProjectSummary,
  SearchHit, SnapshotView, StoredFile,
} from './types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is the backend running?');
  }
  return parse<T>(res);
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    /* not JSON: handled below */
  }
  if (!res.ok) {
    const msg =
      (data as { error?: string } | undefined)?.error ??
      (res.status === 413 ? 'That file is larger than 10 MB.' : `The server answered ${res.status}.`);
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export const api = {
  meta: () => request<Meta>('GET', '/meta'),

  projects: () => request<ProjectSummary[]>('GET', '/projects'),
  createProject: (body: Record<string, unknown>) => request<Project>('POST', '/projects', body),
  bundle: (id: number) => request<Bundle>('GET', `/projects/${id}`),
  patchProject: (id: number, body: Record<string, unknown>) => request<Project>('PATCH', `/projects/${id}`, body),
  deleteProject: (id: number) => request<void>('DELETE', `/projects/${id}`),
  startBuild: (id: number) => request<void>('POST', `/projects/${id}/start-build`, {}),
  ship: (id: number, shipped: boolean) => request<void>('POST', `/projects/${id}/ship`, { shipped }),
  generate: (id: number) => request<{ created: number }>('POST', `/projects/${id}/generate`, {}),
  git: (id: number) => request<GitInfo>('GET', `/projects/${id}/git`),

  savePlan: (id: number, fields: Record<string, string>) => request<void>('PUT', `/projects/${id}/plan`, fields),
  setStep: (id: number, key: string, status: string) => request<void>('PUT', `/projects/${id}/steps/${key}`, { status }),

  // Child resources share one shape: create under the project, patch/delete by id.
  create: <T>(projectId: number, kind: Resource, body: Record<string, unknown>) =>
    request<T>('POST', `/projects/${projectId}/${kind}`, body),
  patch: <T>(kind: Resource, id: number, body: Record<string, unknown>) => request<T>('PATCH', `/${kind}/${id}`, body),
  remove: (kind: Resource | 'files', id: number) => request<void>('DELETE', `/${kind}/${id}`),

  saveLog: (id: number, day: string, body: { summary: string; hours: number | null }) =>
    request<void>('PUT', `/projects/${id}/logs/${day}`, body),
  deleteLog: (id: number, day: string) => request<void>('DELETE', `/projects/${id}/logs/${day}`),

  async upload(projectId: number, file: Blob, name: string, category: string): Promise<StoredFile> {
    const form = new FormData();
    form.append('category', category);
    form.append('file', file, name);
    let res: Response;
    try {
      res = await fetch(`/api/projects/${projectId}/files`, { method: 'POST', body: form });
    } catch {
      // Servers may drop the connection while refusing an oversized upload.
      throw new ApiError(0, 'The upload failed. Files larger than 10 MB are refused.');
    }
    return parse<StoredFile>(res);
  },
  fileUrl: (id: number, download = false) => `/api/files/${id}/content${download ? '?download=1' : ''}`,
  exportUrl: (id: number) => `/api/projects/${id}/export.md`,
  archiveUrl: (id: number) => `/api/projects/${id}/export.zip`,
  calendarUrl: (id: number) => `/api/projects/${id}/calendar.ics`,

  // Keeping scope and time honest.
  snapshot: (id: number) => request<SnapshotView>('GET', `/projects/${id}/snapshot`),
  ackBuild: (id: number) => request<void>('POST', `/projects/${id}/ack-build`, {}),
  setPicks: (id: number, day: string, taskIds: number[]) => request<void>('PUT', `/projects/${id}/picks/${day}`, { task_ids: taskIds }),
  setCutOrder: (id: number, storyIds: number[]) => request<void>('PUT', `/projects/${id}/cut-order`, { story_ids: storyIds }),
  cut: (id: number, body: { story_id?: number; task_id?: number; milestone_id?: number }) => request<void>('POST', `/projects/${id}/cut`, body),
  stuck: (obstacleId: number, action: 'retry' | 'help', approach = '') =>
    request<Obstacle>('POST', `/obstacles/${obstacleId}/stuck`, { action, approach }),

  // Across projects.
  settings: () => request<AppSettings>('GET', '/settings'),
  saveSettings: (body: Partial<AppSettings>) => request<AppSettings>('PUT', '/settings', body),
  lessons: () => request<Lesson[]>('GET', '/lessons'),
  search: (q: string) => request<SearchHit[]>('GET', `/search?q=${encodeURIComponent(q)}`),
  activity: () => request<Activity>('GET', '/activity'),
  alerts: () => request<Alert[]>('GET', '/alerts'),
  backups: () => request<BackupList>('GET', '/backups'),
  createBackup: () => request<BackupInfo>('POST', '/backups', {}),
  restoreBackup: (name: string) => request<{ safety_backup: string }>('POST', `/backups/${encodeURIComponent(name)}/restore`, {}),
  deleteBackup: (name: string) => request<void>('DELETE', `/backups/${encodeURIComponent(name)}`),
  async importProject(file: Blob): Promise<Project> {
    let res: Response;
    try {
      res = await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: file });
    } catch {
      throw new ApiError(0, 'The import failed. Is the backend running?');
    }
    return parse<Project>(res);
  },
};

export type Resource = 'stories' | 'items' | 'milestones' | 'tasks' | 'obstacles';
