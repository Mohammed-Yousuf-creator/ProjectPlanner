import { useEffect, useState } from 'react';
import { api } from '../api';
import { useProject } from '../store';
import { fmtDateTime } from '../time';
import type { PlanChange, SnapshotView } from '../types';
import { Badge, Card, Icon, Modal } from './ui';

const AREA: Record<PlanChange['area'], string> = { answers: 'Answers', stories: 'User stories', lists: 'Lists', milestones: 'Milestones' };

/** The plan as it stood when coding started, and what has changed in the blueprint since. */
export function SnapshotCard() {
  const { b, p } = useProject();
  const [view, setView] = useState<SnapshotView | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!b.has_snapshot) return;
    let cancelled = false;
    api.snapshot(p.id).then((v) => { if (!cancelled) setView(v); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [p.id, b.has_snapshot, b.now]);

  if (!b.has_snapshot) return null;
  const changes = view?.changes ?? [];
  return (
    <Card title="Plan at pencils-down" aside={view ? <Badge tone={changes.length ? 'accent' : 'ok'}>{changes.length ? `${changes.length} change${changes.length === 1 ? '' : 's'} since` : 'unchanged'}</Badge> : undefined}>
      <p className="muted small">
        <Icon name="lock" size={13} /> Frozen {view?.taken_at ? `on ${fmtDateTime(view.taken_at)}` : 'when coding started'}.
        {changes.length > 0 ? ' The blueprint has been edited since — that is fine when it records a decision, and a warning sign when it reopens one.' : ' The blueprint still matches it.'}
      </p>
      {changes.length > 0 && (
        <ul className="event-list">
          {changes.slice(0, 4).map((c, i) => <ChangeRow key={i} c={c} />)}
        </ul>
      )}
      <div className="card-actions">
        <button className="btn btn-sm" onClick={() => setOpen(true)} disabled={!view}>{changes.length > 4 ? `See all ${changes.length} changes` : 'Compare with the frozen plan'}</button>
      </div>
      {open && view && (
        <Modal wide title="The plan when coding started" onClose={() => setOpen(false)} footer={<button className="btn btn-primary" onClick={() => setOpen(false)}>Close</button>}>
          {changes.length === 0 ? <p className="muted">Nothing in the blueprint has changed since {view.taken_at ? fmtDateTime(view.taken_at) : 'coding started'}.</p> : (
            (Object.keys(AREA) as PlanChange['area'][]).map((area) => {
              const list = changes.filter((c) => c.area === area);
              if (list.length === 0) return null;
              return (
                <section key={area} className="diff-area">
                  <h4>{AREA[area]}</h4>
                  <ul className="diff-list">
                    {list.map((c, i) => (
                      <li key={i} className={`diff diff-${c.kind}`}>
                        <div className="diff-head"><Badge tone={c.kind === 'added' ? 'accent' : c.kind === 'removed' ? 'danger' : 'info'}>{c.kind}</Badge> <strong>{c.label}</strong></div>
                        {c.before && <p className="diff-before pre">{c.before}</p>}
                        {c.after && <p className="diff-after pre">{c.after}</p>}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
          )}
          <details className="frozen-plan">
            <summary>The frozen plan in full</summary>
            {view.plan.target_date && <p><strong>Ship date:</strong> {view.plan.target_date}</p>}
            <h4>User stories</h4>
            <ul className="bullets">{view.plan.stories.filter((s) => s.tier === 'mvp').map((s) => <li key={s.id}>{s.text}</li>)}</ul>
            <h4>Milestones</h4>
            <ul className="bullets">{view.plan.milestones.map((m) => <li key={m.id}>{m.title}{m.due_at ? ` — ${fmtDateTime(m.due_at)}` : ''}</li>)}</ul>
            <h4>Answers</h4>
            <dl className="frozen-answers">
              {Object.entries(view.plan.plan).filter(([, v]) => v.trim()).map(([k, v]) => (
                <div key={k}><dt>{k.replace(/_/g, ' ')}</dt><dd className="pre">{v}</dd></div>
              ))}
            </dl>
          </details>
        </Modal>
      )}
    </Card>
  );
}

function ChangeRow({ c }: { c: PlanChange }) {
  return (
    <li>
      <Badge tone={c.kind === 'added' ? 'accent' : c.kind === 'removed' ? 'danger' : 'info'}>{c.kind}</Badge>
      <span className="event-title">{AREA[c.area]}: {c.label}</span>
    </li>
  );
}
