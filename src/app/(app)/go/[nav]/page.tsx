import { notFound, redirect } from 'next/navigation';
import { Button, EmptyState } from '@/components/ui';
import { requestContext } from '@/core/auth/server';
import { todayVN } from '@/core/dates';
import { registry } from '@/core/registry';
import { listEvents } from '@/features/progress/server';

// The sidebar sends an event-scoped entry here when no event is open. Land on the nearest upcoming event the actor can
// see (else the latest past one); with none, say so instead of showing a 404. `nav` is a nav id (the sidebar) or the
// entry's segment (hrefPath), so only segments the manifests declare are ever redirected to.
function segmentOf(nav: string): string | null {
  const entries = [...registry.navFor('main'), ...registry.navFor('admin')];
  const entry = entries.find((e) => e.id === nav && e.href.kind === 'event') ?? entries.find((e) => e.href.kind === 'event' && e.href.segment === nav);
  return entry?.href.kind === 'event' ? entry.href.segment : null;
}

export default async function GoPage({ params }: { params: Promise<{ nav: string }> }) {
  const segment = segmentOf((await params).nav);
  if (!segment) notFound();

  const ctx = await requestContext();
  const events = await listEvents(ctx);
  const today = todayVN();
  const upcoming = events.filter((e) => e.eventDate >= today).toSorted((a, b) => a.eventDate.localeCompare(b.eventDate));
  const past = events.filter((e) => e.eventDate < today).toSorted((a, b) => b.eventDate.localeCompare(a.eventDate));
  const target = upcoming[0] ?? past[0];
  if (target) redirect(`/events/${target.id}/${segment}`);

  return (
    <div className="rounded-card border border-line bg-surface shadow-card">
      <EmptyState
        icon="calendar"
        title="Chưa có sự kiện nào"
        text="Mục này làm việc trong một sự kiện. Tạo sự kiện hoặc nhờ quản trị viên cấp quyền xem sự kiện."
        action={<Button href="/events" icon="arrow-left">Về danh sách sự kiện</Button>}
      />
    </div>
  );
}
