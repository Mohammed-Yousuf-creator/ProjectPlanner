const API = 'http://localhost:8080/api';

function json(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(`${API}${path}`, opts).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
    return data;
  });
}

export const get = (path) => json('GET', path);
export const post = (path, body) => json('POST', path, body);
export const put = (path, body) => json('PUT', path, body);
export const del = (path) => json('DELETE', path);

export const uploadFile = (projectId, file) => {
  const fd = new FormData();
  fd.append('file', file);
  return fetch(`${API}/projects/${projectId}/uploads`, { method: 'POST', body: fd }).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Upload failed (${r.status})`);
    return data;
  });
};

export const downloadUrl = (id) => `${API}/uploads/${id}/download`;

export const deadline = (id) => get(`/projects/${id}/deadline`);
export const countdown = (id) => get(`/projects/${id}/countdown`);
