import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { LifeBuoy, Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { Alert } from '@/components/ui/Alert';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EventWorkspaceNav } from '@/components/domain/EventWorkspaceNav';
import { useMyMentorRequests } from '@/hooks/useParticipant';
import {
  useAssignMentorRequest,
  useCancelMentorRequest,
  useCreateMentorRequest,
  useEventMentorRequests,
  useUpdateMentorRequestStatus,
} from '@/hooks/useMentorRequests';
import { useMyTeamForEvent } from '@/hooks/useMyTeamForEvent';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/components/ui/Toast';
import { formatRelative, humanizeEnum } from '@/lib/format';
import { toApiError } from '@/lib/errors';
import { MENTOR_PRIORITIES } from '@/lib/constants';
import type { MentorRequestRead } from '@/api/types';

type View = 'mine' | 'queue';

/**
 * Mentor desk. Participants create and track their own requests; mentors and
 * organizers get a queue. `GET /events/{id}/mentor-requests` returns 403 for
 * everyone else, which we translate into an explanatory empty state.
 */
export function EventMentorPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const toast = useToast();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = Boolean(useAuthStore((state) => state.accessToken));

  const [view, setView] = useState<View>('mine');
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [resolveTarget, setResolveTarget] = useState<MentorRequestRead | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');

  const myTeams = useMyTeamForEvent(eventId, isAuthenticated);
  const mine = useMyMentorRequests(eventId, isAuthenticated);
  const queue = useEventMentorRequests(eventId, { status: statusFilter || undefined, page: 1, page_size: 50 });

  const createRequest = useCreateMentorRequest(eventId ?? '');
  const cancelRequest = useCancelMentorRequest(eventId ?? '');
  const assignRequest = useAssignMentorRequest(eventId ?? '');
  const updateStatus = useUpdateMentorRequestStatus(eventId ?? '');

  const [form, setForm] = useState({
    topic: '',
    description: '',
    priority: 'normal',
    team_id: '',
  });

  const queueForbidden = queue.isError && toApiError(queue.error).status === 403;

  return (
    <div className="space-y-6">
      <EventWorkspaceNav eventId={eventId ?? ''} isAuthenticated={isAuthenticated} />
      <PageHeader
        eyebrow="Support"
        title="Mentor desk"
        description="Ask for help with a blocker, or work the queue if you mentor this event."
        actions={
          <Button
            onClick={() => setCreateOpen(true)}
            icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            Request a mentor
          </Button>
        }
      />

      <Tabs
        tabs={[
          { value: 'mine', label: 'My requests', count: mine.data?.length },
          { value: 'queue', label: 'Mentor queue' },
        ]}
        value={view}
        onChange={(value) => setView(value as View)}
        aria-label="Mentor desk views"
      />

      {view === 'mine' ? (
        <Card className="space-y-3">
          <CardHeader
            title="My requests in this event"
            description="Cancel a request while it is still pending."
          />
          {mine.isLoading ? (
            <SkeletonLines lines={5} />
          ) : mine.isError ? (
            <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />
          ) : !mine.data || mine.data.length === 0 ? (
            <EmptyState
              inline
              icon={LifeBuoy}
              title="You haven't asked for help yet"
              description="Describe the blocker and a mentor will pick it up from the queue."
              actions={<Button onClick={() => setCreateOpen(true)}>Request a mentor</Button>}
            />
          ) : (
            <div className="space-y-2">
              {mine.data.map((request) => (
                <div key={request.id} className="rounded-xl border border-line-subtle bg-canvas p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={request.status} />
                      <Badge variant="neutral">{humanizeEnum(request.priority)}</Badge>
                      {request.team_name && (
                        <span className="text-[11px] text-taupe">Team: {request.team_name}</span>
                      )}
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                      {formatRelative(request.created_at)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs font-bold text-ink">{request.topic}</p>
                  <p className="text-[11px] leading-relaxed text-taupe">{request.description}</p>
                  {request.mentor_name && (
                    <p className="mt-1 text-[11px] text-forest">Mentor: {request.mentor_name}</p>
                  )}
                  {request.resolution_note && (
                    <p className="mt-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-900">
                      {request.resolution_note}
                    </p>
                  )}
                  {request.status === 'pending' && (
                    <div className="mt-2 flex justify-end">
                      <Button
                        variant="chip"
                        size="sm"
                        loading={cancelRequest.isPending}
                        onClick={() =>
                          cancelRequest.mutate(request.id, {
                            onSuccess: () => toast.info('Request cancelled.'),
                            onError: (error) => toast.error(toApiError(error).message),
                          })
                        }
                      >
                        Cancel request
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <Card className="space-y-3">
          <CardHeader
            title="Mentor queue"
            description="Organizers see every request. Mentors see unassigned requests plus their own."
            actions={
              <Select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                placeholder="All statuses"
                options={['pending', 'assigned', 'in_progress', 'resolved', 'cancelled', 'rejected'].map(
                  (status) => ({ value: status, label: humanizeEnum(status) }),
                )}
                className="w-40"
              />
            }
          />

          {queue.isLoading ? (
            <SkeletonLines lines={5} />
          ) : queue.isError ? (
            queueForbidden ? (
              <EmptyState
                inline
                icon={LifeBuoy}
                title="Mentor queue is restricted"
                description="Only event organizers and approved mentors can view this queue."
              />
            ) : (
              <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />
            )
          ) : !queue.data || queue.data.length === 0 ? (
            <EmptyState
              inline
              icon={LifeBuoy}
              title="Queue is empty"
              description="No mentor requests match this filter right now."
            />
          ) : (
            <div className="space-y-2">
              {queue.data.map((request) => {
                const isMyAssignment = request.assigned_mentor_user_id === user?.id;
                return (
                  <div key={request.id} className="rounded-xl border border-line-subtle bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={request.status} />
                        <Badge variant="neutral">{humanizeEnum(request.priority)}</Badge>
                        {request.mentor_name && (
                          <span className="text-[11px] text-taupe">Mentor: {request.mentor_name}</span>
                        )}
                        {isMyAssignment && <Badge variant="metric">Assigned to you</Badge>}
                      </div>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                        {formatRelative(request.created_at)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs font-bold text-ink">{request.topic}</p>
                    <p className="text-[11px] leading-relaxed text-taupe">{request.description}</p>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {request.status === 'pending' && (
                        <>
                          <Button
                            size="sm"
                            onClick={() =>
                              assignRequest.mutate(
                                { requestId: request.id, body: { mentor_user_id: user?.id ?? '' } },
                                {
                                  onSuccess: () => toast.success('Request claimed.'),
                                  onError: (error) => toast.error(toApiError(error).message),
                                },
                              )
                            }
                            loading={assignRequest.isPending}
                          >
                            Claim request
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              updateStatus.mutate(
                                { requestId: request.id, body: { status: 'rejected' } },
                                {
                                  onSuccess: () => toast.info('Request rejected.'),
                                  onError: (error) => toast.error(toApiError(error).message),
                                },
                              )
                            }
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {request.status === 'assigned' && (isMyAssignment || queueForbidden === false) && (
                        <Button
                          size="sm"
                          onClick={() =>
                            updateStatus.mutate(
                              { requestId: request.id, body: { status: 'in_progress' } },
                              {
                                onSuccess: () => toast.success('Marked in progress.'),
                                onError: (error) => toast.error(toApiError(error).message),
                              },
                            )
                          }
                        >
                          Start working
                        </Button>
                      )}
                      {request.status === 'in_progress' && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setResolutionNote('');
                            setResolveTarget(request);
                          }}
                        >
                          Resolve
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Create request modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Request a mentor"
        description="Be specific: what is blocking you, and what have you tried?"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={createRequest.isPending}
              onClick={() => {
                if (!form.topic.trim() || !form.description.trim()) {
                  toast.error('A topic and description are both required.');
                  return;
                }
                createRequest.mutate(
                  {
                    topic: form.topic.trim(),
                    description: form.description.trim(),
                    priority: form.priority as 'low' | 'normal' | 'high',
                    team_id: form.team_id || null,
                  },
                  {
                    onSuccess: () => {
                      toast.success('Request sent to the mentor queue.');
                      setCreateOpen(false);
                      setForm({ topic: '', description: '', priority: 'normal', team_id: '' });
                    },
                    onError: (error) => toast.error(toApiError(error).message),
                  },
                );
              }}
            >
              Send request
            </Button>
          </>
        }
      >
        {createRequest.isError && (
          <Alert tone="error" title="Could not send the request">
            {toApiError(createRequest.error).message}
          </Alert>
        )}
        <Field label="Topic" htmlFor="mentor-topic" required>
          <Input
            id="mentor-topic"
            value={form.topic}
            onChange={(event) => setForm((prev) => ({ ...prev, topic: event.target.value }))}
            placeholder="e.g. WebSocket reconnection loop"
          />
        </Field>
        <Field label="Description" htmlFor="mentor-description" required>
          <Textarea
            id="mentor-description"
            rows={4}
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Context, error messages, and what you already tried."
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Priority" htmlFor="mentor-priority">
            <Select
              id="mentor-priority"
              value={form.priority}
              onChange={(event) => setForm((prev) => ({ ...prev, priority: event.target.value }))}
              options={MENTOR_PRIORITIES.map((option) => ({ value: option.value, label: option.label }))}
            />
          </Field>
          <Field
            label="Team"
            htmlFor="mentor-team"
            hint="Optional. Only your own team in this event."
          >
            <Select
              id="mentor-team"
              value={form.team_id}
              onChange={(event) => setForm((prev) => ({ ...prev, team_id: event.target.value }))}
              placeholder="No team"
              options={myTeams.data ? [{ value: myTeams.data.id, label: myTeams.data.name }] : []}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(resolveTarget)}
        onClose={() => setResolveTarget(null)}
        onConfirm={() => {
          if (!resolveTarget) return;
          updateStatus.mutate(
            {
              requestId: resolveTarget.id,
              body: { status: 'resolved', resolution_note: resolutionNote.trim() || null },
            },
            {
              onSuccess: () => {
                toast.success('Request resolved.');
                setResolveTarget(null);
              },
              onError: (error) => {
                setResolveTarget(null);
                toast.error(toApiError(error).message);
              },
            },
          );
        }}
        title="Resolve this request?"
        description="The participant is notified with your resolution note."
        confirmLabel="Resolve"
        loading={updateStatus.isPending}
      >
        <Field label="Resolution note" htmlFor="resolution-note" hint="Optional, shared with the requester.">
          <Textarea
            id="resolution-note"
            rows={3}
            value={resolutionNote}
            onChange={(event) => setResolutionNote(event.target.value)}
            placeholder="What fixed it, or what they should do next."
          />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
