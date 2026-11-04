'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Toast } from './kit.types';
import type { Tone } from '@/core/vocab';
import { cn } from './cn';
import { Icon } from './icons';
import type { IconName } from './kit.types';

type Kind = 'success' | 'info' | 'warning' | 'error';
interface Item { id: number; kind: Kind; text: string }

const ToastContext = createContext<Toast | null>(null);

export function useToast(): Toast {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast needs <UiProviders> (or <ToastProvider>) above it.');
  return ctx;
}

const LOOK: Record<Kind, { tone: Tone; icon: IconName; label: string }> = {
  success: { tone: 'emerald', icon: 'check', label: 'Thành công' },
  info: { tone: 'blue', icon: 'bell', label: 'Thông báo' },
  warning: { tone: 'amber', icon: 'alert-triangle', label: 'Cảnh báo' },
  error: { tone: 'red', icon: 'alert-triangle', label: 'Lỗi' },
};

/** Success and info vanish after 2 s; warnings and errors stay 6 s so they can be read. Hover or focus pauses. */
const DURATION: Record<Kind, number> = { success: 2000, info: 2000, warning: 6000, error: 6000 };
const MAX_VISIBLE = 4;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ReadonlyArray<Item>>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const add = useCallback((kind: Kind, text: string) => {
    setItems((l) => [...l, { id: nextId.current++, kind, text }].slice(-MAX_VISIBLE));
  }, []);

  const api = useMemo<Toast>(
    () => ({
      success: (t) => add('success', t),
      info: (t) => add('info', t),
      warning: (t) => add('warning', t),
      error: (t) => add('error', t),
    }),
    [add],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-label="Thông báo"
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-end gap-2 p-3 sm:p-4"
        data-no-print
      >
        {items.map((t) => (
          <ToastView key={t.id} item={t} onDone={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ item, onDone }: { item: Item; onDone: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const look = LOOK[item.kind];

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onDone(item.id), DURATION[item.kind]);
    return () => clearTimeout(timer);
  }, [paused, item.id, item.kind, onDone]);

  return (
    <div
      role={item.kind === 'error' || item.kind === 'warning' ? 'alert' : 'status'}
      data-tone={look.tone}
      data-toast={item.kind}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        'pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-2.5 rounded-control border border-(--tone-bd) bg-surface p-3 shadow-pop',
      )}
    >
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-(--tone-bg) text-(--tone-fg)">
        <Icon name={look.icon} size={14} />
      </span>
      <p className="min-w-0 flex-1 break-words text-sm text-ink">
        <span className="sr-only">{look.label}: </span>
        {item.text}
      </p>
      <button
        type="button"
        aria-label="Đóng thông báo"
        onClick={() => onDone(item.id)}
        className="-m-1 flex size-8 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-3"
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}
