import { useState } from 'react';
import { Download, FolderOpen, MessageSquare, Upload } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { Pagination } from '@/components/ui/Pagination';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { useTeamFiles, useUploadTeamFile, validateTeamFile } from '@/hooks/useTeamFiles';
import { downloadTeamFile } from '@/api/endpoints/teamFiles';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';
import { formatBytes, formatDateTime } from '@/lib/format';
import { toApiError } from '@/lib/errors';
import type { TeamDetailRead, TeamFileRead } from '@/api/types';

/**
 * Team files.
 *
 * Backed by `GET /teams/{id}/files`, which returns every file the team has
 * uploaded — not only those attached to the most recent chat messages — along
 * with the uploader and the message that references it (when any).
 */
export function TeamFilesTab({ team }: { team: TeamDetailRead }) {
  const toast = useToast();
  const [progress, setProgress] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const uploadFile = useUploadTeamFile(team.id);

  const filesQuery = useTeamFiles(team.id, { limit: DEFAULT_PAGE_SIZE, offset });

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
          setOffset(0);
          toast.success(`${stored.original_filename} uploaded.`);
        },
        onError: (error) => {
          setProgress(null);
          toast.error(toApiError(error).message);
        },
      },
    );
  };

  const download = async (file: TeamFileRead) => {
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

  const columns: DataTableColumn<TeamFileRead>[] = [
    {
      key: 'name',
      header: 'File',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{row.original_filename}</p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted">{row.mime_type}</p>
        </div>
      ),
    },
    {
      key: 'kind',
      header: 'Kind',
      render: (row) => (
        <span className="text-[11px] text-taupe">
          {row.mime_type.startsWith('image/')
            ? 'Image'
            : row.mime_type.startsWith('video/')
              ? 'Video'
              : 'File'}
        </span>
      ),
    },
    {
      key: 'size',
      header: 'Size',
      render: (row) => (
        <span className="font-mono text-[11px] text-taupe">{formatBytes(row.size_bytes)}</span>
      ),
    },
    {
      key: 'uploader',
      header: 'Uploaded by',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold text-ink">
            {row.uploaded_by_display_name ?? row.uploaded_by_username ?? 'A teammate'}
          </p>
          {row.message_id && (
            <p className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted">
              <MessageSquare className="h-2.5 w-2.5" aria-hidden="true" />
              In chat
            </p>
          )}
        </div>
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

  const files = filesQuery.data ?? [];

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
                <div
                  className="h-full rounded-lg bg-forest transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="font-mono text-[10px] text-muted">{progress}% uploaded</p>
            </div>
          )}
        </div>
        <Alert tone="info" title="Attach files to a chat message to discuss them">
          Uploading stores the file here. To notify teammates, attach it when you post in team
          chat — files posted that way are tagged “In chat”.
        </Alert>
      </Card>

      <Card padded={false} className="overflow-hidden">
        <div className="border-b border-line-subtle p-5">
          <h3 className="text-sm font-bold text-ink">Shared files</h3>
          <p className="text-[11px] text-taupe">
            Every file this team has uploaded, newest first.
          </p>
        </div>

        {filesQuery.isLoading ? (
          <div className="p-5">
            <SkeletonTable rows={4} />
          </div>
        ) : filesQuery.isError ? (
          <div className="p-5">
            <ErrorState error={filesQuery.error} onRetry={() => void filesQuery.refetch()} />
          </div>
        ) : files.length === 0 ? (
          <div className="p-5">
            <EmptyState
              inline
              icon={FolderOpen}
              title="No files yet"
              description="Upload a design, screenshot or demo video to share it with the team."
            />
          </div>
        ) : (
          <>
            <DataTable columns={columns} rows={files} rowKey={(row) => row.id} className="px-2 pb-2" />
            <div className="border-t border-line-subtle p-4">
              <Pagination
                offset={offset}
                limit={DEFAULT_PAGE_SIZE}
                pageItemCount={files.length}
                onChange={setOffset}
              />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
