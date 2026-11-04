'use client';

import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useModalLayer } from '@/components/ui/dialog-shell';
import { useMounted } from '@/components/ui/use-mounted';

/** Mobile navigation panel: a modal layer (focus trap, Esc, scroll lock, focus return) sliding from the left. */
export function Drawer({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const mounted = useMounted();
  if (!mounted || !open) return null;
  return createPortal(<DrawerView onClose={onClose} label={label}>{children}</DrawerView>, document.body);
}

function DrawerView({ onClose, label, children }: { onClose: () => void; label: string; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onKeyDown = useModalLayer(panelRef, onClose);
  return (
    <div data-shell className="fixed inset-0 z-50 bg-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="h-full w-72 max-w-[85vw] bg-sidebar shadow-modal outline-none"
      >
        {children}
      </div>
    </div>
  );
}
