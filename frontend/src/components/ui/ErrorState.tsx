import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { toApiError } from '@/lib/errors';

export type ErrorStateProps = {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  /** Optional extra action, e.g. "Back to events". */
  extraActions?: React.ReactNode;
};

/**
 * Standard error card for every data view. Distinguishes 401/403/404 from
 * transient failures so the copy always tells the truth.
 */
export function ErrorState({ error, title, onRetry, extraActions }: ErrorStateProps) {
  const apiError = toApiError(error);
  const heading =
    title ??
    (apiError.status === 403
      ? "You don't have access"
      : apiError.status === 404
        ? 'Not found'
        : 'Something went wrong');

  return (
    <EmptyState
      icon={AlertTriangle}
      title={heading}
      description={apiError.message}
      actions={
        <>
          {onRetry && (
            <Button
              variant="outline"
              onClick={onRetry}
              icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              Retry
            </Button>
          )}
          {extraActions}
        </>
      }
    />
  );
}
