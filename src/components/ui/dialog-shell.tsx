'use client';

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Accent, DialogProps, IconName } from './kit.types';
import { cn } from './cn';
import { Icon } from './icons';
import { IconButton } from './button';
import { useMounted } from './use-mounted';

const SIZE = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-2xl',
  '3xl': 'sm:max-w-4xl',
  full: 'sm:max-w-[min(96rem,calc(100vw-2rem))] sm:h-[calc(100dvh-2rem)]',
} as const;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('hidden') && el.getClientRects().length > 0);
}

/** Open dialogs, oldest first. Only the last one traps focus and answers Esc. */
const stack: symbol[] = [];
let scrollLocks = 0;

function lockScroll(): () => void {
  if (scrollLocks++ === 0) document.body.style.overflow = 'hidden';
  return () => {
    if (--scrollLocks === 0) document.body.style.overflow = '';
  };
}

export interface DialogShellProps extends Omit<DialogProps, 'dirty' | 'onClose'> {
  /** Called for Esc, the close button and a backdrop click. */
  onRequestClose: () => void;
  /** Dismiss on backdrop click. Prompts that hold typed text turn it off. */
  closeOnBackdrop?: boolean;
  /** Hide the header close button (confirm dialogs have explicit buttons). */
  hideClose?: boolean;
  /** role="alertdialog" for confirm and alert. */
  role?: 'dialog' | 'alertdialog';
}

/** Accessible modal: role, aria-modal, labelled, focus trap, Esc, focus return, scroll lock. */
export function DialogShell({
  open, onRequestClose, title, subtitle, icon, accent, size = 'md', footer, children,
  closeOnBackdrop = true, hideClose = false, role = 'dialog',
}: DialogShellProps) {
  const mounted = useMounted();
  if (!mounted || !open) return null;
  return createPortal(
    <DialogView
      onRequestClose={onRequestClose} title={title} subtitle={subtitle} icon={icon} accent={accent} size={size}
      footer={footer} closeOnBackdrop={closeOnBackdrop} hideClose={hideClose} role={role}
    >
      {children}
    </DialogView>,
    document.body,
  );
}

/**
 * Modal behaviour shared by dialogs and the mobile drawer: Esc for the top layer only, Tab trapped
 * inside the panel, initial focus, scroll lock, and focus returned to the opener on close.
 */
export function useModalLayer(panelRef: RefObject<HTMLElement | null>, onRequestClose: () => void, bodyRef?: RefObject<HTMLElement | null>) {
  const closeRef = useRef(onRequestClose);

  useEffect(() => {
    closeRef.current = onRequestClose;
  });

  useEffect(() => {
    const id = Symbol('modal');
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stack.push(id);
    const unlock = lockScroll();

    const panel = panelRef.current;
    const marked = panel?.querySelector<HTMLElement>('[data-autofocus]');
    const target =
      (marked && (marked.matches(FOCUSABLE) ? marked : focusables(marked)[0])) ??
      (bodyRef?.current ? focusables(bodyRef.current)[0] : undefined) ??
      (panel ? focusables(panel)[0] : undefined) ??
      panel;
    target?.focus();

    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (stack[stack.length - 1] !== id) return;
      e.stopPropagation();
      closeRef.current();
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      const at = stack.indexOf(id);
      if (at >= 0) stack.splice(at, 1);
      unlock();
      if (returnTo?.isConnected) returnTo.focus();
    };
  }, [panelRef, bodyRef]);

  return (e: KeyboardEvent<HTMLElement>) => {
    const panel = panelRef.current;
    if (e.key !== 'Tab' || !panel) return;
    const items = focusables(panel);
    if (items.length === 0) {
      e.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    } else if (!panel.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  };
}

function DialogView({
  onRequestClose, title, subtitle, icon, accent, size, footer, children, closeOnBackdrop, hideClose, role,
}: {
  onRequestClose: () => void; title: string; subtitle?: string; icon?: IconName; accent?: Accent;
  size: keyof typeof SIZE; footer?: ReactNode; children: ReactNode; closeOnBackdrop: boolean; hideClose: boolean;
  role: 'dialog' | 'alertdialog';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const subtitleId = useId();
  const onKeyDown = useModalLayer(panelRef, onRequestClose, bodyRef);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-overlay sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onRequestClose();
      }}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn(
          'flex max-h-dvh w-full animate-dialog-in flex-col rounded-t-modal bg-surface text-ink shadow-modal outline-none sm:max-h-[90dvh] sm:rounded-modal',
          SIZE[size],
        )}
      >
        <header className="flex items-start gap-3 border-b border-line px-4 py-3 sm:px-5">
          {icon && (
            <span data-tone={accent ?? 'blue'} className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-control bg-(--tone-bg) text-(--tone-fg)">
              <Icon name={icon} size={18} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-bold leading-6 text-ink">{title}</h2>
            {subtitle && <p id={subtitleId} className="text-sm text-ink-muted">{subtitle}</p>}
          </div>
          {!hideClose && <IconButton icon="x" label="Đóng" onClick={onRequestClose} />}
        </header>
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2 px-4 py-3 sm:rounded-b-modal sm:px-5">{footer}</footer>}
      </div>
    </div>
  );
}
