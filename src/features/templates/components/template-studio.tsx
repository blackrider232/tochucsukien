'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, FilterBar, SectionCard, Tabs, useToast } from '@/components/ui';
import type { IsoDate, SanitizedHtml } from '@/core/brand';
import { useSettings } from '@/core/auth';
import { formatVNDate } from '@/core/dates';
import type { SceEvent } from '@/features/progress';
import type { DocumentTemplate } from '../contract';
import { catalogCounts, filterTemplates } from '../domain/catalog';
import { templatePrintHref } from '../domain/key-mapping';
import { TEMPLATE_LEVELS, TEMPLATE_LEVEL_VALUES } from '../domain/levels';
import { DEFAULT_TEMPLATE_ID, initialState, NO_EVENT, pickTemplate, studioHref, type StudioParams, type StudioState } from '../domain/studio-state';
import { renderTemplate } from '../domain/merge-tags';
import { downloadCatalogExcel, downloadTemplateExcel, downloadTemplateWord, NO_TABLE_MESSAGE } from './studio-exports';
import { TemplateList } from './template-list';
import { TemplatePreview } from './template-preview';

export interface StudioProps {
  templates: ReadonlyArray<DocumentTemplate>;
  events: ReadonlyArray<SceEvent>;
  today: IsoDate;
  isAdmin: boolean;
  params: StudioParams;
}

/** Screen A: the catalog on the left, the filled-in document on the right. State lives in the address, so a link reopens the same view. */
export function TemplateStudio({ templates, events, today, isAdmin, params }: StudioProps) {
  const settings = useSettings();
  const toast = useToast();
  const [state, setState] = useState<StudioState>(() => initialState(params, events, today));
  const preview = useRef<HTMLDivElement>(null);
  const counts = useMemo(() => catalogCounts(templates), [templates]);
  const selected = pickTemplate(templates, state.templateId);
  const visible = useMemo(() => filterTemplates(templates, { level: state.level, query: state.query }), [templates, state.level, state.query]);
  const event = events.find((e) => e.id === state.eventId) ?? null;
  const change = (patch: Partial<StudioState>) => setState((s) => ({ ...s, ...patch }));

  useEffect(() => {
    window.history.replaceState(null, '', studioHref({ ...state, templateId: selected?.id ?? state.templateId }));
  }, [state, selected?.id]);

  const select = (id: string) => {
    change({ templateId: id });
    // On a phone the preview sits below the list.
    if (!window.matchMedia('(min-width: 1024px)').matches) preview.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const mergedHtml = (t: DocumentTemplate): SanitizedHtml => (event ? renderTemplate(t, { event, settings, today }) : t.content);
  const actions = {
    word(t: DocumentTemplate) {
      downloadTemplateWord(t, mergedHtml(t));
      toast.success(`Đã tạo file Word (.doc): ${t.title}`);
    },
    async excel(t: DocumentTemplate) {
      if (await downloadTemplateExcel(t, mergedHtml(t), event?.name ?? null)) toast.success('Đã xuất file bảng biểu Excel thành công!');
      else toast.info(NO_TABLE_MESSAGE);
    },
    printHref: (t: DocumentTemplate) => templatePrintHref(t.id, event?.id ?? null),
  };

  const eventOptions = events.length === 0
    ? [{ value: NO_EVENT, label: '(Chưa có sự kiện nào)' }]
    : [{ value: NO_EVENT, label: 'Mẫu trắng (chưa điền sự kiện)' }, ...events.map((e) => ({ value: e.id, label: `${e.name} (${formatVNDate(e.eventDate)})` }))];

  return (
    <div className="space-y-4">
      <FilterBar
        search={{ value: state.query, onChange: (query) => change({ query }), placeholder: 'Tìm tờ trình, giấy mời, kịch bản, thẻ...' }}
        filters={[{ id: 'event', label: 'Điền dữ liệu từ', value: state.eventId, options: eventOptions, onChange: (eventId) => change({ eventId }) }]}
        trailing={
          <>
            <Button variant="secondary" icon="file-spreadsheet" onClick={() => void downloadCatalogExcel(templates)}>Danh mục (Excel)</Button>
            {isAdmin && <Button variant="secondary" icon="layout-template" href="/admin/templates">Quản trị biểu mẫu</Button>}
          </>
        }
      />

      {/* The kit's tab list does not contain its screen-reader counts, which widen the page on a phone; clipping here does. */}
      <div className="relative overflow-x-clip">
        <Tabs
          variant="pill"
          value={state.level}
          onChange={(level) => change({ level: level as StudioState['level'] })}
          items={[
            { id: 'all', label: 'Tất cả biểu mẫu', count: counts.total },
            ...TEMPLATE_LEVEL_VALUES.map((l) => ({ id: l, label: TEMPLATE_LEVELS[l].short, icon: TEMPLATE_LEVELS[l].icon, count: counts.byLevel[l] })),
          ]}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <SectionCard title="Danh mục biểu mẫu" icon="layers" actions={<Badge tone="slate">{visible.length} mẫu</Badge>}>
            <TemplateList templates={visible} selectedId={selected?.id ?? ''} onSelect={select} actions={actions} />
          </SectionCard>
        </div>
        <div ref={preview} className="scroll-mt-4 lg:col-span-8">
          {selected ? (
            <TemplatePreview template={selected} event={event} today={today} isAdmin={isAdmin} />
          ) : (
            <Alert
              tone="warning"
              title="Biểu mẫu này không còn tồn tại"
              action={<Button variant="secondary" onClick={() => change({ templateId: DEFAULT_TEMPLATE_ID })}>Về thư viện biểu mẫu</Button>}
            >
              Liên kết trỏ tới một biểu mẫu đã bị xóa hoặc không có trong danh mục. Chọn một biểu mẫu ở danh sách bên trái.
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
