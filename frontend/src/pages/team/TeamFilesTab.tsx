import { useMemo, useState } from 'react';
import { Download, FileWarning, FolderOpen, Upload } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { useTeamMessages } from '@/hooks/useTeamMessages';
import { useUploadTeamFile, validateTeamFile } from '@/hooks/useTeamFiles';
import { downloadTeamFile } from '@/api/endpoints/teamFiles';
import { formatBytes, formatDateTime, humanizeEnum } from '@/lib/format';
import { toApiError } from '@/lib/errors';
import type { StoredFileRead, TeamDetailRead } from '@/api/types';

/**
 * There is NO "list team files" endpoint (see Backend_missing.md), so this tab
 * only (a) uploads new files and (b) lists files discovered from chat
 * attachments. Nothing is invented.
 */
export function TeamFilesTab({ team }: { team: TeamDetailRead }) {
  const toast = useToast();
  const [progress, setProgress] = useState<number | null>(null);
  const uploadFile = useUploadTeamFile(team.id);
  const messagesQuery = useTeamMessages(team.id, { limit: 100, offset: 0 });

  const files = useMemo<StoredFileRead[]>(() => {
    const seen = new Map<string, StoredFileRead>();
    for (const message of messagesQuery.data ?? []) {
      for (const file of message.attachments) {
        if (!seen.has(file.id)) seen.set(file.id, file);
      }
    }
    return [...seen.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [messagesQuery.data]);

  const handleUpload = async (file: File) => {
    const validation = validateTeamFile(file);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }
    setProgress(0);
    uploadFile.mutate(
      { file, onProgress: setProgress },
      {
        onSuccess: (stored) => {
          setProgress(null);
          toast.success(`${stored.original_filename} uploaded. Attach it to a chat message to share it.`);
        },
        onError: (error) => {
          setProgress(null);
          toast.error(toApiError(error).message);
        },
      },
    );
  };

  const columns: DataTableColumn<StoredFileRead>[] = [
    {
      key: 'name',
      header: 'File',
      render: (row) => (
        <div>
          <p className="font-semibold text-ink">{row.original_filename}</p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted">{row.mime_type}</p>
        </div>
      ),
    },
    {
      key: 'size',
      header: 'Size',
      render: (row) => <span className="font-mono text-[11px] text-taupe">{formatBytes(row.size_bytes)}</span>,
    },
    {
      key: 'kind',
      header: 'Kind',
      render: (row) => (
        <span className="text-[11px] text-taupe">
          {row.mime_type.startsWith('image/') ? 'Image' : 'Video'}
        </span>
      ),
    },
    {
      key: 'uploaded',
      header: 'Uploaded',
      render: (row) => (
        <span className="font-mono text-[11px] text-taupe">{formatDateTime(row.created_at)}</span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <Button
          variant="chip"
          size="sm"
          icon={<Download className="h-3 w-3" aria-hidden="true" />}
          onClick={() => void download(row)}
        >
          Download
        </Button>
      ),
    },
  ];

  const download = async (file: StoredFileRead) => {
    try {
      const blob = await downloadTeamFile(team.id, file.id);
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
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <CardHeader
          title="Upload a file"
          description="Images: JPEG, PNG, WebP up to 10 MB. Videos: MP4, WebM, MOV up to 100 MB."
        />
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-forest px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-forest-dark focus-within:ring-1 focus-within:ring-forest">
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            {uploadFile.isPending ? 'Uploading…' : 'Choose a file'}
            <input
              type="file"
              className="sr-only"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleUpload(file);
                event.target.value = '';
              }}
            />
          </label>
          {progress !== null && (
            <div className="min-w-[10rem] flex-1 space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded-lg bg-fill">
                <div className="h-full rounded-lg bg-forest transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="font-mono text-[10px] text-muted">{progress}% uploaded</p>
            </div>
          )}
        </div>
        <Alert tone="info" title="Files are shared through chat">
          There is no standalone team file listing in the API. Uploaded files appear here once they
          are attached to a chat message; upload, then attach the file when you post it.
        </Alert>
      </Card>

      <Card padded={false} className="overflow-hidden">
        <div className="border-b border-line-subtle p-5">
          <h3 className="text-sm font-bold text-ink">Shared files</h3>
          <p className="text-[11px] text-taupe">
            Discovered from the last 100 chat messages ({humanizeEnum('attachments')}).
          </p>
        </div>
        {messagesQuery.isLoading ? (
          <div className="p-5">
            <SkeletonTable rows={4} />
          </div>
        ) : messagesQuery.isError ? (
          <div className="p-5">
            <EmptyState
              inline
              icon={FileWarning}
              title="Could not load shared files"
              description={toApiError(messagesQuery.error).message}
              actions={
                <Button variant="outline" onClick={() => void messagesQuery.refetch()}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : files.length === 0 ? (
          <div className="p-5">
            <EmptyState
              inline
              icon={FolderOpen}
              title="No files shared yet"
              description="Upload a file and attach it to a chat message — it will be listed here."
            />
          </div>
        ) : (
          <DataTable columns={columns} rows={files} rowKey={(row) => row.id} className="px-2 pb-2" />
        )}
      </Card>
    </div>
  );
}
