'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { ComboboxProps } from './kit.types';
import { matchesQuery } from '@/core/text';
import { cn } from './cn';
import { controlClass } from './filter-bar';
import { useControl } from './use-control';

const DEBOUNCE_MS = 200;

type Status = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Server-backed search box following the ARIA 1.2 combobox pattern: ArrowDown/Up move,
 * Enter picks, Esc closes (then clears), Tab leaves. The form value is the picked item key.
 */
export function Combobox<T>({ name, search, itemKey, itemLabel, renderItem, onPick }: ComboboxProps<T>) {
  const { id, form, aria } = useControl(name);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ReadonlyArray<T>>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const run = (q: string) => {
    clearTimeout(timer.current);
    const mine = ++seq.current;
    setStatus('loading');
    timer.current = setTimeout(async () => {
      try {
        const found = await search(q);
        if (mine !== seq.current) return;
        const ranked = rank(found, q, itemLabel);
        setItems(ranked);
        setActive(ranked.length > 0 ? 0 : -1);
        setStatus('ready');
      } catch {
        if (mine !== seq.current) return;
        setItems([]);
        setStatus('error');
      }
    }, DEBOUNCE_MS);
  };

  const pick = (item: T) => {
    seq.current++;
    clearTimeout(timer.current);
    setQuery(itemLabel(item));
    setOpen(false);
    setStatus('idle');
    form?.setValue(name, itemKey(item), { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
    onPick(item);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        if (status === 'idle') run(query);
        return;
      }
      if (items.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a + step + items.length) % items.length);
    } else if (e.key === 'Enter') {
      const item = items[active];
      if (open && item !== undefined) {
        e.preventDefault();
        pick(item);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      } else if (query !== '') {
        setQuery('');
      }
    } else if (e.key === 'Home' && open) {
      e.preventDefault();
      setActive(items.length > 0 ? 0 : -1);
    } else if (e.key === 'End' && open) {
      e.preventDefault();
      setActive(items.length - 1);
    }
  };

  const activeItem = items[active];
  const optionId = (i: number) => `${listId}-opt-${i}`;
  const message =
    status === 'loading' ? 'Đang tìm…' : status === 'error' ? 'Không tìm được. Thử lại sau.' : status === 'ready' && items.length === 0 ? 'Không tìm thấy kết quả.' : null;

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && activeItem !== undefined ? optionId(active) : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          run(e.target.value);
        }}
        onFocus={() => {
          if (query === '' && status === 'idle') return;
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={controlClass}
        {...aria}
      />
      <div aria-live="polite" className="sr-only">
        {open && status === 'ready' ? `${items.length} kết quả` : ''}
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-control border border-line bg-surface py-1 shadow-pop"
        >
          {items.map((item, i) => (
            <li
              key={itemKey(item)}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(item); }}
              onMouseMove={() => setActive(i)}
              className={cn('flex min-h-touch cursor-pointer items-center px-3 py-1.5 text-sm text-ink', i === active && 'bg-surface-3')}
            >
              {renderItem ? renderItem(item) : itemLabel(item)}
            </li>
          ))}
          {message && <li role="presentation" className="px-3 py-2 text-sm text-ink-muted">{message}</li>}
        </ul>
      )}
    </div>
  );
}

/** Keeps results that match the query, prefix matches first, otherwise the server order. */
function rank<T>(found: ReadonlyArray<T>, q: string, label: (t: T) => string): ReadonlyArray<T> {
  if (q.trim() === '') return found;
  const matching = found.filter((t) => matchesQuery(q, label(t)));
  const lead = q.trim().toLowerCase();
  return matching
    .map((t, i) => ({ t, i, starts: label(t).toLowerCase().startsWith(lead) ? 0 : 1 }))
    .sort((a, b) => a.starts - b.starts || a.i - b.i)
    .map((x) => x.t);
}
