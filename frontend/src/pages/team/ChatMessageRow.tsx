import { useState } from 'react';
import { Download, FileText, Film, ImageIcon, Pencil, Trash2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { downloadTeamFile } from '@/api/endpoints/teamFiles';
import { formatBytes, formatDateTime, formatRelative } from '@/lib/format';
import { toApiError } from '@/lib/errors';
import type { StoredFileRead, TeamMessageRead } from '@/api/types';

export function ChatMessageRow({
  message,
  teamId,
  canModerate,
  isMine,
  onEdit,
  onDelete,
  editing,
  savingEdit,
}: {
  message: TeamMessageRead;
  teamId: string;
  canModerate: boolean;
  isMine: boolean;
  onEdit: (body: string) => void;
  onDelete: () => void;
  editing: boolean;
  savingEdit: boolean;
}) {
  const [draft, setDraft] = useState(message.body ?? '');
  const deleted = message.deleted_at !== null;

  return (
    <div className="flex items-start gap-2.5 py-3">
      <Avatar name={message.sender.display_name} username={message.sender.username} src={message.sender.avatar_url} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-ink">{message.sender.display_name}</span>
          <span className="font-mono text-[10px] text-muted">@{message.sender.username}</span>
          <span className="font-mono text-[10px] text-muted" title={formatDateTime(message.created_at)}>
            {formatRelative(message.created_at)}
          </span>
          {message.edited_at && !deleted && (
            <span className="font-mono text-[10px] italic text-muted">edited</span>
          )}
        </div>

        {deleted ? (
          <p className="mt-1 text-[11px] italic text-muted">Message deleted</p>
        ) : editing ? (
          <div className="mt-1.5 flex items-end gap-2">
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label="Edit message"
              autoFocus
            />
            <Button
              size="sm"
              loading={savingEdit}
              disabled={draft.trim().length === 0}
              onClick={() => onEdit(draft.trim())}
            >
              Save
            </Button>
          </div>
        ) : (
          message.body && (
            <p className="mt-1 whitespace-pre-line break-words text-xs leading-relaxed text-ink">
              {message.body}
            </p>
          )
        )}

        {!deleted && message.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.attachments.map((attachment) => (
              <AttachmentChip key={attachment.id} file={attachment} teamId={teamId} />
            ))}
          </div>
        )}

        {!deleted && (isMine || canModerate) && (
          <div className="mt-1 flex items-center gap-1">
            {isMine && !editing && (
              <Button
                variant="chip"
                size="sm"
                icon={<Pencil className="h-3 w-3" aria-hidden="true" />}
                onClick={() => onEdit('__start__')}
              >
                Edit
              </Button>
            )}
            <Button
              variant="chip"
              size="sm"
              icon={<Trash2 className="h-3 w-3" aria-hidden="true" />}
              onClick={onDelete}
            >
              Delete
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Downloads go through axios because `GET /teams/{id}/files/{file_id}` needs the
 * Bearer header. Blob URLs are revoked after the browser starts the download.
 */
function AttachmentChip({ file, teamId }: { file: StoredFileRead; teamId: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const isImage = file.mime_type.startsWith('image/');
  const isVideo = file.mime_type.startsWith('video/');

  const handleDownload = async () => {
    setBusy(true);
    try {
      const blob = await downloadTeamFile(teamId, file.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.original_filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (error) {
      toast.error(toApiError(error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleDownload()}
      disabled={busy}
      className="inline-flex max-w-full items-center gap-2 rounded-xl border border-line bg-canvas px-2.5 py-1.5 text-left transition-colors hover:bg-hover-stone disabled:opacity-60"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-taupe">
        {isImage ? (
          <ImageIcon className="h-3 w-3" aria-hidden="true" />
        ) : isVideo ? (
          <Film className="h-3 w-3" aria-hidden="true" />
        ) : (
          <FileText className="h-3 w-3" aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block max-w-[12rem] truncate text-[11px] font-semibold text-ink">
          {file.original_filename}
        </span>
        <span className="block font-mono text-[10px] text-muted">{formatBytes(file.size_bytes)}</span>
      </span>
      <Download className="h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
    </button>
  );
}
