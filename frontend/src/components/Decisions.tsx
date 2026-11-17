import { useState } from 'react';
import { useProject } from '../store';
import { fmtDate } from '../time';
import type { DecisionData } from '../types';
import { AddInput, Icon, SavedText } from './ui';

/**
 * Decisions made in a blueprint step: what was decided, why, and what was turned down.
 * Three weeks in, "why did I pick this?" has an answer that is not "I don't remember".
 */
export function DecisionLog({ step }: { step: string }) {
  const { b, items, addItem, updateItem, removeItem } = useProject();
  const all = items<DecisionData>('decision');
  const mine = all.filter((d) => (d.data.step ?? '') === step);
  const others = all.filter((d) => (d.data.step ?? '') !== step);
  const [showAll, setShowAll] = useState(false);
  const stepTitle = (key: string) => b.steps.find((s) => s.key === key)?.title ?? 'General';

  return (
    <section className="decisions">
      <h4><Icon name="flag" size={14} /> Decisions made here</h4>
      <p className="field-hint">One line each: what you decided and why. Add the alternatives you turned down, so you do not re-argue them later.</p>
      {mine.map((d) => (
        <div key={d.id} className="decision">
          <div className="decision-head">
            <SavedText className="title-input" value={d.data.title ?? ''} onSave={(v) => updateItem(d, { title: v })} ariaLabel="Decision" required />
            {d.data.decided_at && <span className="muted small">{fmtDate(d.data.decided_at)}</span>}
            <button className="icon-btn" aria-label="Remove decision" onClick={() => removeItem(d.id)}><Icon name="trash" size={14} /></button>
          </div>
          <div className="decision-grid">
            <label>Because<SavedText multiline minRows={1} value={d.data.why ?? ''} onSave={(v) => updateItem(d, { why: v })} placeholder="The reason, in a sentence" ariaLabel="Why" /></label>
            <label>Instead of<SavedText multiline minRows={1} value={d.data.alternatives ?? ''} onSave={(v) => updateItem(d, { alternatives: v })} placeholder="What you turned down" ariaLabel="Alternatives" /></label>
          </div>
        </div>
      ))}
      <AddInput placeholder="e.g. SQLite instead of Postgres" buttonLabel="Log decision"
        onAdd={(title) => addItem('decision', { title, decision: title, why: '', alternatives: '', step })} />
      {others.length > 0 && (
        <>
          <button className="link-btn small" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Hide' : 'Show'} the {others.length} decision{others.length === 1 ? '' : 's'} from other steps</button>
          {showAll && (
            <ul className="decision-list">
              {others.map((d) => (
                <li key={d.id}>
                  <strong>{d.data.title}</strong> <span className="muted small">({stepTitle(d.data.step ?? '')})</span>
                  {d.data.why && <span className="muted"> — {d.data.why}</span>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
