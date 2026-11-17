import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { Alert } from '../types';
import { Icon } from './ui';

const ENABLED = 'planner-notify';
const SHOWN = 'planner-notified';
const supported = typeof window !== 'undefined' && 'Notification' in window;

function wasShown(key: string): boolean {
  try { return (JSON.parse(localStorage.getItem(SHOWN) ?? '[]') as string[]).includes(key); } catch { return false; }
}
function markShown(key: string) {
  try {
    const list = JSON.parse(localStorage.getItem(SHOWN) ?? '[]') as string[];
    localStorage.setItem(SHOWN, JSON.stringify([...list.filter((k) => k !== key), key].slice(-200)));
  } catch { /* private mode */ }
}

/**
 * Desktop notifications for deadlines: planning about to end, pencils down, feature freeze,
 * milestones, ship date, the stuck timer. The browser schedules them; nothing leaves the machine.
 * They only fire while a ProjectPlanner tab is open.
 */
export function NotifyButton() {
  const navigate = useNavigate();
  const [on, setOn] = useState(() => {
    try { return supported && Notification.permission === 'granted' && localStorage.getItem(ENABLED) === '1'; } catch { return false; }
  });
  const [note, setNote] = useState('');
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    const clear = () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; };

    const show = (a: Alert) => {
      if (wasShown(a.key)) return;
      markShown(a.key);
      try {
        const n = new Notification(`${a.title}`, { body: `${a.project} — ${a.body}`, tag: a.key });
        n.onclick = () => { window.focus(); navigate(a.path); n.close(); };
      } catch { /* notifications were switched off in the browser */ }
    };

    const load = () => {
      api.alerts().then((alerts) => {
        if (cancelled) return;
        clear();
        const now = Date.now();
        for (const a of alerts) {
          const wait = new Date(a.at).getTime() - now;
          if (wait > 6 * 60_000) continue;      // the next refresh picks it up
          if (wasShown(a.key)) continue;
          timers.current.push(window.setTimeout(() => show(a), Math.max(0, wait)));
        }
      }).catch(() => undefined);
    };
    load();
    const every = window.setInterval(load, 5 * 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; clear(); window.clearInterval(every); document.removeEventListener('visibilitychange', onVisible); };
  }, [on, navigate]);

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(''), 5000);
    return () => window.clearTimeout(t);
  }, [note]);

  if (!supported) return null;

  const toggle = async () => {
    if (on) {
      try { localStorage.setItem(ENABLED, '0'); } catch { /* private mode */ }
      setOn(false);
      setNote('Deadline notifications are off.');
      return;
    }
    let permission = Notification.permission;
    if (permission === 'default') {
      try { permission = await Notification.requestPermission(); } catch { permission = 'denied'; }
    }
    if (permission !== 'granted') {
      setNote('Notifications are blocked for this site. Allow them in the browser\'s site settings, then try again.');
      return;
    }
    try { localStorage.setItem(ENABLED, '1'); } catch { /* private mode */ }
    setOn(true);
    setNote('Deadline notifications are on while this tab is open.');
  };

  return (
    <span className="notify">
      <button className={`icon-btn ${on ? 'on' : ''}`} onClick={toggle} aria-pressed={on}
        aria-label={on ? 'Turn deadline notifications off' : 'Turn deadline notifications on'}
        title={on ? 'Deadline notifications are on' : 'Notify me about deadlines'}>
        <Icon name="bell" size={18} />
      </button>
      {note && <span className="notify-note" role="status">{note}</span>}
    </span>
  );
}
