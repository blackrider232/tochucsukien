'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';

export interface SwitcherEvent {
  id: string;
  name: string;
  /** Already formatted, e.g. '04/11/2026'. */
  dateLabel?: string;
  href: string;
}

/** A disclosure listing the user's other events as links. Esc and outside click close it. */
export function EventSwitcher({ current, events }: { current: string; events: ReadonlyArray<SwitcherEvent> }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        root.current?.querySelector('button')?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-touch max-w-full items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-3"
      >
        <span className="min-w-0 truncate">{current}</span>
        <Icon name="chevron-down" size={16} className={cn('shrink-0 transition-transform', open && 'rotate-180')} />
        <span className="sr-only">Chuyển sự kiện</span>
      </button>
      {open && (
        <ul id={listId} className="absolute left-0 top-full z-30 mt-1 max-h-72 w-72 max-w-[calc(100vw-1.5rem)] overflow-auto rounded-control border border-line bg-surface py-1 shadow-pop">
          {events.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Chưa có sự kiện khác.</li>}
          {events.map((ev) => (
            <li key={ev.id}>
              <Link href={ev.href} onClick={() => setOpen(false)} className="flex min-h-touch flex-col justify-center px-3 py-1.5 text-sm hover:bg-surface-3">
                <span className="font-semibold text-ink">{ev.name}</span>
                {ev.dateLabel && <span className="text-xs text-ink-muted">{ev.dateLabel}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
