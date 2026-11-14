import { useMemo, useState } from 'react';
import { FolderPlus, GitBranch } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { Alert } from '@/components/ui/Alert';
import { useEvent } from '@/hooks/useEvents';
import { useJudgingCriteria } from '@/hooks/useJudging';
import { useTeamProject } from '@/hooks/useProjects';
import { reviewProjectReadiness } from '@/lib/projectReadiness';
import { canManageTeam } from '@/lib/permissions';
import { formatDateTime, isSafeHttpUrl } from '@/lib/format';
import { toApiError } from '@/lib/errors';
import type { TeamDetailRead, TeamMemberInfo } from '@/api/types';
import { CreateProjectModal } from './CreateProjectModal';
import { SubmissionPanel } from './SubmissionPanel';
import { SubmissionSummaryCard } from '@/components/ai/SubmissionSummaryCard';

export function TeamProjectTab({
  team,
  membership,
}: {
  team: TeamDetailRead;
  membership: TeamMemberInfo | null;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const projectQuery = useTeamProject(team.id);
  const eventQuery = useEvent(team.event_id);
  const criteriaQuery = useJudgingCriteria(team.event_id);

  const project = projectQuery.data;
  const canManage = canManageTeam(membership);

  const readiness = useMemo(
    () =>
      project?.latest_submission && eventQuery.data
        ? reviewProjectReadiness(project.latest_submission, eventQuery.data, team.member_count)
        : null,
    [project?.latest_submission, eventQuery.data, team.member_count],
  );

  if (projectQuery.isLoading) {
    return (
      <Card>
        <SkeletonLines lines={8} />
      </Card>
    );
  }

  if (projectQuery.isError) {
    const apiError = toApiError(projectQuery.error);
    // 404 means "no project yet" - that is an empty state, not an error.
    if (apiError.status === 404) {
      return (
        <>
          <EmptyState
            icon={FolderPlus}
            title="No project yet"
            description={
              canManage
                ? 'Create the project to publish your submission versions for this event.'
                : 'A team owner or lead must create the project before submissions can be drafted.'
            }
            actions={
              canManage ? (
                <Button onClick={() => setCreateOpen(true)}>Create project</Button>
              ) : undefined
            }
          />
          <CreateProjectModal
            open={createOpen}
            eventId={team.event_id}
            teamId={team.id}
            onClose={() => setCreateOpen(false)}
            onCreated={() => setCreateOpen(false)}
          />
        </>
      );
    }
    return <ErrorState error={projectQuery.error} onRetry={() => void projectQuery.refetch()} />;
  }

  if (!project) return null;

  const latest = project.latest_submission ?? null;

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <CardHeader
          title={latest?.title ?? 'Untitled project'}
          description={latest?.tagline ?? 'Project submissions for this event.'}
          actions={<Badge variant="neutral">{project.track_name ?? 'Open track'}</Badge>}
        />
        <div className="grid gap-3 pt-2 sm:grid-cols-3">
          <Fact label="Team" value={project.team_name ?? team.name} />
          <Fact label="Versions" value={String(project.submissions.length)} mono />
          <Fact
            label="Latest status"
            value={latest ? latest.status : 'No submissions'}
            mono
          />
        </div>
        {latest && (
          <div className="space-y-1 border-t border-line-subtle pt-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Abstract</p>
            <p className="text-xs leading-relaxed text-taupe">{latest.abstract}</p>
            {latest.description && (
              <p className="whitespace-pre-line text-[11px] leading-relaxed text-taupe">
                {latest.description}
              </p>
            )}
            <div className="flex flex-wrap gap-3 pt-1">
              {isSafeHttpUrl(latest.repo_url) && (
                <a href={latest.repo_url ?? undefined} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-rust hover:underline">
                  Repository
                </a>
              )}
              {isSafeHttpUrl(latest.demo_url) && (
                <a href={latest.demo_url ?? undefined} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-rust hover:underline">
                  Live demo
                </a>
              )}
              {isSafeHttpUrl(latest.presentation_url) && (
                <a href={latest.presentation_url ?? undefined} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-rust hover:underline">
                  Presentation
                </a>
              )}
            </div>
          </div>
        )}
      </Card>

      {readiness && readiness.blocking.length > 0 && latest?.status === 'draft' && (
        <Alert tone="warning" title="Before you submit">
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {readiness.blocking.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Alert>
      )}

      {criteriaQuery.data && criteriaQuery.data.length > 0 && (
        <Card className="space-y-2">
          <CardHeader
            title="Judging criteria"
            description="How judges will score the final submission."
          />
          <ul className="divide-y divide-line-subtle pt-2">
            {criteriaQuery.data.map((criterion) => (
              <li key={criterion.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="text-xs font-semibold text-ink">{criterion.name}</p>
                  {criterion.description && (
                    <p className="text-[11px] text-taupe">{criterion.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="metric">weight {criterion.weight}</Badge>
                  <Badge variant="neutral">max {criterion.max_score}</Badge>
                  <StatusBadge status={criterion.is_active ? 'active' : 'inactive'} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <SubmissionPanel
        project={project}
        teamId={team.id}
        canManage={canManage}
        readiness={readiness}
      />

      {project.latest_submission && (
        <SubmissionSummaryCard
          // Keyed on the submission id so switching versions refetches rather
          // than showing the previous version's cached overview.
          key={project.latest_submission.id}
          submissionId={project.latest_submission.id}
          enabled={project.latest_submission.status === 'submitted'}
        />
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-muted">
        <GitBranch className="h-3 w-3" aria-hidden="true" />
        Project created {formatDateTime(project.created_at)} · submissions are versioned and never
        overwritten.
      </p>
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className={mono ? 'font-mono text-xs text-ink' : 'text-xs font-medium text-ink'}>{value}</p>
    </div>
  );
}
