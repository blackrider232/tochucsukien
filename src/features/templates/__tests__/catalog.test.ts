import { describe, expect, it } from 'vitest';
import type { Instant, Version } from '@/core/brand';
import { BUILTIN_TEMPLATES } from '../domain/builtin-templates';
import { builtinDraft, catalogCounts, draftOf, filterTemplates, hasDataTable, plainText, resolveCatalog, sameAsBuiltin, type StoredTemplate } from '../domain/catalog';
import { template } from './fixtures';

const stored = (over: Partial<StoredTemplate>): StoredTemplate => ({
  templateKey: 'form_kh_ubnd', baseBuiltinKey: 'form_kh_ubnd', level: 'cap_ubnd', code: 'KH-UBND', title: 'Kế hoạch đã sửa', kind: 'doc',
  description: 'Mô tả', contentHtml: '<p>Nội dung mới</p>', version: 2 as Version, updatedAt: '2026-11-01T00:00:00.000Z' as Instant, ...over,
});

describe('resolveCatalog', () => {
  it('is the 23 built-ins when nothing is stored, every one pristine', () => {
    const list = resolveCatalog([]);
    expect(list).toHaveLength(23);
    expect(list.every((t) => t.origin === 'builtin' && t.version === null && t.updatedAt === null)).toBe(true);
    expect(list.map((t) => t.id)).toEqual(BUILTIN_TEMPLATES.map((t) => t.id));
  });

  it('puts an override in the built-in place and appends custom templates after the built-ins', () => {
    const list = resolveCatalog([
      stored({}),
      stored({ templateKey: '2d1f6f3e-8f4a-4a53-9b0c-0a1f2b3c4d5e', baseBuiltinKey: null, title: 'Mẫu riêng', code: '' }),
    ]);
    expect(list).toHaveLength(24);
    expect(list[0]).toMatchObject({ id: 'form_kh_ubnd', origin: 'override', title: 'Kế hoạch đã sửa', version: 2 });
    expect(list[1]!.origin).toBe('builtin');
    expect(list[23]).toMatchObject({ id: '2d1f6f3e-8f4a-4a53-9b0c-0a1f2b3c4d5e', origin: 'custom', code: '' });
  });

  it('shows a later fix to the built-in text for every template without an override (m3 B10)', () => {
    const list = resolveCatalog([stored({})]);
    const untouched = list.filter((t) => t.id !== 'form_kh_ubnd');
    expect(untouched.every((t) => t.origin === 'builtin')).toBe(true);
    expect(untouched.map((t) => t.content)).toEqual(resolveCatalog([]).filter((t) => t.id !== 'form_kh_ubnd').map((t) => t.content));
  });

  it('sanitizes stored content on the way out, even if the row was written around the command', () => {
    const list = resolveCatalog([stored({ contentHtml: '<p onclick="x()">a</p><script>alert(1)</script><img src=x onerror=alert(1)>' })]);
    expect(list[0]!.content).toBe('<p>a</p>');
  });

  it('treats an override of a built-in that no longer exists as a custom template', () => {
    const list = resolveCatalog([stored({ templateKey: 'form_cu_da_xoa', baseBuiltinKey: 'form_cu_da_xoa' })]);
    expect(list[23]).toMatchObject({ id: 'form_cu_da_xoa', origin: 'custom' });
  });
});

describe('sameAsBuiltin', () => {
  const base = builtinDraft('form_kh_ubnd')!;
  it('recognises an unchanged document, even re-serialized by the editor', () => {
    expect(sameAsBuiltin('form_kh_ubnd', base)).toBe(true);
    expect(sameAsBuiltin('form_kh_ubnd', { ...base, content: base.content.replace(/\n\s+/g, '\n    ') })).toBe(true);
  });
  it('sees any changed field', () => {
    expect(sameAsBuiltin('form_kh_ubnd', { ...base, title: `${base.title}.` })).toBe(false);
    expect(sameAsBuiltin('form_kh_ubnd', { ...base, level: 'cap_stc' })).toBe(false);
    expect(sameAsBuiltin('form_kh_ubnd', { ...base, kind: 'grid' })).toBe(false);
    expect(sameAsBuiltin('form_kh_ubnd', { ...base, content: `${base.content}<p>x</p>` })).toBe(false);
    expect(sameAsBuiltin('khong_co', base)).toBe(false);
  });
  it('round-trips a catalog entry', () => {
    expect(sameAsBuiltin('form_dskhach', draftOf(resolveCatalog([]).find((t) => t.id === 'form_dskhach')!))).toBe(true);
  });
});

describe('filter, search and counts', () => {
  const list = resolveCatalog([]);
  it('filters by level and counts 4, 2 and 17', () => {
    expect(filterTemplates(list, { level: 'cap_stc', query: '' })).toHaveLength(2);
    expect(catalogCounts(list)).toEqual({ total: 23, byLevel: { cap_ubnd: 4, cap_stc: 2, cap_trungtam: 17 }, overrides: 0, custom: 0 });
  });
  it('searches title, code and description without tone marks', () => {
    expect(filterTemplates(list, { level: 'all', query: 'giay moi' }).map((t) => t.id)).toEqual(expect.arrayContaining(['form_giaymoi_ubnd', 'form_giaymoi_vip']));
    expect(filterTemplates(list, { level: 'all', query: 'ttr-stc' }).map((t) => t.id)).toEqual(['form_totrinh_stc_ubnd']);
    expect(filterTemplates(list, { level: 'all', query: 'xyz không có' })).toEqual([]);
    expect(filterTemplates(list, { level: 'cap_ubnd', query: 'ttr-stc' })).toEqual([]);
  });
  it('counts custom and modified templates', () => {
    const c = catalogCounts(resolveCatalog([stored({}), stored({ templateKey: 'x1', baseBuiltinKey: null })]));
    expect(c).toMatchObject({ total: 24, overrides: 1, custom: 1 });
  });
});

describe('hasDataTable (m3 B17)', () => {
  it('is true only for tables with header cells', () => {
    expect(hasDataTable('<table><tr><td>layout</td></tr></table>')).toBe(false);
    expect(hasDataTable('<table><tr><th>STT</th></tr></table>')).toBe(true);
    expect(hasDataTable('<p>thead</p>')).toBe(false);
    const withTables = resolveCatalog([]).filter((t) => hasDataTable(t.content)).map((t) => t.id);
    expect(withTables).toHaveLength(6);
  });
});

describe('plainText', () => {
  it('drops tags, decodes entities and keeps line breaks', () => {
    expect(plainText('<p>Xin&nbsp;chào &amp; <b>bạn</b></p><p>Hai</p>')).toBe('Xin chào & bạn\nHai');
    expect(plainText(template('<p>a</p>').content)).toBe('a');
  });
});
