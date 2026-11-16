import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, del } from '../services/api';
import ProjectCard from '../components/ProjectCard';
import CountdownClock from '../components/CountdownClock';

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const data = await get('/projects');
      setProjects(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this project and all its stories, tasks, models, and uploads?')) return;
    try {
      await del(`/projects/${id}`);
      setProjects(projects.filter((p) => p.id !== id));
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="card"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Project Hub</h1>
          <div className="subtitle">Central control for your solo software projects.</div>
        </div>
        <Link to="/new"><button>New Project</button></Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="section-title">Your projects</div>
        {projects.length === 0 ? (
          <div className="empty">No projects yet. Create your first project to begin planning.</div>
        ) : (
          <div className="grid">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-title">🚦 14-day coding deadline</div>
        <div className="subtitle">Per video2, coding must start within 14 days of deciding — no doom perfectionism.</div>
        <div style={{ marginTop: "0.75rem" }}>
          <CountdownClock
            target={new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()}
            label="Example: decision + 14 days"
          />
        </div>
      </div>
    </div>
  );
}
