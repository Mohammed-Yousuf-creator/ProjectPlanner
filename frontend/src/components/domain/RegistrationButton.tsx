import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Alert } from '@/components/ui/Alert';
import { useToast } from '@/components/ui/Toast';
import { useRegisterForEvent, useWithdrawFromEvent } from '@/hooks/useRegistrations';
import { useAuthStore } from '@/stores/authStore';
import { getRegistrationAvailability, isActiveRegistrationStatus, canWithdraw } from '@/lib/registration';
import { errorMessage, toApiError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import type { EventRead } from '@/api/types';

export type RegistrationButtonProps = {
  event: EventRead;
  /** The caller's current registration status for this event, if known. */
  registrationStatus?: string | null;
  /** Where the "already registered" link should point. */
  manageHref?: string;
};

/**
 * Register / withdraw control for a public event page. Button state is driven by
 * the API result and the event's timing fields - never by optimistic guessing.
 */
export function RegistrationButton({
  event,
  registrationStatus,
  manageHref,
}: RegistrationButtonProps) {
  const toast = useToast();
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken));
  const register = useRegisterForEvent(event.id);
  const withdraw = useWithdrawFromEvent(event.id);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const availability = getRegistrationAvailability(event);

  if (!isAuthenticated) {
    return (
      <div className="space-y-2">
        <Link to={`/login?next=${encodeURIComponent(`/events/${event.id}`)}`}>
          <Button size="md">Sign in to register</Button>
        </Link>
        <p className="text-[11px] text-muted">
          Registration takes one click once you have an account.
        </p>
      </div>
    );
  }

  if (registrationStatus === 'rejected') {
    return (
      <Alert tone="error" title="Registration rejected">
        Your registration was previously rejected. Contact the organizers if you believe this is a
        mistake.
      </Alert>
    );
  }

  if (isActiveRegistrationStatus(registrationStatus)) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            {registrationStatus === 'waitlisted' ? 'You are on the waitlist' : 'You are registered'}
          </span>
          {manageHref && (
            <Link to={manageHref}>
              <Button variant="outline" size="sm">
                View my registration
              </Button>
            </Link>
          )}
          {canWithdraw(registrationStatus) && (
            <Button
              variant="outline"
              size="sm"
              icon={<LogOut className="h-3.5 w-3.5" aria-hidden="true" />}
              onClick={() => setConfirmWithdraw(true)}
            >
              Withdraw
            </Button>
          )}
        </div>
        {inlineError && <p className="text-[11px] font-medium text-red-800">{inlineError}</p>}

        <ConfirmDialog
          open={confirmWithdraw}
          onClose={() => setConfirmWithdraw(false)}
          onConfirm={() => {
            setInlineError(null);
            withdraw.mutate(undefined, {
              onSuccess: () => {
                setConfirmWithdraw(false);
                toast.success('Your registration was withdrawn.');
              },
              onError: (error) => {
                setConfirmWithdraw(false);
                setInlineError(errorMessage(error));
              },
            });
          }}
          title="Withdraw from this event?"
          description="Your seat is released. You can register again later while registration stays open."
          confirmLabel="Withdraw registration"
          destructive
          loading={withdraw.isPending}
        >
          <p>
            The backend keeps your registration history, and re-registering reactivates the same
            record rather than creating a duplicate.
          </p>
        </ConfirmDialog>
      </div>
    );
  }

  if (availability.state !== 'open') {
    return (
      <div className="space-y-2">
        <Button disabled icon={<Clock className="h-3.5 w-3.5" aria-hidden="true" />}>
          Registration unavailable
        </Button>
        <p className="text-[11px] text-taupe">
          {availability.state === 'not-open-yet'
            ? `Registration opens ${formatDateTime(availability.opensAt)}.`
            : availability.reason}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        loading={register.isPending}
        onClick={() => {
          setInlineError(null);
          register.mutate(undefined, {
            onSuccess: () => toast.success('You are registered. See you there.'),
            onError: (error) => {
              const apiError = toApiError(error);
              setInlineError(apiError.message);
            },
          });
        }}
      >
        {registrationStatus === 'withdrawn' ? 'Re-register for this event' : 'Register for this event'}
      </Button>
      {inlineError ? (
        <p className="text-[11px] font-medium text-red-800">{inlineError}</p>
      ) : (
        <p className="text-[11px] text-muted">
          The organizer reviews registrations; you can withdraw at any time while registration is
          open.
        </p>
      )}
    </div>
  );
}
