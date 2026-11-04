'use client';

import { useMemo, useRef } from 'react';
import { Alert, Badge, Button, IconButton, PrintLink, RichHtml, SectionCard, StatusBadge, useToast } from '@/components/ui';
import { useSettings } from '@/core/auth';
import type { IsoDate, SanitizedHtml } from '@/core/brand';
import type { DocumentTemplate } from '../contract';
import type { SceEvent } from '@/features/progress';
import { hasDataTable, plainText } from '../domain/catalog';
import { NO_CODE_LABEL, TEMPLATE_KINDS, TEMPLATE_LEVELS, TEMPLATE_ORIGINS } from '../domain/levels';
import { templatePrintHref } from '../domain/key-mapping';
import { MERGE_TAGS, missingTags, renderTemplate, tagNamesIn, tagByName } from '../domain/merge-tags';
import { downloadTemplateExcel, downloadTemplateWord, NO_TABLE_MESSAGE } from './studio-exports';

/** The blank a missing value leaves is highlighted on screen only; printed and exported it is plain dots. */
const BLANK_CSS = '.tpl-blank { background: color-mix(in srgb, var(--warning-ink) 22%, transparent); border-radius: 2px; text-decoration: underline dotted; text-decoration-color: var(--warning-ink); }';

export function TemplatePreview({ template, event, today, isAdmin }: { template: DocumentTemplate; event: SceEvent | null; today: IsoDate; isAdmin: boolean }) {
  const settings = useSettings();
  const toast = useToast();
  const paper = useRef<HTMLDivElement>(null);

  const ctx = useMemo(() => (event ? { event, settings, today } : null), [event, settings, today]);
  // Derived on every render from the selected template and event, never cached beside them (m3 B20).
  const html: SanitizedHtml = useMemo(() => (ctx ? renderTemplate(template, ctx) : template.content), [ctx, template]);
  const missing = useMemo(() => (ctx ? missingTags(template.content, ctx) : []), [ctx, template]);
  const manual = useMemo(() => MERGE_TAGS.filter((t) => t.source === 'manual' && tagNamesIn(template.content).some((n) => tagByName(n) === t)), [template]);
  const text = useMemo(() => plainText(html), [html]);
  const words = text ? text.split(/\s+/).length : 0;
  const hasTable = hasDataTable(template.content);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(paper.current?.innerText ?? text);
      toast.success('Đã sao chép nội dung biểu mẫu!');
    } catch {
      toast.error('Không sao chép được. Hãy bôi đen nội dung rồi nhấn Ctrl+C.');
    }
  };
  const word = () => {
    downloadTemplateWord(template, html);
    toast.success(`Đã tạo file Word (.doc): ${template.title}`);
  };
  const excel = async () => {
    if (await downloadTemplateExcel(template, html, event?.name ?? null)) toast.success('Đã xuất file bảng biểu Excel thành công!');
    else toast.info(NO_TABLE_MESSAGE);
  };

  return (
    <SectionCard
      title={template.title}
      subtitle={template.description}
      icon="file-signature"
      actions={
        <>
          <Button icon="download" onClick={word}>Tải Word (.doc)</Button>
          {hasTable && <Button variant="secondary" icon="file-spreadsheet" onClick={() => void excel()}>Tải Excel (.xlsx)</Button>}
          <PrintLink href={templatePrintHref(template.id, event?.id ?? null)} label="In / PDF" />
          <IconButton icon="copy" label="Sao chép nội dung văn bản" onClick={() => void copy()} />
          {isAdmin && <Button variant="secondary" icon="pencil" href={`/admin/templates?edit=${encodeURIComponent(template.id)}`}>Sửa mẫu (Admin)</Button>}
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="slate">{template.code || NO_CODE_LABEL}</Badge>
          <Badge tone={TEMPLATE_LEVELS[template.level].tone}>{TEMPLATE_LEVELS[template.level].label}</Badge>
          <Badge tone={TEMPLATE_KINDS[template.kind].tone}>{TEMPLATE_KINDS[template.kind].short}</Badge>
          <StatusBadge registry={TEMPLATE_ORIGINS} value={template.origin} />
        </div>

        {!event && <Alert tone="info" title="Chưa chọn sự kiện">Biểu mẫu hiện các thẻ {'{{…}}'} chưa điền. Chọn sự kiện ở ô “Điền dữ liệu từ” để tự động điền thông tin.</Alert>}
        {missing.length > 0 && (
          <Alert tone="warning" title="Sự kiện còn thiếu thông tin" action={event ? <Button variant="secondary" href={`/events/${event.id}/plan`}>Mở sự kiện</Button> : undefined}>
            Biểu mẫu cần: {missing.map((t) => t.label).join(', ')}. Chỗ thiếu hiện dưới dạng “……”; hãy bổ sung trong sự kiện hoặc điền tay sau khi tải về.
          </Alert>
        )}
        {manual.length > 0 && <Alert tone="info">Có chỗ để trống cần điền tay: {manual.map((t) => t.label.replace(/ \(điền tay\)$/, '')).join(', ')}.</Alert>}

        <style>{BLANK_CSS}</style>
        <div ref={paper} className="mx-auto w-full max-w-3xl overflow-x-auto bg-paper p-4 font-serif text-print-base leading-snug text-paper-ink shadow-pop sm:p-8">
          <RichHtml html={html} />
        </div>

        <p className="flex flex-wrap justify-between gap-2 text-xs text-ink-muted" aria-live="polite">
          <span>{words} từ • {text.length} ký tự</span>
          <span>{event ? `Đã tự động điền thông tin: “${event.name}”` : 'Mẫu chuẩn ban hành • Sẵn sàng tải về'}</span>
        </p>
      </div>
    </SectionCard>
  );
}
