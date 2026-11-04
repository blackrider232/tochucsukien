import type { SanitizedHtml } from '@/core/brand';
import { escapeHtml, safeSpreadsheetText } from '@/core/text';
import type { XlsxSheet, XlsxSheetSpec } from './kit.types';

/** Revokes the object URL after the click has been dispatched (m3 B33, m4c B51). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface SheetBox { readonly __sheet: true; readonly spec: XlsxSheetSpec<unknown> }

/** Erases Row so one workbook can hold sheets of different row types. */
export function xlsxSheet<Row>(spec: XlsxSheetSpec<Row>): XlsxSheet {
  return { __sheet: true, spec } as unknown as XlsxSheet;
}

const HEADER_FILL = 'FF1E3A8A';
const INVALID_SHEET_NAME = /[\\/?*[\]:]/g;

function argb(color: string): string {
  const hex = color.replace('#', '').toUpperCase();
  return hex.length === 6 ? `FF${hex}` : hex;
}

/** Strings are written as text cells (never formulas) with spreadsheet-injection guarded; numbers stay numbers. */
export function safeCell(value: string | number | null): string | number | null {
  return typeof value === 'string' ? safeSpreadsheetText(value) : value;
}

export async function buildWorkbook(sheets: ReadonlyArray<XlsxSheet>) {
  const mod = await import('exceljs');
  const ExcelJS = mod.default ?? mod;
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  for (const box of sheets as unknown as ReadonlyArray<SheetBox>) {
    const spec = box.spec;
    const ws = workbook.addWorksheet(spec.name.replace(INVALID_SHEET_NAME, ' ').slice(0, 31) || 'Sheet1');
    const span = Math.max(spec.columns.length, 1);
    ws.columns = spec.columns.map((c) => ({ width: c.width }));

    for (const line of spec.title?.lines ?? []) {
      const row = ws.addRow([safeCell(line)]);
      ws.mergeCells(row.number, 1, row.number, span);
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      row.font = { bold: true, size: 12 };
    }

    const header = ws.addRow(spec.columns.map((c) => safeCell(c.header)));
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    spec.rows.forEach((item, i) => {
      const row = ws.addRow(spec.columns.map((c) => safeCell(c.value(item, i))));
      row.alignment = { vertical: 'middle', wrapText: true };
      spec.columns.forEach((c, k) => {
        const cell = row.getCell(k + 1);
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        const fill = c.fill?.(item);
        if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(fill) } };
      });
    });

    for (const line of spec.footer?.lines ?? []) {
      const row = ws.addRow([safeCell(line)]);
      ws.mergeCells(row.number, 1, row.number, span);
    }

    if (spec.freezeHeader) ws.views = [{ state: 'frozen', ySplit: header.number }];
    if (spec.autoFilter) ws.autoFilter = { from: { row: header.number, column: 1 }, to: { row: header.number, column: span } };
  }
  return workbook;
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** ExcelJS is loaded lazily from npm. */
export async function downloadXlsx(fileName: string, sheets: ReadonlyArray<XlsxSheet>): Promise<void> {
  const workbook = await buildWorkbook(sheets);
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: XLSX_TYPE }), fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
}

/** The Word-HTML document text. `body` is already sanitized; the title is escaped here (m3 B29). */
export function wordHtml(input: { title: string; body: SanitizedHtml; orientation?: 'portrait' | 'landscape' }): string {
  const landscape = input.orientation === 'landscape';
  const size = landscape ? '29.7cm 21.0cm' : '21.0cm 29.7cm';
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeHtml(input.title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page WordSection1 { size: ${size}; margin: 2.0cm 1.5cm 2.0cm 3.0cm; mso-page-orientation: ${landscape ? 'landscape' : 'portrait'}; }
div.WordSection1 { page: WordSection1; }
body { font-family: "Times New Roman", serif; font-size: 14pt; }
table { border-collapse: collapse; }
</style></head>
<body><div class="WordSection1">${input.body}</div></body></html>`;
}

/** Word-compatible HTML (.doc) with NĐ30 page CSS. */
export function downloadWordHtml(input: { fileName: string; title: string; body: SanitizedHtml; orientation?: 'portrait' | 'landscape' }): void {
  const blob = new Blob(['﻿', wordHtml(input)], { type: 'application/msword;charset=utf-8' });
  downloadBlob(blob, input.fileName.endsWith('.doc') ? input.fileName : `${input.fileName}.doc`);
}
