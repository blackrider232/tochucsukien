'use client';

import Link from 'next/link';
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { RowMenuItem, RowMenuProps } from './kit.types';
import { cn } from './cn';
import { Icon } from './icons';

const MENU_WIDTH = 224;
const GAP = 4;
const HIDDEN: CSSProperties = { position: 'fixed', top: 0, left: 0, visibility: 'hidden' };

/** Below the trigger, right-aligned; above it when the viewport has no room below. */
function place(trigger: DOMRect, menuHeight: number): CSSProperties {
  const left = Math.max(8, Math.min(trigger.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
  const below = trigger.bottom + GAP;
  const top = below + menuHeight > window.innerHeight - 8 && trigger.top - GAP - menuHeight > 8 ? trigger.top - GAP - menuHeight : below;
  return { position: 'fixed', top, left, width: MENU_WIDTH };
}

/**
 * ARIA menu button: Enter, Space or ArrowDown opens on the first item, arrows and Home/End move,
 * Esc and Tab close, and focus goes back to the trigger. The menu is portalled so a scrolling table
 * never clips it, and it follows the trigger when the page scrolls.
 */
export function RowMenu({ items, label = 'Thao tác' }: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>(HIDDEN);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const menuId = useId();
  const focusFirst = useRef(false);

  const enabled = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
  const close = (refocus: boolean) => {
    setOpen(false);
    setStyle(HIDDEN);
    if (refocus) trigger.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    setStyle(place(trigger.current.getBoundingClientRect(), menu.current.offsetHeight));
    focusFirst.current = true;
  }, [open]);

  // A hidden menu cannot take focus, so the first item is focused once the measured position is painted.
  useEffect(() => {
    if (!open || style.visibility === 'hidden' || !focusFirst.current) return;
    focusFirst.current = false;
    enabled()[0]?.focus({ preventScroll: true });
  });

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !trigger.current?.contains(t)) setOpen(false);
    };
    // Follow the trigger while the page or a table scrolls; close once it leaves the viewport.
    const onMove = () => {
      const t = trigger.current?.getBoundingClientRect();
      if (!t || t.bottom < 0 || t.top > window.innerHeight) setOpen(false);
      else setStyle(place(t, menu.current?.offsetHeight ?? 0));
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  const onMenuKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const list = enabled();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => list[(i + list.length) % list.length]?.focus();
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(list.length - 1);
    else if (e.key === 'Escape') {
      e.stopPropagation();
      close(true);
    } else if (e.key === 'Tab') {
      close(false);
      return;
    } else return;
    e.preventDefault();
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' && !open) {
      e.preventDefault();
      setOpen(true);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      close(true);
    }
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
        className="inline-flex size-touch shrink-0 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink active:bg-surface-3"
      >
        <Icon name="ellipsis" size={18} />
      </button>
      {open &&
        createPortal(
          <ul
            ref={menu}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKey}
            style={style}
            className="z-40 rounded-control border border-line bg-surface py-1 text-ink shadow-pop"
          >
            {items.map((item) => (
              <li key={item.id} role="none">
                <MenuEntry item={item} onDone={() => close(true)} />
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}

function MenuEntry({ item, onDone }: { item: RowMenuItem; onDone: () => void }) {
  const cls = cn(
    'flex min-h-touch w-full items-center gap-2.5 px-3 text-left text-sm hover:bg-surface-3 focus-visible:bg-surface-3 focus-visible:-outline-offset-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
    item.tone === 'danger' ? 'text-danger-ink' : 'text-ink',
  );
  const body = (
    <>
      {item.icon && <Icon name={item.icon} size={16} className="shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </>
  );
  if (item.href && !item.disabled) {
    return <Link role="menuitem" tabIndex={-1} href={item.href} onClick={onDone} className={cls}>{body}</Link>;
  }
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-disabled={item.disabled || undefined}
      onClick={() => {
        if (item.disabled) return;
        onDone();
        item.onSelect?.();
      }}
      className={cls}
    >
      {body}
    </button>
  );
}
