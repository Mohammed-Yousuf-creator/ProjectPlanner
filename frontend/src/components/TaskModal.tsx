import { Link } from 'react-router-dom';
import { api } from '../api';
import { useProject } from '../store';
import type { Task, TaskScope, TaskStatus } from '../types';
import { dayKey, endOfDayISO, fmtDateTime, fromLocalInput, toLocalInput } from '../time';
import { useTaskActions } from './hooks';
import { AddInput, Badge, ConfirmButton, Field, Icon, Modal, SavedDate, SavedText, Segmented } from './ui';

export const STATUS_LABEL: Record<TaskStatus, string> = { backlog: 'Backlog', todo: 'To do', doing: 'Doing', done: 'Done' };

export function TaskModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const { b, p, run } = useProject();
  const actions = useTaskActions();
  const precise = p.type === 'hackathon';
  const story = b.stories.find((s) => s.id === task.story_id);
  const obstacles = b.obstacles.filter((o) => o.task_id === task.id);

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
          {story && <Field label="User story"><p className="muted">{story.text}</p></Field>}
          <Link className="btn btn-sm" to={`/p/${p.id}/obstacles?task=${task.id}`}>I'm stuck on this</Link>
          <p className="muted small">
            Created {fmtDateTime(task.created_at)}
            {task.started_at && <><br />Started {fmtDateTime(task.started_at)}</>}
            {task.done_at && <><br />Done {fmtDateTime(task.done_at)}</>}
          </p>
        </aside>
      </div>
    </Modal>
  );
}
