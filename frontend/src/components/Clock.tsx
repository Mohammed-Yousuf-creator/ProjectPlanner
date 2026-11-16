import { useEffect, useRef } from 'react';
import type { Bundle } from '../types';
import { clockState, type ClockState } from '../lib';
import { clock, fmtDateTime, useNow } from '../time';

/** Ticks once a second and tells the caller when a countdown hits zero (to reload the phase). */
export function useClock(b: Bundle, onZero?: () => void): { now: number; state: ClockState } {
  const now = useNow(1000);
  const state = clockState(b, now);
  const fired = useRef<number | null>(null);
  useEffect(() => {
    if (!onZero || state.target === undefined) return;
    if (now >= state.target && fired.current !== state.target) {
      fired.current = state.target;
      onZero();
    }
  }, [now, state.target, onZero]);
  return { now, state };
}

/** Compact clock for the project header. */
export function ClockChip({ b, onZero }: { b: Bundle; onZero?: () => void }) {
  const { now, state } = useClock(b, onZero);
  return (
    <div className={`clock-chip tone-${state.tone}`} title={state.target ? fmtDateTime(state.target) : undefined}>
      <span className="clock-chip-label">{state.label}</span>
      <span className="clock-chip-time">{state.target !== undefined ? clock(state.target - now) : state.text}</span>
    </div>
  );
}

/** The big countdown on the overview. */
export function HeroClock({ state, now }: { state: ClockState; now: number }) {
  return (
    <div className={`hero-clock tone-${state.tone}`}>
      <div className="hero-clock-label">{state.label}</div>
      <div className="hero-clock-time" aria-live="off">
        {state.target !== undefined ? clock(state.target - now) : state.text}
      </div>
      {state.fraction !== undefined && (
        <div className="hero-clock-bar" aria-hidden="true">
          <div style={{ width: `${Math.min(100, Math.max(0, state.fraction * 100))}%` }} />
        </div>
      )}
    </div>
  );
}

/** Hackathon timeline: plan → build → polish → submit, with a marker for now. */
export function HackTimeline({ b, now }: { b: Bundle; now: number }) {
  const h = b.hackathon;
  if (!h) return null;
  const start = new Date(h.start).getTime();
  const end = new Date(h.end).getTime();
  const total = end - start;
  const live = now >= start && now < end;
  // Very short segments get a minimum width so their label stays readable; the "now" marker
  // is placed by the same weights so it always sits inside the right segment.
  const spans = h.segments.map((s) => ({ from: new Date(s.start).getTime(), to: new Date(s.end).getTime() }));
  const weights = spans.map((s) => Math.max(s.to - s.from, total * 0.06));
  const weightSum = weights.reduce((a, w) => a + w, 0);
  let pos = 0;
  for (let i = 0; i < spans.length; i++) {
    const { from, to } = spans[i];
    if (now >= to) pos += weights[i];
    else {
      if (now > from) pos += weights[i] * ((now - from) / Math.max(1, to - from));
      break;
    }
  }
  pos /= weightSum;
  return (
    <div className="timeline">
      <div className="timeline-track">
        {h.segments.map((s, i) => {
          const { from, to } = spans[i];
          const active = now >= from && now < to;
          const past = now >= to;
          return (
            <div key={s.key} className={`timeline-seg seg-${s.key} ${active ? 'active' : ''} ${past ? 'past' : ''}`}
              style={{ flexGrow: weights[i] }} title={`${s.label}: ${fmtDateTime(s.start)} → ${fmtDateTime(s.end)}`}>
              <span className="timeline-seg-label">{s.label}</span>
              <span className="timeline-seg-time">{active ? `${clock(to - now)} left` : fmtDateTime(s.start)}</span>
            </div>
          );
        })}
        {live && <div className="timeline-now" style={{ left: `${pos * 100}%` }} aria-label="Now" />}
      </div>
      <div className="timeline-ends">
        <span>Start · {fmtDateTime(h.start)}</span>
        <span>Feature freeze · {fmtDateTime(h.freeze_at)}</span>
        <span>Deadline · {fmtDateTime(h.end)}</span>
      </div>
    </div>
  );
}
