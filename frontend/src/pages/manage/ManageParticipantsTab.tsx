import { useState } from 'react';
import { Users } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { Pagination } from '@/components/ui/Pagination';
import { useToast } from '@/components/ui/Toast';
import { useEventParticipants, useUpdateParticipantStatus } from '@/hooks/useRegistrations';
import { REGISTRATION_STATUSES, TABLE_PAGE_SIZE } from '@/lib/constants';
import { formatDateTime, humanizeEnum } from '@/lib/format';
import { toApiError } from '@/lib/errors';
import type { OrganizerParticipantRead } from '@/api/types';

/** Roster with status filtering, username/email search, and status changes. */
export function ManageParticipantsTab({ eventId }: { eventId: string }) {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [offset, setOffset] = useState(0);

  const participants = useEventParticipants(eventId, {
    status: status || undefined,
    search: search || undefined,
    limit: TABLE_PAGE_SIZE,
    offset,
  });
  const updateStatus = useUpdateParticipantStatus(eventId);

  const columns: DataTableColumn<OrganizerParticipantRead>[] = [
    {
      key: 'participant',
      header: 'Participant',
      render: (row) => (
        <div>
          <p className="font-semibold text-ink">{row.display_name}</p>
          <p className="text-[11px] text-taupe">
            @{row.username} · {row.email}
          </p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (row) => <Badge variant="neutral">{humanizeEnum(row.role)}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'registered',
      header: 'Registered',
      render: (row) => (
        <span className="font-mono text-[11px] text-taupe">{formatDateTime(row.registered_at)}</span>
      ),
    },
    {
      key: 'checked_in',
      header: 'Checked in',
      render: (row) =>
        row.checked_in_at ? (
          <span className="font-mono text-[11px] text-forest">{formatDateTime(row.checked_in_at)}</span>
        ) : (
          <span className="text-[11px] text-muted">—</span>
        ),
    },
    {
      key: 'actions',
      header: 'Set status',
      render: (row) =>
        row.status === 'withdrawn' || row.status === 'rejected' ? (
          <span className="text-[11px] text-muted">Locked</span>
        ) : (
          <Select
            aria-label={`Set status for ${row.display_name}`}
            className="w-36"
            value={row.status}
            onChange={(event) =>
              updateStatus.mutate(
                {
                  userId: row.user_id,
                  body: { status: event.target.value as 'approved' | 'waitlisted' | 'rejected' },
                },
                {
                  onSuccess: () => toast.success(`${row.display_name} is now ${event.target.value}.`),
                  onError: (error) => toast.error(toApiError(error).message),
                },
              )
            }
            options={[
              { value: 'registered', label: 'Registered' },
              { value: 'approved', label: 'Approved' },
              { value: 'waitlisted', label: 'Waitlisted' },
              { value: 'rejected', label: 'Rejected' },
            ]}
          />
        ),
    },
  ];

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="space-y-3 p-5">
        <CardHeader
          title="Participants"
          description="Search by username or email. Withdrawn registrations cannot be modified."
        />
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <form
            className="flex flex-1 flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchDraft.trim());
              setOffset(0);
            }}
          >
            <Input
              aria-label="Search participants"
              placeholder="Search username or email…"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              className="max-w-xs"
            />
            <Button type="submit" variant="outline" size="sm">
              Search
            </Button>
          </form>
          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setOffset(0);
            }}
            placeholder="Any status"
            options={REGISTRATION_STATUSES.map((value) => ({ value, label: humanizeEnum(value) }))}
            className="w-40"
          />
        </div>
      </div>

      {participants.isLoading ? (
        <div className="px-5 pb-5">
          <SkeletonTable rows={5} />
        </div>
      ) : participants.isError ? (
        <div className="px-5 pb-5">
          <ErrorState error={participants.error} onRetry={() => void participants.refetch()} />
        </div>
      ) : !participants.data || participants.data.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState
            inline
            icon={Users}
            title="No participants match"
            description="Adjust the filters, or wait for people to register."
          />
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={participants.data}
            rowKey={(row) => row.membership_id}
            className="px-2"
          />
          <div className="border-t border-line-subtle p-4">
            <Pagination
              offset={offset}
              limit={TABLE_PAGE_SIZE}
              pageItemCount={participants.data.length}
              onChange={setOffset}
            />
          </div>
        </>
      )}
    </Card>
  );
}
