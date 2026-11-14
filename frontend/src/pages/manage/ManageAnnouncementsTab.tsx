import { useState } from 'react';
import { Megaphone, Pencil, Plus, Send, Undo2 } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import {
  useAnnouncementAction,
  useAnnouncements,
  useCreateAnnouncement,
  useUpdateAnnouncement,
} from '@/hooks/useAnnouncements';
import { useEventTeams } from '@/hooks/useTeams';
import { ANNOUNCEMENT_AUDIENCES } from '@/lib/constants';
import { formatRelative, humanizeEnum } from '@/lib/format';
import { toApiError } from '@/lib/errors';
import type { AnnouncementRead } from '@/api/types';

/**
 * Audience targeting rules come straight from the backend:
 * `audience_type` ∈ all|participants|judges|mentors|team, and `target_team_id`
 * is mandatory for `team` and must be null otherwise.
 */
export function ManageAnnouncementsTab({ eventId }: { eventId: string }) {
  const toast = useToast();
  const announcements = useAnnouncements(eventId);
  const teams = useEventTeams(eventId);
  const createAnnouncement = useCreateAnnouncement(eventId);
  const updateAnnouncement = useUpdateAnnouncement(eventId);
  const action = useAnnouncementAction(eventId);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AnnouncementRead | null>(null);
  const [publishTarget, setPublishTarget] = useState<AnnouncementRead | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<AnnouncementRead | null>(null);

  const [form, setForm] = useState({
    title: '',
    body: '',
    audience_type: 'all',
    target_team_id: '',
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', body: '', audience_type: 'all', target_team_id: '' });
    createAnnouncement.reset();
    updateAnnouncement.reset();
    setModalOpen(true);
  };

  const openEdit = (announcement: AnnouncementRead) => {
    setEditing(announcement);
    setForm({
      title: announcement.title,
      body: announcement.body,
      audience_type: announcement.audience_type,
      target_team_id: announcement.target_team_id ?? '',
    });
    createAnnouncement.reset();
    updateAnnouncement.reset();
    setModalOpen(true);
  };

  const save = () => {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error('A title and body are both required.');
      return;
    }
    if (form.audience_type === 'team' && !form.target_team_id) {
      toast.error('Choose the team that should receive this announcement.');
      return;
    }

    const payload = {
      title: form.title.trim(),
      body: form.body.trim(),
      audience_type: form.audience_type,
      target_team_id: form.audience_type === 'team' ? form.target_team_id : null,
    };

    if (editing) {
      updateAnnouncement.mutate(
        { id: editing.id, body: payload },
        {
          onSuccess: () => {
            toast.success('Draft updated.');
            setModalOpen(false);
          },
          onError: (error) => toast.error(toApiError(error).message),
        },
      );
    } else {
      createAnnouncement.mutate(payload, {
        onSuccess: () => {
          toast.success('Draft created. Publish it to notify recipients.');
          setModalOpen(false);
        },
        onError: (error) => toast.error(toApiError(error).message),
      });
    }
  };

  return (
    <Card className="space-y-3">
      <CardHeader
        title="Announcements"
        description="Publishing dispatches in-app notifications to the resolved audience and is irreversible."
        actions={
          <Button size="sm" onClick={openCreate} icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}>
            New draft
          </Button>
        }
      />

      {announcements.isLoading ? (
        <SkeletonLines lines={5} />
      ) : announcements.isError ? (
        <ErrorState error={announcements.error} onRetry={() => void announcements.refetch()} />
      ) : !announcements.data || announcements.data.length === 0 ? (
        <EmptyState
          inline
          icon={Megaphone}
          title="No announcements yet"
          description="Draft an update, then publish it when you are ready to notify recipients."
          actions={<Button onClick={openCreate}>Write the first announcement</Button>}
        />
      ) : (
        <div className="space-y-2">
          {announcements.data.map((announcement) => (
            <article key={announcement.id} className="rounded-xl border border-line-subtle bg-white p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={announcement.status} />
                  <Badge variant="category">{humanizeEnum(announcement.audience_type)}</Badge>
                  {announcement.published_at && (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                      Published {formatRelative(announcement.published_at)}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {announcement.status === 'draft' && (
                    <>
                      <Button
                        variant="chip"
                        size="sm"
                        icon={<Pencil className="h-3 w-3" aria-hidden="true" />}
                        onClick={() => openEdit(announcement)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        icon={<Send className="h-3 w-3" aria-hidden="true" />}
                        onClick={() => setPublishTarget(announcement)}
                      >
                        Publish
                      </Button>
                    </>
                  )}
                  {announcement.status === 'published' && (
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<Undo2 className="h-3 w-3" aria-hidden="true" />}
                      onClick={() => setWithdrawTarget(announcement)}
                    >
                      Withdraw
                    </Button>
                  )}
                </div>
              </div>
              <h3 className="mt-1.5 text-xs font-bold text-ink">{announcement.title}</h3>
              <p className="whitespace-pre-line text-[11px] leading-relaxed text-taupe">
                {announcement.body}
              </p>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit draft' : 'New announcement'}
        description="Only drafts are editable. Published announcements are immutable."
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} loading={createAnnouncement.isPending || updateAnnouncement.isPending}>
              {editing ? 'Save draft' : 'Create draft'}
            </Button>
          </>
        }
      >
        {(createAnnouncement.isError || updateAnnouncement.isError) && (
          <Alert tone="error" title="Could not save the draft">
            {toApiError(createAnnouncement.error ?? updateAnnouncement.error).message}
          </Alert>
        )}
        <Field label="Title" htmlFor="announcement-title" required>
          <Input
            id="announcement-title"
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          />
        </Field>
        <Field label="Body" htmlFor="announcement-body" required>
          <Textarea
            id="announcement-body"
            rows={4}
            value={form.body}
            onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))}
          />
        </Field>
        <Field label="Audience" htmlFor="announcement-audience" required>
          <Select
            id="announcement-audience"
            value={form.audience_type}
            onChange={(event) => setForm((prev) => ({ ...prev, audience_type: event.target.value }))}
            options={ANNOUNCEMENT_AUDIENCES.map((option) => ({ value: option.value, label: option.label }))}
          />
        </Field>
        {form.audience_type === 'team' && (
          <Field label="Target team" htmlFor="announcement-team" required>
            <Select
              id="announcement-team"
              value={form.target_team_id}
              onChange={(event) => setForm((prev) => ({ ...prev, target_team_id: event.target.value }))}
              placeholder="Select a team"
              options={(teams.data ?? []).map((team) => ({ value: team.id, label: team.name }))}
            />
          </Field>
        )}
        <p className="text-[11px] text-muted">
          Publishing resolves recipients by role and dispatches one notification per recipient.
        </p>
      </Modal>

      <ConfirmDialog
        open={Boolean(publishTarget)}
        onClose={() => setPublishTarget(null)}
        onConfirm={() => {
          if (!publishTarget) return;
          action.mutate(
            { id: publishTarget.id, action: 'publish' },
            {
              onSuccess: () => {
                toast.success('Announcement published and recipients notified.');
                setPublishTarget(null);
              },
              onError: (error) => {
                setPublishTarget(null);
                toast.error(toApiError(error).message);
              },
            },
          );
        }}
        title="Publish this announcement?"
        description="Notifies recipients immediately."
        confirmLabel="Publish and notify"
        loading={action.isPending}
      >
        <p>
          Recipients are resolved from the audience “{humanizeEnum(publishTarget?.audience_type)}”. A
          published announcement cannot be edited afterwards — only withdrawn.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(withdrawTarget)}
        onClose={() => setWithdrawTarget(null)}
        onConfirm={() => {
          if (!withdrawTarget) return;
          action.mutate(
            { id: withdrawTarget.id, action: 'withdraw' },
            {
              onSuccess: () => {
                toast.info('Announcement withdrawn.');
                setWithdrawTarget(null);
              },
              onError: (error) => {
                setWithdrawTarget(null);
                toast.error(toApiError(error).message);
              },
            },
          );
        }}
        title="Withdraw this announcement?"
        confirmLabel="Withdraw"
        destructive
        loading={action.isPending}
      >
        <p>Notifications already delivered stay in recipients' inboxes.</p>
      </ConfirmDialog>
    </Card>
  );
}
