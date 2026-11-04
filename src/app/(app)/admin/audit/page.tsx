import type { Metadata } from 'next';
import { requestContext } from '@/core/auth/server';
import { parseUuid } from '@/core/brand';
import { parseIsoDate } from '@/core/dates';
import { AuditScreen } from '@/features/core';
import { auditFacets, readAuditPage, type AuditFilter } from '@/features/core/server';
import { listEvents } from '@/features/progress/server';

export const metadata: Metadata = { title: 'Nhật ký kiểm toán' };

type Params = { action?: string; entity?: string; actor?: string; eventId?: string; from?: string; to?: string; before?: string };

/** Unparseable values are dropped, so a hand-edited URL shows a wider list instead of failing. */
function parseFilter(p: Params): { filter: AuditFilter; before: number | null } {
  const text = (v: string | undefined, max: number) => (v && v.trim() ? v.trim().slice(0, max) : undefined);
  const before = Number(p.before);
  return {
    filter: {
      action: text(p.action, 120),
      entity: text(p.entity, 40),
      actor: text(p.actor, 120),
      eventId: parseUuid<'Event'>(p.eventId) ?? undefined,
      from: parseIsoDate(p.from) ?? undefined,
      to: parseIsoDate(p.to) ?? undefined,
    },
    before: Number.isInteger(before) && before > 0 ? before : null,
  };
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [ctx, params] = await Promise.all([requestContext(), searchParams]);
  const { filter, before } = parseFilter(params);
  const [page, facets, events] = await Promise.all([readAuditPage(ctx, filter, before ?? undefined), auditFacets(ctx), listEvents(ctx, { includeDeleted: true })]);
  return (
    <AuditScreen
      rows={page.rows}
      filter={filter}
      before={before}
      nextBefore={page.nextBefore}
      facets={facets}
      events={events.map((e) => ({ id: e.id, name: e.name }))}
    />
  );
}
