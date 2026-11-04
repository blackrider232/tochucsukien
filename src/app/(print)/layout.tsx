import type { ReactNode } from 'react';
import { AutoPrint } from '@/components/shell/auto-print';
import { AppContextProvider } from '@/core/auth';
import { appContextValue } from '@/core/auth/server';

// No shell here: a print route renders its document only, on a neutral backdrop.
// The page itself sets the paper with <PrintPage>; this layout adds the toolbar and prints on load.
export const dynamic = 'force-dynamic';

export default async function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <AppContextProvider value={await appContextValue()}>
      <div className="min-h-dvh overflow-x-auto bg-surface-3 px-2 py-3 print:overflow-visible print:bg-paper print:p-0">
        <AutoPrint />
        <main id="main-content" tabIndex={-1} className="outline-none">
          {children}
        </main>
      </div>
    </AppContextProvider>
  );
}
