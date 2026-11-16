import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Badge, Empty, Field, Icon, Modal, Progress, Segmented, Spinner } from '../components/ui';
import { useToast } from '../store';
import type { Complexity, Meta, ProjectSummary, ProjectType, VendorMode } from '../types';
import { clock, DAY, fmtDateTime, fromLocalInput, roughly, toLocalInput, useNow } from '../time';

const STEP_COUNT = { standard: 10, hackathon: 5 } as const;

export default function Dashboard() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(() => {
    api.projects().then((list) => { setProjects(list); setError(''); }).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    document.title = 'ProjectPlanner';
    load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  const active = useMemo(() => (projects ?? []).filter((p) => !p.archived), [projects]);
  const archived = useMemo(() => (projects ?? []).filter((p) => p.archived), [projects]);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p className="muted">Every project gets a deadline for planning. When it passes, you are coding.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" /> New project</button>
      </div>

      {error && (
        <div className="notice notice-danger">
          <Icon name="alert" /> <span>{error}</span>
          <button className="btn btn-sm" onClick={load}>Retry</button>
        </div>
      )}
      {!projects && !error && <Spinner />}

      {projects && active.length === 0 && (
        <Empty title="No projects yet">
          Decide on a project and the clock starts: you plan it step by step, and at most 14 days later you are writing code.
        </Empty>
      )}

      <div className="project-grid">
        {active.map((p) => <ProjectCard key={p.id} p={p} onReload={load} />)}
      </div>

      {archived.length > 0 && (
        <section className="archived">
          <button className="btn btn-ghost" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
          </button>
          {showArchived && <div className="project-grid">{archived.map((p) => <ProjectCard key={p.id} p={p} onReload={load} />)}</div>}
        </section>
      )}

      {creating && <NewProject onClose={() => setCreating(false)} />}
    </main>
  );
}

function ProjectCard({ p, onReload }: { p: ProjectSummary; onReload: () => void }) {
  const now = useNow(1000);
  const deadline = new Date(p.planning_deadline).getTime();
  const hackStart = p.hack_start ? new Date(p.hack_start).getTime() : null;
  const hackEnd = p.hack_end ? new Date(p.hack_end).getTime() : null;

  // The server moves a project into the build phase when its planning time is up.
  useEffect(() => {
    if (p.phase === 'plan' && now >= deadline) onReload();
  }, [p.phase, now >= deadline]); // eslint-disable-line react-hooks/exhaustive-deps

  let line: { label: string; time: string; tone: string };
  if (p.type === 'hackathon' && hackStart !== null && hackEnd !== null && p.phase !== 'shipped') {
    if (now < hackStart) line = { label: 'Starts in', time: clock(hackStart - now), tone: 'calm' };
    else if (now < hackEnd) line = { label: 'Time left', time: clock(hackEnd - now), tone: hackEnd - now < (hackEnd - hackStart) * 0.2 ? 'hot' : 'warn' };
    else line = { label: 'Hackathon', time: 'Time is up', tone: 'hot' };
  } else if (p.phase === 'plan') {
    const total = deadline - new Date(p.decided_at).getTime();
    const left = deadline - now;
    line = { label: 'Coding starts in', time: clock(left), tone: left < total * 0.15 ? 'hot' : left < total * 0.5 ? 'warn' : 'calm' };
  } else if (p.phase === 'build') {
    const since = p.build_started_at ? now - new Date(p.build_started_at).getTime() : 0;
    line = { label: 'Building', time: `Day ${Math.floor(since / DAY) + 1}`, tone: 'calm' };
  } else {
    line = { label: 'MVP', time: 'Shipped', tone: 'ok' };
  }

  const stepsDone = Object.values(p.steps).filter((s) => s === 'done' || s === 'skipped').length;
  const stepsTotal = STEP_COUNT[p.type];

  return (
    <Link to={`/p/${p.id}`} className={`project-card ${p.archived ? 'is-archived' : ''}`}>
      <div className="project-card-top">
        <h2>{p.name}</h2>
        <div className="badges">
          {p.type === 'hackathon' && <Badge tone="info">Hackathon</Badge>}
          <Badge tone={p.phase === 'plan' ? 'accent' : p.phase === 'build' ? 'neutral' : 'ok'}>
            {p.phase === 'plan' ? 'Planning' : p.phase === 'build' ? 'Building' : 'Shipped'}
          </Badge>
        </div>
      </div>
      {p.summary && <p className="project-card-summary">{p.summary}</p>}

      <div className={`project-card-clock tone-${line.tone}`}>
        <span>{line.label}</span>
        <strong>{line.time}</strong>
      </div>

      {p.phase === 'plan' ? (
        <div className="project-card-progress">
          <Progress value={Math.min(stepsDone, stepsTotal)} max={stepsTotal} label="Planning steps" />
          <span>{Math.min(stepsDone, stepsTotal)}/{stepsTotal} planning steps</span>
        </div>
      ) : (
        <div className="project-card-progress">
          <Progress value={p.tasks_done} max={p.tasks_total} tone="ok" label="Tasks done" />
          <span>{p.tasks_done}/{p.tasks_total} tasks done</span>
        </div>
      )}

      <div className="project-card-foot">
        {p.focus_task ? <span className="focus-line"><Icon name="play" size={12} /> {p.focus_task}</span> : <span className="muted">{p.phase === 'plan' ? 'Open to keep planning' : 'Nothing in progress'}</span>}
        {p.open_obstacles > 0 && <Badge tone="danger">{p.open_obstacles} stuck</Badge>}
      </div>
    </Link>
  );
}

const SIZES: { value: Complexity; label: string; blurb: string }[] = [
  { value: 'tiny', label: 'Tiny', blurb: 'A script or a weekend hack' },
  { value: 'small', label: 'Small', blurb: 'A few screens, one core idea' },
  { value: 'medium', label: 'Medium', blurb: 'A real app with several parts' },
  { value: 'hard', label: 'Hard', blurb: 'Big, unfamiliar, lots of unknowns' },
];

function NewProject({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const now = useNow(30_000);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [type, setType] = useState<ProjectType>('standard');
  const [size, setSize] = useState<Complexity>('medium');
  const [vendor, setVendor] = useState<VendorMode | ''>('');
  const [hackStart, setHackStart] = useState(() => toLocalInput(new Date()));
  const [hackEnd, setHackEnd] = useState(() => toLocalInput(new Date(Date.now() + DAY)));
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.meta().then(setMeta).catch(() => {}); }, []);

  const days = meta?.planning_days[size] ?? { tiny: 1, small: 3, medium: 7, hard: 14 }[size];
  const maxDays = meta?.max_planning_days ?? 14;
  const effectiveVendor: VendorMode = vendor || (type === 'hackathon' ? 'fasttrack' : 'diy');

  const hackSpan = useMemo(() => {
    const s = fromLocalInput(hackStart);
    const e = fromLocalInput(hackEnd);
    if (!s || !e) return null;
    return new Date(e).getTime() - new Date(s).getTime();
  }, [hackStart, hackEnd]);
  const hackProblem = type === 'hackathon'
    ? hackSpan === null ? 'Set a start and a deadline.' : hackSpan <= 0 ? 'The deadline must be after the start.' : hackSpan < 30 * 60_000 ? 'A hackathon lasts at least 30 minutes.' : ''
    : '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || hackProblem || busy) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { name, summary, type, complexity: size, vendor_mode: effectiveVendor };
      if (type === 'hackathon') {
        body.hack_start = fromLocalInput(hackStart);
        body.hack_end = fromLocalInput(hackEnd);
      }
      const p = await api.createProject(body);
      navigate(`/p/${p.id}/blueprint`);
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title="New project" onClose={onClose} wide>
      <form onSubmit={submit} className="form">
        <Field label="Name" htmlFor="np-name">
          <input id="np-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120}
            placeholder="e.g. Habit tracker" autoFocus required />
        </Field>
        <Field label="One line: what is it?" htmlFor="np-summary">
          <input id="np-summary" className="input" value={summary} onChange={(e) => setSummary(e.target.value)}
            placeholder="A vague idea is fine — the plan sharpens it" />
        </Field>

        <Field label="Kind of project">
          <Segmented<ProjectType> ariaLabel="Kind of project" value={type} onChange={setType}
            options={[{ value: 'standard', label: 'Standard project' }, { value: 'hackathon', label: 'Hackathon' }]} />
        </Field>

        {type === 'standard' ? (
          <>
            <Field label="How hard is it?" hint="Harder projects get more planning time — but never more than 14 days.">
              <div className="size-grid" role="radiogroup" aria-label="Project size">
                {SIZES.map((s) => (
                  <button key={s.value} type="button" role="radio" aria-checked={size === s.value}
                    className={`size-card ${size === s.value ? 'on' : ''}`} onClick={() => setSize(s.value)}>
                    <strong>{s.label}</strong>
                    <span>{s.blurb}</span>
                    <em>Plan: {meta?.planning_days[s.value] ?? '…'} {meta?.planning_days[s.value] === 1 ? 'day' : 'days'}</em>
                  </button>
                ))}
              </div>
            </Field>
            <div className="commitment">
              <Icon name="flag" size={18} />
              <div>
                <strong>You will be coding by {fmtDateTime(now + days * DAY)} at the latest.</strong>
                <p>The clock starts when you create the project. You can start earlier or shorten the deadline, but it can never
                  be moved past {maxDays} days — whatever is unplanned then gets decided while building.</p>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="form-row">
              <Field label="Hackathon starts" htmlFor="np-start">
                <input id="np-start" type="datetime-local" className="input" value={hackStart} onChange={(e) => setHackStart(e.target.value)} required />
              </Field>
              <Field label="Submission deadline" htmlFor="np-end">
                <input id="np-end" type="datetime-local" className="input" value={hackEnd} onChange={(e) => setHackEnd(e.target.value)} required />
              </Field>
            </div>
            {hackProblem ? (
              <p className="field-error">{hackProblem}</p>
            ) : (
              <div className="commitment">
                <Icon name="flag" size={18} />
                <div>
                  <strong>{roughly(hackSpan ?? 0)} on the clock.</strong>
                  <p>Planning gets about 10% of the event (a quarter at most), then you are coding. Features freeze at 80%,
                    and the last stretch is reserved for the demo and the submission.</p>
                </div>
              </div>
            )}
          </>
        )}

        <Field label="Auth, database, hosting…"
          hint="Your default for the plumbing. It is only a starting point — you decide per capability in the plan, and can change it any time.">
          <Segmented<VendorMode> ariaLabel="Approach" value={effectiveVendor} onChange={setVendor}
            options={[
              { value: 'diy', label: 'Build it myself', title: 'Slower, but you learn how it works' },
              { value: 'fasttrack', label: 'Fast-track with external services', title: 'For hackathons and real launches' },
            ]} />
        </Field>

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!name.trim() || !!hackProblem || busy}>
            {busy ? 'Creating…' : 'Decide & start the clock'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
