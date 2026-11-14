import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { FolderSearch, ExternalLink, Github, PlayCircle, Presentation } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Pagination } from '@/components/ui/Pagination';
import { EventWorkspaceNav } from '@/components/domain/EventWorkspaceNav';
import { useEventProjects } from '@/hooks/useProjects';
import { useAuthStore } from '@/stores/authStore';
import { formatDate, isSafeHttpUrl } from '@/lib/format';
import { toApiError } from '@/lib/errors';
import { TABLE_PAGE_SIZE } from '@/lib/constants';
import type { ProjectPublicRead } from '@/api/types';

/** Gallery of submitted projects. Requires a login (participant, judge or organizer). */
export function EventProjectsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken));
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useEventProjects(eventId, {
    page,
    page_size: TABLE_PAGE_SIZE,
  });

  return (
    <div className="space-y-6">
      <EventWorkspaceNav eventId={eventId ?? ''} isAuthenticated={isAuthenticated} />
      <PageHeader
        eyebrow="Showcase"
        title="Submitted projects"
        description="Only finalized submissions are public. Drafts stay inside the team workspace."
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : isError ? (
        toApiError(error).status === 403 ? (
          <EmptyState
            icon={FolderSearch}
            title="Projects are visible to event members"
            description="Register for this event, or sign in as an approved judge or organizer, to browse submissions."
          />
        ) : (
          <ErrorState error={error} onRetry={() => void refetch()} />
        )
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={FolderSearch}
          title="No submitted projects yet"
          description="Teams appear here after they finalize their first submission."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {data.map((project) => (
              <ProjectCard key={project.project_id} project={project} />
            ))}
          </div>
          <Pagination
            offset={(page - 1) * TABLE_PAGE_SIZE}
            limit={TABLE_PAGE_SIZE}
            pageItemCount={data.length}
            onChange={(nextOffset) => setPage(Math.floor(nextOffset / TABLE_PAGE_SIZE) + 1)}
          />
        </>
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectPublicRead }) {
  const submission = project.latest_submission;
  const links = [
    { href: submission.repo_url, label: 'Repository', icon: Github },
    { href: submission.demo_url, label: 'Demo', icon: PlayCircle },
    { href: submission.presentation_url, label: 'Slides', icon: Presentation },
  ].filter((link) => isSafeHttpUrl(link.href));

  return (
    <Card className="flex flex-col justify-between gap-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="category">{project.track_name ?? 'Open track'}</Badge>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
            v{submission.version_number} · {formatDate(submission.submitted_at)}
          </span>
        </div>
        <h3 className="text-base font-bold text-ink">{submission.title}</h3>
        <p className="text-[11px] font-semibold text-taupe">{project.team_name}</p>
        {submission.tagline && <p className="text-xs text-taupe">{submission.tagline}</p>}
        <p className="line-clamp-3 text-xs leading-relaxed text-taupe">{submission.abstract}</p>
      </div>
      {links.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-line-subtle pt-3">
          {links.map((link) => (
            <a key={link.label} href={link.href ?? undefined} target="_blank" rel="noopener noreferrer">
              <Button variant="chip" size="sm" icon={<link.icon className="h-3 w-3" aria-hidden="true" />}>
                {link.label}
                <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
              </Button>
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}
