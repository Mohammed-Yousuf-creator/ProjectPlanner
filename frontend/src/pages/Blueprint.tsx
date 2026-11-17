import { type ComponentType } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { DecisionLog } from '../components/Decisions';
import { Badge, Icon } from '../components/ui';
import { useProject } from '../store';
import { GoalStep, MvpStep, ResearchStep, StoriesStep } from '../steps/define';
import { ArchitectureStep, DataStep, WireframeStep } from '../steps/design';
import { BuildPlanStep, FlowsStep, StackStep } from '../steps/build';
import type { Step } from '../types';
import { fmtDateTime, roughly, useNow } from '../time';

const VIEWS: Record<string, ComponentType> = {
  goal: GoalStep,
  research: ResearchStep,
  stories: StoriesStep,
  mvp: MvpStep,
  data: DataStep,
  wireframe: WireframeStep,
  architecture: ArchitectureStep,
  stack: StackStep,
  flows: FlowsStep,
  buildplan: BuildPlanStep,
};

export default function Blueprint() {
  const { b, p, run } = useProject();
  const { stepKey } = useParams();
  const navigate = useNavigate();
  const now = useNow(30_000);
  const planning = p.phase === 'plan';

  const fallback = (planning && b.planning.current_step) || b.steps[0].key;
  const index = b.steps.findIndex((s) => s.key === stepKey);
  if (index < 0) return <Navigate to={`/p/${p.id}/blueprint/${fallback}`} replace />;

  const step = b.steps[index];
  const View = VIEWS[step.key];
  const next = b.steps[index + 1];
  const go = (key?: string) => navigate(key ? `/p/${p.id}/blueprint/${key}` : `/p/${p.id}`);

  const mark = async (status: 'done' | 'skipped' | 'todo', advance: boolean) => {
    await run(() => api.setStep(p.id, step.key, status));
    if (advance) go(next?.key);
    window.scrollTo({ top: 0 });
  };

  const overdue = planning && step.status === 'todo' && !step.optional && new Date(step.move_on_by).getTime() < now;
  const allOk = step.checks.every((c) => c.ok);

  return (
    <div className="blueprint">
      <aside className="stepper" aria-label="Planning steps">
        <ol>
          {b.steps.map((s, i) => <StepLink key={s.key} s={s} i={i} active={s.key === step.key} current={planning && s.key === b.planning.current_step} planning={planning} />)}
        </ol>
        <a className="btn btn-sm btn-ghost export-link" href={api.exportUrl(p.id)} download>
          <Icon name="download" size={14} /> Export as PLAN.md
        </a>
        <p className="stepper-decisions muted small">{b.items.filter((i) => i.kind === 'decision').length} decision{b.items.filter((i) => i.kind === 'decision').length === 1 ? '' : 's'} logged</p>
      </aside>

      <article className="step">
        {!planning && (
          <div className="notice notice-info">
            <Icon name="lock" size={15} />
            <span>You are past planning — this is your reference now. Edit it to record a decision you have already made, not to reopen one.</span>
          </div>
        )}
        <header className="step-head">
          <div className="step-kicker">
            Step {index + 1} of {b.steps.length}
            {step.optional && <Badge>optional for a hackathon</Badge>}
            {step.essential && <Badge tone="accent">essential</Badge>}
            {step.status !== 'todo' && <Badge tone="ok">{step.status}</Badge>}
          </div>
          <h2>{step.title}</h2>
          <p className="step-tagline">{step.tagline}</p>
          {planning && step.status === 'todo' && !step.optional && (
            <p className={`step-budget ${overdue ? 'late' : ''}`}>
              <Icon name="clock" size={14} />
              {overdue
                ? `Time for this step ran out ${roughly(now - new Date(step.move_on_by).getTime())} ago. Good enough beats perfect — wrap up and move on.`
                : `Move on by ${fmtDateTime(step.move_on_by)} (${roughly(new Date(step.move_on_by).getTime() - now)} left for this step).`}
            </p>
          )}
        </header>

        <div className="step-body">
          <View />
          <DecisionLog step={step.key} />
        </div>

        <footer className="step-foot">
          <div className="checks">
            <h4>Good enough when</h4>
            <ul>
              {step.checks.map((c) => (
                <li key={c.label} className={c.ok ? 'ok' : ''}>
                  <span className="check-mark">{c.ok && <Icon name="check" size={12} />}</span> {c.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="step-actions">
            {step.status === 'todo' ? (
              <>
                <button className={`btn ${allOk || overdue ? 'btn-primary' : ''}`} onClick={() => mark('done', true)}>
                  <Icon name="check" /> Good enough — {next ? 'next step' : 'finish'}
                </button>
                <button className="btn btn-ghost" onClick={() => mark('skipped', true)}
                  title={step.essential ? 'An essential step you skip stays skipped — no task is created for it.' : 'Decide it while building, if it ever matters'}>
                  Skip
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-primary" onClick={() => go(next?.key)}>{next ? 'Next step' : 'Back to overview'} <Icon name="arrow" /></button>
                <button className="btn btn-ghost" onClick={() => mark('todo', false)}>Reopen</button>
              </>
            )}
          </div>
          {!allOk && step.status === 'todo' && (
            <p className="muted small">The checklist is a guide, not a gate. You can move on with open items — you just cannot stay here forever.</p>
          )}
        </footer>
      </article>
    </div>
  );
}

function StepLink({ s, i, active, current, planning }: { s: Step; i: number; active: boolean; current: boolean; planning: boolean }) {
  return (
    <li className={`status-${s.status} ${active ? 'active' : ''} ${s.optional ? 'optional' : ''}`}>
      <Link to={`../${s.key}`} relative="path" aria-current={active ? 'step' : undefined}>
        <span className="step-dot">{s.status === 'done' ? <Icon name="check" size={12} /> : s.status === 'skipped' ? <Icon name="skip" size={11} /> : i + 1}</span>
        <span className="stepper-text">
          <span className="stepper-title">{s.title}</span>
          {planning && s.status === 'todo' && (
            <span className="stepper-when">{s.optional ? 'optional' : current ? `now · until ${fmtDateTime(s.move_on_by)}` : `by ${fmtDateTime(s.move_on_by)}`}</span>
          )}
        </span>
      </Link>
    </li>
  );
}
