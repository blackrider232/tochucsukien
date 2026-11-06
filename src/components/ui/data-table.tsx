'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Column, DataTableProps } from './kit.types';
import { cn } from './cn';
import { Icon } from './icons';
import { EmptyState } from './empty-state';

type SortState = { id: string; dir: 'asc' | 'desc' } | null;

const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;
const JUSTIFY = { left: 'justify-start', center: 'justify-center', right: 'justify-end' } as const;
const MD_JUSTIFY = { left: 'md:justify-start', center: 'md:justify-center', right: 'md:justify-end' } as const;

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

const SKELETON_ROWS = 5;
const EYEBROW = 'text-xs font-semibold text-ink-muted';

export function DataTable<Row>({
  rows, columns, rowKey, empty, numbered, stickyHeader, maxHeight, minWidth, rowTone, selection, toolbar, loading,
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
  // Phones scroll the page, never a box inside it, so the height limit applies from md up.
  const tableMax = stickyHeader ? (maxHeight ?? 'min(70dvh, 40rem)') : maxHeight;
  const hasToolbar = Boolean(toolbar) || Boolean(selection);
  const [first, ...rest] = columns;
  const selectAll = (
    <SelectBox label="Chọn tất cả" checked={allSelected} indeterminate={selectedCount > 0 && !allSelected} onChange={toggleAll} />
  );

  return (
    <div className="space-y-2">
      {hasToolbar && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {selection && rows.length > 0 && <div className="flex items-center md:hidden">{selectAll}<span className="text-sm text-ink-2">Chọn tất cả</span></div>}
            <p aria-live="polite" className="text-sm font-medium text-ink-2">
              {selection && selectedCount > 0 ? `Đã chọn ${selectedCount} / ${rows.length} dòng` : ''}
            </p>
          </div>
          {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
        </div>
      )}
      {rows.length === 0 && !loading ? (
        <div className="rounded-card border border-line bg-surface">
          <EmptyState {...empty} />
        </div>
      ) : (
        <div
          className="relative overflow-auto rounded-card border border-line bg-surface md:max-h-(--table-max) md:shadow-card"
          style={tableMax ? ({ '--table-max': tableMax } as CSSProperties) : undefined}
        >
          <div
            role="table"
            aria-busy={loading || undefined}
            className="w-full text-sm md:min-w-(--table-min)"
            style={{ '--table-min': minWidth ?? '0', '--cols': gridCols } as CSSProperties}
          >
            <div role="rowgroup" className={cn('max-md:hidden', stickyHeader && 'sticky top-0 z-10')}>
              <div role="row" className="border-b border-line bg-surface-2 md:grid md:grid-cols-(--cols)">
                {selection && (
                  <div role="columnheader" className="flex items-center justify-center">{selectAll}</div>
                )}
                {numbered && <div role="columnheader" className={cn('flex min-h-11 items-center justify-center px-2', EYEBROW)}>STT</div>}
                {columns.map((c) => {
                  const dir = sort?.id === c.id ? sort.dir : null;
                  return (
                    <div
                      key={c.id}
                      role="columnheader"
                      aria-sort={c.sortValue ? (dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none') : undefined}
                      className={cn('flex min-h-11 min-w-0 items-center px-3', EYEBROW, ALIGN[c.align ?? 'left'], JUSTIFY[c.align ?? 'left'])}
                    >
                      {c.sortValue ? (
                        <button
                          type="button"
                          onClick={() => cycleSort(c.id)}
                          className="-mx-1 inline-flex min-h-8 items-center gap-1 rounded-control px-1 hover:text-ink pointer-coarse:min-h-touch"
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
            <div role="rowgroup">
              {loading && rows.length === 0 ? (
                <SkeletonRows columns={columns.length + (selection ? 1 : 0) + (numbered ? 1 : 0)} />
              ) : (
                sorted.map((row, index) => {
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
                        'border-b border-line last:border-b-0 hover:bg-surface-3 max-md:px-3 max-md:py-2 md:grid md:grid-cols-(--cols)',
                        tone && 'shadow-[inset_4px_0_0_var(--tone-solid)]',
                        selected && 'bg-selected',
                      )}
                    >
                      {/* On phones the checkbox, STT and the first column share one line: the row's title. */}
                      <div className="flex items-center gap-2 md:contents">
                        {selection && (
                          <div role="cell" className="flex items-center justify-center max-md:-ml-2">
                            <SelectBox label={`Chọn dòng ${index + 1}`} checked={selected} onChange={(next) => toggleOne(key, next)} />
                          </div>
                        )}
                        {numbered && (
                          <div role="cell" className="flex items-center justify-center tabular-nums text-ink-muted md:px-2 md:py-2.5">
                            {index + 1}<span className="md:hidden">.</span>
                          </div>
                        )}
                        {first && <Cell column={first} title>{first.cell(row, index)}</Cell>}
                      </div>
                      {rest.map((c) => (
                        <Cell key={c.id} column={c}>{c.cell(row, index)}</Cell>
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          </div>
          {loading && <p className="sr-only" role="status">Đang tải dữ liệu…</p>}
        </div>
      )}
    </div>
  );
}

function SkeletonRows({ columns }: { columns: number }) {
  return Array.from({ length: SKELETON_ROWS }, (_, r) => (
    <div key={r} role="row" aria-hidden="true" className="border-b border-line last:border-b-0 max-md:px-3 max-md:py-3 md:grid md:grid-cols-(--cols)">
      {Array.from({ length: columns }, (_, c) => (
        <div key={c} className={cn('px-3 py-3.5', c > 0 && 'max-md:hidden')}>
          <span className="block h-3 w-3/4 animate-pulse rounded-full bg-surface-3" />
        </div>
      ))}
    </div>
  ));
}

function Cell<Row>({ column, title, children }: { column: Column<Row>; title?: boolean; children: ReactNode }) {
  return (
    <div
      role="cell"
      className={cn(
        'min-w-0 text-ink md:flex md:items-center md:px-3 md:py-2.5',
        ALIGN[column.align ?? 'left'],
        MD_JUSTIFY[column.align ?? 'left'],
        title ? 'max-md:flex-1 max-md:text-left max-md:font-semibold' : 'max-md:flex max-md:items-baseline max-md:justify-between max-md:gap-3 max-md:py-0.5',
        column.hideOnMobile && 'max-md:hidden',
      )}
    >
      {!title && <span className={cn('shrink-0 md:hidden', EYEBROW)}>{column.header}</span>}
      <span className={cn('min-w-0', !title && 'max-md:text-right')}>{children}</span>
    </div>
  );
}
