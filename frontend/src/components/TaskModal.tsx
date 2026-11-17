import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useProject } from '../store';
import type { Task, TaskScope, TaskStatus } from '../types';
import { hoursLabel, isStale, staleLimitMs, times } from '../lib';
import { dayKey, endOfDayISO, fmtDateTime, fromLocalInput, roughly, toLocalInput, useNow } from '../time';
import { useTaskActions } from './hooks';
import { AddInput, Badge, ConfirmButton, Field, Icon, Modal, SavedDate, SavedText, Segmented } from './ui';

export const STATUS_LABEL: Record<TaskStatus, string> = { backlog: 'Backlog', todo: 'To do', doing: 'Doing', done: 'Done' };

export function TaskModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const { b, p, run } = useProject();
  const actions = useTaskActions();
  const precise = p.type === 'hackathon';
  const story = b.stories.find((s) => s.id === task.story_id);
  const obstacles = b.obstacles.filter((o) => o.task_id === task.id);
  const now = useNow(60_000);
  const stale = isStale(task, p.stale_hours, now);
  const ratio = task.estimate_hours && task.spent_minutes > 0 ? task.spent_minutes / 60 / task.estimate_hours : null;

  /** Splitting: the unticked sub-steps move to a new task, this one keeps what is done. */
  const split = async () => {
    const open = task.checklist.filter((c) => !c.done);
    const title = open.length === 1 ? open[0].text : `${task.title} — the rest`;
    await run(async () => {
      await api.create(p.id, 'tasks', {
        title, status: 'todo', scope: task.scope === 'dlc' ? 'dlc' : 'mvp', milestone_id: task.milestone_id, story_id: task.story_id,
        checklist: open.length > 1 ? open : [], split_from: task.id,
      });
      if (open.length > 0) await api.patch('tasks', task.id, { checklist: task.checklist.filter((c) => c.done) });
    });
  };

  const setChecklist = (checklist: Task['checklist']) => actions.patch(task, { checklist });

  return (
    <Modal wide onClose={onClose}
      title={<SavedText className="title-input" value={task.title} ariaLabel="Task title"
        required onSave={(v) => { void actions.patch(task, { title: v }); }} />}
      footer={<>
        <ConfirmButton className="btn btn-ghost btn-danger" onConfirm={() => { onClose(); void actions.remove(task); }}>
          <Icon name="trash" size={14} /> Delete
        </ConfirmButton>
        <span className="grow" />
        <button className="btn btn-primary" onClick={onClose}>Close</button>
      </>}>
      {stale && (
        <div className="notice notice-warn">
          <Icon name="alert" size={16} />
          <div>
            <strong>In progress for {roughly(now - new Date(task.started_at!).getTime())} — the limit is {roughly(staleLimitMs(task, p.stale_hours))}. Split it or cut it.</strong>
            <p className="muted small">Splitting moves the unticked sub-steps into a new task, so this one can be finished today.</p>
            <div className="card-actions">
              <button className="btn btn-sm btn-primary" onClick={split}>Split off the rest</button>
              <button className="btn btn-sm" onClick={() => { onClose(); void actions.patch(task, { scope: 'dlc', status: 'backlog' }); }}>Park for later</button>
              <button className="btn btn-sm btn-ghost" onClick={() => actions.setStatus(task, 'todo')}>Put back</button>
            </div>
          </div>
        </div>
      )}
      <div className="task-modal">
        <div className="task-modal-main">
          <Field label="Sub-steps" hint="Break it down until each step is obviously doable. Ticking them off is the point.">
            <ul className="checklist checklist-edit">
              {task.checklist.map((c, i) => (
                <li key={i}>
                  <input type="checkbox" checked={c.done} aria-label={`Done: ${c.text}`} onChange={() => actions.toggleCheck(task, i)} />
                  <SavedText multiline minRows={1} className={c.done ? 'struck' : ''} value={c.text} ariaLabel="Sub-step"
                    onSave={(v) => setChecklist(task.checklist.map((x, j) => (j === i ? { ...x, text: v } : x)))}
                    onClear={() => setChecklist(task.checklist.filter((_, j) => j !== i))} />
                  <button className="icon-btn" aria-label="Remove sub-step" onClick={() => setChecklist(task.checklist.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button>
                </li>
              ))}
            </ul>
            <AddInput placeholder="Add a sub-step" onAdd={(text) => setChecklist([...task.checklist, { text, done: false }])} />
          </Field>

          <Field label="Notes">
            <SavedText multiline minRows={3} value={task.notes} onSave={(v) => { void actions.patch(task, { notes: v }); }}
              placeholder="Decisions, links, what “done” means for this one" ariaLabel="Notes" />
          </Field>

          {obstacles.length > 0 && (
            <Field label="Obstacles on this task">
              <ul className="plain-list">
                {obstacles.map((o) => (
                  <li key={o.id} className="row">
                    <Link className="row-main" to={`/p/${p.id}/obstacles`}>{o.title}</Link>
                    <Badge tone={o.status === 'open' ? 'danger' : 'ok'}>{o.status}</Badge>
                  </li>
                ))}
              </ul>
            </Field>
          )}
        </div>

        <aside className="task-modal-side">
          <Field label="Status">
            <Segmented<TaskStatus> size="sm" ariaLabel="Status" value={task.status} onChange={(v) => actions.setStatus(task, v)}
              options={(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
          </Field>
          <Field label="Scope" hint={task.scope === 'debt' ? 'A planning decision that was still open when coding started.' : undefined}>
            <Segmented<TaskScope> size="sm" ariaLabel="Scope" value={task.scope} onChange={(v) => actions.patch(task, { scope: v })}
              options={[
                { value: 'mvp', label: 'MVP' },
                { value: 'dlc', label: 'Expansion' },
                ...(task.scope === 'debt' ? [{ value: 'debt' as const, label: 'Decision' }] : []),
              ]} />
          </Field>
          <Field label="Milestone" htmlFor="task-milestone">
            <select id="task-milestone" className="input" value={task.milestone_id ?? ''}
              onChange={(e) => actions.patch(task, { milestone_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">None</option>
              {b.milestones.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </Field>
          <Field label="Hard deadline" htmlFor="task-due">
            <SavedDate id="task-due" type={precise ? 'datetime-local' : 'date'}
              value={task.due_at ? (precise ? toLocalInput(task.due_at) : dayKey(task.due_at)) : ''}
              onSave={(v) => { void run(() => api.patch('tasks', task.id, { due_at: !v ? null : precise ? fromLocalInput(v) : endOfDayISO(v) })); }} />
          </Field>
          <div className="form-row effort-row">
            <Field label="Estimate (h)" htmlFor="task-estimate">
              <NumberInput id="task-estimate" value={task.estimate_hours} step={0.5} max={999}
                onSave={(v) => actions.patch(task, { estimate_hours: v })} />
            </Field>
            <Field label="Spent (h)" htmlFor="task-spent">
              <NumberInput id="task-spent" value={task.spent_minutes ? Math.round(task.spent_minutes / 6) / 10 : null} step={0.25} max={9999}
                onSave={(v) => actions.patch(task, { spent_minutes: Math.round((v ?? 0) * 60) })} />
            </Field>
          </div>
          {ratio !== null && (
            <p className={`small ${ratio > 1.25 ? 'overdue' : 'muted'}`}>
              {hoursLabel(task.spent_minutes)} spent on a {task.estimate_hours} h estimate: {times(ratio)}.
            </p>
          )}
          {story && <Field label="User story"><p className="muted">{story.text}</p></Field>}
          <Link className="btn btn-sm" to={`/p/${p.id}/obstacles?task=${task.id}`}>I'm stuck on this</Link>
          <p className="muted small">
            Created {fmtDateTime(task.created_at)}
            {task.started_at && <><br />Started {fmtDateTime(task.started_at)}</>}
            {task.done_at && <><br />Done {fmtDateTime(task.done_at)}</>}
            {task.closed_commit && <><br />Closed by commit <code>{task.closed_commit.slice(0, 7)}</code></>}
            <br />Reference it in a commit as <code>#{task.id}</code>{p.commit_close && <> — <code>closes #{task.id}</code> marks it done</>}
          </p>
        </aside>
      </div>
    </Modal>
  );
}

/** A small number field that saves on blur or Enter; empty means "not set". */
function NumberInput({ id, value, onSave, step, max }: { id: string; value: number | null; onSave: (v: number | null) => unknown; step: number; max: number }) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(value === null ? '' : String(value)); }, [value]);
  const parsed = draft.trim() === '' ? null : Number(draft.replace(',', '.'));
  const bad = parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || parsed > max);
  const commit = () => {
    if (bad) { setDraft(value === null ? '' : String(value)); return; }
    const next = parsed === 0 ? null : parsed;
    if (next !== value) void onSave(next);
  };
  return (
    <input id={id} className="input" inputMode="decimal" value={draft} placeholder="–" aria-invalid={bad} step={step}
      onFocus={() => { focused.current = true; }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { focused.current = false; commit(); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}
