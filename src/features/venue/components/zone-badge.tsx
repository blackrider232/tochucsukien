import { Badge } from '@/components/ui';
import type { HallZone } from '../contract';
import { ZONE_COLORS, ZONE_GROUPS } from '../domain/halls';

/** A zone's name in its colour, with its target group's icon: the one zone chip of legend, header and catalog. */
export function ZoneBadge({ zone }: { zone: Pick<HallZone, 'name' | 'color' | 'assignedGroup'> }) {
  return <Badge tone={ZONE_COLORS[zone.color].tone} icon={ZONE_GROUPS[zone.assignedGroup].icon}>{zone.name}</Badge>;
}
