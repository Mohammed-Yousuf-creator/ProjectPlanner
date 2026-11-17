import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { SearchHit } from '../types';
import { Icon } from './ui';

const KIND: Record<SearchHit['kind'], string> = {
  project: 'Project', answer: 'Blueprint', story: 'User story', item: 'Blueprint', task: 'Task', obstacle: 'Obstacle', log: 'Journal',
};

function pathFor(h: SearchHit): string {
  const base = `/p/${h.project_id}`;
  switch (h.kind) {
    case 'task': return `${base}/board?task=${h.id}`;
    case 'obstacle': return `${base}/obstacles`;
    case 'log': return `${base}/journal`;
    case 'story': return `${base}/blueprint/stories`;
    case 'answer':
    case 'item': return `${base}/blueprint`;
    default: return base;
  }
}

/** Search across every project: answers, stories, tasks, obstacles and their fixes, journal entries. Opens with "/". */
export function GlobalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if ((e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { if (open) input.current?.focus(); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits(null); setFailed(''); return; }
    let cancelled = false;
    const t = window.setTimeout(() => {
      api.search(term)
        .then((r) => { if (!cancelled) { setHits(r); setActive(0); setFailed(''); } })
        .catch((e: Error) => { if (!cancelled) { setHits([]); setFailed(e.message); } });
    }, 180);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [q]);

  const go = (h: SearchHit) => {
    setOpen(false);
    setQ('');
    navigate(pathFor(h));
  };

  if (!open) {
    return (
      <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Search all projects" title="Search all projects ( / )">
        <Icon name="search" size={18} />
      </button>
    );
  }

  return (
    <div className="search" ref={box}>
      <div className="search-field">
        <Icon name="search" size={15} />
        <input ref={input} className="search-input" value={q} placeholder="Search every project…" aria-label="Search every project"
          role="combobox" aria-expanded={!!hits} aria-controls="search-results" aria-autocomplete="list"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setOpen(false); setQ(''); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min((hits?.length ?? 1) - 1, a + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            else if (e.key === 'Enter' && hits?.[active]) go(hits[active]);
          }} />
      </div>
      {q.trim().length >= 2 && hits && (
        <ul className="search-results" id="search-results" role="listbox">
          {failed && <li className="search-empty">{failed}</li>}
          {!failed && hits.length === 0 && <li className="search-empty">Nothing matches “{q.trim()}”.</li>}
          {hits.map((h, i) => (
            <li key={`${h.kind}-${h.id}-${h.sub}`} role="option" aria-selected={i === active}>
              <button className={`search-hit ${i === active ? 'on' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => go(h)}>
                <span className="search-hit-top">
                  <span className="search-kind">{KIND[h.kind] ?? h.kind}{h.sub && h.kind !== 'project' ? ` · ${h.sub.replace(/_/g, ' ')}` : ''}</span>
                  <span className="search-project">{h.project_name}</span>
                </span>
                <span className="search-title">{h.title}</span>
                {h.snippet && h.snippet !== h.title && <span className="search-snippet">{h.snippet}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
