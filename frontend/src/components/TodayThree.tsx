import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { picksFor, todayKey } from '../lib';
import { useProject } from '../store';
import { addDays, dayKey } from '../time';
import type { DayPick, Task } from '../types';
import { useTaskActions } from './hooks';
import { Badge, Card, Icon } from './ui';

const MAX = 3;

/** What became of a pick: finished that day, finished later, still open, or gone. */
export function pickOutcome(pick: DayPick, tasks: Task[]): { label: string; tone: 'ok' | 'neutral' | 'danger' | 'accent'; task?: Task } {
  const task = pick.task_id === null ? undefined : tasks.find((t) => t.id === pick.task_id);
  if (!task) return { label: 'removed', tone: 'neutral' };
  if (task.status === 'done' && task.done_at) {
    return dayKey(task.done_at) <= pick.day ? { label: 'done', tone: 'ok', task } : { label: `done ${dayKey(task.done_at) === todayKey() ? 'today' : 'later'}`, tone: 'neutral', task };
  }
  if (task.scope === 'dlc') return { label: 'parked', tone: 'neutral', task };
  if (task.status === 'doing') return { label: 'in progress', tone: 'accent', task };
  return { label: pick.day < todayKey() ? 'not done' : 'not started', tone: pick.day < todayKey() ? 'danger' : 'neutral', task };
}

/** Pick up to three tasks for today; the journal later shows what became of them. */
export function TodayThree() {
  const { b, p, run } = useProject();
  const actions = useTaskActions();
  const today = todayKey();
  const picks = picksFor(b, today);
  const [editing, setEditing] = useState(false);
  const [chosen, setChosen] = useState<number[]>([]);

  const open = b.tasks.filter((t) => t.status !== 'done' && t.scope !== 'dlc');
  const candidates = [...open.filter((t) => t.status === 'doing'), ...open.filter((t) => t.status === 'todo'), ...open.filter((t) => t.status === 'backlog')];
  const yesterday = picksFor(b, dayKey(addDays(new Date(), -1)));
  const carried = yesterday.map((k) => pickOutcome(k, b.tasks)).filter((o) => o.task && o.task.status !== 'done' && o.task.scope !== 'dlc').map((o) => o.task!.id);

  const startEditing = () => {
    const current = picks.filter((k) => k.task_id !== null).map((k) => k.task_id!);
    setChosen(current.length ? current : carried.slice(0, MAX));
    setEditing(true);
  };
  const toggle = (id: number) => setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length >= MAX ? list : [...list, id]));
  const save = async () => {
    await run(() => api.setPicks(p.id, today, chosen));
    setEditing(false);
  };

  if (editing) {
    return (
      <Card title="Today's three" aside={<span className="muted">{chosen.length}/{MAX}</span>}>
        <p className="muted small">Pick at most three. Small enough that finishing all of them today is realistic.</p>
        <ul className="plain-list pick-list">
          {candidates.slice(0, 12).map((t) => {
            const on = chosen.includes(t.id);
            return (
              <li key={t.id}>
                <label className={`pick-option ${on ? 'on' : ''} ${!on && chosen.length >= MAX ? 'off' : ''}`}>
                  <input type="checkbox" checked={on} disabled={!on && chosen.length >= MAX} onChange={() => toggle(t.id)} />
                  <span>{t.title}</span>
                  {carried.includes(t.id) && <Badge>from yesterday</Badge>}
                  {t.estimate_hours ? <span className="muted small">{t.estimate_hours} h</span> : null}
                </label>
              </li>
            );
          })}
        </ul>
        <div className="card-actions">
          <button className="btn btn-primary btn-sm" onClick={save} disabled={chosen.length === 0 && picks.length === 0}>Set for today</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setChosen([]); }}>Cancel</button>
        </div>
      </Card>
    );
  }

  if (picks.length === 0) {
    return (
      <Card title="Today's three">
        {candidates.length === 0 ? (
          <p className="muted">Nothing open to pick from. <Link to="board">Add the next micro-challenge</Link>.</p>
        ) : (
          <>
            <p className="muted">Not picked yet. Three tasks, chosen in the morning, beat a board you stare at all day.</p>
            <div className="card-actions"><button className="btn btn-sm" onClick={startEditing}><Icon name="plus" size={13} /> Pick today's tasks</button></div>
          </>
        )}
      </Card>
    );
  }

  const outcomes = picks.map((k) => ({ pick: k, ...pickOutcome(k, b.tasks) }));
  const done = outcomes.filter((o) => o.task?.status === 'done').length;
  return (
    <Card title="Today's three" aside={<span className="muted">{done}/{picks.length} done</span>}>
      <ul className="plain-list pick-list">
        {outcomes.map((o) => (
          <li key={o.pick.id} className="row">
            <span className={`row-main ${o.task?.status === 'done' ? 'struck' : ''}`}>{o.task?.title ?? o.pick.title}</span>
            {o.task && o.task.status !== 'done' && o.task.status !== 'doing' && o.task.scope !== 'dlc' ? (
              <button className="btn btn-sm" onClick={() => actions.setStatus(o.task!, 'doing')}><Icon name="play" size={12} /> Start</button>
            ) : (
              <Badge tone={o.tone}>{o.label}</Badge>
            )}
          </li>
        ))}
      </ul>
      <div className="card-actions">
        <button className="link-btn small" onClick={startEditing}>Change</button>
      </div>
    </Card>
  );
}

/** The picks of a past day and what became of them — shown with a journal entry. */
export function PickOutcomes({ day }: { day: string }) {
  const { b } = useProject();
  const picks = picksFor(b, day);
  if (picks.length === 0) return null;
  return (
    <ul className="pick-outcomes">
      {picks.map((k) => {
        const o = pickOutcome(k, b.tasks);
        return (
          <li key={k.id} className={`pick-${o.tone}`}>
            <Icon name={o.label === 'done' ? 'check' : o.tone === 'danger' ? 'x' : 'arrow'} size={12} />
            <span>{o.task?.title ?? k.title}</span>
            <span className="muted small">{o.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
