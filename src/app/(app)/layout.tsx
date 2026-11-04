import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { loadShell } from '@/components/shell/load-shell';
import { AppEnvProvider } from '@/components/ui/app-env';

// Every page here is per user and per request.
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { ctx, model, slots, holidays } = await loadShell();
  return (
    <AppEnvProvider settings={ctx.settings} holidays={holidays}>
      <AppShell model={model} slots={slots}>
        {children}
      </AppShell>
    </AppEnvProvider>
  );
}
