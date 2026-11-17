import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Badge, Card, ConfirmButton, Empty, Field, Icon, SavedText } from '../components/ui';
import { useProject } from '../store';
import type { Obstacle, ObstacleKind } from '../types';
import { fmtDateTime } from '../time';

type Kind = Exclude<ObstacleKind, 'unsorted'>;

const KINDS: Record<Kind, { title: string; ask: string; example: string; protocol: string }> = {
  memory: {
    title: 'Memory',
    ask: 'I knew this once and forgot it.',
    example: 'Syntax, a command, the name of a function.',
    protocol: 'Look it up right now — docs, a search, your notes — and carry on. No guilt at all: memorising is not engineering.',
  },
  knowledge: {
    title: 'Knowledge',
    ask: 'I never learned how this works.',
    example: 'How flexbox lays things out, how OAuth works.',
    protocol: 'Learn the minimum you need for the task in front of you, from the docs first. Not the whole topic — just enough to continue.',
  },
  problem: {
    title: 'Problem-solving',
    ask: 'I have to work out an approach myself.',
    example: 'A caching strategy, how to design this API.',
    protocol: 'This is the part that makes you better, so do not skip it: come up with your own approaches first and try one. Only after several real attempts, go and see how others solved it.',
  },
  debug: {
    title: 'Debugging',
    ask: 'Something that should work does not.',
    example: 'Why is this error coming?',
    protocol: 'Read the whole error. Form one hypothesis, test it, repeat. A bug is always one of the other three in disguise — something you forgot, something you never knew, or a design that is wrong — so work out which, and treat it that way.',
  },
};

const MIN_ATTEMPTS = 2;

export default function Obstacles() {
  const { b, p, run } = useProject();
  const [params, setParams] = useSearchParams();
  const taskParam = Number(params.get('task')) || null;
  const [title, setTitle] = useState('');
  const [taskId, setTaskId] = useState<number | null>(taskParam && b.tasks.some((t) => t.id === taskParam) ? taskParam : null);
  const [query, setQuery] = useState('');

  const open = b.obstacles.filter((o) => o.status === 'open');
  const resolved = useMemo(() => {
    const q = query.trim().toLowerCase();
    return b.obstacles.filter((o) => o.status === 'resolved' && (!q || `${o.title} ${o.resolution} ${o.approaches}`.toLowerCase().includes(q)));
  }, [b.obstacles, query]);
  const resolvedTotal = b.obstacles.length - open.length;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await run(() => api.create(p.id, 'obstacles', { title, task_id: taskId }));
    setTitle('');
    if (params.has('task')) setParams({}, { replace: true });
  };

  return (
    <div className="stack obstacles">
      <Card title="I'm stuck">
        <p className="lead">Before you search for an answer, name the obstacle and what kind it is. The kind decides what you do next.</p>
        <form className="row row-wrap" onSubmit={add}>
          <input className="input row-main" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus={!!taskParam}
            placeholder="What exactly is blocking you? One sentence." aria-label="Obstacle" />
          <select className="input select-task" value={taskId ?? ''} onChange={(e) => setTaskId(e.target.value ? Number(e.target.value) : null)} aria-label="Related task">
            <option value="">Not tied to a task</option>
            {b.tasks.filter((t) => t.status !== 'done' || t.id === taskId).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <button className="btn btn-primary" type="submit" disabled={!title.trim()}>Log it</button>
        </form>
      </Card>

      {open.length === 0 ? (
        <Empty title="No open obstacles">When one shows up, log it here first. Half the time, writing the sentence is enough to see the answer.</Empty>
      ) : (
        open.map((o) => <OpenObstacle key={o.id} o={o} />)
      )}

      {resolvedTotal > 0 && (
        <Card title="Solved before" aside={
          <input className="input input-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your fixes" aria-label="Search solved obstacles" />
        }>
          {resolved.length === 0 ? <p className="muted">Nothing matches “{query}”.</p> : (
            <ul className="solved-list">
              {resolved.map((o) => (
                <li key={o.id}>
                  <div className="solved-head">
                    <strong>{o.title}</strong>
                    {o.kind !== 'unsorted' && <Badge>{KINDS[o.kind].title}</Badge>}
                    <span className="muted small">{o.resolved_at ? fmtDateTime(o.resolved_at) : ''}</span>
                    <button className="link-btn" onClick={() => run(() => api.patch('obstacles', o.id, { status: 'open' }))}>Reopen</button>
                    <ConfirmButton className="icon-btn" confirmLabel="Sure?" title="Delete" onConfirm={() => run(() => api.remove('obstacles', o.id))}><Icon name="trash" size={14} /></ConfirmButton>
                  </div>
                  {o.resolution && <p className="pre">{o.resolution}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function OpenObstacle({ o }: { o: Obstacle }) {
  const { b, run } = useProject();
  const patch = (body: Record<string, unknown>) => run(() => api.patch('obstacles', o.id, body));
  const task = b.tasks.find((t) => t.id === o.task_id);
  const kind = o.kind === 'unsorted' ? null : KINDS[o.kind];
  const earnedHelp = o.attempts >= MIN_ATTEMPTS && o.approaches.trim().length > 0;

  return (
    <Card tone="danger"
      title={<SavedText className="title-input" value={o.title} required onSave={(v) => { void patch({ title: v }); }} ariaLabel="Obstacle" />}
      aside={<ConfirmButton className="icon-btn" confirmLabel="Sure?" title="Delete" onConfirm={() => run(() => api.remove('obstacles', o.id))}><Icon name="trash" size={15} /></ConfirmButton>}>
      {task && <p className="muted small">On task: {task.title}</p>}

      <Field label="What kind of obstacle is this?">
        <div className="kind-grid" role="radiogroup" aria-label="Kind of obstacle">
          {(Object.keys(KINDS) as Kind[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={o.kind === k} className={`choice-card ${o.kind === k ? 'on' : ''}`} onClick={() => patch({ kind: k })}>
              <strong>{KINDS[k].title}</strong>
              <span>{KINDS[k].ask}</span>
              <em>{KINDS[k].example}</em>
            </button>
          ))}
        </div>
      </Field>

      {kind && (
        <>
          <div className="protocol">
            <h4>What to do</h4>
            <p>{kind.protocol}</p>
          </div>

          {(o.kind === 'problem' || o.kind === 'debug') && (
            <>
              <Field label={o.kind === 'problem' ? 'My own approaches' : 'Hypotheses I tested'}
                hint={o.kind === 'problem' ? 'Write down at least two ways you could do it before trying one.' : 'One per line: what you thought it was, and what happened when you checked.'}>
                <SavedText multiline minRows={2} value={o.approaches} onSave={(v) => { void patch({ approaches: v }); }}
                  placeholder={'1. …\n2. …'} ariaLabel="Approaches" />
              </Field>
              <div className="attempts">
                <span>Real attempts: <strong>{o.attempts}</strong></span>
                <button className="btn btn-sm" onClick={() => patch({ attempts: o.attempts + 1 })}><Icon name="plus" size={12} /> I tried again</button>
                {o.attempts > 0 && <button className="link-btn" onClick={() => patch({ attempts: o.attempts - 1 })}>undo</button>}
                {o.kind === 'problem' && (
                  <span className={`help-gate ${earnedHelp ? 'earned' : ''}`}>
                    <Icon name={earnedHelp ? 'check' : 'lock'} size={13} />
                    {earnedHelp ? 'You gave it a real shot — looking up how others do it is fair now.' : `Outside help after ${MIN_ATTEMPTS} attempts and your own approaches written down.`}
                  </span>
                )}
              </div>
            </>
          )}

          <Field label="What fixed it" hint="Future you will hit this again. Leave the answer here.">
            <SavedText multiline minRows={2} value={o.resolution} onSave={(v) => { void patch({ resolution: v }); }} placeholder="The cause, and the fix" ariaLabel="Resolution" />
          </Field>
          <button className="btn btn-primary" onClick={() => patch({ status: 'resolved' })}><Icon name="check" /> Solved</button>
        </>
      )}
    </Card>
  );
}
