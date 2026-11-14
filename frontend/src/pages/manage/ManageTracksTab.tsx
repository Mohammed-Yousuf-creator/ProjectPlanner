import { useState } from 'react';
import { Pencil, Plus, Route, Trash2 } from 'lucide-react';
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
import { useCreateTrack, useDeleteTrack, useEventTracks, useUpdateTrack } from '@/hooks/useTracks';
import { toApiError } from '@/lib/errors';
import type { EventTrackRead } from '@/api/types';

/** Track CRUD. Names are unique per event (server-enforced). */
export function ManageTracksTab({ eventId }: { eventId: string }) {
  const toast = useToast();
  const tracks = useEventTracks(eventId);
  const createTrack = useCreateTrack(eventId);
  const updateTrack = useUpdateTrack(eventId);
  const deleteTrack = useDeleteTrack(eventId);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EventTrackRead | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<EventTrackRead | null>(null);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDescription('');
    createTrack.reset();
    setModalOpen(true);
  };

  const openEdit = (track: EventTrackRead) => {
    setEditing(track);
    setName(track.name);
    setDescription(track.description ?? '');
    updateTrack.reset();
    setModalOpen(true);
  };

  const save = () => {
    if (name.trim().length === 0) {
      toast.error('A track name is required.');
      return;
    }
    if (editing) {
      updateTrack.mutate(
        { trackId: editing.id, body: { name: name.trim(), description: description.trim() || null } },
        {
          onSuccess: () => {
            toast.success('Track updated.');
            setModalOpen(false);
          },
          onError: (error) => toast.error(toApiError(error).message),
        },
      );
    } else {
      createTrack.mutate(
        { name: name.trim(), description: description.trim() || null },
        {
          onSuccess: () => {
            toast.success('Track created.');
            setModalOpen(false);
          },
          onError: (error) => toast.error(toApiError(error).message),
        },
      );
    }
  };

  return (
    <Card className="space-y-3">
      <CardHeader
        title="Tracks"
        description="Tracks are optional categories teams can select for their project."
        actions={
          <Button size="sm" onClick={openCreate} icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}>
            New track
          </Button>
        }
      />

      {tracks.isLoading ? (
        <SkeletonLines lines={4} />
      ) : tracks.isError ? (
        <ErrorState error={tracks.error} onRetry={() => void tracks.refetch()} />
      ) : !tracks.data || tracks.data.length === 0 ? (
        <EmptyState
          inline
          icon={Route}
          title="No tracks yet"
          description="Add tracks if you want projects to be grouped by theme or challenge."
          actions={<Button onClick={openCreate}>Add the first track</Button>}
        />
      ) : (
        <ul className="divide-y divide-line-subtle">
          {tracks.data.map((track) => (
            <li key={track.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-ink">{track.name}</p>
                {track.description ? (
                  <p className="text-[11px] text-taupe">{track.description}</p>
                ) : (
                  <p className="text-[11px] text-muted">No description</p>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="chip"
                  size="sm"
                  icon={<Pencil className="h-3 w-3" aria-hidden="true" />}
                  onClick={() => openEdit(track)}
                >
                  Edit
                </Button>
                <Button
                  variant="chip"
                  size="sm"
                  icon={<Trash2 className="h-3 w-3" aria-hidden="true" />}
                  onClick={() => setDeleteTarget(track)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit track' : 'New track'}
        description="Track names must be unique within the event."
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={save}
              loading={createTrack.isPending || updateTrack.isPending}
            >
              {editing ? 'Save changes' : 'Create track'}
            </Button>
          </>
        }
      >
        {(createTrack.isError || updateTrack.isError) && (
          <Alert tone="error" title="Could not save the track">
            {toApiError(createTrack.error ?? updateTrack.error).message}
          </Alert>
        )}
        <Field label="Name" htmlFor="track-name" required>
          <Input
            id="track-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Climate & sustainability"
          />
        </Field>
        <Field label="Description" htmlFor="track-description">
          <Textarea
            id="track-description"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What kind of projects belong in this track?"
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteTrack.mutate(deleteTarget.id, {
            onSuccess: () => {
              toast.success('Track deleted.');
              setDeleteTarget(null);
            },
            onError: (error) => {
              setDeleteTarget(null);
              toast.error(toApiError(error).message);
            },
          });
        }}
        title="Delete this track?"
        confirmLabel="Delete track"
        destructive
        loading={deleteTrack.isPending}
      >
        <p>Projects already assigned to “{deleteTarget?.name}” keep their record but lose the label.</p>
      </ConfirmDialog>
    </Card>
  );
}
