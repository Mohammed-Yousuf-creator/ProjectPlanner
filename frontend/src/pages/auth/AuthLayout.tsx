import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandDot } from '@/components/ui/StatusDot';

/** Centered warm-stone canvas with a single card - recipe 5.7 spacing rules. */
export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-line bg-white/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-2xl font-bold tracking-tight text-ink">AEGIS</span>
            <BrandDot />
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-4">
          <div className="space-y-1 text-center">
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
            <p className="text-xs text-taupe">{description}</p>
          </div>

          <div className="rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-8">
            {children}
          </div>

          <div className="text-center text-xs text-taupe">{footer}</div>
        </div>
      </main>
    </div>
  );
}
