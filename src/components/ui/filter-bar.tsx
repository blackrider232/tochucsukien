'use client';

import { useId } from 'react';
import type { FilterBarProps } from './kit.types';
import { Icon } from './icons';

export const controlClass =
  'min-h-touch w-full rounded-control border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-muted aria-invalid:border-red-600 disabled:bg-surface-3 disabled:text-ink-muted';

export function FilterBar({ search, filters, trailing }: FilterBarProps) {
  const searchId = useId();
  return (
    <div role="search" className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1 basis-56">
        <label htmlFor={searchId} className="sr-only">{search.placeholder}</label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted">
            <Icon name="search" size={16} />
          </span>
          <input
            id={searchId}
            type="search"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder}
            autoComplete="off"
            className={`${controlClass} pl-9`}
          />
        </div>
      </div>
      {filters?.map((f) => (
        <FilterSelect key={f.id} filter={f} />
      ))}
      {trailing && <div className="flex flex-wrap items-center gap-2">{trailing}</div>}
    </div>
  );
}

function FilterSelect({ filter }: { filter: NonNullable<FilterBarProps['filters']>[number] }) {
  const id = useId();
  return (
    <div className="min-w-36 flex-1 basis-40 sm:flex-none">
      <label htmlFor={id} className="mb-0.5 block text-xs font-semibold text-ink-muted">{filter.label}</label>
      <select id={id} value={filter.value} onChange={(e) => filter.onChange(e.target.value)} className={controlClass}>
        {filter.options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
