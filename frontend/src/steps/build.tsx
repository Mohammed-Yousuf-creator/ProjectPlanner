// Steps 8–10: tools, the core logic, and the work broken into micro-challenges.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { ReasonModal } from '../components/Honesty';
import { AddInput, Badge, Empty, Field, Icon, SavedDate, SavedText, Segmented } from '../components/ui';
import { useProject, useToast } from '../store';
import type { CapabilityData, FlowData, Milestone, StackData, VendorMode } from '../types';
import { endOfDayISO, dayKey, fmtDateTime, fromLocalInput, toLocalInput } from '../time';
import { ItemCard, PlanField } from './common';

// ---------- 8. stack & build-vs-buy ----------

const LAYERS = ['Frontend', 'Backend', 'Database', 'Hosting', 'Auth', 'Other'];
const EXTRA_CAPABILITIES = ['Payments', 'Email / notifications', 'Search', 'Background jobs', 'Realtime', 'Analytics'];

export function StackStep() {
  const { p, run, items, addItem, updateItem, removeItem } = useProject();
  const stack = items<StackData>('stack');
  const caps = items<CapabilityData>('capability');
  const learning = stack.filter((s) => s.data.familiarity === 'learning').length;
  const undecided = caps.filter((c) => c.data.decision === 'undecided');
  const have = new Set(caps.map((c) => (c.data.name ?? '').toLowerCase()));
  const defaultDecision = p.vendor_mode === 'fasttrack' ? 'buy' : 'build';

  return (
    <>
      <p className="lead">
        Tools come last, on purpose: you know the project now, so pick what solves it. The rule is the simplest stack that fits your
        skills and can actually be deployed — a stack you know beats a faster one you do not.
      </p>

      <Field label="Stack">
        {stack.length === 0 && <Empty title="No choices yet">Usually: a frontend, a backend, a database, and somewhere to host it.</Empty>}
        <ul className="plain-list">
          {stack.map((s) => (
            <li key={s.id} className="stack-row">
              <SavedText className="stack-layer" value={s.data.layer ?? ''} onSave={(v) => updateItem(s, { layer: v })} ariaLabel="Layer" />
              <SavedText className="stack-choice" value={s.data.choice ?? ''} onSave={(v) => updateItem(s, { choice: v })} placeholder="Technology" ariaLabel="Choice" />
              <SavedText className="stack-why" value={s.data.why ?? ''} onSave={(v) => updateItem(s, { why: v })} placeholder="Why this one" ariaLabel="Why" />
              <Segmented size="sm" ariaLabel="Familiarity" value={s.data.familiarity ?? ''} onChange={(v) => updateItem(s, { familiarity: v })}
                options={[{ value: 'known', label: 'I know it' }, { value: 'learning', label: 'New to me' }]} />
              <button className="icon-btn" aria-label="Remove" onClick={() => removeItem(s.id)}><Icon name="trash" size={15} /></button>
            </li>
          ))}
        </ul>
        <div className="chips">
          {LAYERS.map((layer) => (
            <button key={layer} type="button" className="chip" onClick={() => addItem('stack', { layer, choice: '', why: '', familiarity: '' })}>
              <Icon name="plus" size={12} /> {layer}
            </button>
          ))}
        </div>
        {learning > 2 && (
          <p className="notice notice-warn"><Icon name="alert" size={15} />
            <span>{learning} technologies are new to you. One or two is a good stretch; more than that and you are learning tools instead of building the project — unless learning them <em>is</em> the goal.</span>
          </p>
        )}
      </Field>

      <Field label="Build it yourself, or use an external service?"
        hint="Optional, and per capability. Building auth or a database yourself teaches you how it works; handing it to a managed service saves the invisible hours — right for hackathons and real launches.">
        <div className="vendor-bar">
          <span>Default for this project:</span>
          <Segmented<VendorMode> size="sm" ariaLabel="Default approach" value={p.vendor_mode}
            onChange={(v) => run(() => api.patchProject(p.id, { vendor_mode: v }))}
            options={[{ value: 'diy', label: 'Build it myself' }, { value: 'fasttrack', label: 'Fast-track with services' }]} />
          {undecided.length > 0 && (
            <button className="btn btn-sm" onClick={() => undecided.forEach((c) => updateItem(c, { decision: defaultDecision }))}>
              Apply to {undecided.length} undecided
            </button>
          )}
        </div>
        <ul className="plain-list">
          {caps.map((c) => (
            <li key={c.id} className="cap-row">
              <SavedText className="cap-name" value={c.data.name ?? ''} onSave={(v) => updateItem(c, { name: v })} ariaLabel="Capability" />
              <Segmented size="sm" ariaLabel={`Decision for ${c.data.name}`} value={c.data.decision === 'undecided' ? '' : c.data.decision}
                onChange={(v) => updateItem(c, { decision: v })}
                options={[{ value: 'build', label: 'Build' }, { value: 'buy', label: 'Service' }, { value: 'skip', label: 'Not needed' }]} />
              <SavedText className="cap-service" value={c.data.decision === 'buy' ? c.data.service ?? '' : c.data.notes ?? ''}
                onSave={(v) => updateItem(c, c.data.decision === 'buy' ? { service: v } : { notes: v })}
                placeholder={c.data.decision === 'buy' ? 'Which service? Check its free tier.' : c.data.decision === 'build' ? 'How, roughly?' : 'Notes'}
                ariaLabel="Service or notes" />
              <button className="icon-btn" aria-label="Remove" onClick={() => removeItem(c.id)}><Icon name="trash" size={15} /></button>
            </li>
          ))}
        </ul>
        <div className="chips">
          {EXTRA_CAPABILITIES.filter((n) => !have.has(n.toLowerCase())).map((name) => (
            <button key={name} type="button" className="chip" onClick={() => addItem('capability', { name, decision: 'undecided', service: '', notes: '' })}>
              <Icon name="plus" size={12} /> {name}
            </button>
          ))}
        </div>
        <AddInput placeholder="Another capability" onAdd={(name) => addItem('capability', { name, decision: 'undecided', service: '', notes: '' })} />
      </Field>

      <PlanField k="deploy_path" label="Can I actually deploy this?"
        hint="Write the steps down before you code. If deploying looks like it takes longer than building, change the stack now."
        placeholder={'Where it runs, how it gets there, what it costs.\n1. …'} minRows={2} />
    </>
  );
}

// ---------- 9. core logic & data flows ----------

export function FlowsStep() {
  const { items, addItem, updateItem, removeItem } = useProject();
  const flows = items<FlowData>('flow');
  const core = flows.filter((f) => f.data.core).length;
  return (
    <>
      <PlanField k="core_algorithm" label="The core logic, in pseudo-code" mono
        hint="The one piece that makes this project this project. Write it out roughly now; if you cannot, you have found the thing to research."
        placeholder={'for each item in the input:\n    check it, transform it\nreturn the combined result'} minRows={4} />

      <Field label="Data flows"
        hint="Think of every feature as its own lane from the entry point, through the logic, down to the data — and back. Lanes run in parallel and do not tangle. The core of the project should fit in one to three of them.">
        {core > 3 && (
          <p className="notice notice-warn"><Icon name="alert" size={15} />
            <span>{core} flows are marked core. If everything is core, nothing is — which one to three carry the whole idea?</span>
          </p>
        )}
        {flows.length === 0 && <Empty title="No data flows yet">Name the first one after what the user does: “Send a message”, “Upload a file”.</Empty>}
        {flows.map((f) => (
          <ItemCard key={f.id} onRemove={() => removeItem(f.id)}
            title={<>
              <SavedText className="title-input" value={f.data.name ?? ''} onSave={(v) => updateItem(f, { name: v })} ariaLabel="Flow name" />
              <label className="check-inline">
                <input type="checkbox" checked={!!f.data.core} onChange={(e) => updateItem(f, { core: e.target.checked })} /> Core
              </label>
            </>}>
            <div className="flow-lane">
              <Field label="Trigger">
                <SavedText multiline minRows={1} value={f.data.trigger ?? ''} onSave={(v) => updateItem(f, { trigger: v })} placeholder="The user clicks…" ariaLabel="Trigger" />
              </Field>
              <Field label="Entry point — input → output">
                <SavedText multiline mono minRows={2} value={f.data.controller ?? ''} onSave={(v) => updateItem(f, { controller: v })} placeholder={'POST /notes\nin: title, body\nout: id, created_at'} ariaLabel="Entry point" />
              </Field>
              <Field label="Logic">
                <SavedText multiline minRows={2} value={f.data.logic ?? ''} onSave={(v) => updateItem(f, { logic: v })} placeholder="What actually happens, step by step" ariaLabel="Logic" />
              </Field>
              <Field label="Data access">
                <SavedText multiline minRows={2} value={f.data.data ?? ''} onSave={(v) => updateItem(f, { data: v })} placeholder="Reads / writes which models" ariaLabel="Data access" />
              </Field>
            </div>
          </ItemCard>
        ))}
        <AddInput placeholder="Flow name, e.g. Upload a file" buttonLabel="Add flow"
          onAdd={(name) => addItem('flow', { name, core: flows.length === 0, trigger: '', controller: '', logic: '', data: '' })} />
      </Field>
    </>
  );
}

// ---------- 10. milestones & micro-challenges ----------

export function BuildPlanStep() {
  const { b, p, run } = useProject();
  const toast = useToast();
  const hack = p.type === 'hackathon';
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    const res = await run(() => api.generate(p.id));
    setBusy(false);
    if (res) toast.ok(res.created ? `Added ${res.created} task${res.created === 1 ? '' : 's'} to the board.` : 'The board already has everything the blueprint describes.');
  };

  const unassigned = b.tasks.filter((t) => t.milestone_id === null);

  return (
    <>
      <p className="lead">
        Divide the project into micro-challenges — neither too hard nor too easy — and put hard deadlines on them. Every finished one is
        a small win, and small wins are what carry you through the middle of a project. Build in this order: skeleton, data layer,
        core logic, then the interface on top of something that already works.
      </p>

      <div className="generate-bar">
        <div>
          <strong>Fill the board from the blueprint</strong>
          <p className="muted">Skeleton, data layer, one task per data flow and per MVP story, deploy — grouped into milestones with deadlines{hack ? ' that follow the hackathon clock' : ''}. Safe to run again after you change the plan.</p>
        </div>
        <button className="btn btn-primary" onClick={generate} disabled={busy}>{busy ? 'Generating…' : 'Generate tasks'}</button>
      </div>

      <Field label="Milestones" hint="Deadlines are what make them milestones. Move them, but do not remove them.">
        {b.milestones.length === 0 && <Empty title="No milestones yet">Generate them above, or add your own.</Empty>}
        <ul className="plain-list">
          {b.milestones.map((m) => <MilestoneRow key={m.id} m={m} precise={hack} count={b.tasks.filter((t) => t.milestone_id === m.id).length} />)}
        </ul>
        <AddInput placeholder="Milestone, e.g. Core logic works" buttonLabel="Add milestone" onAdd={(title) => run(() => api.create(p.id, 'milestones', { title }))} />
      </Field>

      <Field label={`Micro-challenges (${b.tasks.length})`}>
        {b.tasks.length === 0 ? (
          <Empty title="The board is empty">Generate tasks, or add them on the board.</Empty>
        ) : (
          <div className="task-preview">
            {b.milestones.map((m) => {
              const mine = b.tasks.filter((t) => t.milestone_id === m.id);
              if (!mine.length) return null;
              return (
                <div key={m.id}>
                  <h5>{m.title}</h5>
                  <ul>{mine.map((t) => <li key={t.id} className={t.status === 'done' ? 'done' : ''}>{t.title}{t.checklist.length > 0 && <small> · {t.checklist.length} sub-steps</small>}</li>)}</ul>
                </div>
              );
            })}
            {unassigned.length > 0 && (
              <div>
                <h5>No milestone</h5>
                <ul>{unassigned.map((t) => <li key={t.id} className={t.status === 'done' ? 'done' : ''}>{t.title}</li>)}</ul>
              </div>
            )}
          </div>
        )}
        <p><Link to={`/p/${p.id}/board`} className="btn btn-sm">Edit on the board <Icon name="arrow" size={14} /></Link></p>
      </Field>
    </>
  );
}

export function MilestoneRow({ m, count, precise }: { m: Milestone; count: number; precise: boolean }) {
  const { p, run } = useProject();
  const [pending, setPending] = useState<{ due: string | null } | null>(null);
  const [version, setVersion] = useState(0);
  const setDue = (value: string) => {
    const due = !value ? null : precise ? fromLocalInput(value) : endOfDayISO(value);
    if (due === m.due_at || (due && m.due_at && new Date(due).getTime() === new Date(m.due_at).getTime())) return;
    // Once coding has started, a deadline that was set is a promise: moving it needs a reason.
    if (p.phase !== 'plan' && m.due_at) setPending({ due });
    else void run(() => api.patch('milestones', m.id, { due_at: due }));
  };
  const moved = m.original_due_at && m.due_at && new Date(m.original_due_at).getTime() !== new Date(m.due_at).getTime();
  return (
    <li className="row row-wrap" key={version}>
      {pending && (
        <ReasonModal title={pending.due ? `Move “${m.title}” to ${fmtDateTime(pending.due)}` : `Remove the deadline of “${m.title}”`}
          confirmLabel={pending.due ? 'Move the date' : 'Remove the deadline'} placeholder="e.g. The parser took two days longer"
          onClose={() => { setPending(null); setVersion((v) => v + 1); }}
          onConfirm={async (reason) => {
            await run(() => api.patch('milestones', m.id, { due_at: pending.due, reason }));
            setPending(null);
            setVersion((v) => v + 1);
          }}>
          <p className="muted">It was due {fmtDateTime(m.due_at!)}. The move is counted and shown on the overview with the reason you give.</p>
        </ReasonModal>
      )}
      <SavedText className="row-main" value={m.title} ariaLabel="Milestone"
        required onSave={(v) => { void run(() => api.patch('milestones', m.id, { title: v })); }} />
      <Badge>{count} task{count === 1 ? '' : 's'}</Badge>
      {moved && <Badge tone="danger" title={`First planned for ${fmtDateTime(m.original_due_at!)}`}>moved</Badge>}
      <SavedDate ariaLabel="Deadline" title={m.due_at ? fmtDateTime(m.due_at) : 'No deadline'}
        type={precise ? 'datetime-local' : 'date'}
        value={m.due_at ? (precise ? toLocalInput(m.due_at) : dayKey(m.due_at)) : ''}
        onSave={setDue} />
      <button className="icon-btn" aria-label="Delete milestone" onClick={() => run(() => api.remove('milestones', m.id))}><Icon name="trash" size={15} /></button>
    </li>
  );
}
