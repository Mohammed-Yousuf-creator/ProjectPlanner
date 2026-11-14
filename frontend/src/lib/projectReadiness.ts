import type { EventRead, ProjectSubmissionRead } from '@/api/types';
import { isSafeHttpUrl } from './format';

export type ProjectReadiness = {
  /** Rules that will make `POST .../submit` fail if not fixed. */
  blocking: string[];
  /** Non-blocking advisories. */
  advisories: string[];
  ready: boolean;
};

/**
 * Client-side mirror of the server-side submit validations documented in the
 * README: required title, abstract, an HTTP(S) repository URL, team at the
 * event minimum size, and the submission deadline not yet passed.
 *
 * The server is still the authority - this only lets the UI explain problems
 * before the round-trip.
 */
export function reviewProjectReadiness(
  submission: ProjectSubmissionRead,
  event: EventRead,
  teamMemberCount: number,
): ProjectReadiness {
  const blocking: string[] = [];
  const advisories: string[] = [];

  if (!submission.title.trim()) blocking.push('Add a submission title.');
  if (!submission.abstract.trim()) blocking.push('Write an abstract of what you built.');
  if (!submission.repo_url) {
    blocking.push('Add a repository URL — required to submit.');
  } else if (!isSafeHttpUrl(submission.repo_url)) {
    blocking.push('The repository URL must start with http:// or https://.');
  }
  if (submission.demo_url && !isSafeHttpUrl(submission.demo_url)) {
    blocking.push('The demo URL must start with http:// or https://.');
  }
  if (submission.presentation_url && !isSafeHttpUrl(submission.presentation_url)) {
    blocking.push('The presentation URL must start with http:// or https://.');
  }
  if (teamMemberCount < event.min_team_size) {
    blocking.push(
      `Your team needs at least ${event.min_team_size} active members (currently ${teamMemberCount}).`,
    );
  }
  if (event.submission_deadline_at && new Date(event.submission_deadline_at) < new Date()) {
    blocking.push('The submission deadline has passed.');
  }

  if (!submission.tagline) advisories.push('Add a one-line tagline to help judges skim the gallery.');
  if (!submission.demo_url) advisories.push('A live demo link makes the submission easier to evaluate.');
  if (!submission.presentation_url) advisories.push('Consider linking your pitch deck.');

  return { blocking, advisories, ready: blocking.length === 0 };
}
