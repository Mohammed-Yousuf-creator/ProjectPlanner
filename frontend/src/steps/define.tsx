// Steps 1–4: what am I building, and what is the smallest version of it?

import { api } from '../api';
import { useShipDateMove } from '../components/Honesty';
import { AddInput, Badge, Empty, Field, Icon, SavedDate, SavedText, Segmented } from '../components/ui';
import { cutOrder } from '../lib';
import { useProject } from '../store';
import type { CriterionData, NotDoingData, QuestionData, ResourceData, Story, Tier } from '../types';
import { fmtDate, fmtDateTime, roughly, useNow } from '../time';
import { ItemCard, PlanField } from './common';

// ---------- 1. goal ----------

export function GoalStep() {
  const { p, items, addItem, updateItem, removeItem } = useProject();
  const hack = p.type === 'hackathon';
  const criteria = items<CriterionData>('criterion');
  const ship = useShipDateMove();
  return (
    <>
      {ship.modal}
      <PlanField k="why" label="Why am I building this?"
        hint={hack ? 'What are you making, and why would it win or be worth the weekend?' : 'A hobby project, a portfolio piece, a startup idea, a client job, a way to learn something? Be exact — the same developer builds very differently for each.'}
        placeholder="I am building this because…" />
      <PlanField k="who" label="Who is it for?" placeholder={hack ? 'The judges, and the person in the demo story' : 'Me / a friend / other developers / paying customers…'} minRows={1} />
      <PlanField k="value" label="What makes it valuable?" placeholder="The one thing it does that makes someone care" minRows={1} />

      {hack && (
        <>
          <PlanField k="theme" label="Theme / prompt / track" placeholder="What the hackathon asks for" minRows={1} />
          <Field label="Judging criteria" hint="Write them down word for word. Every scope decision gets checked against these.">
            <ul className="plain-list">
              {criteria.map((c) => (
                <li key={c.id} className="row">
                  <SavedText className="row-main" value={c.data.text ?? ''} onSave={(v) => updateItem(c, { text: v })} ariaLabel="Criterion" />
                  <SavedText className="input-narrow" value={c.data.weight ?? ''} onSave={(v) => updateItem(c, { weight: v })} placeholder="weight" ariaLabel="Weight" />
                  <button className="icon-btn" aria-label="Remove criterion" onClick={() => removeItem(c.id)}><Icon name="trash" size={15} /></button>
                </li>
              ))}
            </ul>
            <AddInput placeholder="e.g. Technical difficulty" onAdd={(text) => addItem('criterion', { text, weight: '' })} />
          </Field>
        </>
      )}

      <div className="form-row">
        <PlanField k="outcome_goals" label="Outcome goals" hint="What you want at the end."
          placeholder={'The line this adds to my résumé\n10 people use it\nImpress a friend'} minRows={3} />
        <PlanField k="journey_goals" label="Journey goals" hint="What you want to get better at along the way."
          placeholder={'Commit every day for 14 days\nLearn one new tool properly\nStay off my phone while coding'} minRows={3} />
      </div>

      {!hack && (
        <div className="form-row">
          <PlanField k="time_budget" label="Time and effort I can realistically put in"
            placeholder="e.g. 8 hours a week, evenings and Sunday" minRows={1} />
          <Field label="Target date for the MVP" htmlFor="target-date"
            hint={p.phase === 'plan' ? 'Optional. Generated milestones are spread up to this date.'
              : p.original_target_date && p.original_target_date !== p.target_date ? `First planned for ${fmtDate(p.original_target_date + 'T12:00')}. Moving it again needs a reason.`
                : 'Coding has started: moving this date needs a reason, and every move is counted.'}>
            <SavedDate key={`${p.target_date}-${ship.pending === null}`} id="target-date" value={p.target_date ?? ''} onSave={ship.change} />
          </Field>
        </div>
      )}

      <PlanField k="resolve" label="My resolve"
        hint="One sentence you will read when motivation drops. A weak resolve gets distracted; a “no matter what” resolve does not."
        placeholder="No matter what happens, I will…" minRows={1} />
    </>
  );
}

// ---------- 2. feasibility & unknowns ----------

export function ResearchStep() {
  const { items, addItem, updateItem, removeItem } = useProject();
  const questions = items<QuestionData>('question');
  const resources = items<ResourceData>('resource');
  const open = questions.filter((q) => (q.data.status ?? 'open') === 'open').length;
  const learn = questions.filter((q) => q.data.status === 'learn').length;
  const now = useNow(30_000);
  return (
    <>
      <PlanField k="feasibility_notes" label="Is this even doable?"
        hint="Before investing more: how does the hard part actually work? Look at how similar things do it. Write down what you found."
        placeholder="The part I have no idea how to build is… It turns out it works like…" minRows={3} />

      <Field label="Unknowns and decisions"
        hint="Every question you can answer now is one you will not have to stop and answer mid-code. Come up with a few approaches yourself, then pick one.">
        {questions.length === 0 && <Empty title="No unknowns logged">What do you not know how to do yet? What is still undecided?</Empty>}
        {questions.map((q) => (
          <ItemCard key={q.id} onRemove={() => removeItem(q.id)}
            title={<SavedText value={q.data.text ?? ''} onSave={(v) => updateItem(q, { text: v })} ariaLabel="Question" />}>
            <SavedText multiline minRows={1} value={q.data.answer ?? ''} onSave={(v) => updateItem(q, { answer: v })}
              placeholder="Approaches I considered, and the one I picked…" ariaLabel="Answer" />
            <div className="item-card-foot">
              <Segmented size="sm" ariaLabel="Status" value={q.data.status ?? 'open'} onChange={(v) => updateItem(q, { status: v })}
                options={[
                  { value: 'open', label: 'Open' },
                  { value: 'answered', label: 'Decided' },
                  { value: 'learn', label: 'Learn while building', title: 'Stop researching: it becomes a task on the board' },
                ]} />
              <QuestionBox status={q.data.status ?? 'open'} until={q.data.box_until} now={now} />
            </div>
          </ItemCard>
        ))}
        <AddInput placeholder="e.g. How do I store uploaded files?" onAdd={(text) => addItem('question', { text, status: 'open', answer: '' })} />
        {questions.length > 0 && (
          <p className="muted small">
            {open === 0 ? 'Nothing left open.' : `${open} still open.`}
            {learn > 0 && ` ${learn} to learn while building — each becomes a task on the board when coding starts.`}
          </p>
        )}
      </Field>

      <Field label="Where I go when I'm stuck" hint="Docs, a book, a forum, a friend, your own notes. Decide now so you do not wander later.">
        <ul className="plain-list">
          {resources.map((r) => (
            <li key={r.id} className="row row-wrap">
              <SavedText className="row-main" value={r.data.title ?? ''} onSave={(v) => updateItem(r, { title: v })} ariaLabel="Resource" />
              <SavedText className="row-main" value={r.data.url ?? ''} onSave={(v) => updateItem(r, { url: v })} placeholder="link (optional)" ariaLabel="Link" />
              {/^https?:\/\//.test(r.data.url ?? '') && (
                <a className="icon-btn" href={r.data.url} target="_blank" rel="noreferrer noopener" aria-label="Open link"><Icon name="external" size={15} /></a>
              )}
              <button className="icon-btn" aria-label="Remove resource" onClick={() => removeItem(r.id)}><Icon name="trash" size={15} /></button>
            </li>
          ))}
        </ul>
        <AddInput placeholder="e.g. Official Go documentation" onAdd={(title) => addItem('resource', { title, url: '', note: '' })} />
      </Field>
    </>
  );
}

/** The time-box of an open question: research has an end, like everything else here. */
function QuestionBox({ status, until, now }: { status: string; until?: string; now: number }) {
  if (status !== 'open' || !until) return null;
  const left = new Date(until).getTime() - now;
  if (left > 0) return <span className="box-note" title={fmtDateTime(until)}><Icon name="clock" size={12} /> decide within {roughly(left)}</span>;
  return <span className="box-note over"><Icon name="alert" size={12} /> time-box over {roughly(-left)} ago — decide, or learn it while building</span>;
}

// ---------- 3. user stories ----------

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function StoriesStep() {
  const { b, p, run } = useProject();
  const hack = p.type === 'hackathon';
  const n = b.stories.length;
  return (
    <>
      <Field label="The user should be able to…"
        hint="Finish the sentence, once per thing a user does with your app. Stay out of the technical: “upload a file”, not “POST a multipart form to the REST endpoint”.">
        <AddInput prefix="The user should be able to" placeholder="upload a file" autoFocus
          onAdd={(text) => run(() => api.create(p.id, 'stories', { text: capitalize(text.replace(/[.\s]+$/, '')) }))} />
      </Field>
      <p className="muted">
        {n} {n === 1 ? 'story' : 'stories'}. {hack ? 'Three to six is plenty for a hackathon.' : 'Ten to twenty is typical. Get everything out of your head — you will cut half of it in the next step.'}
      </p>
      {n === 0 ? (
        <Empty title="No stories yet">Start with the obvious ones: create an account, see a dashboard, add a thing, delete a thing.</Empty>
      ) : (
        <ol className="story-list">
          {b.stories.map((s) => <StoryRow key={s.id} s={s} />)}
        </ol>
      )}
    </>
  );
}

function StoryRow({ s }: { s: Story }) {
  const { run } = useProject();
  return (
    <li className="row">
      <SavedText className="row-main" value={s.text} ariaLabel="User story"
        onSave={(v) => { void run(() => api.patch('stories', s.id, { text: v })); }} onClear={() => { void run(() => api.remove('stories', s.id)); }} />
      {s.tier !== 'unsorted' && <Badge tone={s.tier === 'mvp' ? 'accent' : 'neutral'}>{s.tier === 'mvp' ? 'MVP' : s.tier}</Badge>}
      <button className="icon-btn" aria-label="Delete story" onClick={() => run(() => api.remove('stories', s.id))}><Icon name="trash" size={15} /></button>
    </li>
  );
}

// ---------- 4. MVP cut ----------

const TIERS: { key: Tier; title: string; blurb: string }[] = [
  { key: 'mvp', title: 'MVP', blurb: 'The app does not function without it.' },
  { key: 'later', title: 'Later', blurb: 'Good idea. Expansion pack, after the MVP ships.' },
  { key: 'cut', title: 'Cut', blurb: 'Not building this.' },
];

export function MvpStep() {
  const { b, p, run, items, addItem, updateItem, removeItem } = useProject();
  const by = (tier: Tier) => b.stories.filter((s) => s.tier === tier);
  const unsorted = by('unsorted');
  const total = b.stories.length;
  const mvp = by('mvp').length;
  const share = total ? Math.round((mvp / total) * 100) : 0;
  const budget = b.limits.scope_budget;
  const full = mvp >= budget;
  const tooBig = total > 0 && (mvp > budget || mvp * 2 > total);
  const move = (s: Story, tier: Tier) => run(() => api.patch('stories', s.id, { tier }));
  const notDoing = items<NotDoingData>('notdoing');

  if (total === 0) {
    return <Empty title="Nothing to cut yet">Write your user stories first (previous step), then come back and be ruthless.</Empty>;
  }

  return (
    <>
      <div className={`cut-meter ${tooBig ? 'too-big' : ''}`}>
        <div className="cut-meter-head">
          <strong>{mvp} of {total} stories in the MVP ({share}%)</strong>
          <span>{mvp > budget ? `Over the budget of ${budget}. Move ${mvp - budget} out.` : tooBig ? 'Still too big — aim to cut about half.' : mvp === 0 ? 'Pick what the app cannot function without.' : 'Small enough to finish.'}</span>
        </div>
        <div className="budget" role="img" aria-label={`${mvp} of ${budget} MVP slots used`}>
          {Array.from({ length: Math.max(budget, mvp) }, (_, i) => <i key={i} className={i < mvp ? (i < budget ? 'used' : 'over') : ''} />)}
          <span>Scope budget: <strong>{budget}</strong> MVP {budget === 1 ? 'story' : 'stories'} for a {p.type === 'hackathon' ? 'hackathon' : `${p.complexity} project`}.
            {full ? ' Full — to add one, move one out.' : ` ${budget - mvp} left.`}</span>
        </div>
        <div className="cut-meter-bar" aria-hidden="true">
          <div style={{ width: `${share}%` }} />
          <i />
        </div>
      </div>

      {unsorted.length > 0 && (
        <section className="sort-queue">
          <h4>To sort ({unsorted.length}) — do I absolutely need this for the app to function?</h4>
          <ul className="plain-list">
            {unsorted.map((s) => (
              <li key={s.id} className="row">
                <span className="row-main">{s.text}</span>
                <div className="tier-buttons">
                  <button className="btn btn-sm btn-primary" disabled={full} title={full ? `The MVP is full (${budget}). Move a story out first.` : undefined} onClick={() => move(s, 'mvp')}>Yes — MVP</button>
                  <button className="btn btn-sm" onClick={() => move(s, 'later')}>Later</button>
                  <button className="btn btn-sm" onClick={() => move(s, 'cut')}>Cut</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="tier-columns">
        {TIERS.map((t) => (
          <section key={t.key} className={`tier-col tier-${t.key}`}>
            <header>
              <h4>{t.title} <span className="count">{by(t.key).length}</span></h4>
              <p>{t.blurb}</p>
            </header>
            <ul className="plain-list">
              {by(t.key).map((s) => (
                <li key={s.id} className="tier-card">
                  <span>{s.text}</span>
                  <div className="tier-moves">
                    {TIERS.filter((x) => x.key !== t.key).map((x) => (
                      <button key={x.key} className="link-btn" disabled={x.key === 'mvp' && full}
                        title={x.key === 'mvp' && full ? `The MVP is full (${budget}). Move a story out first.` : undefined} onClick={() => move(s, x.key)}>→ {x.title}</button>
                    ))}
                  </div>
                </li>
              ))}
              {by(t.key).length === 0 && <li className="muted small">Empty</li>}
            </ul>
          </section>
        ))}
      </div>

      <CutOrder />

      <Field label="Not doing"
        hint="Things this project deliberately leaves out, and why. Written down now, they stop coming back as “quick additions” in week three.">
        <ul className="plain-list">
          {notDoing.map((n) => (
            <li key={n.id} className="row row-wrap">
              <SavedText className="row-main" value={n.data.text ?? ''} onSave={(v) => updateItem(n, { text: v })} ariaLabel="Not doing" />
              <SavedText className="row-main" value={n.data.why ?? ''} onSave={(v) => updateItem(n, { why: v })} placeholder="because…" ariaLabel="Why not" />
              <button className="icon-btn" aria-label="Remove" onClick={() => removeItem(n.id)}><Icon name="trash" size={15} /></button>
            </li>
          ))}
        </ul>
        <AddInput placeholder="e.g. User accounts — one local user is enough" onAdd={(text) => addItem('notdoing', { text, why: '' })} />
      </Field>

      <PlanField k="mvp_statement" label="The MVP in one sentence"
        hint="The absolute minimum that still gives someone value. If it needs an “and also”, it is not minimal yet."
        placeholder="A user can … and that is it." minRows={1} />
    </>
  );
}

/**
 * The order in which MVP stories get cut when a milestone slips. Decided now, with a clear head,
 * so that the decision under deadline pressure is already made.
 */
function CutOrder() {
  const { b, p, run } = useProject();
  const order = cutOrder(b.stories);
  if (order.length < 2) return null;
  const ranked = order.some((s) => s.cut_rank !== null);
  const save = (list: Story[]) => run(() => api.setCutOrder(p.id, list.map((s) => s.id)));
  const swap = (i: number, j: number) => {
    const next = order.slice();
    [next[i], next[j]] = [next[j], next[i]];
    void save(next);
  };
  return (
    <Field label="If time runs short, cut in this order"
      hint="The first one goes first. When a milestone slips, the planner offers exactly this cut — one click, no debate.">
      <ol className="cut-order">
        {order.map((s, i) => (
          <li key={s.id}>
            <span className="cut-rank">{i + 1}</span>
            <span className="row-main">{s.text}</span>
            {i === 0 && <Badge tone="danger">first to go</Badge>}
            {i === order.length - 1 && <Badge tone="ok">last to go</Badge>}
            <button className="icon-btn" aria-label="Cut earlier" title="Cut earlier" disabled={i === 0} onClick={() => swap(i, i - 1)}><Icon name="up" size={14} /></button>
            <button className="icon-btn" aria-label="Cut later" title="Cut later" disabled={i === order.length - 1} onClick={() => swap(i, i + 1)}><Icon name="down" size={14} /></button>
          </li>
        ))}
      </ol>
      {!ranked && <p className="muted small">Not ranked yet: this is the default (last story first). <button className="link-btn" onClick={() => save(order)}>Keep this order</button></p>}
    </Field>
  );
}
