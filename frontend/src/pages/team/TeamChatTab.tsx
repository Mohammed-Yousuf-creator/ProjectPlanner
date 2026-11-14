import { useEffect, useMemo, useRef, useState } from 'react';
import { MessagesSquare, Paperclip, Send, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import {
  useCreateTeamMessage,
  useDeleteTeamMessage,
  useTeamMessages,
  useUpdateTeamMessage,
} from '@/hooks/useTeamMessages';
import { useUploadTeamFile, validateTeamFile } from '@/hooks/useTeamFiles';
import { canManageTeam } from '@/lib/permissions';
import { toApiError } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';
import type { StoredFileRead, TeamDetailRead, TeamMemberInfo, TeamMessageRead } from '@/api/types';
import { ChatMessageRow } from './ChatMessageRow';

const PAGE_SIZE = 50;

/**
 * Chat history is chronological (oldest first) with limit/offset, so paging
 * forwards with `offset` loads later messages. We auto-scroll to the newest.
 */
export function TeamChatTab({
  team,
  membership,
}: {
  team: TeamDetailRead;
  membership: TeamMemberInfo | null;
}) {
  const toast = useToast();
  const userId = useAuthStore((state) => state.user?.id);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [body, setBody] = useState('');
  const [attachment, setAttachment] = useState<StoredFileRead | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamMessageRead | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const messagesQuery = useTeamMessages(team.id, { limit, offset: 0 });
  const createMessage = useCreateTeamMessage(team.id);
  const updateMessage = useUpdateTeamMessage(team.id);
  const deleteMessage = useDeleteTeamMessage(team.id);
  const uploadFile = useUploadTeamFile(team.id);

  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);
  const canModerate = canManageTeam(membership);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, messagesQuery.dataUpdatedAt]);

  const handleFilePick = (file: File) => {
    const validation = validateTeamFile(file);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }
    setUploadProgress(0);
    uploadFile.mutate(
      { file, onProgress: setUploadProgress },
      {
        onSuccess: (stored) => {
          setAttachment(stored);
          setUploadProgress(null);
        },
        onError: (error) => {
          setUploadProgress(null);
          toast.error(toApiError(error).message);
        },
      },
    );
  };

  const send = () => {
    const trimmed = body.trim();
    if (!trimmed && !attachment) {
      toast.error('Write a message or attach a file.');
      return;
    }
    createMessage.mutate(
      {
        body: trimmed || null,
        attachment_ids: attachment ? [attachment.id] : null,
      },
      {
        onSuccess: () => {
          setBody('');
          setAttachment(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
        },
        onError: (error) => toast.error(toApiError(error).message),
      },
    );
  };

  return (
    <Card className="space-y-3" padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle px-5 py-3">
        <div>
          <h3 className="text-sm font-bold text-ink">Team chat</h3>
          <p className="text-[11px] text-taupe">
            Messages are permanent. Deleted messages keep a placeholder for context.
          </p>
        </div>
        {messages.length >= limit && (
          <Button variant="chip" size="sm" onClick={() => setLimit((value) => value + PAGE_SIZE)}>
            Load earlier messages
          </Button>
        )}
      </div>

      <div className="max-h-[28rem] overflow-y-auto px-5">
        {messagesQuery.isLoading ? (
          <SkeletonLines lines={6} />
        ) : messagesQuery.isError ? (
          <ErrorState error={messagesQuery.error} onRetry={() => void messagesQuery.refetch()} />
        ) : messages.length === 0 ? (
          <EmptyState
            inline
            icon={MessagesSquare}
            title="No messages yet"
            description="Say hello — your teammates see new messages instantly."
          />
        ) : (
          <div className="divide-y divide-line-subtle">
            {messages.map((message) => (
              <ChatMessageRow
                key={message.id}
                message={message}
                teamId={team.id}
                canModerate={canModerate}
                isMine={message.sender.user_id === userId}
                editing={editingId === message.id}
                savingEdit={updateMessage.isPending}
                onEdit={(nextBody) => {
                  if (nextBody === '__start__') {
                    setEditingId(message.id);
                    return;
                  }
                  updateMessage.mutate(
                    { messageId: message.id, body: { body: nextBody } },
                    {
                      onSuccess: () => {
                        setEditingId(null);
                        toast.success('Message updated.');
                      },
                      onError: (error) => toast.error(toApiError(error).message),
                    },
                  );
                }}
                onDelete={() => setDeleteTarget(message)}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-line-subtle px-5 py-3">
        {attachment && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-canvas px-3 py-2">
            <p className="truncate text-[11px] text-taupe">
              Attached: <span className="font-semibold text-ink">{attachment.original_filename}</span>
            </p>
            <button
              type="button"
              aria-label="Remove attachment"
              onClick={() => {
                setAttachment(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="rounded-lg p-1 text-muted transition-colors hover:text-ink"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        {uploadProgress !== null && (
          <div className="space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-lg bg-fill">
              <div
                className="h-full rounded-lg bg-forest transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="font-mono text-[10px] text-muted">Uploading {uploadProgress}%</p>
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleFilePick(file);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            aria-label="Attach a file"
            icon={<Paperclip className="h-3.5 w-3.5" aria-hidden="true" />}
            onClick={() => fileInputRef.current?.click()}
            loading={uploadFile.isPending}
          >
            Attach
          </Button>
          <Textarea
            rows={2}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write a message…"
            className="flex-1"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
          />
          <Button
            onClick={send}
            loading={createMessage.isPending}
            icon={<Send className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            Send
          </Button>
        </div>
        <p className="text-[10px] text-muted">
          Enter to send · Shift+Enter for a new line · JPEG/PNG/WebP up to 10 MB, MP4/WebM/MOV up to
          100 MB.
        </p>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMessage.mutate(deleteTarget.id, {
            onSuccess: () => {
              toast.success('Message deleted.');
              setDeleteTarget(null);
            },
            onError: (error) => {
              setDeleteTarget(null);
              toast.error(toApiError(error).message);
            },
          });
        }}
        title="Delete this message?"
        description="The text is masked for everyone; a placeholder keeps the thread readable."
        confirmLabel="Delete message"
        destructive
        loading={deleteMessage.isPending}
      >
        <p>The message body is replaced with “Message deleted”. Attachments stay in team history.</p>
      </ConfirmDialog>
    </Card>
  );
}
