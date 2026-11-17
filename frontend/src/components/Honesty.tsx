// Keeping scope and time honest: what changed since coding started, how fast the work is
// really going, and what to do when a date slips.

import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { dateMoves, estimateStats, pace, scopeCreep, staleLimitMs, staleTasks, targetDrift, times } from '../lib';
import { useProject } from '../store';
import { DAY, HOUR, fmtDate, fmtDateTime, fromLocalInput, roughly, toLocalInput } from '../time';
import type { ProjectEvent, ScopeChange, Slip } from '../types';
import { Badge, Card, Icon, Modal } from './ui';

/** Asks for the one-line reason a change needs before it is made. */
export function ReasonModal({ title, children, confirmLabel, placeholder, onConfirm, onClose }: {
  title: string; children?: ReactNode; confirmLabel: string; placeholder: string;
  onConfirm: (reason: string) => void | Promise<unknown>; onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const ok = reason.trim().length > 0;
  const submit = () => { if (ok) void onConfirm(reason.trim()); };
  return (
    <Modal title={title} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!ok} onClick={submit}>{confirmLabel}</button>
      </>}>
      {children}
      <label className="field-label" htmlFor="reason-input">Why? One line.</label>
      <input id="reason-input" className="input" value={reason} placeholder={placeholder} maxLength={300} autoFocus
        onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
    </Modal>
  );
}

// ---------- scope creep ----------

export function ScopeCard() {
  const { b } = useProject();
  const c = scopeCreep(b);
  const [open, setOpen] = useState(false);
  const scope = b.events.filter((e): e is Extract<ProjectEvent, { data: ScopeChange }> => e.kind !== 'date_move').reverse();
  const total = c.added + c.ideas + c.removed;
  return (
    <Card title="Scope since coding started"
      aside={total === 0 ? <Badge tone="ok">unchanged</Badge> : <Badge tone={c.net > 0 ? 'danger' : 'ok'}>{c.net > 0 ? `+${c.net}` : c.net} net</Badge>}>
      <div className="scope-meter">
        <div className={`scope-stat ${c.added > 0 ? 'bad' : ''}`}><strong>{c.added}</strong><span>added to the MVP</span></div>
        <div className={`scope-stat ${c.removed > 0 ? 'good' : ''}`}><strong>{c.removed}</strong><span>cut or moved out</span></div>
        <div className="scope-stat"><strong>{c.ideas}</strong><span>ideas parked</span></div>
      </div>
      {total === 0 ? (
        <p className="muted small">Every task added to the MVP from here on is counted. Park new ideas in the expansion pack instead.</p>
      ) : (
        <>
          <p className="muted small">
            {c.net > 0
              ? `The MVP is ${c.net} task${c.net === 1 ? '' : 's'} bigger than when you started. Each one pushes the ship date.`
              : 'The MVP is no bigger than when you started. That is how projects get finished.'}
          </p>
          <button className="link-btn small" onClick={() => setOpen((o) => !o)}>{open ? 'Hide the list' : 'Show what changed'}</button>
          {open && (
            <ul className="event-list">
              {scope.map((e) => (
                <li key={e.id}>
                  <Badge tone={e.kind === 'scope_add' ? 'danger' : e.kind === 'scope_cut' || e.data.how !== 'new' ? 'ok' : 'neutral'}>
                    {e.kind === 'scope_add' ? 'added' : e.kind === 'scope_cut' ? 'cut' : e.data.how === 'new' ? 'idea parked' : 'moved out'}
                  </Badge>
                  <span className="event-title">{e.data.title}{e.data.tasks?.length ? ` (${e.data.tasks.length} task${e.data.tasks.length === 1 ? '' : 's'})` : ''}</span>
                  <span className="muted small">{fmtDate(e.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

// ---------- pace ----------

export function PaceCard({ now }: { now: number }) {
  const { b, p } = useProject();
  const data = pace(b, now);
  if (!data || data.total === 0) return null;
  const W = 520, H = 150, L = 30, R = 10, T = 10, B = 22;
  const last = data.points[data.points.length - 1].at;
  const horizon = Math.max(last, data.end ?? 0, Math.min(data.projected ?? 0, last + 120 * DAY)) + (last - data.start) * 0.02;
  const span = Math.max(1, horizon - data.start);
  const top = Math.max(1, ...data.points.map((pt) => pt.remaining));
  const x = (t: number) => L + ((Math.min(t, horizon) - data.start) / span) * (W - L - R);
  const y = (n: number) => T + (1 - n / top) * (H - T - B);
  let line = '';
  data.points.forEach((pt, i) => {
    if (i === 0) line += `M${x(pt.at).toFixed(1)},${y(pt.remaining).toFixed(1)}`;
    else line += ` H${x(pt.at).toFixed(1)} V${y(pt.remaining).toFixed(1)}`;
  });
  const shipped = p.phase === 'shipped';
  const endLabel = b.hackathon ? 'feature freeze' : 'ship date';
  const late = data.slipDays !== null && data.slipDays > 0.5;

  let verdict: ReactNode;
  if (shipped) verdict = 'Shipped. This is how the work actually went.';
  else if (data.remaining === 0) verdict = 'Nothing left on the MVP. Ship it.';
  else if (data.projected === null) verdict = 'No task finished in the last 7 days, so there is no pace to project from. Finish one small thing today.';
  else if (data.end === null) verdict = <>At the pace of the last 7 days ({data.perDay.toFixed(1)} tasks a day) the MVP is done around <strong>{fmtDate(data.projected)}</strong>. Set a ship date to hold yourself to it.</>;
  else if (late) verdict = <>At the pace of the last 7 days ({data.perDay.toFixed(1)} tasks a day) the MVP is done around <strong>{fmtDate(data.projected)}</strong> — <strong>{roughly(data.slipDays! * DAY)} after</strong> the {endLabel}. Cut scope, or move the date and say why.</>;
  else verdict = <>At the pace of the last 7 days ({data.perDay.toFixed(1)} tasks a day) the MVP is done around <strong>{fmtDate(data.projected)}</strong>, before the {endLabel}.</>;

  return (
    <Card title="Pace" aside={<span className="muted">{data.remaining} of {data.total} tasks left</span>}>
      <svg className="pace-chart" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Tasks remaining over time: ${data.remaining} of ${data.total} left.`}>
        <line className="pace-axis" x1={L} y1={y(0)} x2={W - R} y2={y(0)} />
        <line className="pace-axis" x1={L} y1={T} x2={L} y2={y(0)} />
        <text className="pace-tick" x={L - 5} y={y(top) + 4} textAnchor="end">{top}</text>
        <text className="pace-tick" x={L - 5} y={y(0) + 4} textAnchor="end">0</text>
        <text className="pace-tick" x={L} y={H - 5}>{fmtDate(data.start)}</text>
        {data.end !== null && (
          <>
            <line className="pace-ideal" x1={x(data.start)} y1={y(data.points[0].remaining)} x2={x(data.end)} y2={y(0)} />
            <line className="pace-deadline" x1={x(data.end)} y1={T} x2={x(data.end)} y2={y(0)} />
            <text className="pace-tick pace-deadline-label" x={x(data.end)} y={H - 5} textAnchor={x(data.end) > W - 80 ? 'end' : 'middle'}>{endLabel} {fmtDate(data.end)}</text>
          </>
        )}
        {!shipped && data.projected !== null && data.remaining > 0 && (
          <line className={`pace-projection ${late ? 'late' : ''}`} x1={x(last)} y1={y(data.remaining)} x2={x(data.projected)} y2={data.projected > horizon ? y(data.remaining * (1 - (horizon - last) / (data.projected - last))) : y(0)} />
        )}
        <path className="pace-line" d={line} />
        <circle className="pace-now" cx={x(last)} cy={y(data.remaining)} r="3.5" />
      </svg>
      <p className={`pace-verdict ${late ? 'late' : ''}`}>{verdict}</p>
      <p className="muted small pace-legend">
        <span className="legend-swatch legend-line" /> open tasks
        {data.end !== null && <><span className="legend-swatch legend-ideal" /> even pace</>}
        {!shipped && <><span className="legend-swatch legend-projection" /> your pace</>}
      </p>
    </Card>
  );
}

// ---------- deadline moves ----------

export function MovesCard() {
  const { b, p } = useProject();
  const moves = dateMoves(b);
  const drift = targetDrift(b);
  if (moves.length === 0) return null;
  const shipMoves = moves.filter((m) => m.move.what === 'target').length;
  return (
    <Card title="Deadline moves" tone={moves.length >= 3 ? 'danger' : undefined} aside={<Badge tone="danger">moved {moves.length}×</Badge>}>
      <p className="move-summary">
        {shipMoves > 0 && drift !== null && p.original_target_date
          ? <>The ship date has moved <strong>{shipMoves} time{shipMoves === 1 ? '' : 's'}</strong> and is now <strong>{Math.abs(drift)} day{Math.abs(drift) === 1 ? '' : 's'} {drift >= 0 ? 'later' : 'earlier'}</strong> than first planned ({fmtDate(p.original_target_date + 'T12:00')}).</>
          : <>Deadlines have been moved <strong>{moves.length} time{moves.length === 1 ? '' : 's'}</strong> since coding started.</>}
      </p>
      <ul className="event-list">
        {moves.slice(0, 6).map((m, i) => (
          <li key={i}>
            <span className="event-title">
              <strong>{m.move.title}</strong>: {moveDate(m.move.from)} → {m.move.to ? moveDate(m.move.to) : 'no date'}
              <span className="event-reason">“{m.move.reason}”</span>
            </span>
            <span className="muted small">{fmtDate(m.at)}</span>
          </li>
        ))}
      </ul>
      {moves.length > 6 && <p className="muted small">…and {moves.length - 6} earlier.</p>}
    </Card>
  );
}

const moveDate = (s: string) => (s.length <= 10 ? fmtDate(s + 'T12:00') : fmtDateTime(s));

// ---------- estimates ----------

export function EstimatesCard({ overall }: { overall?: { multiplier: number; tasks: number } | null }) {
  const { b } = useProject();
  const s = estimateStats(b.tasks);
  const mult = s.multiplier ?? (overall && overall.multiplier > 0 ? overall.multiplier : null);
  const fromAll = s.multiplier === null && mult !== null;
  if (s.measured === 0 && s.openHours === 0 && !fromAll) {
    return (
      <Card title="Estimates">
        <p className="muted small">Give a task an estimate in hours and log the time you spend on it (the focus screen does that for you). After a few
          tasks this card shows how much longer things take than you think — and corrects your remaining estimate with it.</p>
      </Card>
    );
  }
  return (
    <Card title="Estimates against actuals" aside={mult !== null ? <Badge tone={mult > 1.25 ? 'danger' : 'ok'}>{times(mult)}</Badge> : undefined}>
      {mult !== null ? (
        <p>
          {fromAll ? 'Across your projects, tasks' : 'In this project, tasks'} take <strong>{times(mult)}</strong> your estimate
          {!fromAll && <span className="muted"> ({s.spent.toFixed(1)} h spent on {s.estimated.toFixed(1)} h estimated, {s.measured} task{s.measured === 1 ? '' : 's'})</span>}.
        </p>
      ) : (
        <p className="muted">No finished task has both an estimate and logged time yet.</p>
      )}
      {s.openHours > 0 && (
        <p>
          Open work is estimated at <strong>{s.openHours.toFixed(1)} h</strong>
          {mult !== null && Math.abs(mult - 1) > 0.05 && <> — realistically <strong>{(s.openHours * mult).toFixed(1)} h</strong></>}
          {s.openUnestimated > 0 && <span className="muted">, plus {s.openUnestimated} task{s.openUnestimated === 1 ? '' : 's'} without an estimate</span>}.
        </p>
      )}
    </Card>
  );
}

// ---------- stale tasks ----------

export function StaleNotice({ now }: { now: number }) {
  const { b, p } = useProject();
  const stale = staleTasks(b, now);
  if (stale.length === 0 || p.phase !== 'build') return null;
  return (
    <div className="notice notice-warn stale-notice">
      <Icon name="alert" size={16} />
      <div>
        <strong>{stale.length === 1 ? 'A task has' : `${stale.length} tasks have`} been in progress too long. Split it or cut it.</strong>
        <ul className="plain-list">
          {stale.map((t) => (
            <li key={t.id}>
              <Link to={`/p/${p.id}/board?task=${t.id}`}>#{t.id} {t.title}</Link>
              <span className="muted small"> — in progress for {roughly(now - new Date(t.started_at!).getTime())} (limit {roughly(staleLimitMs(t, p.stale_hours))})</span>
            </li>
          ))}
        </ul>
        <p className="muted small">A task that does not finish is usually two tasks. Write the smaller one you can finish today, and park or cut the rest.</p>
      </div>
    </div>
  );
}

// ---------- slipped milestone: cut or move ----------

const snoozeKey = (projectId: number, milestoneId: number) => `planner-cut-snooze-${projectId}-${milestoneId}`;

function snoozedUntil(projectId: number, milestoneId: number): number {
  try { return Number(localStorage.getItem(snoozeKey(projectId, milestoneId)) ?? 0); } catch { return 0; }
}

export function CutPrompt({ now }: { now: number }) {
  const { b, p, run } = useProject();
  const [moving, setMoving] = useState<Slip | null>(null);
  const [, bump] = useState(0);
  const slip = b.slips.find((s) => snoozedUntil(p.id, s.milestone_id) < now);
  if (!slip || p.phase !== 'build') return null;
  const next = b.cut_next;
  const late = now - new Date(slip.due_at).getTime();
  const snooze = () => {
    try { localStorage.setItem(snoozeKey(p.id, slip.milestone_id), String(Date.now() + b.limits.cut_snooze_minutes * 60_000)); } catch { /* private mode */ }
    bump((n) => n + 1);
  };

  return (
    <div className="notice notice-danger cut-prompt" role="alert">
      <Icon name="flag" size={18} />
      <div className="cut-prompt-body">
        <strong>“{slip.title}” was due {roughly(late)} ago and {slip.open_tasks.length} task{slip.open_tasks.length === 1 ? ' is' : 's are'} still open.</strong>
        <p>Working faster is not a plan. Either the scope shrinks or the date moves — pick one.</p>
        {next ? (
          <div className="cut-candidate">
            <span className="muted small">Next on your cut list</span>
            <span className="cut-candidate-text">{next.text}</span>
            <span className="muted small">{next.open_tasks} open task{next.open_tasks === 1 ? '' : 's'} move to the expansion pack</span>
          </div>
        ) : (
          <ul className="plain-list cut-tasks">
            {slip.open_tasks.slice(0, 5).map((t) => (
              <li key={t.id} className="row">
                <span className="row-main">#{t.id} {t.title}</span>
                <button className="btn btn-sm" onClick={() => run(() => api.cut(p.id, { task_id: t.id, milestone_id: slip.milestone_id }))}>Park for later</button>
              </li>
            ))}
          </ul>
        )}
        <div className="card-actions">
          {next && (
            <button className="btn btn-primary" onClick={() => run(() => api.cut(p.id, { story_id: next.story_id, milestone_id: slip.milestone_id }))}>
              Cut it
            </button>
          )}
          <button className="btn" onClick={() => setMoving(slip)}>Move the date…</button>
          <button className="btn btn-ghost" onClick={snooze} title={`Ask again in ${roughly(b.limits.cut_snooze_minutes * 60_000)}`}>Not now</button>
        </div>
      </div>
      {moving && <MoveMilestone slip={moving} onClose={() => setMoving(null)} />}
    </div>
  );
}

function MoveMilestone({ slip, onClose }: { slip: Slip; onClose: () => void }) {
  const { b, run } = useProject();
  const moves = dateMoves(b).length;
  const [when, setWhen] = useState(() => toLocalInput(new Date(Date.now() + (b.hackathon ? 2 * HOUR : 2 * DAY))));
  const iso = fromLocalInput(when);
  const valid = !!iso && new Date(iso).getTime() > Date.now();
  return (
    <ReasonModal title={`Move “${slip.title}”`} confirmLabel="Move the date" placeholder="e.g. The import format was harder than I thought"
      onClose={onClose}
      onConfirm={async (reason) => {
        if (!valid) return;
        await run(() => api.patch('milestones', slip.milestone_id, { due_at: iso, reason }));
        onClose();
      }}>
      <p className="muted">
        {moves === 0 ? 'This is the first deadline you move in this project.' : `You have already moved a deadline ${moves} time${moves === 1 ? '' : 's'} in this project.`}{' '}
        The move is recorded with its reason and shown on the overview.
      </p>
      <label className="field-label" htmlFor="move-when">New deadline</label>
      <input id="move-when" type="datetime-local" className="input input-date" value={when} min={toLocalInput(new Date())}
        onChange={(e) => setWhen(e.target.value)} />
      {!valid && <p className="field-error">Pick a moment in the future.</p>}
    </ReasonModal>
  );
}

/** Changes a ship date. Before coding starts it just saves; afterwards it asks why first. */
export function useShipDateMove() {
  const { p, run } = useProject();
  const [pending, setPending] = useState<string | null>(null);
  const change = (value: string) => {
    if (value === (p.target_date ?? '')) return;
    if (p.phase !== 'plan' && p.target_date) setPending(value);
    else void run(() => api.patchProject(p.id, { target_date: value }));
  };
  const modal = pending !== null ? (
    <ReasonModal title={pending ? `Move the ship date to ${fmtDate(pending + 'T12:00')}` : 'Remove the ship date'} confirmLabel={pending ? 'Move the date' : 'Remove the date'}
      placeholder="e.g. Underestimated the data layer by a week" onClose={() => setPending(null)}
      onConfirm={async (reason) => {
        await run(() => api.patchProject(p.id, { target_date: pending, reason }));
        setPending(null);
      }}>
      <p className="muted">
        The ship date was {fmtDate(p.target_date + 'T12:00')}{p.original_target_date && p.original_target_date !== p.target_date ? ` (first planned: ${fmtDate(p.original_target_date + 'T12:00')})` : ''}.
        A move is allowed, but it is counted and shown on the overview with the reason you give here.
      </p>
    </ReasonModal>
  ) : null;
  return { change, modal, pending };
}
