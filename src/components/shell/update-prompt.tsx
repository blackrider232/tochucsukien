'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type Phase = 'idle' | 'ready' | 'updating';

/**
 * Registers the service worker (production only) and reports a waiting version. The new worker
 * activates only when the user accepts, so a form is never reloaded under their hands.
 */
export function useServiceWorkerUpdate(): { phase: Phase; apply: () => void; dismiss: () => void } {
  const [state, setState] = useState<{ worker: ServiceWorker | null; phase: Phase }>({ worker: null, phase: 'idle' });
  const found = (worker: ServiceWorker) => setState({ worker, phase: 'ready' });

  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    let cancelled = false;

    const watch = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting && navigator.serviceWorker.controller) found(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const next = reg.installing;
        next?.addEventListener('statechange', () => {
          if (next.state === 'installed' && navigator.serviceWorker.controller && !cancelled) found(next);
        });
      });
    };

    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(watch).catch(() => {});

    let reloaded = false;
    const onChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
    };
  }, []);

  const apply = useCallback(() => {
    setState((s) => ({ ...s, phase: 'updating' }));
    state.worker?.postMessage({ type: 'SKIP_WAITING' });
  }, [state.worker]);
  const dismiss = useCallback(() => setState((s) => ({ ...s, phase: 'idle' })), []);
  return { phase: state.phase, apply, dismiss };
}

export function UpdatePrompt() {
  const { phase, apply, dismiss } = useServiceWorkerUpdate();
  if (phase === 'idle') return null;
  return (
    <div role="status" data-no-print className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-md flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-pop">
      <p className="min-w-0 flex-1 text-sm text-ink">Có phiên bản mới của ứng dụng. Cập nhật để dùng bản mới nhất.</p>
      <Button variant="ghost" onClick={dismiss}>Để sau</Button>
      <Button loading={phase === 'updating'} onClick={apply}>Cập nhật</Button>
    </div>
  );
}
