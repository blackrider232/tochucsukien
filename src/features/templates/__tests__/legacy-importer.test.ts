import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Instant, Version } from '@/core/brand';
import { buildWorkCalendar } from '@/core/dates';
import { memoryDb } from '@/core/db';
import { deterministicIds, normalizeBlob, type ImportContext, type LegacyBlob } from '@/core/legacy';
import { builtinDraft, resolveCatalog } from '../domain/catalog';
import { renderTemplate } from '../domain/merge-tags';
import { overrideRowId } from '../server/ids';
import { legacyImporter } from '../server/legacy-importer';
import { dropDuplicatedNgay } from '../server/legacy-content';
import { listTemplates } from '../server/reads';
import { mergeCtx, NOW, SETTINGS } from './fixtures';
import { admin } from './harness';
import { fixedLegacyTemplates, LEGACY_FIXES, loadLegacyTemplates } from './legacy-templates';

const extras = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'legacy-extras.json'), 'utf8')) as Record<string, Record<string, unknown>>;
const ctx: ImportContext = { ids: deterministicIds, calendar: buildWorkCalendar([]), includeDemo: false };

/** What a legacy blob holds after an admin's first save: the whole catalog frozen, plus whatever else they did. */
const frozenCatalog = () => loadLegacyTemplates().map((t) => ({ ...t, isCustom: true as const }));
const blobOf = (systemTemplates: unknown): LegacyBlob => normalizeBlob({ events: [], systemTemplates });
const plan = (b: LegacyBlob, c = ctx) => legacyImporter.plan(b, c);
const rowsOf = (b: LegacyBlob) => plan(b).batches.flatMap((x) => x.rows);

describe('templates legacy importer', () => {
  it('imports nothing from an untouched frozen copy of the catalog (m3 B10)', () => {
    const p = plan(blobOf(frozenCatalog()));
    expect(p.batches).toEqual([]);
    expect(p.issues).toEqual([]);
  });

  it('imports nothing when systemTemplates is absent, empty or not an array', () => {
    for (const v of [undefined, [], null, 'x', {}]) expect(plan(blobOf(v)).batches).toEqual([]);
    expect(plan(normalizeBlob({ events: [] })).batches).toEqual([]);
  });

  it('also skips entries equal to today\'s fixed built-in', () => {
    const fixed = fixedLegacyTemplates().map((t) => ({ ...t }));
    expect(plan(blobOf(fixed)).batches).toEqual([]);
  });

  it('keeps an edited built-in as an override, sanitized, with a deterministic row id and no stored group label', () => {
    const [row, ...rest] = rowsOf(blobOf([...frozenCatalog().filter((t) => t.id !== 'form_giaymoi_ubnd'), extras.edited]));
    expect(rest).toEqual([]);
    expect(row).toMatchObject({
      id: overrideRowId('form_giaymoi_ubnd'), template_key: 'form_giaymoi_ubnd', base_builtin_key: 'form_giaymoi_ubnd', legacy_id: 'form_giaymoi_ubnd',
      level: 'cap_ubnd', code: 'GM-UBND', title: 'Giấy mời Đại biểu (Admin đã sửa tiêu đề)', kind: 'doc', updated_at: '2026-09-30T08:15:00.000Z',
    });
    expect(row).not.toHaveProperty('group_name');
    expect(String(row!.content_html)).not.toMatch(/script|onerror|<img/i);
    expect(String(row!.content_html)).toContain('{{TEN_SU_KIEN}}');
    expect(plan(blobOf([extras.edited])).issues).toContainEqual(expect.objectContaining({ severity: 'coerced', legacyId: 'form_giaymoi_ubnd', message: expect.stringContaining('mã script') }));
  });

  it('keeps an admin-created template as a custom template keyed by its own uuid', () => {
    const [row] = rowsOf(blobOf([...frozenCatalog(), extras.custom]));
    const id = deterministicIds.idFor('Template', 'form_custom_1767225600000');
    expect(row).toMatchObject({ id, template_key: id, base_builtin_key: null, legacy_id: 'form_custom_1767225600000', level: 'cap_trungtam', code: '', kind: 'grid', title: 'Phiếu đăng ký gian hàng' });
  });

  it('coerces an unknown group or type and reports it; drops entries without id, title or content', () => {
    const p = plan(blobOf([extras.badGroup, extras.noTitle, extras.noContent, extras.noId, 'not an object', extras.badGroup]));
    expect(p.batches.flatMap((b) => b.rows)).toHaveLength(1);
    expect(p.batches[0]!.rows[0]).toMatchObject({ level: 'cap_trungtam', kind: 'doc', code: 'BM-X' });
    const messages = p.issues.map((i) => `${i.severity}:${i.legacyId}`);
    expect(messages).toEqual(expect.arrayContaining([
      'coerced:form_custom_1767225600001', 'dropped_invalid:form_custom_1767225600002', 'dropped_invalid:form_custom_1767225600003', 'dropped_invalid:null',
    ]));
    expect(p.issues.filter((i) => i.message.includes('bị trùng'))).toHaveLength(1);
  });

  it('is deterministic and converges: planning twice gives identical rows', () => {
    const b = blobOf([...frozenCatalog().filter((t) => t.id !== 'form_giaymoi_ubnd'), extras.edited, extras.custom]);
    expect(plan(b)).toEqual(plan(b));
    expect(rowsOf(b)).toHaveLength(2);
  });

  it('plans rows that parse back through the table and show up in the catalog (override in place, custom last)', async () => {
    const rows = rowsOf(blobOf([...frozenCatalog().filter((t) => t.id !== 'form_giaymoi_ubnd'), extras.edited, extras.custom]));
    const stamped = rows.map((r) => ({ version: 1, created_at: NOW, created_by: null, updated_by: null, updated_at: NOW, ...r }));
    const seed = { sce_tcsk_templates: stamped, sce_tcsk_audit_logs: [] };
    const list = await listTemplates({ actor: admin, db: memoryDb(seed, admin), settings: SETTINGS, calendar: buildWorkCalendar([]), now: NOW });
    expect(list).toHaveLength(24);
    expect(list[1]).toMatchObject({ id: 'form_giaymoi_ubnd', origin: 'override', title: 'Giấy mời Đại biểu (Admin đã sửa tiêu đề)' });
    expect(list[23]).toMatchObject({ origin: 'custom', title: 'Phiếu đăng ký gian hàng' });
    expect(list[1]!.updatedAt).toBe('2026-09-30T08:15:00.000Z' as Instant);
    expect(list[1]!.version).toBe(1 as Version);
  });

  it('never copies a built-in that matches the original into the table', () => {
    const everything = [...frozenCatalog(), extras.custom];
    const rows = rowsOf(blobOf(everything));
    expect(rows.map((r) => r.legacy_id)).toEqual(['form_custom_1767225600000']);
    expect(builtinDraft('form_kh_ubnd')).not.toBeNull();
  });
});

describe('imported content and the B13 date tag', () => {
  const DATE_FIX = LEGACY_FIXES.find((f) => f.bug === 'B13')!;
  const usingTag = loadLegacyTemplates().filter((t) => t.content.includes(DATE_FIX.from));
  const plainText = (html: string) => new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
  /** A legacy admin edit: the original content with a visible change to the title, imported, then rendered with an event. */
  const importedAndRendered = (id: string, edit: (content: string) => string = (c) => c) => {
    const original = loadLegacyTemplates().find((t) => t.id === id)!;
    const rows = rowsOf(blobOf([{ ...original, title: `${original.title} (Admin sửa)`, content: edit(original.content) }]));
    expect(rows, id).toHaveLength(1);
    const stamped = { version: 1 as Version, templateKey: id, baseBuiltinKey: id, level: original.group, code: original.code, title: String(rows[0]!.title), kind: original.type, description: original.description, contentHtml: String(rows[0]!.content_html), updatedAt: NOW };
    const imported = resolveCatalog([stamped as never]).find((t) => t.id === id)!;
    return { imported, text: plainText(renderTemplate(imported, mergeCtx())) };
  };

  it('finds the three templates whose legacy text put "ngày" before the tag', () => {
    expect(usingTag.map((t) => t.id)).toEqual(['form_kh_sce_chitiet', 'form_thongcao_baochi', 'form_baocao_tiendo_hangngay']);
  });

  it.each(usingTag.map((t) => t.id))('prints one "ngày" before the date in an edited %s', (id) => {
    const { text } = importedAndRendered(id);
    expect(text).toContain('ngày 04 tháng 11 năm 2026');
    expect(text).not.toMatch(/ngày\s+ngày/i);
  });

  it('prints the date once for every other edited built-in too', () => {
    for (const t of loadLegacyTemplates()) expect(importedAndRendered(t.id).text, t.id).not.toMatch(/ngày\s+ngày/i);
  });

  it('also fixes the spellings an editor produces: capital, non-breaking space, extra spaces', () => {
    for (const before of ['Ngày {{NGAY_HOM_NAY}}', 'ngày&nbsp;{{NGAY_HOM_NAY}}', 'ngày   {{ NGAY_HOM_NAY }}']) {
      const { text } = importedAndRendered('form_thu_camon', (c) => `${c}<p>Lập ${before}.</p>`);
      expect(text, before).toContain('Lập ngày 04 tháng 11 năm 2026.');
    }
  });

  it('leaves a "ngày" that is not in front of the tag alone', () => {
    const { text } = importedAndRendered('form_thu_camon', (c) => `${c}<p>Ngày mai, hôm nay {{NGAY_HOM_NAY}}; ngày làm việc.</p>`);
    expect(text).toContain('Ngày mai, hôm nay ngày 04 tháng 11 năm 2026; ngày làm việc.');
  });

  it('applies the same replacement as the fix listed for the built-ins, on every legacy template', () => {
    for (const t of loadLegacyTemplates()) expect(dropDuplicatedNgay(t.content), t.id).toBe(t.content.split(DATE_FIX.from).join(DATE_FIX.to));
  });
});
