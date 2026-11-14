import { apiClient, request } from '../client';
import type { StoredFileRead } from '../types';

/**
 * POST /teams/{id}/files - multipart upload with progress reporting.
 * Accepts JPEG/PNG/WebP up to 10 MB or MP4/WebM/MOV up to 100 MB; the server
 * re-validates content signatures, so client checks are advisory only.
 */
export function uploadTeamFile(
  teamId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<StoredFileRead> {
  const formData = new FormData();
  formData.append('file', file);

  return request.post<StoredFileRead>(`/teams/${teamId}/files`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 180_000,
    onUploadProgress: (event) => {
      if (!onProgress || !event.total) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    },
  });
}

/**
 * GET /teams/{id}/files/{file_id} - requires the Bearer header, so a plain
 * anchor cannot be used. Returns a Blob for preview/download.
 */
export async function downloadTeamFile(teamId: string, fileId: string): Promise<Blob> {
  const response = await apiClient.get<Blob>(`/teams/${teamId}/files/${fileId}`, {
    responseType: 'blob',
  });
  return response.data;
}
