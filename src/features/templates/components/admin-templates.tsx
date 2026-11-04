'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, DataTable, FilterBar, KpiCard, RowMenu, SectionCard, StatusBadge, useDialogs, useToast } from '@/components/ui';
import { useCommand } from '@/core/commands';
import type { TemplateId, Uuid } from '@/core/brand';
import type { DocumentTemplate } from '../contract';
import { catalogCounts, filterTemplates } from '../domain/catalog';
import { templateHref } from '../domain/key-mapping';
import { NO_CODE_LABEL, TEMPLATE_KINDS, TEMPLATE_LEVELS, TEMPLATE_LEVEL_VALUES, TEMPLATE_ORIGINS } from '../domain/levels';
import { downloadCatalogExcel } from './studio-exports';
import { TemplateEditor, type EditorTarget } from './template-editor';

export interface AdminTemplatesProps {
  templates: ReadonlyArray<DocumentTemplate>;
  /** ?edit=<id>: open that template's editor straight away (the "Sửa mẫu" button on the library). */
  editId?: string;
}

const KPI_CAPTIONS = { cap_ubnd: 'Kế hoạch, Giấy mời, Báo cáo', cap_stc: 'Tờ trình & Báo cáo TP', cap_trungtam: 'Tác nghiệp & Ký hiệu -TTXT' } as const;

type CustomId = Uuid<'Template'> & TemplateId;

/** Screen B: every template with its status, and the actions only an admin has. */
export function AdminTemplates({ templates, editId }: AdminTemplatesProps) {
  const run = useCommand();
  const dialogs = useDialogs();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('all');
  const [target, setTarget] = useState<EditorTarget | null>(() => {
    const t = editId ? templates.find((x) => x.id === editId) : undefined;
    return t ? { kind: 'edit', template: t } : null;
  });
  const counts = useMemo(() => catalogCounts(templates), [templates]);
  const rows = useMemo(() => filterTemplates(templates, { level: level === 'all' ? 'all' : (level as DocumentTemplate['level']), query }), [templates, level, query]);

  const resetOne = async (t: DocumentTemplate) => {
    const ok = await dialogs.confirm({
      title: 'Khôi phục về mẫu gốc ban đầu?',
      text: `Mọi sửa đổi của Admin đối với biểu mẫu "${t.title}" sẽ bị hủy bỏ và quay lại mẫu chuẩn ban hành. Có thể hoàn tác ngay sau khi khôi phục.`,
      confirmLabel: 'Đồng ý khôi phục', cancelLabel: 'Hủy', tone: 'warning',
    });
    if (ok) await run('templates.resetOne', { id: t.id }, { success: 'Đã khôi phục. Biểu mẫu đã được đưa về trạng thái chuẩn ban hành của SCE.' });
  };
  const resetAll = async () => {
    if (counts.overrides === 0) return toast.info('Chưa có biểu mẫu gốc nào bị sửa.');
    const ok = await dialogs.confirm({
      title: `Khôi phục ${counts.overrides} biểu mẫu gốc đã sửa?`,
      text: `${counts.overrides} biểu mẫu gốc đã sửa sẽ quay về mẫu chuẩn ban hành. ${counts.custom} biểu mẫu do Admin tạo được giữ nguyên. Có thể hoàn tác ngay sau khi khôi phục.`,
      confirmLabel: 'Xác nhận khôi phục tất cả', cancelLabel: 'Hủy', tone: 'warning',
    });
    if (ok) await run('templates.resetAll', {}, { success: 'Đã khôi phục toàn bộ biểu mẫu gốc.' });
  };
  const remove = async (t: DocumentTemplate) => {
    const ok = await dialogs.confirm({
      title: 'Xóa biểu mẫu này?',
      text: `Bạn có chắc chắn muốn xóa biểu mẫu "${t.title}" khỏi hệ thống? Có thể hoàn tác ngay sau khi xóa.`,
      confirmLabel: 'Xóa biểu mẫu', cancelLabel: 'Hủy', tone: 'danger',
    });
    if (ok) await run('templates.deleteCustom', { id: t.id as CustomId, version: t.version! }, { success: 'Đã xóa. Biểu mẫu đã được gỡ bỏ khỏi hệ thống.' });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Tổng biểu mẫu chuẩn" value={counts.total} icon="layers" accent="purple" caption="Nghị định 30/2020/NĐ-CP" />
        {TEMPLATE_LEVEL_VALUES.map((l) => (
          <KpiCard key={l} label={TEMPLATE_LEVELS[l].short} value={counts.byLevel[l]} icon={TEMPLATE_LEVELS[l].icon} accent={TEMPLATE_LEVELS[l].tone} caption={KPI_CAPTIONS[l]} />
        ))}
      </div>

      <SectionCard
        title="Quản trị và sửa đổi các loại biểu mẫu chuẩn"
        subtitle="Chỉ Quản trị viên mới có quyền sửa đổi nội dung mẫu gốc, mã hiệu và thẻ trộn dữ liệu. Thay đổi áp dụng ngay cho toàn bộ chuyên viên."
        icon="layout-template"
        actions={
          <>
            <Button icon="plus" onClick={() => setTarget({ kind: 'create' })}>Thêm biểu mẫu mới</Button>
            <Button variant="secondary" icon="refresh" onClick={() => void resetAll()}>Khôi phục mẫu gốc SCE</Button>
            <Button variant="secondary" icon="file-spreadsheet" onClick={() => void downloadCatalogExcel(templates)}>Xuất Excel</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FilterBar
            search={{ value: query, onChange: setQuery, placeholder: 'Tìm theo tên biểu mẫu, mã hiệu (TT-SCE...), mô tả...' }}
            filters={[{
              id: 'level', label: 'Phân cấp thẩm quyền', value: level, onChange: setLevel,
              options: [{ value: 'all', label: `Tất cả phân cấp thẩm quyền (${counts.total} mẫu)` }, ...TEMPLATE_LEVEL_VALUES.map((l) => ({ value: l, label: TEMPLATE_LEVELS[l].label }))],
            }]}
          />
          <DataTable
            rows={rows}
            rowKey={(t) => t.id}
            numbered
            minWidth="48rem"
            empty={{ icon: 'search', title: 'Không tìm thấy biểu mẫu nào theo tiêu chí tìm kiếm.' }}
            columns={[
              { id: 'title', header: 'Tên biểu mẫu chuẩn', width: '36%', cell: (t) => (
                <div>
                  <p className="font-semibold text-ink">{t.title}</p>
                  <p className="line-clamp-1 text-xs text-ink-muted">{t.description}</p>
                </div>
              ) },
              { id: 'code', header: 'Mã hiệu', hideOnMobile: true, cell: (t) => (t.code ? <Badge tone="slate">{t.code}</Badge> : <span className="text-xs italic text-ink-muted">{NO_CODE_LABEL}</span>) },
              { id: 'level', header: 'Nhóm quy trình', hideOnMobile: true, cell: (t) => TEMPLATE_LEVELS[t.level].label },
              { id: 'kind', header: 'Định dạng', hideOnMobile: true, cell: (t) => TEMPLATE_KINDS[t.kind].adminShort },
              { id: 'status', header: 'Trạng thái', cell: (t) => <StatusBadge registry={TEMPLATE_ORIGINS} value={t.origin} size="sm" /> },
              { id: 'actions', header: 'Thao tác', align: 'right', cell: (t) => (
                <RowMenu
                  label={`Thao tác với ${t.title}`}
                  items={[
                    { id: 'edit', label: 'Chỉnh sửa nội dung', icon: 'pencil', onSelect: () => setTarget({ kind: 'edit', template: t }) },
                    { id: 'preview', label: 'Xem trước biểu mẫu', icon: 'eye', href: templateHref(t.id, null) },
                    ...(t.origin === 'override' ? [{ id: 'reset', label: 'Khôi phục về mẫu gốc', icon: 'refresh' as const, onSelect: () => void resetOne(t) }] : []),
                    ...(t.origin === 'custom' ? [{ id: 'delete', label: 'Xóa biểu mẫu', icon: 'trash' as const, tone: 'danger' as const, onSelect: () => void remove(t) }] : []),
                  ]}
                />
              ) },
            ]}
          />
        </div>
      </SectionCard>

      {target && <TemplateEditor key={target.kind === 'edit' ? `${target.template.id}@${target.template.version}` : 'create'} target={target} onClose={() => setTarget(null)} />}
    </div>
  );
}
