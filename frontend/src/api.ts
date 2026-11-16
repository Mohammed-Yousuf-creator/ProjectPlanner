// Thin client for the Go API. Every call goes to the same origin under /api.

import type { Bundle, GitInfo, Meta, Project, ProjectSummary, StoredFile } from './types';

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
};

export type Resource = 'stories' | 'items' | 'milestones' | 'tasks' | 'obstacles';
