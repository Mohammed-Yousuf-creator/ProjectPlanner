import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Spinner } from '@/components/ui/Spinner';

function BootScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <Spinner label="Restoring your session…" />
    </div>
  );
}

/**
 * Requires a token and a hydrated user. While the boot-time `GET /users/me` is
 * in flight we render a spinner rather than bouncing to /login.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const bootstrapping = useAuthStore((state) => state.bootstrapping);
  const location = useLocation();

  if (accessToken && bootstrapping) return <BootScreen />;

  if (!accessToken) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return <>{children}</>;
}

/** Authenticated users should never see the sign-in/sign-up forms. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const bootstrapping = useAuthStore((state) => state.bootstrapping);
  const location = useLocation();

  if (accessToken && bootstrapping) return <BootScreen />;

  if (accessToken) {
    const params = new URLSearchParams(location.search);
    const next = params.get('next');
    return <Navigate to={next && next.startsWith('/') ? next : '/dashboard'} replace />;
  }

  return <>{children}</>;
}
