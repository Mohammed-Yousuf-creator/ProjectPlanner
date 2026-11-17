import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useProject } from '../store';
import { fmtDateTime } from '../time';
import { Icon } from './ui';

/**
 * Shown once, in place of everything else, the first time a project is opened after planning
 * ended. The plan is frozen; the only thing to do is start the first task.
 */
export function PencilsDown() {
  const { b, p, run } = useProject();
  const navigate = useNavigate();
  const skipped = b.steps.filter((s) => s.status !== 'done' && !s.optional);
  const debt = b.tasks.filter((t) => t.scope === 'debt' && t.status !== 'done');
  const first = b.tasks.find((t) => t.status === 'doing') ?? b.tasks.find((t) => t.status === 'todo' && t.scope !== 'dlc');
  const mvp = b.tasks.filter((t) => t.scope !== 'dlc').length;

  const go = async (to: string) => {
    await run(async () => {
      await api.ackBuild(p.id);
      if (first && first.status !== 'doing' && to === 'focus') await api.patch('tasks', first.id, { status: 'doing' });
    });
    navigate(`/p/${p.id}/${to}`);
  };

  return (
    <main className="pencils" role="dialog" aria-modal="true" aria-labelledby="pencils-title">
      <div className="pencils-box">
        <p className="pencils-kicker"><Icon name="flag" size={16} /> {p.forced_start ? 'Planning time is up' : 'Planning is done'}</p>
        <h1 id="pencils-title">Pencils down. Start coding.</h1>
        <p className="pencils-lead">
          {p.forced_start
            ? <>The planning deadline passed on <strong>{fmtDateTime(p.planning_deadline)}</strong>. The plan is frozen as it stood, and the board has been filled from it.</>
            : <>You closed planning on <strong>{p.build_started_at ? fmtDateTime(p.build_started_at) : '—'}</strong>. The plan is frozen as it stands, and the board has been filled from it.</>}
        </p>

        <dl className="pencils-facts">
          <div><dt>{mvp}</dt><dd>task{mvp === 1 ? '' : 's'} on the board</dd></div>
          <div><dt>{b.milestones.length}</dt><dd>milestone{b.milestones.length === 1 ? '' : 's'}</dd></div>
          <div className={debt.length ? 'warn' : ''}><dt>{debt.length}</dt><dd>decision{debt.length === 1 ? '' : 's'} left to make while building</dd></div>
        </dl>

        {skipped.length > 0 && (
          <p className="muted">
            Not finished in planning: {skipped.map((s) => s.title).join(', ')}.
            {debt.length > 0 ? ' Each open decision is a task now — make the smallest decision that unblocks you when you reach it.' : ''}
          </p>
        )}

        {first ? (
          <div className="pencils-first">
            <span className="muted small">Your first task</span>
            <strong>{first.title}</strong>
            {first.checklist.length > 0 && <span className="muted small">{first.checklist.length} sub-step{first.checklist.length === 1 ? '' : 's'}</span>}
          </div>
        ) : (
          <p className="muted">The board is empty. Add your first micro-challenge — something you can finish in one sitting.</p>
        )}

        <div className="pencils-actions">
          {first
            ? <button className="btn btn-primary btn-lg" autoFocus onClick={() => go('focus')}><Icon name="play" size={15} /> Start the first task</button>
            : <button className="btn btn-primary btn-lg" autoFocus onClick={() => go('board')}>Open the board</button>}
          {first && <button className="btn btn-ghost btn-lg" onClick={() => go('board')}>Look at the board first</button>}
        </div>
        <p className="muted small">The blueprint stays available as a reference. Changes you make to it from here on are recorded and shown against this frozen copy.</p>
      </div>
    </main>
  );
}
