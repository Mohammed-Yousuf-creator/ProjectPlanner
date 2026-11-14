import { Link } from 'react-router-dom';

/** Quiet editorial footer; no fake social links or newsletter forms. */
export function Footer() {
  return (
    <footer className="mt-12 border-t border-line bg-canvas-2">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-xs text-taupe sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p className="flex items-center gap-2">
          <span className="font-bold tracking-tight text-ink">AEGIS</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
            Hackathons &amp; conferences
          </span>
        </p>
        <nav className="flex flex-wrap items-center gap-4">
          <Link to="/events" className="transition-colors hover:text-rust">
            Events
          </Link>
          <Link to="/marketplace" className="transition-colors hover:text-rust">
            Marketplace
          </Link>
          <Link to="/sponsors" className="transition-colors hover:text-rust">
            Sponsors
          </Link>
        </nav>
      </div>
    </footer>
  );
}
