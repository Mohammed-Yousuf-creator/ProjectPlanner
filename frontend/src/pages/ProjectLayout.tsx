import { useCallback, useEffect } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { ClockChip } from '../components/Clock';
import { Badge, Icon, Spinner } from '../components/ui';
import { clockState } from '../lib';
import { ProjectProvider, useProject } from '../store';
import { clock, useNow } from '../time';

export default function ProjectLayout() {
  const { projectId } = useParams();
  const id = Number(projectId);
  if (!Number.isInteger(id) || id <= 0) return <Missing />;
  return (
    <ProjectProvider
      key={id}
      id={id}
      fallback={(state, retry) =>
        state.status === 'loading' ? (
          <main className="page"><Spinner /></main>
        ) : state.notFound ? (
          <Missing />
        ) : (
          <main className="page">
            <div className="notice notice-danger">
              <Icon name="alert" /> <span>{state.message}</span>
              <button className="btn btn-sm" onClick={retry}>Retry</button>
            </div>
          </main>
        )
      }
    >
      <Shell />
    </ProjectProvider>
  );
}

function Missing() {
  return (
    <main className="page">
      <div className="empty">
        <strong>This project does not exist.</strong>
        <p><Link to="/">Back to all projects</Link></p>
      </div>
    </main>
  );
}

function Shell() {
  const { b, p, reload } = useProject();
  const onZero = useCallback(() => { void reload(); }, [reload]);
  const openObstacles = b.obstacles.filter((o) => o.status === 'open').length;
  const planning = p.phase === 'plan';

  return (
    <>
      <TitleClock />
      <div className="project-head">
        <div className="project-head-row">
          <Link to="/" className="back-link" aria-label="All projects"><Icon name="back" /></Link>
          <div className="project-title">
            <h1>{p.name}</h1>
            <div className="badges">
              {p.type === 'hackathon' && <Badge tone="info">Hackathon</Badge>}
              <Badge tone={planning ? 'accent' : p.phase === 'build' ? 'neutral' : 'ok'}>
                {planning ? 'Planning' : p.phase === 'build' ? 'Building' : 'Shipped'}
              </Badge>
              {p.archived && <Badge>Archived</Badge>}
            </div>
          </div>
          <ClockChip b={b} onZero={onZero} />
        </div>
        <nav className="tabs" aria-label="Project sections">
          <NavLink to="." end>Overview</NavLink>
          <NavLink to="blueprint">{planning ? 'Blueprint' : 'Blueprint (reference)'}</NavLink>
          <NavLink to="board">Board</NavLink>
          {p.type === 'hackathon' && <NavLink to="hackathon">Hackathon</NavLink>}
          <NavLink to="journal">Journal</NavLink>
          <NavLink to="obstacles">Stuck?{openObstacles > 0 && <span className="tab-count">{openObstacles}</span>}</NavLink>
          <NavLink to="files">Files</NavLink>
          <NavLink to="settings">Settings</NavLink>
        </nav>
      </div>
      <main className="page page-project">
        <Outlet />
      </main>
    </>
  );
}

/** Keeps the countdown visible in the browser tab title, so it follows you into the editor. */
function TitleClock() {
  const { b, p } = useProject();
  const now = useNow(1000);
  const state = clockState(b, now);
  const text = state.target !== undefined ? clock(state.target - now) : state.text ?? '';
  useEffect(() => {
    document.title = `${text ? `${text} · ` : ''}${p.name}`;
    return () => { document.title = 'ProjectPlanner'; };
  }, [text, p.name]);
  return null;
}
