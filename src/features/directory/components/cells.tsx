import { Badge, Icon } from '@/components/ui';
import { GUEST_GROUPS } from '@/core/vocab';
import type { MasterContact } from '../contract';
import { GROUP_ICON } from '../domain/groups';

/** Every value is React text: markup in a name, an organization or a note shows as typed (m4c B1-B4, B12). */
export function GroupBadge({ group }: { group: MasterContact['group'] }) {
  return <Badge tone={GUEST_GROUPS[group].tone} icon={GROUP_ICON[group]}>{GUEST_GROUPS[group].short}</Badge>;
}

export function NameCell({ c }: { c: MasterContact }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="break-words font-semibold text-ink">{c.name}</p>
      {c.title && <p className="break-words text-sm text-ink-2">{c.title}</p>}
    </div>
  );
}

export function OrgCell({ c }: { c: MasterContact }) {
  return (
    <div className="min-w-0 space-y-0.5 text-sm">
      <p className="break-words text-ink-2">{c.organization}</p>
      {c.address && (
        <p className="flex items-start gap-1 text-xs text-ink-muted">
          <Icon name="map-pin" size={12} />
          <span className="break-words">{c.address}</span>
        </p>
      )}
    </div>
  );
}

export function ContactCell({ c }: { c: MasterContact }) {
  if (!c.phone && !c.email) return <span className="text-sm text-ink-muted">-</span>;
  return (
    <p className="flex flex-col gap-0.5 text-xs text-ink-muted">
      {c.phone && <span className="inline-flex items-center gap-1 font-mono"><Icon name="phone" size={12} />{c.phone}</span>}
      {c.email && <span className="inline-flex items-center gap-1 break-all"><Icon name="mail" size={12} />{c.email}</span>}
    </p>
  );
}

export function BanquetCell({ c }: { c: MasterContact }) {
  return (
    <div className="min-w-0 space-y-1">
      {c.hasBanquet ? <Badge tone="amber">Tiệc VIP</Badge> : <span className="text-sm text-ink-muted">-</span>}
      {c.notes && <p className="line-clamp-2 break-words text-xs italic text-ink-muted">{c.notes}</p>}
    </div>
  );
}
