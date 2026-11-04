import { Badge } from '@/components/ui';
import type { HallZone } from '../contract';
import { ZONE_COLORS, ZONE_GROUPS } from '../domain/halls';

/**
 * The one zone chip of legend, header and catalog: the seat prefix in the zone's colour with its target group's icon,
 * then the name as wrapping text (a long name inside the no-wrap Badge overflowed a 360 px screen).
 */
export function ZoneBadge({ zone }: { zone: Pick<HallZone, 'name' | 'prefix' | 'color' | 'assignedGroup'> }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Badge tone={ZONE_COLORS[zone.color].tone} icon={ZONE_GROUPS[zone.assignedGroup].icon}>{zone.prefix}</Badge>
      <span className="min-w-0 break-words text-sm font-semibold text-ink">{zone.name}</span>
    </span>
  );
}
