'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

/** Toolbar (hidden when printing) and a one-time window.print() once fonts are ready. `?noprint=1` skips the auto print. */
export function AutoPrint() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('noprint')) return;
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) requestAnimationFrame(() => window.print());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div data-no-print className="mx-auto mb-3 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface p-2 shadow-card">
      <p className="px-2 text-sm text-ink-2">Bản xem trước khi in</p>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => window.close()}>Đóng</Button>
        <Button icon="printer" onClick={() => window.print()}>In</Button>
      </div>
    </div>
  );
}
