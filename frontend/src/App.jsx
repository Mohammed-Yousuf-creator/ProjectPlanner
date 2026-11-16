import { Routes, Route, Link } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import NewProject from './pages/NewProject';
import ProjectDetail from './pages/ProjectDetail';

export default function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">ProjectPlanner</div>
        <nav>
          <Link to="/" className="nav-item">Dashboard</Link>
          <Link to="/new" className="nav-item">New Project</Link>
        </nav>
        <div style={{ marginTop: 'auto', fontSize: '0.75rem', color: '#64748b', lineHeight: 1.5 }}>
          Local · Postgres · Go · React<br />
          No AI · 10 MB uploads · 14-day deadline
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/new" element={<NewProject />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
        </Routes>
      </main>
    </div>
  );
}
