import { useState } from 'react';
import { uploadFile, downloadUrl, get, del } from '../services/api';

export default function FileUpload({ projectId, onChange }) {
  const [file, setFile] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    try {
      const data = await get(`/projects/${projectId}/uploads`);
      setUploads(data);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('File exceeds the 10 MB limit.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const created = await uploadFile(projectId, file);
      setMsg(`Uploaded (${created.size} bytes → ${created.compressed_size} bytes compressed).`);
      setFile(null);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(null), 4000);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this upload?')) return;
    try {
      await del(`/uploads/${id}`);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  load();

  return (
    <div className="card">
      <div className="section-title">📎 Attachments (max 10 MB, compressed on upload)</div>
      {error && <div className="alert alert-error">{error}</div>}
      {msg && <div className="alert alert-ok">{msg}</div>}
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: "0.6rem", alignItems: 'center', marginBottom: "1rem", flexWrap: 'wrap' }}>
        <input type="file" onChange={(e) => setFile(e.target.files[0] || null)} disabled={loading} />
        <button type="submit" disabled={loading || !file}>
          {loading ? 'Compressing…' : 'Attach & Compress'}
        </button>
        {file && <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</span>}
      </form>
      <div className="upload-list">
        {uploads.length === 0 && <div className="empty">No attachments yet.</div>}
        {uploads.map((u) => (
          <div key={u.id} className="upload-list-item">
            <a href={downloadUrl(u.id)} target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8', fontWeight: 600, flex: 1 }}>{u.original_name}</a>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{(u.size / 1024 / 1024).toFixed(2)} MB → {(u.compressed_size / 1024 / 1024).toFixed(2)} MB</span>
            <span className="compression">compressed</span>
            <button className="ghost danger" onClick={() => handleDelete(u.id)} style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}>Remove</button>
          </div>
        ))}
      </div>
      {onChange} 
    </div>
  );
}
