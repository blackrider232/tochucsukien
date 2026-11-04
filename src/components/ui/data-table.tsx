'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Column, DataTableProps } from './kit.types';
import { cn } from './cn';
import { Icon } from './icons';
import { EmptyState } from './empty-state';

type SortState = { id: string; dir: 'asc' | 'desc' } | null;

const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;
const JUSTIFY = { left: 'justify-start', center: 'justify-center', right: 'justify-end' } as const;

function compare(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'vi', { numeric: true, sensitivity: 'base' });
}

/** Sorted copy; ties keep the original order. */
export function sortRows<Row>(rows: ReadonlyArray<Row>, column: Column<Row> | undefined, dir: 'asc' | 'desc'): ReadonlyArray<Row> {
  const value = column?.sortValue;
  if (!value) return rows;
  const sign = dir === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, key: value(row) }))
    .sort((x, y) => compare(x.key, y.key) * sign || x.index - y.index)
    .map((x) => x.row);
}

function SelectBox({ label, checked, indeterminate, onChange }: { label: string; checked: boolean; indeterminate?: boolean; onChange: (next: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);
  return (
    <label className="flex size-touch cursor-pointer items-center justify-center">
      <input ref={ref} type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-primary" />
    </label>
  );
}

export function DataTable<Row>({
  rows, columns, rowKey, empty, numbered, stickyHeader, maxHeight, minWidth, rowTone, selection, toolbar,
}: DataTableProps<Row>) {
  const [sort, setSort] = useState<SortState>(null);

  const sorted = useMemo(
    () => (sort ? sortRows(rows, columns.find((c) => c.id === sort.id), sort.dir) : rows),
    [rows, columns, sort],
  );

  const cycleSort = (id: string) =>
    setSort((s) => (s?.id !== id ? { id, dir: 'asc' } : s.dir === 'asc' ? { id, dir: 'desc' } : null));

  const keys = sorted.map(rowKey);
  const selectedCount = selection ? keys.filter((k) => selection.selected.has(k)).length : 0;
  const allSelected = keys.length > 0 && selectedCount === keys.length;

  const toggleAll = (next: boolean) => {
    if (!selection) return;
    const out = new Set(selection.selected);
    for (const k of keys) {
      if (next) out.add(k);
      else out.delete(k);
    }
    selection.onChange(out);
  };
  const toggleOne = (key: string, next: boolean) => {
    if (!selection) return;
    const out = new Set(selection.selected);
    if (next) out.add(key);
    else out.delete(key);
    selection.onChange(out);
  };

  const gridCols = [selection ? '3rem' : null, numbered ? '3.5rem' : null, ...columns.map((c) => c.width ?? 'minmax(0, 1fr)')]
    .filter(Boolean)
    .join(' ');
  const scrollStyle = stickyHeader ? { maxHeight: maxHeight ?? 'min(70dvh, 40rem)' } : maxHeight ? { maxHeight } : undefined;
  const hasToolbar = Boolean(toolbar) || Boolean(selection);

  return (
    <div className="space-y-2">
      {hasToolbar && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p aria-live="polite" className="text-sm font-medium text-ink-2">
            {selection && selectedCount > 0 ? `Đã chọn ${selectedCount} / ${rows.length} dòng` : ''}
          </p>
          {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
        </div>
      )}
      {rows.length === 0 ? (
        <div className="rounded-card border border-line bg-surface">
          <EmptyState {...empty} />
        </div>
      ) : (
        <div className="overflow-auto rounded-card border border-line bg-surface md:shadow-card" style={scrollStyle}>
          <div
            role="table"
            className="w-full text-sm md:min-w-(--table-min)"
            style={{ '--table-min': minWidth ?? '0', '--cols': gridCols } as CSSProperties}
          >
            <div role="rowgroup" className={cn('max-md:hidden', stickyHeader && 'sticky top-0 z-10')}>
              <div role="row" className="border-b border-line bg-surface-2 md:grid md:grid-cols-(--cols)">
                {selection && (
                  <div role="columnheader" className="flex items-center justify-center">
                    <SelectBox label="Chọn tất cả" checked={allSelected} indeterminate={selectedCount > 0 && !allSelected} onChange={toggleAll} />
                  </div>
                )}
                {numbered && <div role="columnheader" className="flex items-center justify-center px-2 py-2.5 text-xs font-bold uppercase tracking-wide text-ink-muted">STT</div>}
                {columns.map((c) => {
                  const dir = sort?.id === c.id ? sort.dir : null;
                  return (
                    <div
                      key={c.id}
                      role="columnheader"
                      aria-sort={c.sortValue ? (dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none') : undefined}
                      className={cn('min-w-0 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-ink-muted', ALIGN[c.align ?? 'left'])}
                    >
                      {c.sortValue ? (
                        <button
                          type="button"
                          onClick={() => cycleSort(c.id)}
                          className={cn('-mx-1 inline-flex min-h-8 items-center gap-1 rounded px-1 font-bold uppercase hover:text-ink', JUSTIFY[c.align ?? 'left'])}
                        >
                          {c.header}
                          <Icon name={dir === 'desc' ? 'chevron-down' : 'chevron-right'} size={12} className={cn(dir === 'asc' && '-rotate-90', !dir && 'opacity-40')} />
                          <span className="sr-only">{dir === 'asc' ? ', tăng dần' : dir === 'desc' ? ', giảm dần' : ', chưa sắp xếp'}</span>
                        </button>
                      ) : (
                        c.header
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div role="rowgroup" className="max-md:space-y-3 max-md:p-3">
              {sorted.map((row, index) => {
                const key = rowKey(row);
                const tone = rowTone?.(row) ?? null;
                const selected = selection?.selected.has(key) ?? false;
                return (
                  <div
                    key={key}
                    role="row"
                    aria-selected={selection ? selected : undefined}
                    data-tone={tone ?? undefined}
                    className={cn(
                      'border-b border-line last:border-b-0 hover:bg-surface-2 md:grid md:grid-cols-(--cols) max-md:flex max-md:flex-col max-md:rounded-control max-md:border max-md:p-1',
                      tone && 'border-l-4 border-l-(--tone-solid) bg-(--tone-bg)',
                      selected && 'bg-surface-3',
                    )}
                  >
                    {selection && (
                      <div role="cell" className="flex items-center justify-center max-md:justify-start max-md:pl-1">
                        <SelectBox label={`Chọn dòng ${index + 1}`} checked={selected} onChange={(next) => toggleOne(key, next)} />
                      </div>
                    )}
                    {numbered && (
                      <div role="cell" className="flex items-center justify-center px-2 py-2.5 tabular-nums text-ink-muted max-md:justify-start max-md:py-1">
                        <span className="md:hidden">STT&nbsp;</span>{index + 1}
                      </div>
                    )}
                    {columns.map((c) => (
                      <Cell key={c.id} column={c}>{c.cell(row, index)}</Cell>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Cell<Row>({ column, children }: { column: Column<Row>; children: ReactNode }) {
  return (
    <div
      role="cell"
      className={cn(
        'min-w-0 px-3 py-2.5 text-ink max-md:flex max-md:items-baseline max-md:justify-between max-md:gap-3 max-md:py-1.5',
        ALIGN[column.align ?? 'left'],
        column.hideOnMobile && 'max-md:text-xs max-md:text-ink-muted',
      )}
    >
      <span className="hidden shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-muted max-md:inline">{column.header}</span>
      <span className="min-w-0 max-md:text-right">{children}</span>
    </div>
  );
}
