// Small building blocks used on every page.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

// ---------- icons (inline SVG, no icon font) ----------

const paths: Record<string, string> = {
  check: 'M4 12.5l5 5L20 6.5',
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  clock: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  back: 'M19 12H5M11 6l-6 6 6 6',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  lock: 'M7 11V8a5 5 0 0110 0v3M5 11h14v9H5z',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z',
  play: 'M7 5l12 7-12 7z',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4',
  alert: 'M12 9v4M12 17h.01M10.3 4.3L2.6 18a2 2 0 001.7 3h15.4a2 2 0 001.7-3L13.7 4.3a2 2 0 00-3.4 0z',
  rocket: 'M5 15c-1 1-1.5 4-1.5 4s3-.5 4-1.5M9 15l-3-3c1-4 4-8 12-9-1 8-5 11-9 12zM14.5 9.5h.01',
  skip: 'M5 5l8 7-8 7zM17 5v14',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  bell: 'M6 16V11a6 6 0 0112 0v5l2 2H4l2-2zM10 21h4',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.3l2-1.5-2-3.4-2.3 1a7 7 0 00-2.2-1.3L14 3h-4l-.4 2.5a7 7 0 00-2.2 1.3l-2.3-1-2 3.4 2 1.5a7 7 0 000 2.6l-2 1.5 2 3.4 2.3-1a7 7 0 002.2 1.3L10 21h4l.4-2.5a7 7 0 002.2-1.3l2.3 1 2-3.4-2-1.5c.1-.4.1-.9.1-1.3z',
  calendar: 'M5 6h14v14H5zM5 10h14M9 3v4M15 3v4',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  scissors: 'M6 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12',
  mic: 'M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3zM5 11a7 7 0 0014 0M12 18v3',
};

export function Icon({ name, size = 16 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] ?? ''} />
    </svg>
  );
}

// ---------- text that saves itself ----------

interface SavedTextProps {
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  minRows?: number;
  mono?: boolean;
  className?: string;
  ariaLabel?: string;
  id?: string;
  type?: string;
  /** An empty value is never saved; leaving the field empty puts the saved text back. */
  required?: boolean;
  /** Called instead when the field is left empty — for rows that delete themselves when cleared. */
  onClear?: () => void;
}

/**
 * An input or textarea bound to a saved value. It saves when focus leaves the field and,
 * while typing, after a short pause — there is no Save button to forget.
 */
export function SavedText({ value, onSave, placeholder, multiline, minRows = 2, mono, className = '', ariaLabel, id, type, required, onClear }: SavedTextProps) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const latest = useRef({ draft, value, onSave, onClear });
  latest.current = { draft, value, onSave, onClear };
  const timer = useRef<number>();
  const area = useRef<HTMLTextAreaElement>(null);

  // Take outside changes only while the user is not editing this field.
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  // Saving happens after a pause in typing, when focus leaves, and on unmount. An emptied
  // required or self-deleting field only acts when focus leaves, never mid-edit.
  const flush = (leaving = false) => {
    window.clearTimeout(timer.current);
    const { draft, value, onSave, onClear } = latest.current;
    if ((required || onClear) && !draft.trim()) {
      if (!leaving) return;
      if (onClear) onClear();
      else setDraft(value);
      return;
    }
    if (draft !== value) onSave(draft);
  };
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps -- save on unmount (e.g. switching steps mid-sentence)

  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [draft, multiline]);

  const common = {
    id,
    value: draft,
    placeholder,
    'aria-label': ariaLabel,
    className: `input ${mono ? 'mono' : ''} ${className}`,
    onFocus: () => { focused.current = true; },
    onBlur: () => { focused.current = false; flush(true); },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft(e.target.value);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => flush(), 1200);
    },
  };
  if (multiline) return <textarea ref={area} rows={minRows} spellCheck {...common} />;
  return <input type={type ?? 'text'} {...common} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}

/** A single-line "type and press Enter" field for adding things to a list. */
export function AddInput({ placeholder, onAdd, prefix, autoFocus, buttonLabel = 'Add' }: {
  placeholder: string;
  onAdd: (text: string) => void | Promise<unknown>;
  prefix?: string;
  autoFocus?: boolean;
  buttonLabel?: string;
}) {
  const [text, setText] = useState('');
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    void onAdd(t);
  };
  return (
    <form className="add-input" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {prefix && <span className="add-prefix">{prefix}</span>}
      <input className="input" value={text} placeholder={placeholder} autoFocus={autoFocus}
        aria-label={placeholder} onChange={(e) => setText(e.target.value)} />
      <button className="btn" type="submit" disabled={!text.trim()}><Icon name="plus" /> {buttonLabel}</button>
    </form>
  );
}

// ---------- layout bits ----------

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>{label}</label>
      {hint && <p className="field-hint">{hint}</p>}
      {children}
    </div>
  );
}

export function Card({ title, aside, children, className = '', tone }: {
  title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; tone?: 'accent' | 'danger' | 'ok';
}) {
  return (
    <section className={`card ${tone ? `card-${tone}` : ''} ${className}`}>
      {(title || aside) && (
        <header className="card-head">
          {title && <h3>{title}</h3>}
          {aside && <div className="card-aside">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Badge({ children, tone = 'neutral', title }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'ok' | 'danger' | 'info'; title?: string }) {
  return <span className={`badge badge-${tone}`} title={title}>{children}</span>;
}

export function Progress({ value, max, tone = 'accent', label }: { value: number; max: number; tone?: 'accent' | 'ok' | 'danger'; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <div className={`progress-fill tone-${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Segmented control: pick one of a few options. */
export function Segmented<T extends string>({ value, options, onChange, ariaLabel, size }: {
  value: T | '';
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: 'sm';
}) {
  return (
    <div className={`segmented ${size === 'sm' ? 'segmented-sm' : ''}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} title={o.title}
          className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A destructive button that asks once before acting: first click arms it, second click confirms. */
export function ConfirmButton({ onConfirm, children, confirmLabel = 'Click again to confirm', className = 'btn btn-ghost', title }: {
  onConfirm: () => void; children: ReactNode; confirmLabel?: string; className?: string; title?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 3500);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" title={title} className={`${className} ${armed ? 'armed' : ''}`}
      onClick={(e) => { e.stopPropagation(); if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {armed ? confirmLabel : children}
    </button>
  );
}

export function Modal({ title, onClose, children, wide, footer }: {
  title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.activeElement as HTMLElement | null;
    // Focus the first field, or the dialog itself.
    const first = box.current?.querySelector<HTMLElement>('[autofocus], input, textarea, select, button.btn-primary');
    (first ?? box.current)?.focus();
    document.body.classList.add('modal-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
      previous?.focus?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" tabIndex={-1} ref={box}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" size={18} /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <div className="spinner" role="status">{label}</div>;
}

/**
 * A date or date-time input bound to a saved value. A complete value saves right away (picking
 * from the calendar); a cleared or half-typed one only when focus leaves the field.
 */
export function SavedDate({ value, onSave, type = 'date', ariaLabel, id, className = '', title, min, max }: {
  value: string; onSave: (value: string) => void; type?: 'date' | 'datetime-local'; ariaLabel?: string; id?: string;
  className?: string; title?: string; min?: string; max?: string;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(value); }, [value]);
  return (
    <input id={id} type={type} className={`input input-date ${className}`} aria-label={ariaLabel} title={title} min={min} max={max}
      value={draft}
      onFocus={() => { focused.current = true; }}
      onChange={(e) => { setDraft(e.target.value); if (e.target.value && e.target.value !== value) onSave(e.target.value); }}
      onBlur={() => { focused.current = false; if (draft !== value) onSave(draft); }} />
  );
}
