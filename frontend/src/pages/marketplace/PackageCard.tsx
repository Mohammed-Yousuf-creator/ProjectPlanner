import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import type { SponsorshipPackageRead } from '@/api/types';

/**
 * One package tier. `manage` reveals the edit/delete controls for the listing
 * owner's organization.
 */
export function PackageCard({
  pkg,
  manage = false,
  onEdit,
  onDelete,
  selectable = false,
  selected = false,
  onSelect,
}: {
  pkg: SponsorshipPackageRead;
  manage?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const benefits = Array.isArray(pkg.benefits) ? (pkg.benefits as string[]) : [];

  return (
    <Card
      className={cn(
        'flex h-full flex-col gap-2 p-4',
        selectable && 'cursor-pointer transition-colors hover:border-forest/40',
        selected && 'border-forest bg-emerald-50/50',
      )}
      onClick={selectable ? onSelect : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-bold text-ink">{pkg.name}</h4>
          <p className="font-mono text-sm font-bold text-forest">
            {pkg.currency} {pkg.price}
          </p>
        </div>
        {pkg.available_slots !== null && pkg.available_slots !== undefined && (
          <Badge variant="neutral">{pkg.available_slots} slots</Badge>
        )}
      </div>

      {pkg.description && <p className="text-[11px] leading-relaxed text-taupe">{pkg.description}</p>}

      {benefits.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-taupe">
          {benefits.map((benefit) => (
            <li key={benefit}>{benefit}</li>
          ))}
        </ul>
      )}

      {manage && (
        <div className="mt-auto flex gap-1.5 border-t border-line-subtle pt-2">
          <Button variant="chip" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button variant="chip" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      )}
      {selectable && (
        <p className="mt-auto font-mono text-[10px] uppercase tracking-wider text-muted">
          {selected ? 'Selected' : 'Select package'}
        </p>
      )}
    </Card>
  );
}
