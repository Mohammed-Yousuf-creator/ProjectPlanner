import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useClock } from '../components/Clock';
import { useTaskActions } from '../components/hooks';
import { Icon } from '../components/ui';
import { checklistProgress, hoursLabel, isStale, picksFor, staleLimitMs, todayKey } from '../lib';
import { useProject } from '../store';
import { clock, roughly } from '../time';
import type { Task } from '../types';

const key = (projectId: number) => `planner-focus-${projectId}`;

interface Session { taskId: number; startedAt: number }

function readSession(projectId: number): Session | null {
  try {
    const raw = JSON.parse(localStorage.getItem(key(projectId)) ?? 'null') as Session | null;
    return raw && typeof raw.taskId === 'number' && typeof raw.startedAt === 'number' ? raw : null;
  } catch { return null; }
}
function writeSession(projectId: number, s: Session | null) {
  try {
    if (s) localStorage.setItem(key(projectId), JSON.stringify(s));
    else localStorage.removeItem(key(projectId));
  } catch { /* private mode */ }
}

/** Minutes worked in a session, capped so a forgotten tab cannot log a whole night. */
const MAX_SESSION_MINUTES = 6 * 60;
const sessionMinutes = (s: Session, now: number) => Math.min(MAX_SESSION_MINUTES, Math.max(0, Math.round((now - s.startedAt) / 60_000)));

/**
 * One task, the clock and nothing else. The time you spend here is added to the task, which is
 * what makes "estimate against actual" work without a timesheet.
 */
export default function Focus() {
  const { b, p, run } = useProject();
  const actions = useTaskActions();
  const navigate = useNavigate();
  const { now, state } = useClock(b);
  const [session, setSession] = useState<Session | null>(() => readSession(p.id));
  const [paused, setPaused] = useState(false);
  const saving = useRef(false);

  const doing = b.tasks.filter((t) => t.status === 'doing');
  const task = (session && doing.find((t) => t.id === session.taskId)) || doing[0];

  // Keep the running session attached to the task on screen.
  useEffect(() => {
    if (paused) return;
    if (!task) {
      if (session) { writeSession(p.id, null); setSession(null); }
      return;
    }
    if (!session || session.taskId !== task.id) {
      const next = { taskId: task.id, startedAt: Date.now() };
      writeSession(p.id, next);
      setSession(next);
    }
  }, [task?.id, session, paused, p.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Adds the session's minutes to the task and ends the session. */
  const bank = async (t: Task, extra: Record<string, unknown> = {}) => {
    if (saving.current) return;
    saving.current = true;
    const minutes = session && session.taskId === t.id && !paused ? sessionMinutes(session, Date.now()) : 0;
    writeSession(p.id, null);
    setSession(null);
    const body = { ...extra, ...(minutes > 0 ? { spent_minutes: t.spent_minutes + minutes } : {}) };
    if (Object.keys(body).length > 0) await run(() => api.patch('tasks', t.id, body));
    saving.current = false;
  };

  const pause = async () => {
    if (!task) return;
    setPaused(true);
    await bank(task);
  };
  const resume = () => setPaused(false);
  const leave = async () => {
    if (task && !paused) await bank(task);
    navigate(`/p/${p.id}`);
  };

  const today = picksFor(b, todayKey());
  const pickedOpen = today.map((k) => b.tasks.find((t) => t.id === k.task_id)).filter((t): t is Task => !!t && t.status !== 'done' && t.status !== 'doing' && t.scope !== 'dlc');
  const queue = pickedOpen.length > 0 ? pickedOpen : b.tasks.filter((t) => t.status === 'todo' && t.scope !== 'dlc').slice(0, 3);
  const countdown = state.target !== undefined ? clock(state.target - now) : state.text ?? '';

  return (
    <div className={`focus-screen tone-${state.tone}`}>
      <header className="focus-bar">
        <button className="btn btn-ghost btn-sm" onClick={leave}><Icon name="back" size={14} /> Leave focus</button>
        <span className="focus-project">{p.name}</span>
        <span className="focus-clock" title={state.label}>
          <span className="focus-clock-label">{state.label}</span>
          <span className="focus-clock-time">{countdown}</span>
        </span>
      </header>

      {!task ? (
        <div className="focus-empty">
          <h2>Nothing in progress.</h2>
          {queue.length === 0 ? (
            <p className="muted">The board has nothing queued. <Link to={`/p/${p.id}/board`}>Add the next micro-challenge</Link>.</p>
          ) : (
            <>
              <p className="muted">{pickedOpen.length > 0 ? 'Next from today\'s three:' : 'Start the next micro-challenge:'}</p>
              <ul className="plain-list focus-queue">
                {queue.map((t) => (
                  <li key={t.id}>
                    <button className="btn focus-start" onClick={() => { setPaused(false); void actions.setStatus(t, 'doing'); }}>
                      <Icon name="play" size={14} /> {t.title}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <FocusTask task={task} now={now} session={paused ? null : session} paused={paused}
          onDone={() => bank(task, { status: 'done' })}
          onPutBack={() => bank(task, { status: 'todo' })}
          onPause={pause} onResume={resume}
          onStuck={async () => { await bank(task); navigate(`/p/${p.id}/obstacles?task=${task.id}`); }} />
      )}

      {doing.length > 1 && task && (
        <p className="focus-others">
          {doing.length - 1} other task{doing.length === 2 ? ' is' : 's are'} also in progress:{' '}
          {doing.filter((t) => t.id !== task.id).map((t) => (
            <button key={t.id} className="link-btn" onClick={async () => { await bank(task); const next = { taskId: t.id, startedAt: Date.now() }; writeSession(p.id, next); setSession(next); }}>{t.title}</button>
          )).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, ', ', el] : [el]), [])}
          . One at a time keeps you in flow.
        </p>
      )}
    </div>
  );
}

function FocusTask({ task, now, session, paused, onDone, onPutBack, onPause, onResume, onStuck }: {
  task: Task; now: number; session: Session | null; paused: boolean;
  onDone: () => void; onPutBack: () => void; onPause: () => void; onResume: () => void; onStuck: () => void;
}) {
  const { b, p } = useProject();
  const actions = useTaskActions();
  const cp = checklistProgress(task);
  const running = session && session.taskId === task.id ? Math.max(0, now - session.startedAt) : 0;
  const total = task.spent_minutes + running / 60_000;
  const over = task.estimate_hours ? total / 60 > task.estimate_hours : false;
  const stale = isStale(task, p.stale_hours, now);
  const milestone = b.milestones.find((m) => m.id === task.milestone_id);
  const nextStep = task.checklist.findIndex((c) => !c.done);

  return (
    <main className="focus-task-screen">
      <p className="focus-kicker">
        #{task.id}{milestone ? ` · ${milestone.title}` : ''}
      </p>
      <h1>{task.title}</h1>
      {task.notes && <p className="muted pre focus-notes">{task.notes}</p>}

      {task.checklist.length > 0 && (
        <ul className="checklist focus-checklist">
          {task.checklist.map((c, i) => (
            <li key={i} className={i === nextStep ? 'next' : ''}>
              <label className={c.done ? 'done' : ''}>
                <input type="checkbox" checked={c.done} onChange={() => actions.toggleCheck(task, i)} /> <span>{c.text}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className={`focus-timer ${over ? 'over' : ''}`}>
        <span className="focus-timer-time">{clock(running)}</span>
        <span className="muted">
          {paused ? 'paused' : 'this session'} · {hoursLabel(Math.round(total))} on this task
          {task.estimate_hours ? ` of ${task.estimate_hours} h estimated` : ''}
        </span>
      </div>
      {over && <p className="focus-warn"><Icon name="alert" size={14} /> Past your estimate. Is there a smaller version of this that would do?</p>}
      {stale && <p className="focus-warn"><Icon name="alert" size={14} /> In progress for {roughly(now - new Date(task.started_at!).getTime())} (limit {roughly(staleLimitMs(task, p.stale_hours))}). <Link to={`/p/${p.id}/board?task=${task.id}`}>Split it or cut it.</Link></p>}

      <div className="focus-actions">
        <button className="btn btn-primary btn-lg" onClick={onDone} title={cp.total > cp.done ? 'Some sub-steps are still open' : undefined}>
          <Icon name="check" /> Done
        </button>
        {paused
          ? <button className="btn btn-lg" onClick={onResume}><Icon name="play" size={14} /> Resume</button>
          : <button className="btn btn-lg" onClick={onPause}>Pause</button>}
        <button className="btn btn-ghost btn-lg" onClick={onStuck}>I'm stuck</button>
        <button className="btn btn-ghost btn-lg" onClick={onPutBack}>Put back</button>
      </div>
    </main>
  );
}
