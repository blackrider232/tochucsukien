'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DialogShell } from '@/components/ui/dialog-shell';
import { IDLE_LOGOUT_MS, IDLE_WARN_MS } from './session';

const ACTIVITY = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
const THROTTLE_MS = 1000;

function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Warns before the session ends and signs out at the deadline. Activity postpones the warning,
 * but once the warning is up only the button continues the session.
 */
export function IdleGuard({
  onSignOut, warnAfterMs = IDLE_WARN_MS, signOutAfterMs = IDLE_LOGOUT_MS,
}: { onSignOut: () => void; warnAfterMs?: number; signOutAfterMs?: number }) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const lastActivity = useRef(0);
  const warning = useRef(false);
  const signOut = useRef(onSignOut);

  useEffect(() => {
    signOut.current = onSignOut;
  });

  const reset = useCallback(() => {
    lastActivity.current = Date.now();
    warning.current = false;
    setRemaining(null);
  }, []);

  useEffect(() => {
    lastActivity.current = Date.now();
    let lastSeen = 0;
    const onActivity = () => {
      const now = Date.now();
      if (warning.current || now - lastSeen < THROTTLE_MS) return;
      lastSeen = now;
      lastActivity.current = now;
    };
    for (const type of ACTIVITY) window.addEventListener(type, onActivity, { passive: true });

    const tick = setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= signOutAfterMs) {
        clearInterval(tick);
        signOut.current();
      } else if (idle >= warnAfterMs) {
        warning.current = true;
        setRemaining(signOutAfterMs - idle);
      }
    }, 1000);

    return () => {
      clearInterval(tick);
      for (const type of ACTIVITY) window.removeEventListener(type, onActivity);
    };
  }, [warnAfterMs, signOutAfterMs]);

  return (
    <DialogShell
      open={remaining !== null}
      role="alertdialog"
      size="sm"
      icon="clock"
      tone="warning"
      title="Phiên làm việc sắp hết hạn"
      hideClose
      closeOnBackdrop={false}
      onRequestClose={reset}
      footer={
        <>
          <Button variant="secondary" onClick={() => signOut.current()}>Đăng xuất</Button>
          <span data-autofocus=""><Button onClick={reset}>Tiếp tục làm việc</Button></span>
        </>
      }
    >
      <p className="text-sm text-ink-2">
        Bạn đã không thao tác một thời gian. Hệ thống sẽ tự đăng xuất sau{' '}
        <strong className="tabular-nums">{clock(remaining ?? 0)}</strong> để bảo vệ dữ liệu.
      </p>
    </DialogShell>
  );
}
