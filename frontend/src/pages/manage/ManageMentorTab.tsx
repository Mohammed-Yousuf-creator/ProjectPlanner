import { Link } from 'react-router-dom';
import { LifeBuoy } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * The mentor queue is implemented once in `EventMentorPage` (it has the same
 * organizer/mentor actions plus the participant view). This tab links to it
 * instead of duplicating the logic.
 */
export function ManageMentorTab({ eventId }: { eventId: string }) {
  return (
    <Card className="space-y-3">
      <CardHeader
        title="Mentor requests"
        description="Organizers see every request in the event and can assign mentors or advance status."
        actions={
          <Link to={`/events/${eventId}/mentor`}>
            <Button size="sm">Open mentor desk</Button>
          </Link>
        }
      />
      <EmptyState
        inline
        icon={LifeBuoy}
        title="Mentor requests live on the mentor desk"
        description="The mentor desk combines the participant request form with the organizer queue, so there is a single place to triage requests."
        actions={
          <Link to={`/events/${eventId}/mentor`}>
            <Button variant="outline">Go to mentor desk</Button>
          </Link>
        }
      />
    </Card>
  );
}
