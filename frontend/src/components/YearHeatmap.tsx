import { addDays, dayKey, fmtLongDate } from '../time';
import type { Activity } from '../types';

const WEEKS = 53;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A year of work across every project: one square per day, darker for more done. */
export function YearHeatmap({ activity }: { activity: Activity }) {
  const byDay = new Map(activity.days.map((d) => [d.day, d]));
  const today = new Date();
  const todayK = dayKey(today);
  const mondayOffset = (today.getDay() + 6) % 7;
  const start = addDays(today, -mondayOffset - (WEEKS - 1) * 7);
  const weeks = Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));

  let activeDays = 0, hours = 0, tasks = 0;
  for (const d of activity.days) {
    if (d.day < dayKey(start)) continue;
    activeDays++;
    hours += d.hours;
    tasks += d.tasks_done;
  }

  const level = (k: string) => {
    const d = byDay.get(k);
    if (!d) return 0;
    const score = d.tasks_done + d.entries + d.hours / 2;
    return score >= 6 ? 4 : score >= 4 ? 3 : score >= 2 ? 2 : 1;
  };

  return (
    <div className="year">
      <div className="year-scroll">
        <div className="year-months" aria-hidden="true">
          {weeks.map((week, w) => {
            const first = week[0];
            const show = first.getDate() <= 7 && (w === 0 || weeks[w - 1][0].getMonth() !== first.getMonth());
            return <span key={w}>{show ? MONTHS[first.getMonth()] : ''}</span>;
          })}
        </div>
        <div className="year-grid" role="img" aria-label={`${activeDays} active days, ${tasks} tasks finished and ${Math.round(hours)} hours logged in the last year`}>
          {weeks.map((week, w) => (
            <div key={w} className="year-week">
              {week.map((d) => {
                const k = dayKey(d);
                const info = byDay.get(k);
                const future = k > todayK;
                const what = future ? '' : info
                  ? `: ${info.tasks_done} task${info.tasks_done === 1 ? '' : 's'} done${info.hours ? `, ${info.hours} h` : ''}${info.entries ? ', journal entry' : ''}`
                  : ': nothing';
                return <span key={k} className={`year-day level-${future ? 0 : level(k)} ${future ? 'future' : ''} ${k === todayK ? 'today' : ''}`} title={`${fmtLongDate(d)}${what}`} />;
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="muted small year-summary">
        <strong>{activeDays}</strong> active day{activeDays === 1 ? '' : 's'} · <strong>{tasks}</strong> task{tasks === 1 ? '' : 's'} finished · <strong>{Math.round(hours * 10) / 10}</strong> h logged
        <span className="year-legend" aria-hidden="true">less <i className="year-day level-0" /><i className="year-day level-1" /><i className="year-day level-2" /><i className="year-day level-3" /><i className="year-day level-4" /> more</span>
      </p>
    </div>
  );
}
