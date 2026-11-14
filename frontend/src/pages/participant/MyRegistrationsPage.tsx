import { Link } from 'react-router-dom';
import { Ticket } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { useMyRegistrations } from '@/hooks/useParticipant';
import { formatDate, formatDateTime, humanizeEnum } from '@/lib/format';
import type { ParticipantRegistrationRead } from '@/api/types';

/** Active registrations only (registered / approved / waitlisted). */
export function MyRegistrationsPage() {
  const { data, isLoading, isError, error, refetch } = useMyRegistrations();

  const columns: DataTableColumn<ParticipantRegistrationRead>[] = [
    {
      key: 'event',
      header: 'Event',
      render: (row) => (
        <div>
          <Link
            to={`/my/events/${row.event_id}`}
            className="font-semibold text-ink hover:text-rust hover:underline"
          >
            {row.event_name}
          </Link>
          <p className="text-[11px] text-taupe">{row.organization_name}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => <span className="text-[11px] text-taupe">{humanizeEnum(row.event_type)}</span>,
    },
    {
      key: 'format',
      header: 'Format',
      render: (row) => <span className="text-[11px] text-taupe">{humanizeEnum(row.event_format)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.registration_status} />,
    },
    {
      key: 'registered',
      header: 'Registered',
      render: (row) => (
        <span className="font-mono text-[11px] text-taupe">{formatDate(row.registered_at)}</span>
      ),
    },
    {
      key: 'starts',
      header: 'Event starts',
      render: (row) => (
        <span className="font-mono text-[11px] text-taupe">{formatDateTime(row.starts_at)}</span>
      ),
    },
    {
      key: 'checked_in',
      header: 'Check-in',
      render: (row) =>
        row.checked_in_at ? (
          <span className="font-mono text-[11px] text-forest">{formatDateTime(row.checked_in_at)}</span>
        ) : (
          <span className="text-[11px] text-muted">Not checked in</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Participation"
        title="My registrations"
        description="Active registrations across every event. Withdrawn and rejected records stay in your history but are not listed here."
        actions={
          <Link to="/events">
            <Button variant="outline">Find an event</Button>
          </Link>
        }
      />

      {isLoading ? (
        <Card>
          <SkeletonTable rows={5} />
        </Card>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="No active registrations"
          description="Register for an event and it will appear here with its current status."
          actions={
            <Link to="/events">
              <Button>Browse events</Button>
            </Link>
          }
        />
      ) : (
        <Card padded={false} className="overflow-hidden">
          <DataTable columns={columns} rows={data} rowKey={(row) => row.membership_id} />
        </Card>
      )}
    </div>
  );
}
