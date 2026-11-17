import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useGit } from '../components/hooks';
import { ReasonModal, useShipDateMove } from '../components/Honesty';
import { Badge, Card, ConfirmButton, Field, Icon, SavedDate, SavedText, Segmented } from '../components/ui';
import { useProject, useToast } from '../store';
import type { Complexity, Meta, VendorMode } from '../types';
import { DAY, fmtDate, fmtDateTime, minutesLabel, useNow } from '../time';

const SIZE_LABEL: Record<Complexity, string> = { tiny: 'Tiny', small: 'Small', medium: 'Medium', hard: 'Hard' };

export default function Settings() {
  const { b, p, run } = useProject();
  const toast = useToast();
  const navigate = useNavigate();
  const now = useNow(30_000);
  const { git } = useGit();
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => { api.meta().then(setMeta).catch(() => {}); }, []);

  const patch = (body: Record<string, unknown>) => run(() => api.patchProject(p.id, body));
  const ship = useShipDateMove();
  const [archiving, setArchiving] = useState(false);
  const sync = b.plan_sync;
  const planning = p.phase === 'plan';
  const maxDays = meta?.max_planning_days ?? 14;
  const decided = new Date(p.decided_at).getTime();
  const currentDays = Math.round((new Date(p.planning_deadline).getTime() - decided) / DAY);
  // A deadline can only be moved to a moment that has not passed yet.
  const earliestDay = Math.max(1, Math.floor((now - decided) / DAY) + 1);

  const remove = async () => {
    try {
      await api.deleteProject(p.id);
      toast.ok(`Deleted “${p.name}”.`);
      navigate('/');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the project.');
    }
  };

  return (
    <div className="stack settings">
      {ship.modal}
      {archiving && (
        <ReasonModal title={`Archive “${p.name}” unfinished?`} confirmLabel="Archive it" placeholder="e.g. Lost interest once the hard part was solved"
          onClose={() => setArchiving(false)}
          onConfirm={async (reason) => {
            const ok = await patch({ archived: true, archive_reason: reason });
            setArchiving(false);
            if (ok !== undefined) navigate('/');
          }}>
          <p className="muted">Dropping a project is allowed. Dropping it without knowing why is how the next one gets dropped too. Your reason shows up when you start a new project.</p>
        </ReasonModal>
      )}
      <Card title="Project">
        <Field label="Name"><SavedText value={p.name} ariaLabel="Name" required onSave={(v) => { void patch({ name: v }); }} /></Field>
        <Field label="One-line summary"><SavedText value={p.summary} ariaLabel="Summary" placeholder="What it is, in a sentence" onSave={(v) => { void patch({ summary: v }); }} /></Field>
        <Field label="Approach" hint={p.vendor_mode === 'fasttrack'
          ? 'Fast-track: reach for existing services (auth, database, storage, UI kits) wherever they save time.'
          : 'Build it yourself: you write the parts you want to learn from. You can still buy individual pieces in the Stack step.'}>
          <Segmented<VendorMode> ariaLabel="Approach" value={p.vendor_mode} onChange={(v) => patch({ vendor_mode: v })}
            options={[{ value: 'diy', label: 'Build it myself' }, { value: 'fasttrack', label: 'Fast-track with services' }]} />
        </Field>
      </Card>

      <Card title="Planning deadline" aside={<Badge tone={planning ? 'accent' : 'neutral'}>{planning ? 'counting down' : 'over'}</Badge>}>
        {p.type === 'standard' ? (
          <>
            <p className="lead">
              You decided to build this on <strong>{fmtDateTime(p.decided_at)}</strong>. Coding starts by <strong>{fmtDateTime(p.planning_deadline)}</strong>
              {planning ? '' : ` — it started ${p.build_started_at ? fmtDateTime(p.build_started_at) : ''}`}.
              The limit is {maxDays} days after deciding, for every project, however hard. It cannot be raised or reset.
            </p>
            {planning ? (
              <>
                <Field label="Days of planning, counted from the day you decided">
                  <div className="day-picker" role="radiogroup" aria-label="Planning days">
                    {Array.from({ length: maxDays }, (_, i) => i + 1).map((d) => (
                      <button key={d} type="button" role="radio" aria-checked={d === currentDays} disabled={d < earliestDay}
                        className={`day ${d === currentDays ? 'on' : ''}`} title={d < earliestDay ? 'Already passed' : `${d} day${d === 1 ? '' : 's'}`}
                        onClick={() => patch({ planning_days: d })}>{d}</button>
                    ))}
                    <span className="day-cap" title={`The hard limit is ${maxDays} days`}><Icon name="lock" size={13} /> {maxDays} max</span>
                  </div>
                </Field>
                <Field label="Size" hint={meta ? `Suggested planning time: ${(Object.keys(SIZE_LABEL) as Complexity[]).map((c) => `${SIZE_LABEL[c].toLowerCase()} ${meta.planning_days[c]}d`).join(' · ')}. Changing the size does not move the deadline — pick the days above.` : undefined}>
                  <Segmented<Complexity> size="sm" ariaLabel="Size" value={p.complexity} onChange={(v) => patch({ complexity: v })}
                    options={(Object.keys(SIZE_LABEL) as Complexity[]).map((c) => ({ value: c, label: SIZE_LABEL[c] }))} />
                </Field>
              </>
            ) : (
              <p className="muted">
                {p.forced_start ? 'The clock ran out and the project moved to building on its own.' : 'You started coding before the clock ran out.'} Planning cannot be reopened.
              </p>
            )}
          </>
        ) : b.hackathon ? (
          <>
            <p className="lead">
              In a hackathon, planning is measured in minutes: by default a tenth of the event, never more than a quarter
              ({minutesLabel(b.hackathon.max_planning_minutes)} here). Coding starts by <strong>{fmtDateTime(p.planning_deadline)}</strong>.
            </p>
            {planning ? (
              <Field label="Planning time" hint="Event times are changed on the Hackathon tab.">
                <div className="day-picker">
                  {budgetChoices(b.hackathon.max_planning_minutes).map((m) => (
                    <button key={m} type="button" className={`day day-wide ${m === b.hackathon!.planning_minutes ? 'on' : ''}`}
                      onClick={() => patch({ planning_minutes: m })}>{minutesLabel(m)}</button>
                  ))}
                </div>
              </Field>
            ) : <p className="muted">Planning is over. <Link to="../hackathon" relative="path">Open the hackathon schedule</Link></p>}
          </>
        ) : null}
      </Card>

      {p.type === 'standard' && (
        <Card title="Ship date" aside={p.original_target_date && p.target_date && p.original_target_date !== p.target_date ? <Badge tone="danger">moved</Badge> : undefined}>
          <p className="lead">
            The day the MVP is out. {planning ? 'Generated milestones are spread up to it.' : 'Coding has started, so moving it needs a one-line reason — and every move is counted on the overview.'}
          </p>
          <Field label="Target date for the MVP" htmlFor="set-target"
            hint={p.original_target_date && p.original_target_date !== p.target_date ? `First planned for ${fmtDate(p.original_target_date + 'T12:00')}.` : undefined}>
            <SavedDate key={`${p.target_date}-${ship.pending === null}`} id="set-target" value={p.target_date ?? ''} onSave={ship.change} />
          </Field>
        </Card>
      )}

      <Card title="Work in progress">
        <Field label="Flag a task that has been in progress for longer than" htmlFor="set-stale"
          hint="A task that sits in “Doing” past this gets a “split it or cut it” flag. A task with an estimate gets twice its estimate if that is longer.">
          <select id="set-stale" className="input select-task" value={p.stale_hours} onChange={(e) => patch({ stale_hours: Number(e.target.value) })}>
            {[2, 4, 8, 24, 48, 72, 120, 168].map((h) => <option key={h} value={h}>{h < 24 ? `${h} hours` : `${h / 24} day${h === 24 ? '' : 's'}`}</option>)}
            {![2, 4, 8, 24, 48, 72, 120, 168].includes(p.stale_hours) && <option value={p.stale_hours}>{p.stale_hours} hours</option>}
          </select>
        </Field>
      </Card>

      <Card title="Code repository" aside={git?.configured ? <Badge tone={git.ok ? 'ok' : 'danger'}>{git.ok ? 'linked' : 'not found'}</Badge> : undefined}>
        <p className="lead">Optional. Point to the project's folder on this computer and the journal shows your commits and counts them towards your streak. The planner only reads from it.</p>
        <Field label="Local folder" hint={git?.configured && !git.ok ? git.error : 'An absolute path, for example /home/you/code/my-project'}>
          <SavedText mono value={p.repo_path} placeholder="/home/you/code/my-project" ariaLabel="Repository path" onSave={(v) => { void patch({ repo_path: v }); }} />
        </Field>
        <div className={`repo-options ${p.repo_path ? '' : 'disabled'}`}>
          <label className="option">
            <input type="checkbox" checked={p.plan_sync} disabled={!p.repo_path} onChange={(e) => patch({ plan_sync: e.target.checked })} />
            <span>
              <strong>Keep <code>PLAN.md</code> in the repository up to date</strong>
              <span className="muted small">The planner writes the blueprint to <code>PLAN.md</code> in that folder whenever the plan changes. It writes that one file and nothing else, and never commits.</span>
            </span>
          </label>
          {p.plan_sync && sync && (
            <p className={`small ${sync.error ? 'overdue' : 'muted'}`}>
              {sync.error ? `Could not write ${sync.path}: ${sync.error}` : sync.written_at ? `Last written ${fmtDateTime(sync.written_at)} to ${sync.path}` : `Will be written to ${sync.path} within a minute.`}
            </p>
          )}
          <label className="option">
            <input type="checkbox" checked={p.commit_close} disabled={!p.repo_path} onChange={(e) => patch({ commit_close: e.target.checked })} />
            <span>
              <strong>Commits close tasks</strong>
              <span className="muted small">A commit message with <code>closes #12</code> (or <code>fixes</code>, <code>done</code>) marks task 12 done. <code>#12</code> alone just links the commit to the task.</span>
            </span>
          </label>
          {git?.ok && git.closed > 0 && <p className="muted small">{git.closed} task{git.closed === 1 ? '' : 's'} closed by commits so far.</p>}
        </div>
      </Card>

      <Card title="Export">
        <p className="lead">Download the whole blueprint as one Markdown file — drop it into the repository as <code>PLAN.md</code> so the decisions live next to the code.</p>
        <div className="card-actions">
          <a className="btn" href={api.exportUrl(p.id)} download><Icon name="download" /> PLAN.md</a>
          <a className="btn" href={api.archiveUrl(p.id)} download title="Everything in one file: plan, board, journal, uploads. Import it on another machine from App settings.">
            <Icon name="download" /> Whole project (.planner.zip)
          </a>
          <a className="btn" href={api.calendarUrl(p.id)} title="Milestones and deadlines as calendar events">
            <Icon name="calendar" /> Calendar (.ics)
          </a>
        </div>
        <p className="muted small">
          The calendar file can also be subscribed to: add <code>{window.location.origin}{api.calendarUrl(p.id)}</code> as a calendar by URL in a
          calendar app on this computer and it follows the deadlines as they move.
        </p>
      </Card>

      <Card title="Archive or delete" tone="danger">
        <div className="danger-row">
          <div>
            <strong>{p.archived ? 'Archived' : 'Archive this project'}</strong>
            <p className="muted">
              {p.archived ? 'Hidden from the dashboard. Nothing is lost.'
                : p.phase === 'shipped' ? 'Hides it from the dashboard. Everything is kept and you can bring it back.'
                  : 'Hides it from the dashboard. It is not finished, so you will be asked why you are stopping.'}
            </p>
            {p.archived && p.archive_reason && <p className="quote">{p.archive_reason}</p>}
          </div>
          <button className="btn" onClick={() => (p.archived ? patch({ archived: false }) : p.phase === 'shipped' ? patch({ archived: true }) : setArchiving(true))}>{p.archived ? 'Restore' : 'Archive'}</button>
        </div>
        <div className="danger-row">
          <div>
            <strong>Delete this project</strong>
            <p className="muted">Removes the plan, the board, the journal and {b.files.length} uploaded file{b.files.length === 1 ? '' : 's'} from this computer. This cannot be undone.</p>
          </div>
          <ConfirmButton className="btn btn-danger" confirmLabel="Yes, delete everything" onConfirm={remove}>Delete</ConfirmButton>
        </div>
      </Card>
    </div>
  );
}

/** A handful of sensible planning budgets up to the maximum for this hackathon. */
function budgetChoices(max: number): number[] {
  const all = [15, 30, 45, 60, 90, 120, 180, 240];
  const picks = all.filter((m) => m < max);
  picks.push(max);
  return picks;
}
