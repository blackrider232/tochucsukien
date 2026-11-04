import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EventId, TemplateId } from '@/core/brand';
import type { Instant, Version } from '@/core/brand';
import { BUILTIN_IDS } from '../domain/builtin-templates';
import { resolveCatalog, type StoredTemplate } from '../domain/catalog';
import { resolveTemplateKey, STEP_TEMPLATE_KEYS, templateHref, templateKeyOptions, templatePrintHref } from '../domain/key-mapping';

/** Every templateKey the standard SCE process (hội nghị and hội chợ) puts on a step, read from progress's generated table. */
function standardStepKeys(): string[] {
  const source = readFileSync(join(process.cwd(), 'src/features/progress/domain/standard-templates.ts'), 'utf8');
  const keys = [...source.matchAll(/templateKey: (?:"([^"]*)"|\{ hoi_nghi: "([^"]*)", hoi_cho: "([^"]*)" \})/g)].flatMap((m) => [m[1], m[2], m[3]]);
  return [...new Set(keys.filter((k): k is string => k !== undefined))];
}

/** Steps with no form fitting them: declared, not silently opened on a different document (m3 B08, B09). */
const WITHOUT_FORM = ['form_bienten', 'form_sodo_chongoi', 'form_duyet_anpham', 'form_kehoach_truyenthong'];

describe('step templateKey -> template', () => {
  const keys = standardStepKeys();

  it('reads the standard process (guards the extraction itself)', () => {
    expect(keys.length).toBeGreaterThanOrEqual(25);
    expect(keys).toContain('form_giaymoi');
    expect(keys).toContain('');
  });

  it.each(keys.filter((k) => k !== ''))('resolves %s to a built-in template, or to none by declaration', (key) => {
    const id = resolveTemplateKey(key);
    if (WITHOUT_FORM.includes(key)) expect(id).toBeNull();
    else expect(BUILTIN_IDS as ReadonlyArray<string>).toContain(id);
  });

  it('declares every key of the standard process in the table (no key resolves by accident)', () => {
    const direct = new Set<string>(BUILTIN_IDS);
    for (const key of keys.filter((k) => k !== '')) expect(direct.has(key) || Object.hasOwn(STEP_TEMPLATE_KEYS, key), key).toBe(true);
  });

  it('resolves the nine keys legacy left without a template, and no longer opens the UBND plan for them', () => {
    const legacyUnmapped = ['form_giaymoi', 'form_baocao_nhom1', 'form_baocao_nhom2', 'form_baocao_nhom3', 'form_baocao_nhom4', 'form_baocao_nhom5', 'form_duyet_mou', 'form_kehoach_truyenthong', 'form_checkin_letan'];
    const resolved = legacyUnmapped.map((k) => resolveTemplateKey(k));
    expect(resolved.filter((id) => id === 'form_kh_ubnd')).toEqual([]);
    expect(resolved.filter((id) => id !== null)).toHaveLength(8);
    expect(resolveTemplateKey('form_giaymoi')).toBe('form_giaymoi_vip');
    expect(resolveTemplateKey('form_baocao_nhom3')).toBe('form_baocao_tiendo_hangngay');
  });

  it('no longer opens the wrong form for the three legacy mismatches (m3 B09)', () => {
    expect(resolveTemplateKey('form_bienten')).toBeNull();
    expect(resolveTemplateKey('form_sodo_chongoi')).toBeNull();
    expect(resolveTemplateKey('form_duyet_anpham')).toBeNull();
  });

  it('keeps the legacy aliases that were right', () => {
    expect(resolveTemplateKey('form_rsvp')).toBe('form_dskhach');
    expect(resolveTemplateKey('form_hopdong_mc')).toBe('form_kichban_mc');
    expect(resolveTemplateKey('form_the_baochi')).toBe('form_ds_baochi');
    expect(resolveTemplateKey('form_thoa_thuan_gianhang')).toBe('form_truc_gianhang');
  });

  it('maps a built-in id to itself, trims, and accepts a custom template uuid', () => {
    expect(resolveTemplateKey('  form_kh_ubnd ')).toBe('form_kh_ubnd');
    expect(resolveTemplateKey('2d1f6f3e-8f4a-4a53-9b0c-0a1f2b3c4d5e')).toBe('2d1f6f3e-8f4a-4a53-9b0c-0a1f2b3c4d5e');
  });

  it('answers null for a custom template uuid that is not in the catalog (deleted), and keeps one that is', () => {
    const live = '2d1f6f3e-8f4a-4a53-9b0c-0a1f2b3c4d5e';
    const gone = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
    const catalog = [...BUILTIN_IDS, live].map((id) => ({ id }));
    expect(resolveTemplateKey(live, catalog)).toBe(live);
    expect(resolveTemplateKey(gone, catalog)).toBeNull();
    expect(resolveTemplateKey('form_giaymoi', catalog)).toBe('form_giaymoi_vip');
    expect(resolveTemplateKey('form_kh_ubnd', catalog)).toBe('form_kh_ubnd');
    expect(resolveTemplateKey('form_bienten', catalog)).toBeNull();
  });

  it('answers null for a built-in that the catalog does not list', () => {
    expect(resolveTemplateKey('form_kh_ubnd', [])).toBeNull();
  });

  it('answers null for an empty, unknown or hostile key, including Object.prototype names', () => {
    for (const key of ['', ' ', 'form_khong_co', 'constructor', '__proto__', 'toString', 'hasOwnProperty', '<script>']) expect(resolveTemplateKey(key), key).toBeNull();
  });

  it('gives every table entry a reason', () => {
    for (const [key, entry] of Object.entries(STEP_TEMPLATE_KEYS)) expect(entry.why.length, key).toBeGreaterThan(5);
  });
});

describe('links', () => {
  const eventId = '11111111-1111-4111-8111-111111111111' as EventId;
  it('builds the library and print addresses, with or without an event', () => {
    expect(templateHref('form_kh_ubnd' as TemplateId, eventId)).toBe(`/templates?t=form_kh_ubnd&event=${eventId}`);
    expect(templateHref('form_kh_ubnd' as TemplateId, null)).toBe('/templates?t=form_kh_ubnd');
    expect(templatePrintHref('form_kh_ubnd' as TemplateId, eventId)).toBe(`/templates/print?t=form_kh_ubnd&event=${eventId}`);
  });
  it('gives no link for a key that resolved to nothing', () => {
    expect(templateHref(null, eventId)).toBeNull();
    expect(templatePrintHref(null, eventId)).toBeNull();
  });
  it('encodes the id', () => {
    expect(templateHref('a b&c' as TemplateId, null)).toBe('/templates?t=a+b%26c');
  });
});

describe('templateKeyOptions', () => {
  it('lists the 23 built-ins, each one resolving to itself', () => {
    const options = templateKeyOptions();
    expect(options).toHaveLength(23);
    for (const o of options) expect(resolveTemplateKey(o.value)).toBe(o.value);
    expect(options[0]!.label).toBe('KH-UBND: Kế hoạch tổ chức chương trình sự kiện (UBND Thành phố Hà Nội)');
    expect(options.every((o) => o.group === 'Biểu mẫu chuẩn')).toBe(true);
  });

  const custom: StoredTemplate = {
    templateKey: '2d1f6f3e-8f4a-4a53-9b0c-0a1f2b3c4d5e', baseBuiltinKey: null, level: 'cap_trungtam', code: '', title: 'Phiếu đăng ký gian hàng', kind: 'grid',
    description: '', contentHtml: '<p>x</p>', version: 1 as Version, updatedAt: '2026-11-01T00:00:00.000Z' as Instant,
  };
  const override: StoredTemplate = { ...custom, templateKey: 'form_kh_ubnd', baseBuiltinKey: 'form_kh_ubnd', code: 'KH-UBND', title: 'Kế hoạch UBND (đã sửa)' };

  it('also lists the custom templates of the catalog, in their own group labelled "Tùy chỉnh", after the built-ins', () => {
    const catalog = resolveCatalog([custom]);
    const options = templateKeyOptions(catalog);
    expect(options).toHaveLength(24);
    expect(options.slice(0, 23).every((o) => o.group === 'Biểu mẫu chuẩn')).toBe(true);
    expect(options[23]).toEqual({ value: custom.templateKey, label: 'Tùy chỉnh: Phiếu đăng ký gian hàng', group: 'Tùy chỉnh' });
    for (const o of options) expect(resolveTemplateKey(o.value, catalog), o.value).toBe(o.value);
  });

  it('shows the title an admin gave a built-in, and no custom group when there is none', () => {
    const options = templateKeyOptions(resolveCatalog([override]));
    expect(options).toHaveLength(23);
    expect(options[0]).toEqual({ value: 'form_kh_ubnd', label: 'KH-UBND: Kế hoạch UBND (đã sửa)', group: 'Biểu mẫu chuẩn' });
    expect(options.some((o) => o.group === 'Tùy chỉnh')).toBe(false);
  });
});
