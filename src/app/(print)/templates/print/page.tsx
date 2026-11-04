import { notFound } from 'next/navigation';
import { requestContext } from '@/core/auth/server';
import { todayVN } from '@/core/dates';
import { readEvent } from '@/features/progress/server';
import { PrintTemplate } from '@/features/templates';
import { listTemplates } from '@/features/templates/server';
import { parseUuid } from '@/core/brand';

type Params = Promise<{ t?: string | string[]; event?: string | string[] }>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PrintTemplatePage({ searchParams }: { searchParams: Params }) {
  const [ctx, sp] = await Promise.all([requestContext(), searchParams]);
  const [templates, eventId] = [await listTemplates(ctx), parseUuid<'Event'>(first(sp.event))];
  const template = templates.find((t) => t.id === first(sp.t));
  if (!template) notFound();
  const event = eventId ? await readEvent(ctx, eventId) : null;
  return <PrintTemplate template={template} event={event} today={todayVN(ctx.now)} />;
}
