import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { get, post, put, del, countdown, deadline } from '../services/api';
import CountdownClock from '../components/CountdownClock';
import FileUpload from '../components/FileUpload';

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('stories');

  const [tabData, setTabData] = useState({ stories: [], tasks: [], models: [] });

  const load = async () => {
    try {
      const [p, stories, tasks, models] = await Promise.all([
        get(`/projects/${id}`),
        get(`/projects/${id}/stories`),
        get(`/projects/${id}/tasks`),
        get(`/projects/${id}/datamodels`),
      ]);
      setProject(p);
      setTabData({ stories, tasks, models });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  if (loading) return <div className="card"><div className="spinner"></div></div>;
  if (error) return <div className="card"><div className="alert alert-error">{error}</div></div>;
  if (!project) return null;

  const isHackathon = project.type === 'hackathon';
  const statusLabel = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // ---------- Stories ----------
  const [storyForm, setStoryForm] = useState({ title: '', description: '', priority: 'medium', story_points: 0 });
  const addStory = async (e) => {
    e.preventDefault();
    try {
      const created = await post(`/projects/${id}/stories`, storyForm);
      setTabData({ ...tabData, stories: [...tabData.stories, created] });
      setStoryForm({ title: '', description: '', priority: 'medium', story_points: 0 });
    } catch (e) { setError(e.message); }
  };

  // ---------- Tasks ----------
  const [taskForm, setTaskForm] = useState({ title: '', description: '', user_story_id: '', due_date: '', time_box_min: 0 });
  const addTask = async (e) => {
    e.preventDefault();
    try {
      const created = await post(`/projects/${id}/tasks`, taskForm);
      setTabData({ ...tabData, tasks: [...tabData.tasks, created] });
      setTaskForm({ title: '', description: '', user_story_id: '', due_date: '', time_box_min: 0 });
    } catch (e) { setError(e.message); }
  };

  const setTaskStatus = async (task, status) => {
    try {
      await put(`/api/tasks/${task.id}`, { ...task, status });
      load();
    } catch (e) { setError(e.message); }
  };

  // ---------- Data models ----------
  const [modelForm, setModelForm] = useState({ name: '', description: '', fields: [] });
  const addModel = async (e) => {
    e.preventDefault();
    try {
      const created = await post(`/projects/${id}/datamodels`, modelForm);
      setTabData({ ...tabData, models: [...tabData.models, created] });
      setModelForm({ name: '', description: '', fields: [] });
    } catch (e) { setError(e.message); }
  };

  const toggleStatus = (item, status, kind) => {
    const path = kind === 'story' ? `/api/stories/${item.id}` : `/api/tasks/${item.id}`;
    put(path, { ...item, status }).then(() => load()).catch((e) => setError(e.message));
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}><button className="ghost" style={{ padding: '0.35rem 0.9rem', fontSize: '0.85rem' }}>&larr; Back</button></Link>
          <h1>{project.name}</h1>
          <div className="subtitle">{project.goal || 'No goal set yet.'}</div>
        </div>
        <div style={{ display: 'flex', gap: "0.5rem", flexWrap: 'wrap' }}>
          <span className={`badge ${isHackathon ? 'badge-hackathon' : 'badge-standard'}`}>{isHackathon ? 'HACKATHON' : 'STANDARD'}</span>
          <span className={`badge badge-${project.status}`}>{statusLabel(project.status)}</span>
          {project.overdue && <span className="badge badge-overdue">CODING DEADLINE OVERDUE</span>}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* 14-day coding deadline */}
      <div className="deadline-banner {project.overdue ? 'overdue' : 'safe'}">
        <strong style={{ marginRight: "0.5rem" }}>
          {project.overdue ? '🚨 START CODING NOW' : '⏳ Coding deadline'}
        </strong>
        <CountdownClock
          target={project.coding_deadline}
          label={project.overdue
            ? `Deadline passed (${project.days_left} days overdue)`
            : `${project.days_left} days left to start coding`}
        />
        <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: '#94a3b8' }}>
          Set automatically at decision + 14 days (video2 anti-doom rule).
        </span>
      </div>

      {/* Hackathon countdown */}
      {isHackathon && (
        <div className="card">
          <div className="section-title">🏁 Hackathon Countdown</div>
          <CountdownClock target={project.hackathon_start} label="Time until hackathon starts" />
          {project.mvp_only && <span style={{ color: '#fbbf24', fontWeight: 700, marginLeft: "0.5rem" }}>MVP-only scope active</span>}
          <div style={{ marginTop: "0.6rem", fontSize: '0.85rem', color: '#94a3b8' }}>
            Rapid MVP scope, time-boxed tasks, and a demo checklist keep you shipping before the clock hits zero.
          </div>
        </div>
      )}

      <div className="tabs">
        <button className={`tab ${tab === 'stories' ? 'active' : ''}`} onClick={() => setTab('stories')}>User Stories</button>
        <button className={`tab ${tab === 'tasks' ? 'active' : ''}`} onClick={() => setTab('tasks')}>Tasks</button>
        <button className={`tab ${tab === 'models' ? 'active' : ''}`} onClick={() => setTab('models')}>Data Models</button>
        <button className={`tab ${tab === 'uploads' ? 'active' : ''}`} onClick={() => setTab('uploads')}>Attachments</button>
      </div>

      {tab === 'stories' && (
        <div className="section">
          <div className="row">
            <div style={{ flex: 1 }}>
              <form onSubmit={addStory} style={{ display: 'flex', gap: "0.6rem", flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <input value={storyForm.title} onChange={(e) => setStoryForm({ ...storyForm, title: e.target.value })} placeholder="Story title" required />
                <select value={storyForm.priority} onChange={(e) => setStoryForm({ ...storyForm, priority: e.target.value })} style={{ width: 110 }}>
                  <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                </select>
                <input type="number" value={storyForm.story_points} onChange={(e) => setStoryForm({ ...storyForm, story_points: Number(e.target.value) || 0 })} placeholder="Pts" style={{ width: 70 }} />
                <button type="submit">Add Story</button>
              </form>
              <textarea value={storyForm.description} onChange={(e) => setStoryForm({ ...storyForm, description: e.target.value })} placeholder="Non-technical description (who, what, value)" rows={2} style={{ width: '100%', marginTop: "0.5rem" }} />
            </div>
          </div>
          <div style={{ marginTop: "0.75rem" }}>
            {tabData.stories.length === 0 ? <div className="empty">No user stories yet.</div> : (
              tabData.stories.map((s) => (
                <div key={s.id} className="list-item">
                  <div style={{ flex: 1 }}>
                    <div className="title">{s.title}</div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{s.description || ''} · <span className={`badge badge-${s.priority}`}>{s.priority}</span> · {s.story_points} pts</div>
                  </div>
                  <button className="ghost" onClick={() => toggleStatus(s, s.status === 'done' ? 'todo' : 'done', 'story')} style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}>
                    {s.status === 'done' ? 'Reopen' : 'Done'}
                  </button>
                  <button className="ghost danger" onClick={() => del(`/api/stories/${s.id}`).then(() => load())} style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}>Delete</button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'tasks' && (
        <div className="section">
          <div className="row">
            <form onSubmit={addTask} style={{ display: 'flex', gap: "0.6rem", flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="Task title" required style={{ flex: 1 }} />
              <select value={taskForm.user_story_id} onChange={(e) => setTaskForm({ ...taskForm, user_story_id: e.target.value })} style={{ width: 150 }}>
                <option value="">(no story)</option>
                {tabData.stories.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
              <input type="datetime-local" value={taskForm.due_date} onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })} style={{ width: 170 }} />
              <input type="number" value={taskForm.time_box_min} onChange={(e) => setTaskForm({ ...taskForm, time_box_min: Number(e.target.value) || 0 })} placeholder="Time-box min" style={{ width: 100 }} />
              <button type="submit">Add Task</button>
            </form>
            <textarea value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} placeholder="Description" rows={2} style={{ width: '100%', marginTop: "0.5rem" }} />
          </div>
          <div style={{ marginTop: "0.75rem" }}>
            {tabData.tasks.length === 0 ? <div className="empty">No tasks yet.</div> : (
              tabData.tasks.map((t) => (
                <div key={t.id} className="list-item">
                  <div style={{ flex: 1 }}>
                    <div className="title">{t.title}</div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{t.description || ''} {t.time_box_min ? `· ⏱ ${t.time_box_min} min` : ''}</div>
                  </div>
                  <button className="ghost" onClick={() => toggleStatus(t, t.status === 'done' ? 'todo' : 'done', 'task')} style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}>
                    {t.status === 'done' ? 'Reopen' : 'Done'}
                  </button>
                  <button className="ghost danger" onClick={() => del(`/api/tasks/${t.id}`).then(() => load())} style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}>Delete</button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'models' && (
        <div className="section">
          <form onSubmit={addModel} style={{ display: 'flex', gap: "0.6rem", flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: "0.75rem" }}>
            <input value={modelForm.name} onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })} placeholder="Model name" required style={{ flex: 1 }} />
            <button type="submit">Add Model</button>
          </form>
          <textarea value={modelForm.description} onChange={(e) => setModelForm({ ...modelForm, description: e.target.value })} placeholder="Description" rows={2} style={{ width: '100%', marginBottom: "0.75rem" }} />
          <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: "0.4rem" }}>Fields (name, type)</div>
          {tabData.models.length === 0 && <div className="empty">No data models yet.</div>}
          {tabData.models.map((m) => (
            <div key={m.id} className="list-item">
              <div style={{ flex: 1 }}>
                <div className="title">{m.name}</div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{m.description || ''}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: "0.25rem" }}>
                  {(m.fields || []).map((f) => `${f.name}: ${f.type}`).join(', ') || '(no fields)'}
                </div>
              </div>
              <button className="ghost danger" onClick={() => del(`/api/datamodels/${m.id}`).then(() => load())} style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}>Delete</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'uploads' && (
        <div className="section">
          <FileUpload projectId={id} />
        </div>
      )}
    </div>
  );
}
