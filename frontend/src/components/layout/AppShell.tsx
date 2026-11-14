import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { AssistantWidget } from '@/components/ai/AssistantWidget';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/cn';

export type AppShellProps = {
  /** Use the narrower marketing container on public pages. */
  width?: 'default' | 'narrow';
};

/** Header + max-w-7xl content container + footer, wrapping every route. */
export function AppShell({ width = 'default' }: AppShellProps) {
  const { pathname } = useLocation();
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken));
  // The dedicated assistant page renders the same panel full-page; showing the
  // floating launcher there would put two chat surfaces on one screen.
  // Signed-out visitors do not get the launcher: every conversation endpoint
  // requires a token, so the button would only ever produce a 401.
  const showAssistant = isAuthenticated && !pathname.startsWith('/assistant');
  const isPublic = ['/events', '/'].includes(pathname) || pathname === '';

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <Header />
      <main
        className={cn(
          'mx-auto w-full flex-1 px-4 py-8 sm:px-6 lg:px-8',
          width === 'default' ? 'max-w-7xl' : 'max-w-5xl',
        )}
      >
        <Outlet />
      </main>
      <Footer />
      {showAssistant && !isPublic ? <AssistantWidget /> : null}
    </div>
  );
}
