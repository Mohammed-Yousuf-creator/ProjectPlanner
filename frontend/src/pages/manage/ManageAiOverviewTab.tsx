import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Sparkles } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useAiStatus, useEventOverview } from '@/hooks/useAi';
import type { ProjectOverviewItem } from '@/api/types';

/**
 * Organizer's AI digest of every submitted project.
 *
 * Gated behind an explicit button: each uncached submission costs one model call,
 * so an organizer should choose when to spend it rather than have the tab do it
 * on every visit. Cached rows are reused, so re-opening is free.
 */
export function ManageAiOverviewTab({ eventId }: { eventId: string }) {
  const [enabled, setEnabled] = useState(false);
  const status = useAiStatus();
  const overview = useEventOverview(eventId, enabled);
  const items = overview.data?.items ?? [];

  const columns: DataTableColumn<ProjectOverviewItem>[] = [
    {
      key: 'team',
      header: 'Team',
      render: (row) => (
        <Link
          to={`/events/${eventId}/projects`}
          className="font-semibold text-ink hover:text-rust hover:underline"
        >
          {row.team_name}
        </Link>
      ),
    },
    {
      key: 'title',
      header: 'Project',
      render: (row) => <span className="text-xs font-semibold text-ink">{row.title}</span>,
    },
    {
      key: 'tldr',
      header: 'Summary',
      render: (row) => (
        <p className="max-w-md text-[11px] leading-relaxed text-taupe">{row.tldr}</p>
      ),
    },
    {
      key: 'tech',
      header: 'Technologies',
      render: (row) =>
        (row.technologies ?? []).length === 0 ? (
          <span className="text-[11px] text-muted">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {(row.technologies ?? []).slice(0, 4).map((tech) => (
              <Badge key={tech} variant="category">
                {tech}
              </Badge>
            ))}
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <CardHeader
          title="AI project digest"
          description="One-line summaries of every submitted project, for a fast read across the whole event."
          actions={
            <Button
              loading={overview.isFetching}
              icon={<Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
              onClick={() => {
                setEnabled(true);
                // Force a fresh read so a second click after the gate opens still
                // regenerates anything new since the last visit.
                void overview.refetch();
              }}
            >
              {enabled ? 'Refresh digest' : 'Generate digest'}
            </Button>
          }
        />

        {!status.data?.ai_enabled && status.isSuccess && (
          <Alert tone="warning" title="AI is not configured">
            Summaries are extracted from each abstract rather than interpreted. Set
            <code className="mx-1 rounded bg-white px-1 font-mono text-[10px]">GEMINI_API_KEY</code>
            in the backend .env to enable live generation.
          </Alert>
        )}

        {!enabled ? (
          <EmptyState
            inline
            icon={FileText}
            title="No digest generated yet"
            description="Generate a digest to compare every submitted project at a glance."
          />
        ) : overview.isLoading ? (
          <SkeletonLines lines={6} />
        ) : overview.isError ? (
          <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            inline
            icon={FileText}
            title="No submitted projects yet"
            description={overview.data?.note ?? 'Projects appear here once teams submit.'}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-taupe">
              <Badge variant="neutral">{items.length} projects</Badge>
              <span>
                {overview.data?.generated} generated · {overview.data?.cached} reused from cache
              </span>
              {overview.data?.note && <span className="text-muted">{overview.data.note}</span>}
            </div>
            <DataTable
              columns={columns}
              rows={items}
              rowKey={(row) => row.submission_id}
            />
          </>
        )}
      </Card>
    </div>
  );
}
