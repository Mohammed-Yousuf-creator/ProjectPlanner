// Derived state: what the clock should say, how far along the project is.

import type { Bundle, Milestone, Segment, Task } from './types';
import { DAY, dayKey, fromDayKey, roughly, streak } from './time';

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
