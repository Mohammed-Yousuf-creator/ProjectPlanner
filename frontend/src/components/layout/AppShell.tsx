import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { cn } from '@/lib/cn';

export type AppShellProps = {
  /** Use the narrower marketing container on public pages. */
  width?: 'default' | 'narrow';
};

/** Header + max-w-7xl content container + footer, wrapping every route. */
export function AppShell({ width = 'default' }: AppShellProps) {
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
    </div>
  );
}
