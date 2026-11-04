'use client';

import { Badge, EmptyState, RowMenu, cn, type RowMenuItem } from '@/components/ui';
import type { DocumentTemplate } from '../contract';
import { hasDataTable } from '../domain/catalog';
import { NO_CODE_LABEL, TEMPLATE_KINDS } from '../domain/levels';

export interface ListActions {
  word(t: DocumentTemplate): void;
  excel(t: DocumentTemplate): void;
  printHref(t: DocumentTemplate): string;
}

/** The selectable catalog. Selecting is a real button, so the list works with the keyboard and a screen reader (m3 B39). */
export function TemplateList({ templates, selectedId, onSelect, actions }: {
  templates: ReadonlyArray<DocumentTemplate>;
  selectedId: string;
  onSelect: (id: string) => void;
  actions: ListActions;
}) {
  if (templates.length === 0) return <EmptyState icon="search" title="Không tìm thấy biểu mẫu phù hợp." text="Đổi từ khóa hoặc chọn nhóm khác." />;
  return (
    <ul className="space-y-2 lg:max-h-screen lg:overflow-y-auto lg:pr-1">
      {templates.map((t) => {
        const selected = t.id === selectedId;
        const menu: RowMenuItem[] = [
          { id: 'word', label: 'Tải Word (.doc)', icon: 'download', onSelect: () => actions.word(t) },
          ...(hasDataTable(t.content) ? [{ id: 'excel', label: 'Tải Excel (.xlsx)', icon: 'file-spreadsheet' as const, onSelect: () => actions.excel(t) }] : []),
          { id: 'print', label: 'In / PDF', icon: 'printer', href: actions.printHref(t) },
        ];
        return (
          <li key={t.id} className={cn('flex items-start gap-1 rounded-control border p-2 pl-3', selected ? 'border-link bg-selected' : 'border-line bg-surface')}>
            <button type="button" aria-pressed={selected} onClick={() => onSelect(t.id)} className="min-h-touch min-w-0 flex-1 py-1 text-left">
              <span className="flex flex-wrap items-center gap-1.5">
                {t.code ? <Badge tone="slate">{t.code}</Badge> : <Badge tone="slate">{NO_CODE_LABEL}</Badge>}
                <Badge tone={TEMPLATE_KINDS[t.kind].tone}>{TEMPLATE_KINDS[t.kind].short}</Badge>
              </span>
              <span className="mt-1 line-clamp-2 block text-sm font-semibold text-ink">{t.title}</span>
              <span className="line-clamp-1 block text-xs text-ink-muted">{t.description}</span>
            </button>
            <RowMenu label={`Thao tác với ${t.title}`} items={menu} />
          </li>
        );
      })}
    </ul>
  );
}
