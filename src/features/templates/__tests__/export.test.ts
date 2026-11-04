import { describe, expect, it } from 'vitest';
import { resolveCatalog } from '../domain/catalog';
import { catalogFileName, catalogRows, dataTablesOf, templateFileName } from '../domain/export';

const list = resolveCatalog([]);

describe('file names (m3 B14, B28)', () => {
  it('are unique across the catalog even where templates share a symbol', () => {
    const names = list.map((t) => templateFileName(t, '2026-11-04', 'doc'));
    expect(new Set(names).size).toBe(names.length);
    expect(list.filter((t) => t.code === 'QĐ-TTXT')).toHaveLength(2);
  });
  it('use the VN date, the symbol and a slug of the title, and are plain ASCII', () => {
    const t = list.find((x) => x.id === 'form_kh_ubnd')!;
    expect(templateFileName(t, '2026-11-04', 'doc')).toBe('SCE_KH_UBND_Ke_hoach_to_chuc_chuong_trinh_su_kien_UBND_Thanh_2026-11-04.doc');
    for (const t2 of list) expect(templateFileName(t2, '2026-11-04', 'xlsx')).toMatch(/^SCE_[A-Za-z0-9_]+_2026-11-04\.xlsx$/);
  });
  it('fall back to the title when there is no symbol, and never throw on empty fields', () => {
    expect(templateFileName({ code: '', title: 'Danh sách báo chí' }, '2026-11-04', 'doc')).toBe('SCE_Danh_sach_bao_chi_2026-11-04.doc');
    expect(templateFileName({ code: '', title: '' }, '2026-11-04', 'doc')).toBe('SCE_file_2026-11-04.doc');
  });
  it('counts the catalog in the catalog file name (m3 B26)', () => {
    expect(catalogFileName(24, '2026-11-04')).toBe('SCE_Danh_Muc_24_Bieu_Mau_Chuan_2026-11-04.xlsx');
  });
});

describe('catalog sheet', () => {
  it('numbers the rows and labels level and kind from the registries', () => {
    const rows = catalogRows(list);
    expect(rows).toHaveLength(23);
    expect(rows[0]).toMatchObject({ index: 1, code: 'KH-UBND', level: '1. Cấp UBND Thành phố Hà Nội', kind: 'Văn bản' });
    expect(rows.find((r) => r.title.startsWith('Bảng danh sách khách mời'))!.kind).toBe('Bảng tính');
  });
});

describe('dataTablesOf (m3 B17)', () => {
  const content = (id: string) => list.find((t) => t.id === id)!.content;
  it('skips the letterhead and signature layout tables and reads the data table', () => {
    const [table, ...rest] = dataTablesOf(content('form_checklist_hientruong'));
    expect(rest).toEqual([]);
    expect(table!.header).toEqual(['STT', 'Hạng mục kiểm tra cấp bách', 'Bộ phận phụ trách', 'Tình trạng kiểm tra']);
    expect(table!.rows).toHaveLength(5);
    expect(table!.rows[0]![1]).toContain('Biển chỉ dẫn');
  });
  it('returns nothing for a prose document whose only tables are layout', () => {
    expect(dataTablesOf(content('form_kh_ubnd'))).toEqual([]);
    expect(dataTablesOf(content('form_mou_template'))).toEqual([]);
  });
  it('finds a table in every template that hasDataTable says has one', () => {
    for (const t of list) {
      const has = /<th[\s>]/.test(t.content);
      expect(dataTablesOf(t.content).length > 0, t.id).toBe(has);
    }
  });
});
