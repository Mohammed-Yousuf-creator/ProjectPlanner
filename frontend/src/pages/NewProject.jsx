import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../services/api';

export default function NewProject() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    description: '',
    type: 'standard',
    goal: '',
    hackathon_start: '',
    hackathon_end: '',
    mvp_only: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const payload = { ...form };
    if (payload.hackathon_start) payload.hackathon_start = new Date(payload.hackathon_start).toISOString();
    if (payload.hackathon_end) payload.hackathon_end = new Date(payload.hackathon_end).toISOString();
    try {
      await post('/projects', payload);
      navigate('/');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <h1>New Project</h1>
      </div>
      <div className="card" style={{ maxWidth: 700 }}>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label>Project name</label>
          <input
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. My Solo SaaS" required
          />

          <label>Type</label>
          <select
            value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option value="standard">Standard project</option>
            <option value="hackathon">Hackathon (countdown clock)</option>
          </select>

          <label>Goal / why · who · value</label>
          <textarea
            value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })}
            rows={3} placeholder="Why this project, who is it for, what value does it deliver?"
          />

          {form.type === 'hackathon' && (
            <>
              <label>Hackathon start (countdown clock)</label>
              <input
                type="datetime-local"
                value={form.hackathon_start}
                onChange={(e) => setForm({ ...form, hackathon_start: e.target.value })}
              />
              <label>Hackathon end</label>
              <input
                type="datetime-local"
                value={form.hackathon_end}
                onChange={(e) => setForm({ ...form, hackathon_end: e.target.value })}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                <input type="checkbox" checked={form.mvp_only} onChange={(e) => setForm({ ...form, mvp_only: e.target.checked })} />
                MVP-only scope (ruthless cut for the demo)
              </label>
            </>
          )}

          <div className="actions" style={{ marginTop: '1.25rem' }}>
            <button type="submit" disabled={loading}>{loading ? 'Creating…' : 'Create Project'}</button>
            <button type="button" className="ghost" onClick={() => navigate('/')}>Cancel</button>
          </div>
        </form>

        <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#94a3b8' }}>
          <strong>Deadline:</strong> Your 14-day coding deadline is set automatically from the moment you decide (video2 anti-doom-perfectionist rule).<br />
          <strong>Uploads:</strong> capped at 10 MB and gzip-compressed before local storage.<br />
          <strong>No AI:</strong> this project intentionally contains no AI features (video13 constraint).
        </div>
      </div>
    </>
  );
}
