// Derived state: what the clock should say, how far along the project is.

import type { Bundle, DateMove, Milestone, Segment, Story, Task } from './types';
import { DAY, HOUR, dayKey, fromDayKey, roughly, streak } from './time';

export type Tone = 'calm' | 'warn' | 'hot' | 'ok';

export interface ClockState {
  kind: 'plan' | 'build' | 'shipped' | 'hack-wait' | 'hack-live' | 'hack-over';
  /** What the countdown counts down to, in words. */
  label: string;
  /** Timestamp the countdown runs to; undefined when there is nothing to count down. */
  target?: number;
  /** Shown instead of a countdown when there is no target. */
  text?: string;
  tone: Tone;
  /** Elapsed share (0..1) of the window the clock belongs to. */
  fraction?: number;
  segment?: Segment;
}

const ms = (iso: string) => new Date(iso).getTime();

function urgency(remaining: number, total: number): Tone {
  if (total <= 0) return 'hot';
  const left = remaining / total;
  if (left <= 0.15) return 'hot';
  if (left <= 0.5) return 'warn';
  return 'calm';
}

export function clockState(b: Bundle, now: number): ClockState {
  const p = b.project;

  if (b.hackathon) {
    const start = ms(b.hackathon.start);
    const end = ms(b.hackathon.end);
    if (now < start) {
      return { kind: 'hack-wait', label: 'Hackathon starts in', target: start, tone: 'calm' };
    }
    if (now >= end) {
      return { kind: 'hack-over', label: 'Hackathon', text: p.phase === 'shipped' ? 'Submitted' : 'Time is up', tone: p.phase === 'shipped' ? 'ok' : 'hot' };
    }
    if (p.phase === 'shipped') {
      return { kind: 'hack-live', label: 'Shipped — deadline in', target: end, tone: 'ok', fraction: (now - start) / (end - start) };
    }
    const segment = b.hackathon.segments.find((s) => now >= ms(s.start) && now < ms(s.end)) ?? b.hackathon.segments[b.hackathon.segments.length - 1];
    return {
      kind: 'hack-live', label: 'Time left to submit', target: end,
      tone: segment.key === 'submit' ? 'hot' : segment.key === 'polish' ? 'warn' : urgency(end - now, end - start),
      fraction: (now - start) / (end - start), segment,
    };
  }

  if (p.phase === 'plan') {
    const start = ms(b.planning.window_start);
    const end = ms(b.planning.deadline);
    return { kind: 'plan', label: 'Coding starts in', target: end, tone: urgency(end - now, end - start), fraction: (now - start) / Math.max(1, end - start) };
  }
  if (p.phase === 'shipped') {
    return { kind: 'shipped', label: 'MVP', text: 'Shipped', tone: 'ok' };
  }
  if (p.target_date) {
    const target = fromDayKey(p.target_date);
    target.setHours(23, 59, 0, 0);
    const started = p.build_started_at ? ms(p.build_started_at) : now;
    const left = target.getTime() - now;
    if (left < 0) return { kind: 'build', label: 'Target date', text: `${roughly(left)} overdue`, tone: 'hot' };
    return { kind: 'build', label: 'Ship the MVP in', target: target.getTime(), tone: urgency(left, target.getTime() - started), fraction: (now - started) / Math.max(1, target.getTime() - started) };
  }
  const since = p.build_started_at ? now - ms(p.build_started_at) : 0;
  return { kind: 'build', label: 'Building', text: since < DAY ? 'Day 1' : `Day ${Math.floor(since / DAY) + 1}`, tone: 'calm' };
}

/** Tasks that count towards the MVP: everything except the expansion pack. */
export const mvpTasks = (tasks: Task[]) => tasks.filter((t) => t.scope !== 'dlc');

export function taskProgress(tasks: Task[]): { done: number; total: number } {
  const list = mvpTasks(tasks);
  return { done: list.filter((t) => t.status === 'done').length, total: list.length };
}

export function checklistProgress(t: Task): { done: number; total: number } {
  return { done: t.checklist.filter((c) => c.done).length, total: t.checklist.length };
}

/** The next milestone that still has open tasks (or no tasks yet), by due date. */
export function nextMilestone(milestones: Milestone[], tasks: Task[]): Milestone | undefined {
  const open = milestones.filter((m) => {
    const mine = tasks.filter((t) => t.milestone_id === m.id);
    return mine.length === 0 || mine.some((t) => t.status !== 'done');
  });
  return open.sort((a, b) => (a.due_at ? ms(a.due_at) : Infinity) - (b.due_at ? ms(b.due_at) : Infinity) || a.position - b.position)[0];
}

/** Days with a log entry, plus days with commits when a repository is linked. */
export function activeDays(b: Bundle, commitDays: string[] = []): Set<string> {
  return new Set([...b.logs.map((l) => l.day), ...commitDays]);
}

export function currentStreak(b: Bundle, commitDays: string[] = []): number {
  return streak(activeDays(b, commitDays));
}

export const todayKey = () => dayKey(new Date());

/**
 * In a hackathon, how much of the MVP should be done by now if work were spread evenly over
 * the build segment — a blunt but useful "am I behind?" signal.
 */
export function expectedProgress(b: Bundle, now: number): number | null {
  if (!b.hackathon) return null;
  const build = b.hackathon.segments.find((s) => s.key === 'build');
  if (!build) return null;
  const start = ms(build.start);
  const end = ms(build.end);
  if (now <= start) return 0;
  if (now >= end) return 1;
  return (now - start) / (end - start);
}

// ---------- keeping scope and time honest ----------

/** How many tasks were added to, parked from and cut out of the MVP since coding started. */
export function scopeCreep(b: Bundle): { added: number; ideas: number; removed: number; net: number } {
  let added = 0, ideas = 0, removed = 0;
  for (const e of b.events) {
    if (e.kind === 'scope_add') added++;
    else if (e.kind === 'scope_park') {
      // A new idea parked straight away never touched the MVP; a task moved out of it did.
      if (e.data.how === 'new') ideas++;
      else removed++;
    } else if (e.kind === 'scope_cut') removed += Math.max(1, e.data.tasks?.length ?? 1);
  }
  return { added, ideas, removed, net: added - removed };
}

/** "1.5/2 h" (spent of estimated), "2 h" (estimate only) or "40 min" (spent only); empty when neither is set. */
export function effortLabel(t: Task): string {
  const spent = t.spent_minutes > 0 ? Math.round(t.spent_minutes / 6) / 10 : 0;
  if (t.estimate_hours && spent > 0) return `${spent}/${t.estimate_hours} h`;
  if (t.estimate_hours) return `${t.estimate_hours} h`;
  return t.spent_minutes > 0 ? hoursLabel(t.spent_minutes) : '';
}

/** Every time a deadline was moved after coding started, newest first. */
export function dateMoves(b: Bundle): { at: string; move: DateMove }[] {
  const out: { at: string; move: DateMove }[] = [];
  for (const e of b.events) if (e.kind === 'date_move') out.push({ at: e.at, move: e.data });
  return out.reverse();
}

/** Days between the first ship date and the current one; positive = later than first planned. */
export function targetDrift(b: Bundle): number | null {
  const { target_date: now, original_target_date: first } = b.project;
  if (!now || !first) return null;
  return Math.round((fromDayKey(now).getTime() - fromDayKey(first).getTime()) / DAY);
}

/** How long a task may sit in progress before it is flagged: the project limit, or twice its estimate if that is longer. */
export function staleLimitMs(t: Task, staleHours: number): number {
  const byEstimate = t.estimate_hours ? t.estimate_hours * 2 * HOUR : 0;
  return Math.max(staleHours * HOUR, byEstimate);
}

export function isStale(t: Task, staleHours: number, now: number): boolean {
  return t.status === 'doing' && !!t.started_at && now - ms(t.started_at) > staleLimitMs(t, staleHours);
}

export const staleTasks = (b: Bundle, now: number) => b.tasks.filter((t) => isStale(t, b.project.stale_hours, now));

export interface EstimateStats {
  /** Finished tasks that have both an estimate and logged time. */
  measured: number;
  estimated: number; // hours, over the measured tasks
  spent: number;     // hours, over the measured tasks
  multiplier: number | null;
  /** Open MVP work: estimated hours left, and how many open tasks have no estimate. */
  openHours: number;
  openUnestimated: number;
}

export function estimateStats(tasks: Task[]): EstimateStats {
  const s: EstimateStats = { measured: 0, estimated: 0, spent: 0, multiplier: null, openHours: 0, openUnestimated: 0 };
  for (const t of mvpTasks(tasks)) {
    if (t.status === 'done') {
      if (t.estimate_hours && t.spent_minutes > 0) {
        s.measured++;
        s.estimated += t.estimate_hours;
        s.spent += t.spent_minutes / 60;
      }
    } else if (t.estimate_hours) {
      s.openHours += t.estimate_hours;
    } else {
      s.openUnestimated++;
    }
  }
  if (s.estimated > 0) s.multiplier = s.spent / s.estimated;
  return s;
}

export interface Pace {
  start: number;
  end: number | null;              // the ship date (end of that day), if one is set
  /** Remaining MVP tasks over time: one point per change, ending at "now". */
  points: { at: number; remaining: number }[];
  total: number;
  remaining: number;
  /** Tasks finished per day over the last week of building (or since the start, if shorter). */
  perDay: number;
  /** When the remaining work reaches zero at that pace; null when nothing was finished yet. */
  projected: number | null;
  /** Projected finish minus ship date, in days; positive = late. */
  slipDays: number | null;
}

/**
 * Burn-down of the MVP: how many tasks were open at each moment since coding started, and when
 * they run out at the pace of the last seven days. Tasks added later raise the line — scope
 * creep is visible as a step up.
 */
export function pace(b: Bundle, now: number): Pace | null {
  const p = b.project;
  if (!p.build_started_at) return null;
  const start = ms(p.build_started_at);
  const stop = p.shipped_at ? ms(p.shipped_at) : now;
  const list = mvpTasks(b.tasks);
  const changes: { at: number; delta: number }[] = [];
  let open = 0;
  for (const t of list) {
    const created = ms(t.created_at);
    if (created <= start) open++;
    else changes.push({ at: Math.min(created, stop), delta: 1 });
    if (t.status === 'done' && t.done_at) changes.push({ at: Math.min(Math.max(ms(t.done_at), start), stop), delta: -1 });
  }
  changes.sort((a, c) => a.at - c.at);
  const points = [{ at: start, remaining: open }];
  for (const c of changes) {
    open += c.delta;
    points.push({ at: c.at, remaining: Math.max(0, open) });
  }
  points.push({ at: stop, remaining: Math.max(0, open) });

  const remaining = list.filter((t) => t.status !== 'done').length;
  const windowStart = Math.max(start, stop - 7 * DAY);
  const doneInWindow = list.filter((t) => t.status === 'done' && t.done_at && ms(t.done_at) >= windowStart).length;
  const windowDays = Math.max((stop - windowStart) / DAY, 0.25);
  const perDay = doneInWindow / windowDays;
  let end: number | null = null;
  if (b.hackathon) end = ms(b.hackathon.freeze_at);
  else if (p.target_date) {
    const d = fromDayKey(p.target_date);
    d.setHours(23, 59, 0, 0);
    end = d.getTime();
  }
  const projected = remaining === 0 ? stop : perDay > 0 ? stop + (remaining / perDay) * DAY : null;
  const slipDays = projected !== null && end !== null ? (projected - end) / DAY : null;
  return { start, end, points, total: list.length, remaining, perDay, projected, slipDays };
}

/** The picks made for a day, in order. */
export const picksFor = (b: Bundle, day: string) => b.picks.filter((k) => k.day === day).sort((a, c) => a.position - c.position);

/** MVP stories in the order they get cut: ranked first, then unranked from the bottom up. */
export function cutOrder(stories: Story[]): Story[] {
  return stories.filter((s) => s.tier === 'mvp').sort((a, c) => {
    if (a.cut_rank !== null && c.cut_rank !== null) return a.cut_rank - c.cut_rank;
    if (a.cut_rank !== null) return -1;
    if (c.cut_rank !== null) return 1;
    return c.position - a.position;
  });
}

/** "1.4×" */
export const times = (n: number) => `${n.toFixed(n >= 10 ? 0 : 1)}×`;

/** Hours as "1.5 h", minutes below an hour as "40 min". */
export function hoursLabel(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}
