import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { EventSubTabs } from '@/components/shell/app-shell';
import { EventHeader } from '@/components/shell/event-header';
import { EventSwitcher } from '@/components/shell/event-switcher';
import { renderEventActions } from '@/components/shell/load-shell';
import { requestContext } from '@/core/auth/server';
import { parseUuid } from '@/core/brand';
import { formatVNDate } from '@/core/dates';
import { listEvents, readEvent } from '@/features/progress/server';

// Every /events/<id>/* page: the event or a 404 (absent, deleted or not visible to this actor read the same),
// then its header, the switcher, the features' eventActions and the active entry's sub-tabs.
export default async function EventLayout({ children, params }: { children: ReactNode; params: Promise<{ eventId: string }> }) {
  const id = parseUuid<'Event'>((await params).eventId);
  const ctx = await requestContext();
  const event = id ? await readEvent(ctx, id) : null;
  if (!event) notFound();

  const others = (await listEvents(ctx))
    .filter((e) => e.id !== event.id)
    .toSorted((a, b) => b.eventDate.localeCompare(a.eventDate))
    .map((e) => ({ id: e.id, name: e.name, dateLabel: formatVNDate(e.eventDate) }));

  return (
    <div className="space-y-4">
      <EventHeader
        title={event.name}
        meta={[`${formatVNDate(event.eventDate, { weekday: true })}, ${event.eventTime}`, event.location, event.department].filter(Boolean)}
        switcher={<EventSwitcher current={event.name} events={others} />}
        actions={renderEventActions(ctx, event.id)}
      />
      <EventSubTabs eventName={event.name} />
      {children}
    </div>
  );
}
