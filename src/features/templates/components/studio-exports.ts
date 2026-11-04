// Downloads and copy for the studio and the admin list. Browser-only: they run from click handlers.

import { downloadWordHtml, downloadXlsx, xlsxSheet } from '@/components/ui';
import type { SanitizedHtml } from '@/core/brand';
import { fileDateStamp } from '@/core/dates';
import type { DocumentTemplate } from '../contract';
import { catalogFileName, catalogRows, dataTablesOf, templateFileName, type CatalogRow } from '../domain/export';

export const NO_TABLE_MESSAGE = 'Biểu mẫu này là văn bản thuần túy, không có bảng biểu để xuất file Excel. Vui lòng dùng "Tải Word (.doc)".';

/** Word-HTML saved as .doc, honestly labelled (decision 14). `html` is the document as shown, tags already merged. */
export function downloadTemplateWord(t: DocumentTemplate, html: SanitizedHtml): void {
  downloadWordHtml({ fileName: templateFileName(t, fileDateStamp(), 'doc'), title: t.title, body: html });
}

/** Each table with header cells becomes a sheet. Returns false when the document has none. */
export async function downloadTemplateExcel(t: DocumentTemplate, html: SanitizedHtml, eventName: string | null): Promise<boolean> {
  const tables = dataTablesOf(html);
  if (tables.length === 0) return false;
  const sheets = tables.map((table, i) => {
    const width = Math.max(table.header.length, ...table.rows.map((r) => r.length));
    return xlsxSheet({
      name: tables.length > 1 ? `Bảng ${i + 1}` : 'Bảng biểu',
      title: { lines: [t.title, ...(eventName ? [eventName] : [])] },
      columns: Array.from({ length: width }, (_, c) => ({ header: table.header[c] || `Cột ${c + 1}`, width: c === 0 ? 8 : 28, value: (row: ReadonlyArray<string>) => row[c] ?? '' })),
      rows: table.rows,
      freezeHeader: true,
    });
  });
  await downloadXlsx(templateFileName(t, fileDateStamp(), 'xlsx'), sheets);
  return true;
}

export async function downloadCatalogExcel(list: ReadonlyArray<DocumentTemplate>): Promise<void> {
  await downloadXlsx(catalogFileName(list.length, fileDateStamp()), [
    xlsxSheet<CatalogRow>({
      name: 'Danh mục biểu mẫu',
      title: { lines: [`DANH MỤC ${list.length} BIỂU MẪU CHUẨN`] },
      columns: [
        { header: 'STT', width: 6, value: (r) => r.index },
        { header: 'Mã Biểu Mẫu', width: 16, value: (r) => r.code },
        { header: 'Tên Biểu Mẫu', width: 60, value: (r) => r.title },
        { header: 'Nhóm Quy Trình', width: 34, value: (r) => r.level },
        { header: 'Định Dạng', width: 14, value: (r) => r.kind },
        { header: 'Mô Tả Mục Đích', width: 70, value: (r) => r.description },
      ],
      rows: catalogRows(list),
      freezeHeader: true,
      autoFilter: true,
    }),
  ]);
}
