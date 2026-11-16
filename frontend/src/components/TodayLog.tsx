import { useEffect, useState } from 'react';
import { api } from '../api';
import { todayKey } from '../lib';
import { useProject } from '../store';
import { fmtLongDate } from '../time';

/**
 * The end-of-day entry: one line about what got done, like a commit message for the day.
 * Writing it down is what makes the progress register.
 */
export function TodayLog({ compact }: { compact?: boolean }) {
  const { b, p, run } = useProject();
  const today = todayKey();
  const existing = b.logs.find((l) => l.day === today);
  const [summary, setSummary] = useState(existing?.summary ?? '');
  const [hours, setHours] = useState(existing?.hours != null ? String(existing.hours) : '');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (dirty) return;
    setSummary(existing?.summary ?? '');
    setHours(existing?.hours != null ? String(existing.hours) : '');
  }, [existing?.summary, existing?.hours, dirty]);

  const parsedHours = hours.trim() === '' ? null : Number(hours);
  const hoursBad = parsedHours !== null && (!Number.isFinite(parsedHours) || parsedHours < 0 || parsedHours > 24);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim() || hoursBad) return;
    await run(() => api.saveLog(p.id, today, { summary, hours: parsedHours }));
    setDirty(false);
  };

  return (
    <form className="today-log" onSubmit={save}>
      {!compact && <p className="muted">{fmtLongDate(new Date())}</p>}
      <textarea className="input" rows={compact ? 2 : 3} value={summary} aria-label="What did you get done today?"
        placeholder="What did you get done today? One honest line is enough."
        onChange={(e) => { setSummary(e.target.value); setDirty(true); }} />
      <div className="today-log-row">
        <label className="inline-field">
          Hours
          <input className="input input-narrow" inputMode="decimal" value={hours} placeholder="–"
            aria-invalid={hoursBad} onChange={(e) => { setHours(e.target.value); setDirty(true); }} />
        </label>
        {hoursBad && <span className="field-error">0–24</span>}
        <button className="btn btn-primary" type="submit" disabled={!summary.trim() || hoursBad || (!dirty && !!existing)}>
          {existing ? (dirty ? 'Update today' : 'Logged') : 'Log today'}
        </button>
      </div>
    </form>
  );
}
