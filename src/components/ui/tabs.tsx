'use client';

import Link from 'next/link';
import { useRef, type KeyboardEvent } from 'react';
import type { LinkTabsProps, TabItem, TabsProps } from './kit.types';
import { cn } from './cn';
import { Icon } from './icons';

type Variant = 'pill' | 'underline' | 'segmented';

const LIST: Record<Variant, string> = {
  pill: 'flex gap-1.5 overflow-x-auto pb-1',
  underline: 'flex gap-1 overflow-x-auto border-b border-line',
  segmented: 'inline-flex max-w-full gap-0.5 overflow-x-auto rounded-control bg-surface-3 p-1',
};

function itemClass(variant: Variant, active: boolean): string {
  const base = 'inline-flex min-h-touch shrink-0 items-center gap-1.5 whitespace-nowrap px-3.5 text-sm font-semibold transition-colors';
  if (variant === 'pill') {
    return cn(base, 'rounded-full', active ? 'bg-primary text-on-primary' : 'text-ink-2 hover:bg-surface-3');
  }
  if (variant === 'underline') {
    return cn(base, '-mb-px border-b-2', active ? 'border-primary text-primary dark:text-blue-300' : 'border-transparent text-ink-muted hover:text-ink');
  }
  return cn(base, 'rounded-md', active ? 'bg-surface text-ink shadow-card' : 'text-ink-muted hover:text-ink');
}

function TabContent({ item, active }: { item: TabItem; active: boolean }) {
  return (
    <>
      {item.icon && <Icon name={item.icon} size={16} />}
      <span>{item.label}</span>
      {item.count !== undefined && (
        <span
          className={cn(
            'rounded-full px-1.5 text-2xs font-bold tabular-nums',
            active ? 'bg-white/25 text-current' : 'bg-surface-3 text-ink-2',
          )}
        >
          <span aria-hidden="true">{item.count}</span>
          <span className="sr-only">, {item.count} mục</span>
        </span>
      )}
    </>
  );
}

/** Each tab is a link, so the state survives a reload and can be shared. */
export function LinkTabs({ items, activeId, variant = 'pill', label = 'Phân mục' }: LinkTabsProps) {
  return (
    <nav aria-label={label}>
      <ul className={LIST[variant]}>
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id} className="shrink-0">
              <Link href={item.href} aria-current={active ? 'page' : undefined} className={itemClass(variant, active)}>
                <TabContent item={item} active={active} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Client-state tabs: roving tabindex, arrow keys, Home and End. */
export function Tabs({ items, value, onChange, variant = 'pill' }: TabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (from: number, key: string) => {
    const last = items.length - 1;
    const to = key === 'ArrowRight' ? (from === last ? 0 : from + 1) : key === 'ArrowLeft' ? (from === 0 ? last : from - 1) : key === 'Home' ? 0 : last;
    const target = items[to];
    if (!target) return;
    onChange(target.id);
    refs.current[to]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      move(index, e.key);
    }
  };

  return (
    <div role="tablist" aria-orientation="horizontal" className={LIST[variant]}>
      {items.map((item, i) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={itemClass(variant, active)}
          >
            <TabContent item={item} active={active} />
          </button>
        );
      })}
    </div>
  );
}
