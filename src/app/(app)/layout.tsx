import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { CommandToasts } from '@/components/shell/command-toasts';
import { loadShell } from '@/components/shell/load-shell';
import { AppContextProvider } from '@/core/auth';
import { appContextValue } from '@/core/auth/server';

// Every page here is per user and per request.
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [app, { model, slots }] = await Promise.all([appContextValue(), loadShell()]);
  return (
    <AppContextProvider value={app}>
      <CommandToasts>
        <AppShell model={model} slots={slots}>
          {children}
        </AppShell>
      </CommandToasts>
    </AppContextProvider>
  );
}
