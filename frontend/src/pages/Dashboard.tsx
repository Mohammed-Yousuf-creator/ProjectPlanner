import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { YearHeatmap } from '../components/YearHeatmap';
import { Badge, Empty, Field, Icon, Modal, Progress, Segmented, Spinner } from '../components/ui';
import { useToast } from '../store';
import { times } from '../lib';
import type { Activity, Complexity, Lesson, Meta, ProjectSummary, ProjectType, VendorMode } from '../types';
import { clock, DAY, fmtDateTime, fromLocalInput, roughly, toLocalInput, useNow } from '../time';

// Fallback until /api/meta has answered; the server knows which steps each kind of project has.
const STEP_COUNT = { standard: 10, hackathon: 5 } as const;

export default function Dashboard() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);

  const load = useCallback(() => {
    api.projects().then((list) => { setProjects(list); setError(''); }).catch((e: Error) => setError(e.message));
    api.meta().then(setMeta).catch(() => undefined);
    api.activity().then(setActivity).catch(() => undefined);
    api.lessons().then(setLessons).catch(() => undefined);
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
        {active.map((p) => <ProjectCard key={p.id} p={p} onReload={load} stepKeys={meta?.step_keys[p.type]} />)}
      </div>

      {activity && (projects?.length ?? 0) > 0 && (
        <section className="card activity-card">
          <header className="card-head">
            <h3>The last year, across every project</h3>
            <div className="card-aside">
              {activity.multiplier > 0 && (
                <span title={`Actual time over estimated time, across ${activity.tasks} finished tasks`}>
                  Tasks take you <strong>{times(activity.multiplier)}</strong> your estimate
                </span>
              )}
            </div>
          </header>
          <YearHeatmap activity={activity} />
        </section>
      )}

      {lessons.length > 0 && (
        <section className="card lessons-card">
          <header className="card-head"><h3>What past projects taught you</h3></header>
          <LessonList lessons={lessons.slice(0, 6)} />
        </section>
      )}

      {archived.length > 0 && (
        <section className="archived">
          <button className="btn btn-ghost" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
          </button>
          {showArchived && <div className="project-grid">{archived.map((p) => <ProjectCard key={p.id} p={p} onReload={load} stepKeys={meta?.step_keys[p.type]} />)}</div>}
        </section>
      )}

      {creating && <NewProject onClose={() => setCreating(false)} lessons={lessons} />}
    </main>
  );
}

function ProjectCard({ p, onReload, stepKeys }: { p: ProjectSummary; onReload: () => void; stepKeys?: string[] }) {
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

  // Count only the steps this kind of project has: a hackathon has five, not ten.
  const keys = stepKeys ?? Object.keys(p.steps).slice(0, STEP_COUNT[p.type]);
  const stepsTotal = stepKeys?.length ?? STEP_COUNT[p.type];
  const stepsDone = keys.filter((k) => p.steps[k] === 'done' || p.steps[k] === 'skipped').length;

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
      {p.archived && p.archive_reason && <p className="project-card-reason">Stopped: {p.archive_reason}</p>}

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

function LessonList({ lessons }: { lessons: Lesson[] }) {
  return (
    <ul className="lesson-list">
      {lessons.map((l, i) => (
        <li key={i} className={`lesson lesson-${l.kind}`}>
          <Badge tone={l.kind === 'abandoned' ? 'danger' : 'ok'}>{l.kind === 'abandoned' ? 'dropped' : 'shipped'}</Badge>
          <span className="lesson-text">{l.text}</span>
          <Link className="lesson-from muted small" to={`/p/${l.project_id}`}>{l.project}</Link>
        </li>
      ))}
    </ul>
  );
}

function NewProject({ onClose, lessons }: { onClose: () => void; lessons: Lesson[] }) {
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
  const [kit, setKit] = useState('');

  useEffect(() => { api.meta().then(setMeta).catch(() => {}); }, []);

  const building = type === 'standard' ? meta?.building ?? [] : [];
  const mode = meta?.one_build_mode ?? 'warn';
  const blocked = building.length > 0 && mode === 'block';
  const chosenKit = meta?.kits.find((k) => k.key === kit);

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
    if (!name.trim() || hackProblem || busy || blocked) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { name, summary, type, complexity: size, vendor_mode: effectiveVendor, kit };
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
        {building.length > 0 && mode !== 'off' && (
          <div className={`notice ${blocked ? 'notice-danger' : 'notice-warn'}`}>
            <Icon name="alert" size={16} />
            <div>
              <strong>{building.length === 1 ? `“${building[0]}” is not finished.` : `${building.length} projects are not finished: ${building.join(', ')}.`}</strong>
              <p className="muted small">
                {blocked
                  ? 'You set the one-project rule to refuse a second build. Ship it, or archive it with a reason — then start this one.'
                  : `A new idea is most attractive exactly when the current project gets hard. Is this one worth leaving ${building.length === 1 ? 'that one' : 'those'} unfinished?`}
                {' '}<Link to="/settings" onClick={onClose}>Change the rule</Link>
              </p>
            </div>
          </div>
        )}
        {lessons.length > 0 && (
          <details className="lessons-inline">
            <summary>Before you start: {lessons.length} note{lessons.length === 1 ? '' : 's'} from your past projects</summary>
            <LessonList lessons={lessons.slice(0, 5)} />
          </details>
        )}
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

        {meta && meta.kits.length > 0 && (
          <Field label="Starter kit" hint="Optional. A kit fills in the stack layers, the usual unknowns and a first set of milestones for that kind of project. Everything it adds can be edited or deleted.">
            <div className="kit-grid" role="radiogroup" aria-label="Starter kit">
              <button type="button" role="radio" aria-checked={kit === ''} className={`choice-card ${kit === '' ? 'on' : ''}`} onClick={() => setKit('')}>
                <strong>Blank</strong><span>Start from an empty plan</span>
              </button>
              {meta.kits.map((k) => (
                <button key={k.key} type="button" role="radio" aria-checked={kit === k.key} className={`choice-card ${kit === k.key ? 'on' : ''}`} onClick={() => setKit(k.key)}>
                  <strong>{k.label}</strong><span>{k.blurb}</span>
                </button>
              ))}
            </div>
            {chosenKit && (
              <p className="muted small kit-detail">
                Adds: {chosenKit.stack_layers.length} stack layers ({chosenKit.stack_layers.join(', ')}), {chosenKit.questions.length} question{chosenKit.questions.length === 1 ? '' : 's'} to
                answer{type === 'standard' && chosenKit.milestones.length > 0 ? `, and the milestones ${chosenKit.milestones.join(' → ')}` : ''}.
              </p>
            )}
          </Field>
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
          <button type="submit" className="btn btn-primary" disabled={!name.trim() || !!hackProblem || busy || blocked}>
            {busy ? 'Creating…' : 'Decide & start the clock'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
