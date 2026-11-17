import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useGit } from '../components/hooks';
import { TodayLog } from '../components/TodayLog';
import { PickOutcomes } from '../components/TodayThree';
import { Badge, Card, ConfirmButton, Empty, Icon, SavedText } from '../components/ui';
import { activeDays, picksFor, todayKey } from '../lib';
import { useProject } from '../store';
import { addDays, dayKey, fmtDateTime, fmtLongDate, fromDayKey, streak } from '../time';

const WEEKS = 14;

export default function Journal() {
  const { b, p, run } = useProject();
  const { git, commitDays } = useGit();
  const days = activeDays(b, commitDays);
  const current = streak(days);
  const totalHours = b.logs.reduce((sum, l) => sum + (l.hours ?? 0), 0);
  const [pastDay, setPastDay] = useState('');
  const [pastText, setPastText] = useState('');
  const logged = new Set(b.logs.map((l) => l.day));
  const unloggedPickDays = [...new Set(b.picks.map((k) => k.day))].filter((d) => !logged.has(d) && d !== todayKey() && picksFor(b, d).length > 0).sort().reverse().slice(0, 7);

  const addPast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pastDay || !pastText.trim()) return;
    await run(() => api.saveLog(p.id, pastDay, { summary: pastText, hours: null }));
    setPastText('');
    setPastDay('');
  };

  return (
    <div className="grid-2">
      <div className="stack">
        <Card title="Today">
          <p className="lead">
            End the day by writing down what you did — like a commit message for the day. It is how the progress registers; you do not
            notice how far you have come until you recall it.
          </p>
          <TodayLog />
        </Card>

        <Card title="Entries" aside={<span className="muted">{b.logs.length} day{b.logs.length === 1 ? '' : 's'}</span>}>
          {b.logs.length === 0 ? (
            <Empty title="Nothing logged yet">Your first entry can be “Planned the project.” That counts.</Empty>
          ) : (
            <ul className="log-list">
              {b.logs.map((l) => (
                <li key={l.day}>
                  <div className="log-day">
                    <strong>{fmtLongDate(fromDayKey(l.day))}</strong>
                    {l.hours != null && <Badge>{l.hours} h</Badge>}
                    <ConfirmButton className="icon-btn" confirmLabel="Sure?" title="Delete entry" onConfirm={() => run(() => api.deleteLog(p.id, l.day))}>
                      <Icon name="trash" size={14} />
                    </ConfirmButton>
                  </div>
                  <SavedText multiline minRows={1} value={l.summary} ariaLabel={`Entry for ${l.day}`}
                    required onSave={(v) => { void run(() => api.saveLog(p.id, l.day, { summary: v, hours: l.hours })); }} />
                  <PickOutcomes day={l.day} />
                </li>
              ))}
            </ul>
          )}
          {unloggedPickDays.length > 0 && (
            <div className="unlogged-picks">
              <h4>Days with picks but no entry</h4>
              <ul className="log-list">
                {unloggedPickDays.map((day) => (
                  <li key={day}>
                    <div className="log-day"><strong>{fmtLongDate(fromDayKey(day))}</strong></div>
                    <PickOutcomes day={day} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          <details className="past-entry">
            <summary>Add an entry for another day</summary>
            <form className="row row-wrap" onSubmit={addPast}>
              <input type="date" className="input input-date" value={pastDay} max={todayKey()} onChange={(e) => setPastDay(e.target.value)} aria-label="Day" required />
              <input className="input row-main" value={pastText} onChange={(e) => setPastText(e.target.value)} placeholder="What you got done that day" aria-label="Entry" />
              <button className="btn" type="submit" disabled={!pastDay || !pastText.trim()}>Add</button>
            </form>
          </details>
        </Card>
      </div>

      <div className="stack">
        <Card title="Streak">
          <div className="stats">
            <div><strong>{current}</strong><span>day streak</span></div>
            <div><strong>{days.size}</strong><span>active days</span></div>
            <div><strong>{Math.round(totalHours * 10) / 10}</strong><span>hours logged</span></div>
          </div>
          <Heatmap logDays={new Set(b.logs.map((l) => l.day))} commitDays={new Set(commitDays)} />
          <p className="muted small">A day counts when you log it{p.repo_path ? ' or commit to the linked repository' : ''}.</p>
        </Card>

        <Card title="Repository" aside={git?.ok && git.branch ? <Badge>{git.branch}</Badge> : undefined}>
          {!p.repo_path ? (
            <p className="muted">Link the project's local git folder in <Link to="../settings" relative="path">Settings</Link> to see commits here and count them towards your streak.</p>
          ) : !git ? (
            <p className="muted">Reading git…</p>
          ) : !git.ok ? (
            <p className="muted">{git.error} <Link to="../settings" relative="path">Change the path</Link></p>
          ) : git.commits.length === 0 ? (
            <p className="muted">No commits yet in <code>{git.path}</code>.</p>
          ) : (
            <>
              {git.dirty > 0 && <p className="muted small">{git.dirty} file{git.dirty === 1 ? '' : 's'} with uncommitted changes — commit before you stop for the day.</p>}
              <ul className="commit-list">
                {git.commits.slice(0, 15).map((c) => (
                  <li key={c.hash}>
                    <code>{c.hash.slice(0, 7)}</code>
                    <span className="commit-subject">{c.subject}</span>
                    {c.closes?.map((id) => <Link key={`c${id}`} className="commit-ref closes" to={`../board?task=${id}`} relative="path" title="This commit closed the task">✓ #{id}</Link>)}
                    {c.refs?.filter((id) => !c.closes?.includes(id)).map((id) => <Link key={`r${id}`} className="commit-ref" to={`../board?task=${id}`} relative="path">#{id}</Link>)}
                    <time dateTime={c.at}>{fmtDateTime(c.at)}</time>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function Heatmap({ logDays, commitDays }: { logDays: Set<string>; commitDays: Set<string> }) {
  const today = new Date();
  // Start on the Monday WEEKS-1 weeks before this week.
  const mondayOffset = (today.getDay() + 6) % 7;
  const start = addDays(today, -mondayOffset - (WEEKS - 1) * 7);
  const todayK = dayKey(today);
  const weeks = Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  return (
    <div className="heatmap" role="img" aria-label={`Activity over the last ${WEEKS} weeks`}>
      {weeks.map((week, w) => (
        <div key={w} className="heatmap-week">
          {week.map((d) => {
            const k = dayKey(d);
            const future = k > todayK;
            const level = logDays.has(k) ? 2 : commitDays.has(k) ? 1 : 0;
            const what = level === 2 ? 'logged' : level === 1 ? 'commits' : 'nothing';
            return <span key={k} className={`heatmap-day level-${level} ${future ? 'future' : ''} ${k === todayK ? 'today' : ''}`} title={`${fmtLongDate(d)}: ${future ? '—' : what}`} />;
          })}
        </div>
      ))}
    </div>
  );
}
