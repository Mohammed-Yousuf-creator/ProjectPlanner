import { useState } from 'react';
import { CalendarClock, Plus } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { ScheduleItemRow } from '@/components/domain/ScheduleItemRow';
import {
  useCancelScheduleItem,
  useCreateScheduleItem,
  useSchedule,
  useUpdateScheduleItem,
} from '@/hooks/useSchedule';
import { formatDateTime, fromDateTimeLocal, groupByLocalDate, toDateTimeLocal } from '@/lib/format';
import { toApiError } from '@/lib/errors';
import type { EventScheduleItemRead } from '@/api/types';

/**
 * Organizer schedule CRUD. `DELETE` soft-cancels an item, and
 * `include_cancelled=true` lets organizers see those cancelled rows.
 */
export function ManageScheduleTab({ eventId }: { eventId: string }) {
  const toast = useToast();
  const schedule = useSchedule(eventId, true);
  const createItem = useCreateScheduleItem(eventId);
  const updateItem = useUpdateScheduleItem(eventId);
  const cancelItem = useCancelScheduleItem(eventId);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EventScheduleItemRead | null>(null);
  const [cancelTarget, setCancelTarget] = useState<EventScheduleItemRead | null>(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    item_type: 'session',
    starts_at: '',
    ends_at: '',
    venue: '',
    meeting_url: '',
  });

  const openCreate = () => {
    setEditing(null);
    setForm({
      title: '',
      description: '',
      item_type: 'session',
      starts_at: '',
      ends_at: '',
      venue: '',
      meeting_url: '',
    });
    createItem.reset();
    updateItem.reset();
    setModalOpen(true);
  };

  const openEdit = (item: EventScheduleItemRead) => {
    setEditing(item);
    setForm({
      title: item.title,
      description: item.description ?? '',
      item_type: item.item_type,
      starts_at: toDateTimeLocal(item.starts_at),
      ends_at: toDateTimeLocal(item.ends_at),
      venue: item.venue ?? '',
      meeting_url: item.meeting_url ?? '',
    });
    createItem.reset();
    updateItem.reset();
    setModalOpen(true);
  };

  const save = () => {
    if (!form.title.trim()) {
      toast.error('A title is required.');
      return;
    }
    const startsAt = fromDateTimeLocal(form.starts_at);
    const endsAt = fromDateTimeLocal(form.ends_at);
    if (!startsAt || !endsAt) {
      toast.error('Both start and end times are required.');
      return;
    }
    if (new Date(endsAt) < new Date(startsAt)) {
      toast.error('The end time must be at or after the start time.');
      return;
    }
    if (form.meeting_url && !/^https?:\/\//i.test(form.meeting_url)) {
      toast.error('The meeting URL must start with http:// or https://');
      return;
    }

    const body = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      item_type: form.item_type.trim() || 'session',
      starts_at: startsAt,
      ends_at: endsAt,
      venue: form.venue.trim() || null,
      meeting_url: form.meeting_url.trim() || null,
    };

    if (editing) {
      updateItem.mutate(
        { itemId: editing.id, body },
        {
          onSuccess: () => {
            toast.success('Schedule updated.');
            setModalOpen(false);
          },
          onError: (error) => toast.error(toApiError(error).message),
        },
      );
    } else {
      createItem.mutate(body, {
        onSuccess: () => {
          toast.success('Schedule item added.');
          setModalOpen(false);
        },
        onError: (error) => toast.error(toApiError(error).message),
      });
    }
  };

  const groups = groupByLocalDate(schedule.data ?? [], (item) => item.starts_at);

  return (
    <Card className="space-y-3">
      <CardHeader
        title="Schedule"
        description="Cancelled items stay visible here but are hidden from participants."
        actions={
          <Button size="sm" onClick={openCreate} icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}>
            Add item
          </Button>
        }
      />

      {schedule.isLoading ? (
        <SkeletonLines lines={5} />
      ) : schedule.isError ? (
        <ErrorState error={schedule.error} onRetry={() => void schedule.refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState
          inline
          icon={CalendarClock}
          title="No schedule items"
          description="Add sessions, keynotes and deadlines so participants know where to be."
          actions={<Button onClick={openCreate}>Add the first item</Button>}
        />
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.key} className="space-y-2">
              <h3 className="font-mono text-[10px] uppercase tracking-wider text-rust">{group.label}</h3>
              {group.items.map((item) => (
                <ScheduleItemRow
                  key={item.id}
                  item={item}
                  actions={
                    <>
                      <Button variant="chip" size="sm" onClick={() => openEdit(item)}>
                        Edit
                      </Button>
                      {item.status !== 'cancelled' && (
                        <Button variant="chip" size="sm" onClick={() => setCancelTarget(item)}>
                          Cancel item
                        </Button>
                      )}
                      <span className="font-mono text-[10px] text-muted">
                        Updated {formatDateTime(item.updated_at)}
                      </span>
                    </>
                  }
                />
              ))}
            </section>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit schedule item' : 'New schedule item'}
        description="Datetimes are entered locally and stored in UTC."
        maxWidth="max-w-xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} loading={createItem.isPending || updateItem.isPending}>
              {editing ? 'Save changes' : 'Add item'}
            </Button>
          </>
        }
      >
        {(createItem.isError || updateItem.isError) && (
          <Alert tone="error" title="Could not save the item">
            {toApiError(createItem.error ?? updateItem.error).message}
          </Alert>
        )}
        <Field label="Title" htmlFor="schedule-title" required>
          <Input
            id="schedule-title"
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Opening keynote"
          />
        </Field>
        <Field label="Item type" htmlFor="schedule-type" hint="Free text, e.g. session, keynote, deadline.">
          <Input
            id="schedule-type"
            value={form.item_type}
            onChange={(event) => setForm((prev) => ({ ...prev, item_type: event.target.value }))}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts at" htmlFor="schedule-starts" required>
            <Input
              id="schedule-starts"
              type="datetime-local"
              value={form.starts_at}
              onChange={(event) => setForm((prev) => ({ ...prev, starts_at: event.target.value }))}
            />
          </Field>
          <Field label="Ends at" htmlFor="schedule-ends" required>
            <Input
              id="schedule-ends"
              type="datetime-local"
              value={form.ends_at}
              onChange={(event) => setForm((prev) => ({ ...prev, ends_at: event.target.value }))}
            />
          </Field>
        </div>
        <Field label="Description" htmlFor="schedule-description">
          <Textarea
            id="schedule-description"
            rows={3}
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Venue" htmlFor="schedule-venue">
            <Input
              id="schedule-venue"
              value={form.venue}
              onChange={(event) => setForm((prev) => ({ ...prev, venue: event.target.value }))}
              placeholder="Hall A"
            />
          </Field>
          <Field
            label="Meeting URL"
            htmlFor="schedule-url"
            hint="http(s) only. Participants open it in a new tab."
          >
            <Input
              id="schedule-url"
              value={form.meeting_url}
              onChange={(event) => setForm((prev) => ({ ...prev, meeting_url: event.target.value }))}
              placeholder="https://meet.example.com/abc"
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => {
          if (!cancelTarget) return;
          cancelItem.mutate(cancelTarget.id, {
            onSuccess: () => {
              toast.success('Schedule item cancelled.');
              setCancelTarget(null);
            },
            onError: (error) => {
              setCancelTarget(null);
              toast.error(toApiError(error).message);
            },
          });
        }}
        title="Cancel this schedule item?"
        description="It disappears from participant views but stays in your console."
        confirmLabel="Cancel item"
        destructive
        loading={cancelItem.isPending}
      >
        <p>“{cancelTarget?.title}” will be marked cancelled. This is a soft delete.</p>
      </ConfirmDialog>
    </Card>
  );
}
