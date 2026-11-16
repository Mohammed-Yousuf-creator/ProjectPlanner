import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Icon } from './components/ui';
import Dashboard from './pages/Dashboard';
import ProjectLayout from './pages/ProjectLayout';
import Overview from './pages/Overview';
import Blueprint from './pages/Blueprint';
import Board from './pages/Board';
import Journal from './pages/Journal';
import Obstacles from './pages/Obstacles';
import Files from './pages/Files';
import Hackathon from './pages/Hackathon';
import Settings from './pages/Settings';

type Theme = 'dark' | 'light';

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = document.documentElement.dataset.theme;
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('planner-theme', theme); } catch { /* private mode */ }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}

export default function App() {
  const [theme, toggleTheme] = useTheme();
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="ProjectPlanner — all projects">
          <span className="brand-mark" aria-hidden="true"><Icon name="clock" size={18} /></span>
          ProjectPlanner
        </Link>
        <span className="topbar-rule">Decide → plan for at most 14 days → code.</span>
        <button className="icon-btn" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
        </button>
      </header>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/p/:projectId" element={<ProjectLayout />}>
          <Route index element={<Overview />} />
          <Route path="blueprint" element={<Blueprint />} />
          <Route path="blueprint/:stepKey" element={<Blueprint />} />
          <Route path="board" element={<Board />} />
          <Route path="journal" element={<Journal />} />
          <Route path="obstacles" element={<Obstacles />} />
          <Route path="files" element={<Files />} />
          <Route path="hackathon" element={<Hackathon />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
