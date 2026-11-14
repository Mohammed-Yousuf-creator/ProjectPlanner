import { Link } from 'react-router-dom';
import { LifeBuoy } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useMyMentorRequests } from '@/hooks/useParticipant';
import { cancelMentorRequest } from '@/api/endpoints/mentorRequests';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';
import { formatRelative, humanizeEnum } from '@/lib/format';
import { toApiError } from '@/lib/errors';
import type { MentorRequestRead } from '@/api/types';

/** Every mentor request the caller has raised, across all events. */
export function MyMentorRequestsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useMyMentorRequests();

  const cancel = useMutation({
    mutationFn: (requestId: string) => cancelMentorRequest(requestId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['participants', 'me', 'mentor-requests'] });
      toast.success('Request cancelled.');
    },
    onError: (mutationError) => toast.error(toApiError(mutationError).message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Support"
        title="My mentor requests"
        description="Requests you raised. Only pending requests can be cancelled."
      />

      {isLoading ? (
        <Card>
          <SkeletonLines lines={5} />
        </Card>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title="No mentor requests"
          description="Open an event's mentor desk to ask a mentor for help with a specific problem."
          actions={
            <Link to="/my/registrations">
              <Button variant="outline">My registrations</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {data.map((request) => (
            <MentorRequestCard
              key={request.id}
              request={request}
              onCancel={() => cancel.mutate(request.id)}
              cancelling={cancel.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MentorRequestCard({
  request,
  onCancel,
  cancelling,
}: {
  request: MentorRequestRead;
  onCancel: () => void;
  cancelling: boolean;
}) {
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={request.status} />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
              {humanizeEnum(request.priority)} priority
            </span>
            {request.team_name && (
              <span className="text-[11px] text-taupe">Team: {request.team_name}</span>
            )}
          </div>
          <p className="text-xs font-bold text-ink">{request.topic}</p>
          <p className="text-[11px] leading-relaxed text-taupe">{request.description}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
            Raised {formatRelative(request.created_at)}
          </p>
          {request.mentor_name && (
            <p className="text-[11px] text-taupe">Mentor: {request.mentor_name}</p>
          )}
        </div>
      </div>

      {request.resolution_note && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-800">
            Resolution note
          </p>
          <p className="text-[11px] text-emerald-900">{request.resolution_note}</p>
        </div>
      )}

      {request.status === 'pending' && (
        <div className="flex justify-end border-t border-line-subtle pt-3">
          <Button variant="outline" size="sm" onClick={onCancel} loading={cancelling}>
            Cancel request
          </Button>
        </div>
      )}
    </Card>
  );
}
