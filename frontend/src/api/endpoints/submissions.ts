import { request } from '../client';
import type {
  ProjectSubmissionCreate,
  ProjectSubmissionRead,
  ProjectSubmissionUpdate,
} from '../types';

export function createSubmission(
  projectId: string,
  body?: ProjectSubmissionCreate,
): Promise<ProjectSubmissionRead> {
  return request.post<ProjectSubmissionRead>(`/projects/${projectId}/submissions`, body ?? {});
}

export function getProjectSubmissions(projectId: string): Promise<ProjectSubmissionRead[]> {
  return request.get<ProjectSubmissionRead[]>(`/projects/${projectId}/submissions`);
}

export function updateSubmission(
  projectId: string,
  submissionId: string,
  body: ProjectSubmissionUpdate,
): Promise<ProjectSubmissionRead> {
  return request.patch<ProjectSubmissionRead>(
    `/projects/${projectId}/submissions/${submissionId}`,
    body,
  );
}

export function submitSubmission(
  projectId: string,
  submissionId: string,
): Promise<ProjectSubmissionRead> {
  return request.post<ProjectSubmissionRead>(
    `/projects/${projectId}/submissions/${submissionId}/submit`,
  );
}
