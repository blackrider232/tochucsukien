'use client';

import { useId } from 'react';
import type { FilterBarProps } from './kit.types';
import { Icon } from './icons';
import { controlClass, labelClass } from './control-class';

export function FilterBar({ search, filters, trailing }: FilterBarProps) {
  const searchId = useId();
  return (
    <div role="search" className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1 basis-56">
        <label htmlFor={searchId} className={`mb-1 ${labelClass}`}>{search.label ?? 'Tìm kiếm'}</label>
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
      <label htmlFor={id} className={`mb-1 ${labelClass}`}>{filter.label}</label>
      <select id={id} value={filter.value} onChange={(e) => filter.onChange(e.target.value)} className={controlClass}>
        {filter.options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
