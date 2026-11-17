import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useProject } from '../store';
import { clock, fmtDateTime, fromLocalInput, minutesLabel, roughly, toLocalInput } from '../time';
import type { BreakData } from '../types';
import { Badge, Card, Icon, SavedDate, SavedText } from './ui';

// ---------- hours off ----------

/** Sleep and meals, planned up front: the build time that remains is the honest number. */
export function BreaksCard({ now }: { now: number }) {
  const { b, p, items, addItem, updateItem, removeItem } = useProject();
  const h = b.hackathon!;
  const breaks = items<BreakData>('break').slice().sort((a, c) => (a.data.start ?? '').localeCompare(c.data.start ?? ''));
  const start = new Date(h.start).getTime();
  const end = new Date(h.end).getTime();
  const total = Math.round((end - start) / 60_000);
  const off = total - h.work_minutes;
  const [label, setLabel] = useState('Sleep');
  const [from, setFrom] = useState(() => toLocalInput(new Date(Math.max(Date.now(), start))));
  const [hours, setHours] = useState('6');
  const [error, setError] = useState('');

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const s = fromLocalInput(from);
    const len = Number(hours.replace(',', '.'));
    if (!s || !Number.isFinite(len) || len <= 0 || len > 24) { setError('Give a start and a length between 0 and 24 hours.'); return; }
    const sMs = new Date(s).getTime();
    const eMs = sMs + len * 3_600_000;
    if (eMs <= start || sMs >= end) { setError('That is outside the hackathon.'); return; }
    setError('');
    await addItem('break', { label: label.trim() || 'Break', start: s, end: new Date(eMs).toISOString() });
  };

  const current = breaks.find((k) => now >= new Date(k.data.start).getTime() && now < new Date(k.data.end).getTime());
  const next = breaks.find((k) => new Date(k.data.start).getTime() > now);

  return (
    <Card title="Sleep and breaks" aside={<a className="btn btn-sm btn-ghost" href={api.calendarUrl(p.id)} title="Milestones, the freeze and the deadline as calendar events"><Icon name="calendar" size={13} /> Calendar file</a>}>
      <p className="lead">A hackathon plan that assumes you never sleep or eat is wrong from the first hour. Block the time off; the build time shrinks to what you really have.</p>
      <div className="stats hack-hours">
        <div><strong>{minutesLabel(total)}</strong><span>on the clock</span></div>
        <div><strong>{off > 0 ? `−${minutesLabel(off)}` : '0'}</strong><span>off</span></div>
        <div><strong>{minutesLabel(h.build_work_minutes)}</strong><span>of real build time</span></div>
      </div>
      {current && <p className="hack-break-now"><Badge tone="info">Break</Badge> {current.data.label} until {fmtDateTime(current.data.end)}. Actually take it.</p>}
      {!current && next && now >= start && now < end && <p className="muted small">Next break: {next.data.label} in {roughly(new Date(next.data.start).getTime() - now)}.</p>}

      <ul className="plain-list break-list">
        {breaks.map((k) => {
          const past = new Date(k.data.end).getTime() <= now;
          return (
            <li key={k.id} className={`break-row ${past ? 'past' : ''}`}>
              <div className="break-row-head">
                <SavedText className="title-input" value={k.data.label ?? ''} onSave={(v) => updateItem(k, { label: v })} ariaLabel="Break" required />
                <span className="muted small">{roughly(new Date(k.data.end).getTime() - new Date(k.data.start).getTime())}</span>
                <button className="icon-btn" aria-label="Remove break" onClick={() => removeItem(k.id)}><Icon name="x" size={14} /></button>
              </div>
              <div className="break-row-times">
                <SavedDate type="datetime-local" ariaLabel="Break starts" value={toLocalInput(k.data.start)}
                  onSave={(v) => { const iso = fromLocalInput(v); if (iso) updateItem(k, { start: iso }); }} />
                <span className="muted">to</span>
                <SavedDate type="datetime-local" ariaLabel="Break ends" value={toLocalInput(k.data.end)}
                  onSave={(v) => { const iso = fromLocalInput(v); if (iso) updateItem(k, { end: iso }); }} />
              </div>
            </li>
          );
        })}
      </ul>

      <form className="row row-wrap break-add" onSubmit={add}>
        <select className="input input-break" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Kind of break">
          {['Sleep', 'Meal', 'Break', 'Travel'].map((l) => <option key={l}>{l}</option>)}
        </select>
        <input type="datetime-local" className="input input-date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Starts" required />
        <label className="inline-field">for
          <input className="input input-narrow" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} aria-label="Hours" /> h
        </label>
        <button className="btn btn-sm" type="submit"><Icon name="plus" size={12} /> Block it off</button>
      </form>
      {error && <p className="field-error">{error}</p>}
    </Card>
  );
}

// ---------- pitch rehearsal ----------

interface Run { at: string; seconds: number }

function parseRuns(raw: string | undefined): Run[] {
  try {
    const list = JSON.parse(raw || '[]') as Run[];
    return Array.isArray(list) ? list.filter((r) => typeof r?.seconds === 'number' && typeof r?.at === 'string') : [];
  } catch { return []; }
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** Say the pitch out loud against the clock. The run that fits the limit is the one you give. */
export function PitchRehearsal() {
  const { p, savePlan } = useProject();
  const limit = Math.min(3600, Math.max(15, Number(p.plan.pitch_limit) || 180));
  const runs = parseRuns(p.plan.pitch_runs);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const raf = useRef(0);

  useEffect(() => {
    if (startedAt === null) return;
    const tick = () => { setNow(Date.now()); raf.current = window.setTimeout(tick, 200); };
    tick();
    return () => window.clearTimeout(raf.current);
  }, [startedAt]);

  const elapsed = startedAt === null ? 0 : (now - startedAt) / 1000;
  const left = limit - elapsed;
  const over = left < 0;
  const script = (p.plan.demo_script ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const pitch = p.plan.pitch?.trim();

  const stop = () => {
    if (startedAt === null) return;
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    setStartedAt(null);
    if (seconds >= 3) savePlan('pitch_runs', JSON.stringify([...runs, { at: new Date().toISOString(), seconds }].slice(-12)));
  };
  const best = runs.filter((r) => r.seconds <= limit).length;

  return (
    <Card title="Pitch rehearsal" aside={runs.length > 0 ? <Badge tone={best > 0 ? 'ok' : 'danger'}>{best}/{runs.length} within time</Badge> : undefined}>
      <p className="lead">Out loud, standing up, against the clock. The first run is always too long — that is what the second and third are for.</p>
      <div className="row row-wrap">
        <label className="inline-field">Time limit
          <select className="input input-break" value={limit} disabled={startedAt !== null} onChange={(e) => savePlan('pitch_limit', e.target.value)}>
            {[60, 90, 120, 180, 240, 300, 420, 600].map((s) => <option key={s} value={s}>{mmss(s)} min</option>)}
            {![60, 90, 120, 180, 240, 300, 420, 600].includes(limit) && <option value={limit}>{mmss(limit)} min</option>}
          </select>
        </label>
        {startedAt === null
          ? <button className="btn btn-primary" onClick={() => { setNow(Date.now()); setStartedAt(Date.now()); }}><Icon name="mic" size={14} /> Start a run</button>
          : <button className="btn btn-primary" onClick={stop}>Stop</button>}
      </div>

      {startedAt !== null && (
        <div className={`pitch-live ${over ? 'over' : left < limit * 0.2 ? 'close' : ''}`} role="timer" aria-live="off">
          <span className="pitch-time">{over ? `+${clock(-left * 1000)}` : clock(left * 1000)}</span>
          <span className="muted">{over ? 'over time — wrap up now' : 'left'}</span>
          <div className="pitch-bar"><div style={{ width: `${Math.min(100, (elapsed / limit) * 100)}%` }} /></div>
          {(pitch || script.length > 0) && (
            <div className="pitch-script">
              {pitch && <p className="quote">{pitch}</p>}
              {script.length > 0 && <ol>{script.map((l, i) => <li key={i}>{l.replace(/^\d+[.)]\s*/, '')}</li>)}</ol>}
            </div>
          )}
        </div>
      )}

      {runs.length > 0 && startedAt === null && (
        <>
          <ul className="pitch-runs">
            {runs.slice().reverse().map((r, i) => (
              <li key={r.at} className={r.seconds > limit ? 'over' : 'ok'}>
                <span>Run {runs.length - i}</span>
                <strong>{mmss(r.seconds)}</strong>
                <span className="muted small">{r.seconds > limit ? `${mmss(r.seconds - limit)} over` : `${mmss(limit - r.seconds)} to spare`}</span>
                <span className="muted small">{fmtDateTime(r.at)}</span>
              </li>
            ))}
          </ul>
          <button className="link-btn small" onClick={() => savePlan('pitch_runs', '[]')}>Clear the runs</button>
        </>
      )}
    </Card>
  );
}
