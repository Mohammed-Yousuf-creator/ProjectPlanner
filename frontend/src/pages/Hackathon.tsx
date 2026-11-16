import { Navigate } from 'react-router-dom';
import { HackTimeline, HeroClock, useClock } from '../components/Clock';
import { AddInput, Badge, Card, Field, Icon, Progress, SavedDate, SavedText } from '../components/ui';
import { api } from '../api';
import { useProject } from '../store';
import { PlanField } from '../steps/common';
import type { CriterionData, SubmissionData } from '../types';
import { fmtDateTime, fromLocalInput, minutesLabel, roughly, toLocalInput } from '../time';

export default function Hackathon() {
  const { b, p, run, items, addItem, updateItem, removeItem, reload } = useProject();
  const { now, state } = useClock(b, reload);
  const h = b.hackathon;
  if (!h) return <Navigate to={`/p/${p.id}`} replace />;

  const criteria = items<CriterionData>('criterion');
  const submission = items<SubmissionData>('submission');
  const submitted = submission.filter((s) => s.data.done).length;
  const start = new Date(h.start).getTime();
  const end = new Date(h.end).getTime();
  const freeze = new Date(h.freeze_at).getTime();
  const submitFrom = new Date(h.submit_from).getTime();
  const live = now >= start && now < end;
  const current = h.segments.find((s) => now >= new Date(s.start).getTime() && now < new Date(s.end).getTime());

  const setWindow = (field: 'hack_start' | 'hack_end', value: string) => {
    const iso = fromLocalInput(value);
    if (iso) void run(() => api.patchProject(p.id, { [field]: iso }));
  };

  return (
    <div className="stack hackathon">
      <Card className="hack-hero">
        <HeroClock state={state} now={now} />
        <HackTimeline b={b} now={now} />
        {live && current && (
          <p className="hack-now">
            {current.key === 'plan' && p.phase !== 'plan'
              ? <><Badge tone="ok">Ahead of the clock</Badge> You started coding before the planning slot ended. Keep that lead for polish.</>
              : <><Badge tone="accent">{current.label}</Badge> {current.hint}</>}
          </p>
        )}
        {now < start && <p className="hack-now">Use the wait: read the rules, fill in the judging criteria, set up your tools. Coding starts with the clock.</p>}
        {now >= end && <p className="hack-now">Time is up. Whatever you submitted is what you built — write down what you learned in the journal.</p>}
      </Card>

      <div className="grid-2">
        <div className="stack">
          <Card title="Schedule">
            <table className="schedule">
              <tbody>
                {h.segments.map((s) => {
                  const sStart = new Date(s.start).getTime();
                  const sEnd = new Date(s.end).getTime();
                  const on = now >= sStart && now < sEnd;
                  return (
                    <tr key={s.key} className={on ? 'on' : now >= sEnd ? 'past' : ''}>
                      <th scope="row"><span className={`seg-dot seg-${s.key}`} /> {s.label}</th>
                      <td>{fmtDateTime(s.start)}</td>
                      <td className="muted">{roughly(sEnd - sStart)}</td>
                      <td className="muted">{on ? `${roughly(sEnd - now)} left` : now < sStart ? `in ${roughly(sStart - now)}` : 'done'}</td>
                    </tr>
                  );
                })}
                <tr className={now >= end ? 'past' : ''}>
                  <th scope="row"><span className="seg-dot seg-end" /> Deadline</th>
                  <td>{fmtDateTime(h.end)}</td><td /><td className="muted">{now < end ? `in ${roughly(end - now)}` : 'passed'}</td>
                </tr>
              </tbody>
            </table>
            <ul className="rules">
              <li>
                <Icon name="clock" size={14} />
                <span>Planning gets {minutesLabel(h.planning_minutes)} — never more than {minutesLabel(h.max_planning_minutes)}, a quarter of the event. Then the board opens whether the plan is finished or not.</span>
              </li>
              <li className={now >= freeze && now < end ? 'on' : ''}>
                <Icon name="lock" size={14} />
                <span><strong>Feature freeze at {fmtDateTime(h.freeze_at)}.</strong> After that: fix, polish, rehearse. Nothing new.</span>
              </li>
              <li className={now >= submitFrom && now < end ? 'on' : ''}>
                <Icon name="flag" size={14} />
                <span><strong>Start submitting at {fmtDateTime(h.submit_from)}.</strong> Upload forms fail, videos take time to process. A working submission early beats a better one late.</span>
              </li>
            </ul>
            <details className="past-entry">
              <summary>The organisers changed the times</summary>
              <div className="row row-wrap">
                <Field label="Starts" htmlFor="hack-start">
                  <SavedDate id="hack-start" type="datetime-local" value={toLocalInput(h.start)} onSave={(v) => setWindow('hack_start', v)} />
                </Field>
                <Field label="Submission deadline" htmlFor="hack-end">
                  <SavedDate id="hack-end" type="datetime-local" value={toLocalInput(h.end)} onSave={(v) => setWindow('hack_end', v)} />
                </Field>
              </div>
            </details>
          </Card>

          <Card title="Judging criteria" aside={<span className="muted">{criteria.length || 'none yet'}</span>}>
            <p className="lead">Copy these from the rules. Every feature you build should move one of them — if it moves none, it does not belong in the MVP.</p>
            <ul className="plain-list">
              {criteria.map((c) => (
                <li key={c.id} className="row">
                  <SavedText className="row-main" value={c.data.text} ariaLabel="Criterion"
                    onSave={(v) => updateItem(c, { text: v })} onClear={() => removeItem(c.id)} />
                  <SavedText className="input-weight" value={c.data.weight} placeholder="weight" ariaLabel="Weight" onSave={(v) => updateItem(c, { weight: v })} />
                  <button className="icon-btn" aria-label="Remove criterion" onClick={() => removeItem(c.id)}><Icon name="x" size={14} /></button>
                </li>
              ))}
            </ul>
            <AddInput placeholder="e.g. Technical difficulty, Originality, Usefulness" onAdd={(text) => addItem('criterion', { text, weight: '' })} />
            <PlanField k="judging_angle" label="How this project scores on them" minRows={2}
              placeholder="One line per criterion: what the judges will see that earns the points." />
          </Card>
        </div>

        <div className="stack">
          <Card title="Submission checklist" aside={<span className="muted">{submitted}/{submission.length}</span>}>
            <Progress value={submitted} max={submission.length} tone="ok" />
            <ul className="checklist checklist-edit">
              {submission.map((s) => (
                <li key={s.id}>
                  <input type="checkbox" checked={!!s.data.done} aria-label={`Done: ${s.data.text}`} onChange={() => updateItem(s, { done: !s.data.done })} />
                  <SavedText multiline minRows={1} className={s.data.done ? 'struck' : ''} value={s.data.text} ariaLabel="Checklist item"
                    onSave={(v) => updateItem(s, { text: v })} onClear={() => removeItem(s.id)} />
                  <button className="icon-btn" aria-label="Remove item" onClick={() => removeItem(s.id)}><Icon name="x" size={14} /></button>
                </li>
              ))}
            </ul>
            <AddInput placeholder="Something this hackathon requires" onAdd={(text) => addItem('submission', { text, done: false })} />
            <PlanField k="submission_url" label="Where to submit" multiline={false} placeholder="https://…" />
            <PlanField k="rules_url" label="Rules page" multiline={false} placeholder="https://…" />
          </Card>

          <Card title="Demo">
            <p className="lead">Judges score what they see in a few minutes, not what is in the repository. Script the demo before the freeze and build towards it.</p>
            <PlanField k="pitch" label="One-sentence pitch" minRows={1} placeholder="For <who>, this <does what>, so that <why it matters>." />
            <PlanField k="demo_script" label="Demo script" minRows={4}
              placeholder={'1. The problem, in one sentence\n2. Show the core feature working — the happy path only\n3. The one clever thing\n4. What comes next'} />
            <PlanField k="cut_order" label="If time runs short, cut in this order" minRows={2}
              hint="Decide now, while you are calm. At hour 20 you will not want to choose."
              placeholder={'1. …\n2. …'} />
          </Card>
        </div>
      </div>
    </div>
  );
}
