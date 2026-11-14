import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Gavel, ShieldX } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { Pagination } from '@/components/ui/Pagination';
import { useEvent } from '@/hooks/useEvents';
import { useJudgingCriteria } from '@/hooks/useJudging';
import { useEventProjects } from '@/hooks/useProjects';
import { toApiError } from '@/lib/errors';
import { formatDate, humanizeEnum, isSafeHttpUrl } from '@/lib/format';
import { TABLE_PAGE_SIZE } from '@/lib/constants';
import type { ProjectPublicRead } from '@/api/types';
import { EvaluationPanel } from './EvaluationPanel';

/**
 * Judge workspace. The backend exposes no "events I judge" endpoint, so this page
 * is reached via a direct link from the event page; access is validated by the
 * per-submission evaluation calls (403 for non-judges).
 */
export function JudgeWorkspacePage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ProjectPublicRead | null>(null);

  const event = useEvent(eventId);
  const criteria = useJudgingCriteria(eventId);
  const projects = useEventProjects(eventId, { page, page_size: TABLE_PAGE_SIZE });

  if (event.isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonLines lines={2} className="max-w-md" />
        <Card>
          <SkeletonLines lines={6} />
        </Card>
      </div>
    );
  }

  if (event.isError) {
    const apiError = toApiError(event.error);
    if (apiError.status === 403 || apiError.status === 404) {
      return (
        <EmptyState
          icon={ShieldX}
          title="Judge access required"
          description="You are not an approved judge for this event, or the event is not available."
        />
      );
    }
    return <ErrorState error={event.error} onRetry={() => void event.refetch()} />;
  }

  const eventData = event.data;
  if (!eventData) return null;

  const projectsForbidden = projects.isError && toApiError(projects.error).status === 403;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Judging"
        title={eventData.name}
        description="Score each submitted project against the published criteria."
        breadcrumbs={[
          { label: 'Events', to: '/events' },
          { label: eventData.name, to: `/events/${eventData.id}` },
          { label: 'Judge workspace' },
        ]}
        actions={<Badge variant="neutral">{humanizeEnum(eventData.status)}</Badge>}
      />

      <Card>
        <CardHeader
          title="Scoring criteria"
          description="Each score is validated against its maximum on the server."
        />
        <div className="pt-3">
          {criteria.isLoading ? (
            <SkeletonLines lines={2} />
          ) : criteria.isError ? (
            <p className="text-xs text-taupe">{toApiError(criteria.error).message}</p>
          ) : !criteria.data || criteria.data.length === 0 ? (
            <p className="text-xs text-taupe">
              The organizers have not published judging criteria yet.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {criteria.data.map((criterion) => (
                <li
                  key={criterion.id}
                  className="rounded-xl border border-line bg-canvas px-3 py-2"
                >
                  <p className="text-[11px] font-semibold text-ink">{criterion.name}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                    0–{criterion.max_score} · weight {criterion.weight}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="space-y-3 lg:col-span-2" padded={false}>
          <div className="border-b border-line-subtle p-5">
            <h3 className="text-sm font-bold text-ink">Submitted projects</h3>
            <p className="text-[11px] text-taupe">
              Judges see submitted versions only — never drafts.
            </p>
          </div>

          {projects.isLoading ? (
            <div className="p-5">
              <SkeletonLines lines={5} />
            </div>
          ) : projects.isError ? (
            projectsForbidden ? (
              <div className="p-5">
                <EmptyState
                  inline
                  icon={Gavel}
                  title="Not available to your account"
                  description="Only approved judges, participants, and organizers can list projects for this event."
                />
              </div>
            ) : (
              <div className="p-5">
                <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />
              </div>
            )
          ) : !projects.data || projects.data.length === 0 ? (
            <div className="p-5">
              <EmptyState
                inline
                icon={Gavel}
                title="No submissions yet"
                description="Projects appear once teams finalize a submission."
              />
            </div>
          ) : (
            <div className="p-2">
              <ul className="space-y-1">
                {projects.data.map((project) => {
                  const active = selected?.project_id === project.project_id;
                  return (
                    <li key={project.project_id}>
                      <button
                        type="button"
                        onClick={() => setSelected(project)}
                        className={
                          'w-full rounded-xl border px-3 py-2.5 text-left transition-colors ' +
                          (active
                            ? 'border-forest/40 bg-emerald-50'
                            : 'border-transparent hover:border-line hover:bg-canvas')
                        }
                      >
                        <p className="text-xs font-bold text-ink">
                          {project.latest_submission.title}
                        </p>
                        <p className="text-[11px] text-taupe">
                          {project.team_name} · v{project.latest_submission.version_number} ·{' '}
                          {formatDate(project.latest_submission.submitted_at)}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-line-subtle p-3">
                <Pagination
                  offset={(page - 1) * TABLE_PAGE_SIZE}
                  limit={TABLE_PAGE_SIZE}
                  pageItemCount={projects.data.length}
                  onChange={(nextOffset) => setPage(Math.floor(nextOffset / TABLE_PAGE_SIZE) + 1)}
                />
              </div>
            </div>
          )}
        </Card>

        <div className="lg:col-span-3">
          {!selected ? (
            <EmptyState
              icon={Gavel}
              title="Pick a project to evaluate"
              description="Choose a submission on the left to read its details and start scoring."
            />
          ) : (
            <div className="space-y-4">
              <Card className="space-y-2">
                <CardHeader
                  title={selected.latest_submission.title}
                  description={`${selected.team_name} · version ${selected.latest_submission.version_number}`}
                  actions={<Badge variant="neutral">{selected.track_name ?? 'Open track'}</Badge>}
                />
                <p className="pt-2 text-xs leading-relaxed text-taupe">
                  {selected.latest_submission.abstract}
                </p>
                {selected.latest_submission.description && (
                  <p className="whitespace-pre-line text-[11px] leading-relaxed text-taupe">
                    {selected.latest_submission.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-3 pt-1">
                  {isSafeHttpUrl(selected.latest_submission.repo_url) && (
                    <a
                      href={selected.latest_submission.repo_url ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-semibold text-rust hover:underline"
                    >
                      Repository
                    </a>
                  )}
                  {isSafeHttpUrl(selected.latest_submission.demo_url) && (
                    <a
                      href={selected.latest_submission.demo_url ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-semibold text-rust hover:underline"
                    >
                      Live demo
                    </a>
                  )}
                  {isSafeHttpUrl(selected.latest_submission.presentation_url) && (
                    <a
                      href={selected.latest_submission.presentation_url ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-semibold text-rust hover:underline"
                    >
                      Presentation
                    </a>
                  )}
                </div>
              </Card>

              <EvaluationPanel
                submissionId={selected.latest_submission.id}
                criteria={criteria.data ?? []}
              />

              <Button variant="outline" onClick={() => setSelected(null)}>
                Close project
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
