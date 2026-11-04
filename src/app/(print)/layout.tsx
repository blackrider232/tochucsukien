import type { ReactNode } from 'react';
import { AutoPrint } from '@/components/shell/auto-print';
import { AppEnvProvider } from '@/components/ui/app-env';
import { requestContext } from '@/core/auth';

// No shell here: a print route renders its document only, on a neutral backdrop.
// The page itself sets the paper with <PrintPage>; this layout adds the toolbar and prints on load.
export const dynamic = 'force-dynamic';

export default async function PrintLayout({ children }: { children: ReactNode }) {
  const ctx = await requestContext();
  return (
    <AppEnvProvider settings={ctx.settings} holidays={[]}>
      <div className="min-h-dvh bg-surface-3 px-2 py-3 print:bg-white print:p-0">
        <AutoPrint />
        <main id="main-content" tabIndex={-1} className="outline-none">
          {children}
        </main>
      </div>
    </AppEnvProvider>
  );
}
