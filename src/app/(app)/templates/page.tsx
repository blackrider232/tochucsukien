import { requestContext } from '@/core/auth/server';
import { todayVN } from '@/core/dates';
import { can } from '@/core/permissions';
import { listEvents } from '@/features/progress/server';
import { TemplateStudio } from '@/features/templates';
import { listTemplates } from '@/features/templates/server';

type Params = Promise<{ t?: string | string[]; event?: string | string[]; q?: string | string[]; level?: string | string[] }>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function TemplatesPage({ searchParams }: { searchParams: Params }) {
  const [ctx, sp] = await Promise.all([requestContext(), searchParams]);
  const [templates, events] = await Promise.all([listTemplates(ctx), listEvents(ctx)]);
  return (
    <TemplateStudio
      templates={templates}
      events={events}
      today={todayVN(ctx.now)}
      isAdmin={can(ctx.actor, 'templates.admin')}
      params={{ t: first(sp.t), event: first(sp.event), q: first(sp.q), level: first(sp.level) }}
    />
  );
}
