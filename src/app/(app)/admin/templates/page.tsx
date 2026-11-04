import { redirect } from 'next/navigation';
import { requestContext } from '@/core/auth/server';
import { can } from '@/core/permissions';
import { AdminTemplates } from '@/features/templates';
import { listTemplates } from '@/features/templates/server';

export default async function AdminTemplatesPage({ searchParams }: { searchParams: Promise<{ edit?: string | string[] }> }) {
  const [ctx, sp] = await Promise.all([requestContext(), searchParams]);
  // The proxy already sent a non-admin away; this is the enforcement behind it.
  if (!can(ctx.actor, 'templates.admin')) redirect('/events?denied=1');
  return <AdminTemplates templates={await listTemplates(ctx)} editId={Array.isArray(sp.edit) ? sp.edit[0] : sp.edit} />;
}
