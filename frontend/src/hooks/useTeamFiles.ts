import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listTeamFiles, uploadTeamFile } from '@/api/endpoints/teamFiles';
import type { StoredFileRead, TeamFileListParams } from '@/api/types';

export const teamFileKeys = {
  list: (teamId: string, params: TeamFileListParams) =>
    ['team', teamId, 'files', params] as const,
};

/**
 * Team files, newest first. Backed by `GET /teams/{id}/files`, so the Files tab
 * no longer derives its list from chat messages.
 */
export function useTeamFiles(teamId: string | undefined, params: TeamFileListParams = {}) {
  return useQuery({
    queryKey: teamFileKeys.list(teamId ?? '', params),
    queryFn: () => listTeamFiles(teamId as string, params),
    enabled: Boolean(teamId),
    retry: 0,
  });
}

export function useUploadTeamFile(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      onProgress,
    }: {
      file: File;
      onProgress?: (percent: number) => void;
    }): Promise<StoredFileRead> => uploadTeamFile(teamId, file, onProgress),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team', teamId, 'files'] });
    },
  });
}

/** Client-side mirror of the server rules; the server remains authoritative. */
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export type FileValidationResult = { ok: true } | { ok: false; message: string };

/** Mirrors README Phase 5 rules: JPEG/PNG/WebP <=10MB, MP4/WebM/MOV <=100MB. */
export function validateTeamFile(file: File): FileValidationResult {
  const isImage = (IMAGE_MIME_TYPES as readonly string[]).includes(file.type);
  const isVideo = (VIDEO_MIME_TYPES as readonly string[]).includes(file.type);

  if (!isImage && !isVideo) {
    return {
      ok: false,
      message: 'Only JPEG, PNG or WebP images, and MP4, WebM or MOV videos are supported.',
    };
  }
  if (isImage && file.size > MAX_IMAGE_BYTES) {
    return { ok: false, message: 'Images must be 10 MB or smaller.' };
  }
  if (isVideo && file.size > MAX_VIDEO_BYTES) {
    return { ok: false, message: 'Videos must be 100 MB or smaller.' };
  }
  return { ok: true };
}
