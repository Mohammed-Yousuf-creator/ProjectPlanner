import { useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { ExpansionPack } from '../components/ExpansionPack';
import { useTaskActions } from '../components/hooks';
import { STATUS_LABEL, TaskModal } from '../components/TaskModal';
import { AddInput, Badge, Empty, Icon, Modal, Progress, Segmented } from '../components/ui';
import { checklistProgress } from '../lib';
import { useProject, useToast } from '../store';
import { MilestoneRow } from '../steps/build';
import type { Task, TaskStatus } from '../types';
import { dueLabel, fmtDateTime, useNow } from '../time';

const COLUMNS: TaskStatus[] = ['backlog', 'todo', 'doing', 'done'];
type ScopeFilter = 'all' | 'mvp' | 'dlc';

export default function Board() {
  const { b, p, run } = useProject();
  const toast = useToast();
  const now = useNow(30_000);
  const [openId, setOpenId] = useState<number | null>(null);
  const [milestoneFilter, setMilestoneFilter] = useState<number | null>(null);
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [managing, setManaging] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [drop, setDrop] = useState<{ status: TaskStatus; before: number | null } | null>(null);
  const [generating, setGenerating] = useState(false);

  const visible = useMemo(() => b.tasks.filter((t) =>
    (milestoneFilter === null || t.milestone_id === milestoneFilter) &&
    (scope === 'all' || (scope === 'dlc' ? t.scope === 'dlc' : t.scope !== 'dlc')),
  ), [b.tasks, milestoneFilter, scope]);

  const openTask = openId === null ? undefined : b.tasks.find((t) => t.id === openId);
  const stuck = new Set(b.obstacles.filter((o) => o.status === 'open' && o.task_id !== null).map((o) => o.task_id));
  const frozen = !!b.hackathon && p.phase === 'build' && now >= new Date(b.hackathon.freeze_at).getTime() && now < new Date(b.hackathon.end).getTime();
  const doingCount = b.tasks.filter((t) => t.status === 'doing').length;

  const addTask = (title: string, status: TaskStatus, taskScope: 'mvp' | 'dlc') =>
    run(() => api.create(p.id, 'tasks', { title, status, scope: taskScope, milestone_id: milestoneFilter }));

  const generate = async () => {
    setGenerating(true);
    const res = await run(() => api.generate(p.id));
    setGenerating(false);
    if (res) toast.ok(res.created ? `Added ${res.created} task${res.created === 1 ? '' : 's'}.` : 'Nothing new to add — the board already covers the blueprint.');
  };

  // Drag and drop: the new position is the midpoint between the two neighbours it lands between.
  const onDrop = (status: TaskStatus) => {
    const target = drop;
    setDrop(null);
    const id = dragId;
    setDragId(null);
    if (id === null) return;
    const task = b.tasks.find((t) => t.id === id);
    if (!task) return;
    const column = visible.filter((t) => t.status === status && t.id !== id);
    const at = target && target.status === status && target.before !== null ? column.findIndex((t) => t.id === target.before) : -1;
    const index = at < 0 ? column.length : at;
    const prev = column[index - 1]?.position;
    const next = column[index]?.position;
    const position = prev === undefined && next === undefined ? task.position : prev === undefined ? next! - 1 : next === undefined ? prev + 1 : (prev + next) / 2;
    if (task.status === status && position === task.position) return;
    void run(() => api.patch('tasks', id, { status, position }));
  };

  return (
    <div className="board-page">
      {frozen && (
        <div className="notice notice-warn">
          <Icon name="lock" size={15} />
          <span><strong>Feature freeze.</strong> No new features from here on. Only add a task if the demo breaks without it.</span>
        </div>
      )}

      <div className="board-bar">
        <div className="milestone-strip" role="group" aria-label="Milestones">
          <button className={`milestone-pill ${milestoneFilter === null ? 'on' : ''}`} onClick={() => setMilestoneFilter(null)}>
            <strong>All tasks</strong>
            <span>{b.tasks.filter((t) => t.status === 'done').length}/{b.tasks.length} done</span>
          </button>
          {b.milestones.map((m) => {
            const mine = b.tasks.filter((t) => t.milestone_id === m.id);
            const done = mine.filter((t) => t.status === 'done').length;
            const complete = mine.length > 0 && done === mine.length;
            const due = m.due_at ? dueLabel(m.due_at, now) : null;
            return (
              <button key={m.id} className={`milestone-pill ${milestoneFilter === m.id ? 'on' : ''} ${complete ? 'complete' : ''}`}
                onClick={() => setMilestoneFilter(milestoneFilter === m.id ? null : m.id)} title={m.due_at ? fmtDateTime(m.due_at) : 'No deadline'}>
                <strong>{complete && <Icon name="check" size={12} />} {m.title}</strong>
                <span className={due && !complete && due.overdue ? 'overdue' : ''}>{done}/{mine.length}{due && !complete ? ` · ${due.text}` : ''}</span>
                <Progress value={done} max={mine.length} tone="ok" />
              </button>
            );
          })}
        </div>
        <div className="board-tools">
          <Segmented<ScopeFilter> size="sm" ariaLabel="Scope filter" value={scope} onChange={setScope}
            options={[{ value: 'all', label: 'All' }, { value: 'mvp', label: 'MVP' }, { value: 'dlc', label: 'Expansion' }]} />
          <button className="btn btn-sm" onClick={() => setManaging(true)}><Icon name="flag" size={14} /> Milestones</button>
          <button className="btn btn-sm" onClick={generate} disabled={generating} title="Add any tasks the blueprint describes that are not on the board yet">
            {generating ? 'Generating…' : 'Generate from blueprint'}
          </button>
        </div>
      </div>

      {b.tasks.length === 0 && (
        <Empty title="The board is empty">
          Generate tasks from the blueprint, or type your first micro-challenge into “To do”.
        </Empty>
      )}

      <div className="board">
        {COLUMNS.map((status) => {
          const tasks = visible.filter((t) => t.status === status);
          return (
            <Column key={status} status={status} count={tasks.length} wipWarning={status === 'doing' && doingCount > 1}
              dragging={dragId !== null}
              onDragOverColumn={(before) => setDrop((d) => (d && d.status === status && d.before === before ? d : { status, before }))}
              onDrop={() => onDrop(status)}>
              {tasks.map((t) => (
                <div key={t.id}>
                  {drop && drop.status === status && drop.before === t.id && dragId !== t.id && <div className="drop-line" />}
                  <TaskCard t={t} now={now} stuck={stuck.has(t.id)} dragging={dragId === t.id}
                    milestone={milestoneFilter === null ? b.milestones.find((m) => m.id === t.milestone_id)?.title : undefined}
                    onOpen={() => setOpenId(t.id)}
                    onDragStart={() => setDragId(t.id)} onDragEnd={() => { setDragId(null); setDrop(null); }} />
                </div>
              ))}
              {drop && drop.status === status && drop.before === null && dragId !== null && <div className="drop-line" />}
              {(status === 'todo' || status === 'backlog') && (
                <AddTask building={p.phase !== 'plan'} status={status} onAdd={addTask} />
              )}
            </Column>
          );
        })}
      </div>

      <ExpansionPack />

      {openTask && <TaskModal task={openTask} onClose={() => setOpenId(null)} />}
      {managing && (
        <Modal title="Milestones" wide onClose={() => setManaging(false)}
          footer={<button className="btn btn-primary" onClick={() => setManaging(false)}>Done</button>}>
          <p className="muted">A milestone is a group of tasks with a hard deadline. Deleting one keeps its tasks.</p>
          <ul className="plain-list">
            {b.milestones.map((m) => <MilestoneRow key={m.id} m={m} precise={p.type === 'hackathon'} count={b.tasks.filter((t) => t.milestone_id === m.id).length} />)}
          </ul>
          <AddInput placeholder="New milestone" buttonLabel="Add milestone" onAdd={(title) => run(() => api.create(p.id, 'milestones', { title }))} />
        </Modal>
      )}
    </div>
  );
}

function Column({ status, count, wipWarning, children, dragging, onDragOverColumn, onDrop }: {
  status: TaskStatus; count: number; wipWarning: boolean; children: React.ReactNode; dragging: boolean;
  onDragOverColumn: (before: number | null) => void; onDrop: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <section className={`column column-${status}`} aria-label={STATUS_LABEL[status]}
      onDragOver={(e) => {
        if (!dragging) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        // Find the first card whose middle is below the pointer: the dragged card lands before it.
        const cards = Array.from(ref.current?.querySelectorAll<HTMLElement>('[data-task]:not(.dragging)') ?? []);
        const below = cards.find((el) => {
          const r = el.getBoundingClientRect();
          return e.clientY < r.top + r.height / 2;
        });
        onDragOverColumn(below ? Number(below.dataset.task) : null);
      }}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}>
      <header className="column-head">
        <h3>{STATUS_LABEL[status]}</h3>
        <span className="count">{count}</span>
        {wipWarning && <Badge tone="danger" title="Finishing one thing beats starting three">one at a time</Badge>}
      </header>
      <div className="column-body" ref={ref}>{children}</div>
    </section>
  );
}

function TaskCard({ t, now, stuck, milestone, dragging, onOpen, onDragStart, onDragEnd }: {
  t: Task; now: number; stuck: boolean; milestone?: string; dragging: boolean;
  onOpen: () => void; onDragStart: () => void; onDragEnd: () => void;
}) {
  const actions = useTaskActions();
  const cp = checklistProgress(t);
  const due = t.due_at && t.status !== 'done' ? dueLabel(t.due_at, now) : null;
  return (
    <article className={`task-card scope-${t.scope} ${dragging ? 'dragging' : ''}`} data-task={t.id} draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(t.id)); e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragEnd={onDragEnd}>
      <button className="task-card-main" onClick={onOpen} aria-label={`Open task: ${t.title}`}>
        <span className="task-card-title">{t.title}</span>
        <span className="task-card-meta">
          {t.scope === 'debt' && <Badge tone="accent" title="A planning decision to make while building">decide</Badge>}
          {t.scope === 'dlc' && <Badge tone="info">expansion</Badge>}
          {stuck && <Badge tone="danger">stuck</Badge>}
          {cp.total > 0 && <span className="meta-item">{cp.done}/{cp.total}</span>}
          {due && <span className={`meta-item ${due.overdue ? 'overdue' : due.soon ? 'soon' : ''}`} title={fmtDateTime(t.due_at!)}>{due.text}</span>}
          {milestone && <span className="meta-item meta-milestone">{milestone}</span>}
        </span>
      </button>
      <div className="task-card-quick">
        {t.status === 'backlog' && <button className="icon-btn" title="Move to To do" aria-label="Move to To do" onClick={() => actions.setStatus(t, 'todo')}><Icon name="arrow" size={14} /></button>}
        {t.status === 'todo' && <button className="icon-btn" title="Start" aria-label="Start task" onClick={() => actions.setStatus(t, 'doing')}><Icon name="play" size={13} /></button>}
        {t.status === 'doing' && <button className="icon-btn" title="Done" aria-label="Mark done" onClick={() => actions.setStatus(t, 'done')}><Icon name="check" size={14} /></button>}
        {t.status === 'done' && <button className="icon-btn" title="Reopen" aria-label="Reopen task" onClick={() => actions.setStatus(t, 'todo')}><Icon name="undo" size={13} /></button>}
      </div>
    </article>
  );
}

/**
 * Adding a task. Once the build has started, a new idea is scope creep until proven otherwise,
 * so the form offers parking it for later right next to adding it.
 */
function AddTask({ status, building, onAdd }: {
  status: TaskStatus; building: boolean; onAdd: (title: string, status: TaskStatus, scope: 'mvp' | 'dlc') => unknown;
}) {
  const [text, setText] = useState('');
  const submit = (scope: 'mvp' | 'dlc') => {
    const title = text.trim();
    if (!title) return;
    setText('');
    void onAdd(title, scope === 'dlc' ? 'backlog' : status, scope);
  };
  return (
    <form className="add-task" onSubmit={(e) => { e.preventDefault(); submit('mvp'); }}>
      <input className="input" value={text} onChange={(e) => setText(e.target.value)}
        placeholder={status === 'todo' ? 'Add a micro-challenge…' : 'Add to backlog…'} aria-label={`Add a task to ${STATUS_LABEL[status]}`} />
      {text.trim() && (
        <div className="add-task-actions">
          <button className="btn btn-sm btn-primary" type="submit">{building ? 'The MVP needs it' : 'Add'}</button>
          {building && <button className="btn btn-sm" type="button" onClick={() => submit('dlc')} title="Park it in the expansion pack">Park for later</button>}
        </div>
      )}
    </form>
  );
}
