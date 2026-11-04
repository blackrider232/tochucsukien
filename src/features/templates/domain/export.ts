// What leaves the app: file names, the data tables of a document as sheets,
// and the catalog sheet. Browser-only parts take the HTML as a string and use
// DOMParser, so they stay testable under jsdom.

import { fileNameStem } from '@/core/text';
import type { DocumentTemplate } from '../contract';
import { TEMPLATE_KINDS, TEMPLATE_LEVELS } from './levels';

/**
 * One builder for every download (m3 B28): the symbol when there is one plus a
 * slug of the title, so two forms sharing a symbol never share a file name.
 */
export function templateFileName(t: Pick<DocumentTemplate, 'code' | 'title'>, stamp: string, ext: 'doc' | 'xlsx'): string {
  const stem = [t.code.trim() && fileNameStem(t.code, 20), fileNameStem(t.title, 48)].filter(Boolean).join('_');
  return `SCE_${stem}_${stamp}.${ext}`;
}

export const catalogFileName = (count: number, stamp: string) => `SCE_Danh_Muc_${count}_Bieu_Mau_Chuan_${stamp}.xlsx`;

export interface CatalogRow {
  index: number;
  code: string;
  title: string;
  level: string;
  kind: string;
  description: string;
}
export const catalogRows = (list: ReadonlyArray<DocumentTemplate>): CatalogRow[] =>
  list.map((t, i) => ({ index: i + 1, code: t.code, title: t.title, level: TEMPLATE_LEVELS[t.level].label, kind: TEMPLATE_KINDS[t.kind].adminShort, description: t.description }));

export interface DataTable {
  header: ReadonlyArray<string>;
  rows: ReadonlyArray<ReadonlyArray<string>>;
}

const cellText = (el: Element) => (el.textContent ?? '').replace(/[\s ]+/g, ' ').trim();

/** The tables that have header cells, as rows of text. Layout tables have none and are skipped (m3 B17). */
export function dataTablesOf(html: string): DataTable[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('table')]
    .filter((table) => table.querySelector('th'))
    .map((table) => {
      const trs = [...table.querySelectorAll('tr')].map((tr) => [...tr.children].filter((c) => c.tagName === 'TH' || c.tagName === 'TD').map(cellText));
      const [header = [], ...rows] = trs;
      return { header, rows };
    });
}
