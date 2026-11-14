import { useState } from 'react';
import { CalendarCheck2, Check, Undo2 } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { PageNumberPagination } from '@/components/ui/Pagination';
import { useToast } from '@/components/ui/Toast';
import { useCheckInActions, useCheckInSummary, useCheckIns } from '@/hooks/useCheckIns';
import { formatDateTime, formatRelative } from '@/lib/format';
import { toApiError } from '@/lib/errors';
import type { CheckInAttendeeRead } from '@/api/types';

const PAGE_SIZE = 20;

/**
 * Attendance management. This endpoint pages with 1-based `page`/`page_size`,
 * not the limit/offset used elsewhere.
 */
export function ManageCheckInTab({ eventId }: { eventId: string }) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [checkedInFilter, setCheckedInFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');

  const summary = useCheckInSummary(eventId);
  const list = useCheckIns(eventId, {
    page,
    page_size: PAGE_SIZE,
    search: search || undefined,
    checked_in: checkedInFilter === '' ? undefined : checkedInFilter === 'true',
  });
  const { checkIn, undo } = useCheckInActions(eventId);

  const columns: DataTableColumn<CheckInAttendeeRead>[] = [
    {
      key: 'attendee',
      header: 'Attendee',
      render: (row) => (
        <div>
          <p className="font-semibold text-ink">{row.display_name ?? row.username}</p>
          <p className="text-[11px] text-taupe">
            @{row.username} · {row.email}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Registration',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'checked',
      header: 'Check-in',
      render: (row) =>
        row.checked_in_at ? (
          <span className="font-mono text-[11px] text-forest">{formatDateTime(row.checked_in_at)}</span>
        ) : (
          <span className="text-[11px] text-muted">Not checked in</span>
        ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) =>
        row.checked_in_at ? (
          <Button
            variant="chip"
            size="sm"
            icon={<Undo2 className="h-3 w-3" aria-hidden="true" />}
            loading={undo.isPending}
            onClick={() =>
              undo.mutate(row.user_id, {
                onSuccess: () => toast.info('Check-in undone.'),
                onError: (error) => toast.error(toApiError(error).message),
              })
            }
          >
            Undo
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            icon={<Check className="h-3 w-3" aria-hidden="true" />}
            loading={checkIn.isPending}
            onClick={() =>
              checkIn.mutate(row.user_id, {
                onSuccess: () => toast.success(`${row.display_name ?? row.username} checked in.`),
                onError: (error) => toast.error(toApiError(error).message),
              })
            }
          >
            Check in
          </Button>
        ),
    },
  ];

  const summaryData = summary.data;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile label="Eligible" value={summaryData?.total_eligible_registrations} />
        <MetricTile label="Checked in" value={summaryData?.total_checked_in} accent />
        <MetricTile label="Not checked in" value={summaryData?.total_not_checked_in} />
        <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Attendance</p>
          <p className="mt-1 font-mono text-2xl font-bold text-forest">
            {summaryData ? `${summaryData.attendance_percentage.toFixed(1)}%` : '—'}
          </p>
          {summary.isError && (
            <p className="text-[10px] text-red-800">{toApiError(summary.error).message}</p>
          )}
        </div>
      </div>

      <Card padded={false} className="overflow-hidden">
        <div className="space-y-3 p-5">
          <CardHeader
            title="Check-in desk"
            description="Duplicate check-ins are rejected by the server; the message is shown verbatim."
          />
          <div className="flex flex-wrap items-end gap-2 pt-1">
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setSearch(searchDraft.trim());
                setPage(1);
              }}
            >
              <Input
                aria-label="Search attendees"
                placeholder="Search name, username or email…"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                className="max-w-xs"
              />
              <Button type="submit" variant="outline" size="sm">
                Search
              </Button>
            </form>
            <Select
              aria-label="Filter by check-in status"
              className="w-44"
              value={checkedInFilter}
              onChange={(event) => {
                setCheckedInFilter(event.target.value);
                setPage(1);
              }}
              placeholder="Everyone"
              options={[
                { value: 'true', label: 'Checked in' },
                { value: 'false', label: 'Not checked in' },
              ]}
            />
          </div>
        </div>

        {list.isLoading ? (
          <div className="px-5 pb-5">
            <SkeletonTable rows={5} />
          </div>
        ) : list.isError ? (
          <div className="px-5 pb-5">
            <ErrorState error={list.error} onRetry={() => void list.refetch()} />
          </div>
        ) : !list.data || list.data.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              inline
              icon={CalendarCheck2}
              title="No attendees match"
              description="Only registered and approved participants are eligible for check-in."
            />
          </div>
        ) : (
          <>
            <DataTable columns={columns} rows={list.data} rowKey={(row) => row.user_id} className="px-2" />
            <div className="border-t border-line-subtle p-4">
              <PageNumberPagination
                page={page}
                pageSize={PAGE_SIZE}
                pageItemCount={list.data.length}
                onChange={setPage}
              />
            </div>
          </>
        )}
      </Card>

      <p className="text-[11px] text-muted">
        Last check-in:{' '}
        <span className="font-mono">
          {summaryData ? formatRelative(new Date().toISOString()) : '—'}
        </span>{' '}
        — the summary endpoint returns aggregate totals only, so this reflects the current session.
      </p>
    </div>
  );
}

function MetricTile({ label, value, accent }: { label: string; value?: number; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-bold ${accent ? 'text-forest' : 'text-ink'}`}>
        {value ?? '—'}
      </p>
    </div>
  );
}
