import { Link } from 'react-router-dom';
import CountdownClock from './CountdownClock';

export default function ProjectCard({ project, onDelete }) {
  const isHackathon = project.type === 'hackathon';
  const statusBadge = `badge-${project.status}`;
  const typeBadge = isHackathon ? 'badge-hackathon' : 'badge-standard';

  return (
    <Link to={`/projects/${project.id}`} className="project-card" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="pc-name">{project.name}</div>
      <div className="pc-meta">
        <span className={`badge ${typeBadge}`}>{isHackathon ? 'HACKATHON' : 'STANDARD'}</span>
        <span className={`badge ${statusBadge}`}>{project.status}</span>
        {project.overdue && <span className="badge badge-overdue">OVERDUE</span>}
      </div>
      {project.goal && <div className="pc-goal">{project.goal}</div>}
      <div style={{ marginTop: "0.6rem", fontSize: '0.85rem', color: '#94a3b8' }}>
        Coding deadline: <CountdownClock target={project.coding_deadline} />
      </div>
      {isHackathon && project.hackathon_start && (
        <div style={{ marginTop: "0.4rem", fontSize: '0.85rem', color: '#94a3b8' }}>
          Hackathon starts: <CountdownClock target={project.hackathon_start} />
        </div>
      )}
      {onDelete && (
        <button
          className="ghost danger"
          onClick={(e) => { e.stopPropagation(); onDelete(project.id); }}
          style={{ marginTop: "0.6rem", padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
        >
          Delete
        </button>
      )}
    </Link>
  );
}
