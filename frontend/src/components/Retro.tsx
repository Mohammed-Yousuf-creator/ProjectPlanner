import { api } from '../api';
import { times } from '../lib';
import { PlanField } from '../steps/common';
import { useProject } from '../store';
import { fmtDate } from '../time';
import { Badge, Card, Icon } from './ui';

const n1 = (n: number) => (Math.round(n * 10) / 10).toString();
const day = (s: string | null) => (s ? fmtDate(s.length <= 10 ? s + 'T12:00' : s) : '—');

/** Plan against reality, shown once the MVP has shipped. The numbers come from the project's own history. */
export function RetroCard() {
  const { b, p } = useProject();
  const r = b.retro;
  if (!r) return null;
  return (
    <Card title="Retrospective: plan against reality" className="retro"
      aside={<a className="btn btn-sm btn-ghost" href={api.exportUrl(p.id)} download><Icon name="download" size={13} /> PLAN.md</a>}>
      <div className="retro-grid">
        <Stat label="Planning" value={`${n1(r.planning_used_hours)} h`} note={`of ${n1(r.planning_allowed_hours)} h allowed${r.forced_start ? ' — the deadline ended it' : ''}`} bad={r.forced_start} />
        <Stat label="Blueprint steps" value={`${r.steps_done}/${r.steps_total}`} note="finished before coding" />
        <Stat label="Building" value={`${n1(r.build_days)} d`} note={`${r.days_logged} day${r.days_logged === 1 ? '' : 's'} logged, ${n1(r.hours_logged)} h`} />
        <Stat label="Ship date" value={r.days_vs_target === null ? '—' : r.days_vs_target === 0 ? 'on time' : `${Math.abs(r.days_vs_target)} d ${r.days_vs_target > 0 ? 'late' : 'early'}`}
          note={r.first_target ? `first planned ${day(r.first_target)}${r.date_moves ? `, moved ${r.date_moves}×` : ''}` : 'no ship date was set'}
          bad={(r.days_vs_target ?? 0) > 0 || r.date_moves > 0} good={r.days_vs_target !== null && r.days_vs_target <= 0 && r.date_moves === 0} />
        <Stat label="Scope" value={`${r.scope_added > 0 ? '+' : ''}${r.scope_added} / −${r.scope_cut}`} note={`added / cut after coding started; ${r.scope_parked} parked`} bad={r.scope_added > r.scope_cut} />
        <Stat label="Estimates" value={r.multiplier > 0 ? times(r.multiplier) : '—'}
          note={r.multiplier > 0 ? `${n1(r.spent_hours)} h spent on ${n1(r.estimate_hours)} h estimated` : 'no task had both an estimate and logged time'} bad={r.multiplier > 1.25} />
        <Stat label="Tasks" value={`${r.tasks_done}`} note={`done; ${r.tasks_open} left open, ${r.tasks_parked} in the expansion pack`} />
        <Stat label="Plan changes" value={`${r.plan_changes}`} note="blueprint edits after coding started" />
      </div>

      {r.milestones.length > 0 && (
        <div className="table-wrap">
          <table className="retro-table">
            <thead><tr><th>Milestone</th><th>First due</th><th>Finished</th><th>Late by</th><th>Tasks</th><th>Est. / spent</th></tr></thead>
            <tbody>
              {r.milestones.map((m, i) => (
                <tr key={i}>
                  <td>{m.title}</td>
                  <td>{day(m.first_due)}</td>
                  <td>{m.finished_at ? day(m.finished_at) : <span className="muted">{m.tasks_total === 0 ? 'no tasks' : 'not finished'}</span>}</td>
                  <td className={m.days_late !== null && m.days_late > 0 ? 'overdue' : ''}>{m.days_late === null ? '—' : m.days_late > 0 ? `${n1(m.days_late)} d` : 'on time'}</td>
                  <td>{m.tasks_done}/{m.tasks_total}</td>
                  <td>{m.estimate_hours > 0 || m.spent_hours > 0 ? `${n1(m.estimate_hours)} / ${n1(m.spent_hours)} h` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {r.obstacles.length > 0 && (
        <>
          <h4>Where you got stuck</h4>
          <ul className="plain-list retro-obstacles">
            {r.obstacles.slice(0, 8).map((o, i) => (
              <li key={i} className="row row-wrap">
                <span className="row-main">{o.title}</span>
                <Badge>{o.kind === 'unsorted' ? 'not sorted' : o.kind}</Badge>
                {o.needed_help && <Badge tone="info">outside help</Badge>}
                <span className="muted small">{o.attempts} attempt{o.attempts === 1 ? '' : 's'} · {o.solved ? `open ${n1(o.hours_open)} h` : 'never solved'}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h4>Three lines for next time</h4>
      <p className="muted small">These show up when you start your next project.</p>
      <PlanField k="retro_went_well" label="What went well" placeholder="Keep doing this" minRows={1} />
      <PlanField k="retro_hard" label="What was harder than expected" placeholder="Where the plan was wrong" minRows={1} />
      <PlanField k="retro_change" label="What I will do differently" placeholder="One concrete change" minRows={1} />
    </Card>
  );
}

function Stat({ label, value, note, bad, good }: { label: string; value: string; note: string; bad?: boolean; good?: boolean }) {
  return (
    <div className={`retro-stat ${bad ? 'bad' : good ? 'good' : ''}`}>
      <span className="retro-label">{label}</span>
      <strong>{value}</strong>
      <span className="muted small">{note}</span>
    </div>
  );
}

