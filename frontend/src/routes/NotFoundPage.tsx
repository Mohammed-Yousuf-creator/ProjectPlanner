import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-lg">
        <EmptyState
          icon={Compass}
          title="This page doesn't exist"
          description="The link may be outdated, or you may have followed a route that was never published."
          actions={
            <>
              <Link to="/events">
                <Button>Browse events</Button>
              </Link>
              <Link to="/">
                <Button variant="outline">Go home</Button>
              </Link>
            </>
          }
        />
      </div>
    </div>
  );
}
