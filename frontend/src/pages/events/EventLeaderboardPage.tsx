import { useParams } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { EventWorkspaceNav } from '@/components/domain/EventWorkspaceNav';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { useMyTeamForEvent } from '@/hooks/useMyTeamForEvent';
import { useAuthStore } from '@/stores/authStore';
import { formatScore, humanizeEnum } from '@/lib/format';
import { toApiError } from '@/lib/errors';
import type { LeaderboardEntryRead } from '@/api/types';

function medalVariant(rank: number | null | undefined): 'gold' | 'silver' | 'bronze' | null {
  if (rank === 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'bronze';
  return null;
}

/**
 * Public leaderboard. Scores are rendered exactly as the API returns them -
 * `rank` and `final_score` are never computed on the client.
 */
export function EventLeaderboardPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken));
  const { data, isLoading, isError, error, refetch } = useLeaderboard(eventId);
  const myTeam = useMyTeamForEvent(eventId, isAuthenticated);

  const columns: DataTableColumn<LeaderboardEntryRead>[] = [
    {
      key: 'rank',
      header: 'Rank',
      render: (row) =>
        row.rank === null ? (
          <span className="font-mono text-sm text-muted">—</span>
        ) : (
          <span className="font-mono text-sm font-bold text-ink">#{row.rank}</span>
        ),
    },
    {
      key: 'medal',
      header: 'Medal',
      render: (row) => {
        const variant = medalVariant(row.rank);
        if (!variant) return <span className="text-[11px] text-muted">—</span>;
        const label = variant === 'gold' ? '🥇 Gold' : variant === 'silver' ? '🥈 Silver' : '🥉 Bronze';
        return <Badge variant={variant}>{label}</Badge>;
      },
    },
    {
      key: 'team',
      header: 'Team / Project',
      render: (row) => (
        <div>
          <p className="flex items-center gap-1.5 font-semibold text-ink">
            {row.team_name}
            {myTeam.data?.id === row.team_id && (
              <span className="rounded bg-ink px-1.5 py-0.5 font-mono text-[10px] text-canvas">YOU</span>
            )}
          </p>
          <p className="text-[11px] text-taupe">{row.project_title}</p>
        </div>
      ),
    },
    {
      key: 'track',
      header: 'Track',
      render: (row) => (
        <span className="text-[11px] text-taupe">{row.track_name ?? 'Open track'}</span>
      ),
    },
    {
      key: 'score',
      header: 'Final score',
      render: (row) =>
        row.final_score === null ? (
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted">—</span>
            <StatusBadge status="Not yet judged" variant="neutral" />
          </div>
        ) : (
          <span className="font-mono text-sm font-bold text-forest">
            {formatScore(row.final_score, 4)}
          </span>
        ),
    },
    {
      key: 'evaluations',
      header: 'Evaluations',
      render: (row) => (
        <span className="font-mono text-[11px] text-taupe">{row.evaluation_count}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <EventWorkspaceNav eventId={eventId ?? ''} isAuthenticated={isAuthenticated} />
      <PageHeader
        eyebrow="Results"
        title="Leaderboard"
        description="Scores are calculated by the server from submitted evaluations only."
      />

      {isLoading ? (
        <Card>
          <SkeletonTable rows={6} />
        </Card>
      ) : isError ? (
        toApiError(error).status === 403 ? (
          <EmptyState
            icon={Trophy}
            title="Leaderboard not published yet"
            description="Leaderboards open to participants and the public once the event is marked completed. Organizers can view it at any time."
          />
        ) : (
          <ErrorState error={error} onRetry={() => void refetch()} />
        )
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No ranked submissions"
          description="Projects appear here once judges submit evaluations for their final submissions."
        />
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="border-b border-line-subtle p-6">
            <h2 className="text-lg font-bold text-ink">Public leaderboard</h2>
            <p className="text-xs text-taupe">
              Weighted average of judge scores, normalized per criterion.
            </p>
          </div>
          <DataTable
            columns={columns}
            rows={data}
            rowKey={(row) => row.project_id}
            isHighlighted={(row) => myTeam.data?.id === row.team_id}
            className="px-2 pb-2"
          />
          <p className="border-t border-line-subtle px-6 py-3 text-[11px] leading-relaxed text-muted">
            Scoring formula: each criterion score is normalized as
            {' '}<span className="font-mono">(score / max_score) × 100</span>, weighted by the
            criterion weight and divided by the total weight, then averaged across all submitted
            judge evaluations. Tied scores share the same rank. Projects without evaluations show
            no score.
          </p>
        </Card>
      )}

      <p className="text-[11px] text-muted">
        Ranks and scores are returned verbatim by the API. The interface never computes or infers a
        missing value — {humanizeEnum('not_yet_judged')} rows stay blank until judges finalize.
      </p>
    </div>
  );
}
