import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { HackTimeline, HeroClock, useClock } from '../components/Clock';
import { ExpansionPack } from '../components/ExpansionPack';
import { CutPrompt, EstimatesCard, MovesCard, PaceCard, ScopeCard, StaleNotice } from '../components/Honesty';
import { RetroCard } from '../components/Retro';
import { SnapshotCard } from '../components/Snapshot';
import { TodayThree } from '../components/TodayThree';
import { useGit, useTaskActions } from '../components/hooks';
import { TodayLog } from '../components/TodayLog';
import { Badge, Card, Empty, Icon, Modal, Progress } from '../components/ui';
import { checklistProgress, currentStreak, effortLabel, expectedProgress, nextMilestone, taskProgress, todayKey } from '../lib';
import type { Meta } from '../types';
import { useProject } from '../store';
import { dueLabel, fmtDateTime, roughly } from '../time';

export default function Overview() {
  const { b, p } = useProject();
  const { now, state } = useClock(b);

  return (
    <div className="overview">
      <section className={`hero tone-${state.tone}`}>
        <HeroClock state={state} now={now} />
        <HeroText now={now} />
      </section>

      {b.hackathon && <Card><HackTimeline b={b} now={now} /><HackHint now={now} /></Card>}

      {p.phase === 'plan' ? <PlanOverview now={now} /> : <BuildOverview now={now} />}
    </div>
  );
}

// ---------- hero ----------

function HeroText({ now }: { now: number }) {
  const { b, p } = useProject();
  const [asking, setAsking] = useState(false);
  const { run } = useProject();
  const navigate = useNavigate();
  const openEssentials = b.steps.filter((s) => s.essential && s.status === 'todo');
  const beforeHackStart = !!b.hackathon && now < new Date(b.hackathon.start).getTime();

  const start = async () => {
    setAsking(false);
    await run(() => api.startBuild(p.id));
    navigate(`/p/${p.id}/board`);
  };

  if (p.phase === 'plan') {
    return (
      <div className="hero-text">
        <h2>{b.planning.ready_to_build ? 'The plan is good enough. Go.' : 'Plan now, so you never have to stop and decide mid-code.'}</h2>
        <p>
          Decided on {fmtDateTime(p.decided_at)}. On <strong>{fmtDateTime(p.planning_deadline)}</strong> planning ends and you start
          coding — finished plan or not. Anything still open then moves onto the board as a task.
        </p>
        <div className="hero-actions">
          <button className={`btn ${b.planning.ready_to_build ? 'btn-primary' : ''}`} disabled={beforeHackStart}
            title={beforeHackStart ? 'Coding starts when the hackathon starts' : undefined}
            onClick={() => (openEssentials.length ? setAsking(true) : void start())}>
            <Icon name="rocket" /> Start coding now
          </button>
          <Link className="btn btn-ghost" to={`blueprint/${b.planning.current_step || b.steps[0].key}`}>
            Continue planning <Icon name="arrow" />
          </Link>
        </div>
        {beforeHackStart && <p className="muted">You can plan before the hackathon starts; the coding clock starts with the event.</p>}
        {asking && (
          <Modal title="Start coding with an unfinished plan?" onClose={() => setAsking(false)}
            footer={<>
              <button className="btn btn-ghost" onClick={() => setAsking(false)}>Keep planning</button>
              <button className="btn btn-primary" onClick={start}><Icon name="rocket" /> Start coding</button>
            </>}>
            <p>These essential steps are still open:</p>
            <ul>{openEssentials.map((s) => <li key={s.key}>{s.title}</li>)}</ul>
            <p>That is allowed. Each one becomes a “Decide while building” task on the board, so the decision still gets made — just not
              before you write a line of code. There is no way back into the planning phase.</p>
          </Modal>
        )}
      </div>
    );
  }

  if (p.phase === 'shipped') {
    return (
      <div className="hero-text">
        <h2>The MVP is out.</h2>
        <p>Shipped on {p.shipped_at ? fmtDateTime(p.shipped_at) : '—'}. The expansion pack is unlocked: build what you feel like building, and stop whenever you are done playing with it.</p>
      </div>
    );
  }

  const debt = b.tasks.filter((t) => t.scope === 'debt' && t.status !== 'done');
  return (
    <div className="hero-text">
      <h2>{p.forced_start ? 'Planning time ran out. You are building now.' : 'You are building.'}</h2>
      <p>
        Coding started on {p.build_started_at ? fmtDateTime(p.build_started_at) : '—'}
        {p.forced_start ? ', when the planning deadline passed.' : '.'} The blueprint is your reference now — work the board, one micro-challenge at a time.
      </p>
      {debt.length > 0 && (
        <p className="hero-note">
          <Icon name="alert" size={14} /> {debt.length} planning decision{debt.length === 1 ? ' is' : 's are'} still open and waiting on the{' '}
          <Link to="board">board</Link>. Make the smallest decision that unblocks you.
        </p>
      )}
    </div>
  );
}

function HackHint({ now }: { now: number }) {
  const { b, p } = useProject();
  const h = b.hackathon!;
  const start = new Date(h.start).getTime();
  const end = new Date(h.end).getTime();
  if (now < start) return <p className="timeline-hint">Not started yet. Use the wait to read the rules, sort out your idea and set up your tools.</p>;
  if (now >= end) return <p className="timeline-hint">The hackathon is over.</p>;
  const seg = h.segments.find((s) => now >= new Date(s.start).getTime() && now < new Date(s.end).getTime());
  if (!seg) return null;
  const { done, total } = taskProgress(b.tasks);
  const expected = expectedProgress(b, now);
  const behind = p.phase === 'build' && seg.key === 'build' && expected !== null && total > 0 && done / total < expected - 0.2;
  return (
    <p className="timeline-hint">
      {seg.key === 'plan' && p.phase !== 'plan'
        ? <><strong>Ahead of the clock:</strong> you started coding before the planning slot ended. Keep that lead for polish.</>
        : <><strong>{seg.label}:</strong> {seg.hint}</>}
      {behind && <span className="behind"> You are behind the clock ({done}/{total} tasks done, {Math.round(expected! * 100)}% of build time used) — cut a story instead of working faster.</span>}
    </p>
  );
}

// ---------- planning ----------

function PlanOverview({ now }: { now: number }) {
  const { b, p } = useProject();
  const done = b.steps.filter((s) => s.status !== 'todo').length;
  const current = b.steps.find((s) => s.key === b.planning.current_step);
  const late = current && new Date(current.move_on_by).getTime() < now;

  return (
    <div className="grid-2">
      <Card title="Planning pace" aside={<span className="muted">{done}/{b.steps.length} steps</span>}>
        {current ? (
          <p className={`pace ${late ? 'pace-late' : ''}`}>
            {late ? 'By the schedule you should already be past ' : 'By the schedule you should be on '}
            <Link to={`blueprint/${current.key}`}><strong>{current.title}</strong></Link>
            {late ? '. Good enough beats perfect — wrap it up and move on.' : ` — move on by ${fmtDateTime(current.move_on_by)}.`}
          </p>
        ) : (
          <p className="pace">Every step is done or skipped. Nothing left to plan — start coding.</p>
        )}
        <ol className="step-list">
          {b.steps.map((s, i) => (
            <li key={s.key} className={`step-row status-${s.status} ${s.key === b.planning.current_step ? 'current' : ''}`}>
              <Link to={`blueprint/${s.key}`}>
                <span className="step-dot">{s.status === 'done' ? <Icon name="check" size={12} /> : s.status === 'skipped' ? <Icon name="skip" size={11} /> : i + 1}</span>
                <span className="step-row-title">{s.title}</span>
                {s.optional && <Badge>optional</Badge>}
                {s.essential && s.status === 'todo' && <Badge tone="accent">essential</Badge>}
                <span className="step-row-when">{s.status === 'todo' && !s.optional ? fmtDateTime(s.move_on_by) : s.status === 'todo' ? '' : s.status}</span>
              </Link>
            </li>
          ))}
        </ol>
      </Card>

      <div className="stack">
        <WhyCard />
        <Card title="How this works">
          <ul className="bullets">
            <li><strong>Make every decision now.</strong> Deciding mid-code breaks your flow; the blueprint gets the decisions out of the way.</li>
            <li><strong>Good enough, then next.</strong> Each step has a short checklist. When it is green — or its time is up — move on.</li>
            <li><strong>The deadline does not move past {p.type === 'hackathon' ? 'a quarter of the event' : '14 days'}.</strong> When it hits, the board is filled and the first task is in progress.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function WhyCard() {
  const { p } = useProject();
  const why = p.plan.why?.trim();
  const resolve = p.plan.resolve?.trim();
  if (!why && !resolve) {
    return (
      <Card title="Why this project">
        <Empty title="Not written down yet">
          <Link to="blueprint/goal">Start with the goal</Link> — it decides everything that follows.
        </Empty>
      </Card>
    );
  }
  return (
    <Card title="Why this project">
      {why && <p className="quote">{why}</p>}
      {resolve && <p className="resolve"><span>My resolve</span>{resolve}</p>}
    </Card>
  );
}

// ---------- building ----------

function BuildOverview({ now }: { now: number }) {
  const { b, p, run } = useProject();
  const actions = useTaskActions();
  const { git, commitDays } = useGit();
  const { done, total } = taskProgress(b.tasks);
  const doing = b.tasks.filter((t) => t.status === 'doing');
  const upNext = b.tasks.filter((t) => t.status === 'todo' && t.scope !== 'dlc').slice(0, 3);
  const milestone = nextMilestone(b.milestones, b.tasks);
  const openObstacles = b.obstacles.filter((o) => o.status === 'open');
  const streak = currentStreak(b, commitDays);
  const loggedToday = b.logs.some((l) => l.day === todayKey());
  const allDone = total > 0 && done === total;
  const commitsToday = git?.ok ? git.commits.filter((c) => new Date(c.at).toDateString() === new Date().toDateString()).length : 0;
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => { api.meta().then(setMeta).catch(() => undefined); }, []);
  const building = p.phase === 'build';

  return (
    <>
    {building && <CutPrompt now={now} />}
    {building && <StaleNotice now={now} />}
    {p.phase === 'shipped' && <RetroCard />}
    <div className="grid-2">
      <div className="stack">
        <Card title="Now" tone="accent" aside={doing.length > 1 ? <Badge tone="danger" title="One thing at a time keeps you in flow">{doing.length} in progress</Badge> : undefined}>
          {doing.length === 0 ? (
            upNext.length === 0 ? (
              <Empty title={allDone ? 'Everything on the board is done.' : 'Nothing queued.'}>
                {allDone ? 'Ship it, or add the next micro-challenge.' : <Link to="board">Open the board</Link>}
              </Empty>
            ) : (
              <>
                <p className="muted">Nothing in progress. Pick the next micro-challenge:</p>
                <ul className="plain-list">
                  {upNext.map((t) => (
                    <li key={t.id} className="row">
                      <span className="row-main">{t.title}</span>
                      <button className="btn btn-sm" onClick={() => actions.setStatus(t, 'doing')}><Icon name="play" size={12} /> Start</button>
                    </li>
                  ))}
                </ul>
              </>
            )
          ) : (
            doing.map((t) => {
              const cp = checklistProgress(t);
              return (
                <div key={t.id} className="focus-task">
                  <div className="focus-task-head">
                    <h4>{t.title}</h4>
                    <span className="badges">
                      {effortLabel(t) && <Badge title="Time spent / estimate">{effortLabel(t)}</Badge>}
                      {t.due_at && <DueBadge iso={t.due_at} now={now} />}
                    </span>
                  </div>
                  {t.notes && <p className="muted pre">{t.notes}</p>}
                  {t.checklist.length > 0 && (
                    <ul className="checklist">
                      {t.checklist.map((c, i) => (
                        <li key={i}>
                          <label className={c.done ? 'done' : ''}>
                            <input type="checkbox" checked={c.done} onChange={() => actions.toggleCheck(t, i)} /> <span>{c.text}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="focus-task-actions">
                    <button className="btn btn-primary" onClick={() => actions.setStatus(t, 'done')}
                      title={cp.total > cp.done ? 'Some sub-steps are still open' : undefined}>
                      <Icon name="check" /> Done
                    </button>
                    <Link className="btn" to="focus"><Icon name="play" size={13} /> Focus</Link>
                    <Link className="btn btn-ghost" to={`obstacles?task=${t.id}`}>I'm stuck</Link>
                    <button className="btn btn-ghost" onClick={() => actions.setStatus(t, 'todo')}>Put back</button>
                  </div>
                </div>
              );
            })
          )}
        </Card>

        {building && <TodayThree />}

        <Card title="Today" aside={<span className="muted">{streak > 0 ? `${streak}-day streak` : 'No streak yet'}</span>}>
          <TodayLog compact />
          {!loggedToday && streak > 0 && <p className="muted small">Log today to keep the streak going.</p>}
        </Card>

        {p.phase === 'shipped' && <ExpansionPack />}
        <PaceCard now={now} />
        <EstimatesCard overall={meta ? { multiplier: meta.multiplier, tasks: meta.multiplier_tasks } : null} />
      </div>

      <div className="stack">
        <Card title={p.phase === 'shipped' ? 'Progress' : 'MVP progress'} aside={<span className="muted">{done}/{total}</span>}>
          <Progress value={done} max={total} tone="ok" label="MVP tasks done" />
          {p.phase === 'shipped' ? null : milestone ? (
            <p className="milestone-next">
              <Icon name="flag" size={14} /> Next milestone: <strong>{milestone.title}</strong>
              {milestone.due_at && <> <DueBadge iso={milestone.due_at} now={now} /></>}
            </p>
          ) : (
            <p className="muted">No open milestones.</p>
          )}
          <div className="card-actions">
            <Link className="btn btn-sm" to="board">Open the board <Icon name="arrow" size={14} /></Link>
            {p.phase === 'build' ? (
              <button className={`btn btn-sm ${allDone ? 'btn-primary' : ''}`} onClick={() => run(() => api.ship(p.id, true))}
                title="Mark the MVP as shipped and unlock the expansion pack">
                <Icon name="rocket" size={14} /> MVP shipped
              </button>
            ) : (
              <button className="btn btn-sm btn-ghost" onClick={() => run(() => api.ship(p.id, false))}>Not shipped after all</button>
            )}
          </div>
        </Card>

        <Card title="Stuck?" aside={openObstacles.length > 0 ? <Badge tone="danger">{openObstacles.length} open</Badge> : undefined}>
          {openObstacles.length === 0 ? (
            <p className="muted">No open obstacles. When you hit one, name what kind it is before you search for an answer.</p>
          ) : (
            <ul className="plain-list">
              {openObstacles.slice(0, 4).map((o) => (
                <li key={o.id} className="row"><Link className="row-main" to="obstacles">{o.title}</Link><Badge>{o.kind === 'unsorted' ? 'not sorted' : o.kind}</Badge></li>
              ))}
            </ul>
          )}
          <div className="card-actions"><Link className="btn btn-sm" to="obstacles">I'm stuck</Link></div>
        </Card>

        {p.repo_path && (
          <Card title="Repository" aside={git?.ok && git.branch ? <Badge>{git.branch}</Badge> : undefined}>
            {!git ? <p className="muted">Reading git…</p> : !git.ok ? <p className="muted">{git.error}</p> : git.commits.length === 0 ? (
              <p className="muted">No commits yet. The first one is the hardest.</p>
            ) : (
              <>
                <p className="commit-line"><code>{git.commits[0].hash.slice(0, 7)}</code> {git.commits[0].subject}</p>
                <p className="muted small">
                  {roughly(now - new Date(git.commits[0].at).getTime())} ago · {commitsToday} commit{commitsToday === 1 ? '' : 's'} today
                  {git.dirty > 0 && ` · ${git.dirty} uncommitted file${git.dirty === 1 ? '' : 's'}`}
                </p>
              </>
            )}
          </Card>
        )}

        <ScopeCard />
        <MovesCard />
        <SnapshotCard />
        <WhyCard />
      </div>
    </div>
    </>
  );
}

export function DueBadge({ iso, now }: { iso: string; now: number }) {
  const due = dueLabel(iso, now);
  return <Badge tone={due.overdue ? 'danger' : due.soon ? 'accent' : 'neutral'} title={fmtDateTime(iso)}>{due.text}</Badge>;
}
