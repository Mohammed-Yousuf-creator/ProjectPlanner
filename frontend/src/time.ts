// Time helpers: countdown formatting, local dates, streaks.

import { useEffect, useState } from 'react';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Re-renders the calling component on an interval and returns the current time in ms. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "6d 04:12:33" for long spans, "04:12:33" under a day. Never negative. */
export function clock(ms: number): string {
  ms = Math.max(0, ms);
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  const m = Math.floor((ms % HOUR) / MINUTE);
  const s = Math.floor((ms % MINUTE) / SECOND);
  const hms = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return d > 0 ? `${d}d ${hms}` : hms;
}

/** A rough, readable span: "6 days", "4 h 12 min", "35 min", "under a minute". */
export function roughly(ms: number): string {
  ms = Math.abs(ms);
  if (ms >= 2 * DAY) return `${Math.round(ms / DAY)} days`;
  if (ms >= DAY) {
    const hours = Math.round(ms / HOUR);
    if (hours >= 48) return '2 days';
    return hours > 24 ? `1 day ${hours - 24} h` : '1 day';
  }
  if (ms >= HOUR) {
    const minutes = Math.round(ms / MINUTE);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  if (ms >= MINUTE) return `${Math.round(ms / MINUTE)} min`;
  return 'under a minute';
}

export function minutesLabel(minutes: number): string {
  return roughly(minutes * MINUTE);
}

const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});
const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const longDateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

export const fmtDateTime = (iso: string | number | Date) => dateTimeFmt.format(new Date(iso));
export const fmtDate = (iso: string | number | Date) => dateFmt.format(new Date(iso));
export const fmtLongDate = (iso: string | number | Date) => longDateFmt.format(new Date(iso));

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(d: Date | number | string = new Date()): string {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

/** Parses YYYY-MM-DD as a local date (noon, to stay clear of DST edges). */
export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Value for <input type="datetime-local"> in local time. */
export function toLocalInput(iso: string | Date | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** End of the given local day (23:59), as ISO — used for date-only deadlines. */
export function endOfDayISO(day: string): string {
  const d = fromDayKey(day);
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
}

/**
 * Current streak of consecutive active days. Today not being active yet does not break the
 * streak (the day is not over); a fully missed yesterday does.
 */
export function streak(activeDays: Set<string>, today = new Date()): number {
  let cursor = new Date(today);
  if (!activeDays.has(dayKey(cursor))) cursor = addDays(cursor, -1);
  let n = 0;
  while (activeDays.has(dayKey(cursor))) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

/** Due-date wording relative to now. */
export function dueLabel(iso: string, now: number): { text: string; overdue: boolean; soon: boolean } {
  const diff = new Date(iso).getTime() - now;
  if (diff < 0) return { text: `${roughly(diff)} overdue`, overdue: true, soon: false };
  return { text: `due in ${roughly(diff)}`, overdue: false, soon: diff < DAY };
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export { DAY, HOUR, MINUTE };
