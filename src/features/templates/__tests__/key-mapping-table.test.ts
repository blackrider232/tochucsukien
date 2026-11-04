import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveTemplateKey, STEP_TEMPLATE_KEYS } from '../domain/key-mapping';

/**
 * Written by hand from legacy/index.html (openFormNotice's aliasMap, ~line 11666) and the spec's table (m3 §3.2),
 * not read from the implementation. null = no form fits (declared, never the UBND plan).
 */
const EXPECTED: Readonly<Record<string, string | null>> = {
  // a step key that is itself a template id
  form_dskhach: 'form_dskhach',
  form_kichban_mc: 'form_kichban_mc',
  form_ds_baochi: 'form_ds_baochi',
  form_baocao_truyenthong: 'form_baocao_truyenthong',
  form_baocao_tiendo_hangngay: 'form_baocao_tiendo_hangngay',
  form_checklist_hientruong: 'form_checklist_hientruong',
  form_truc_gianhang: 'form_truc_gianhang',
  form_thu_camon: 'form_thu_camon',
  // legacy aliases that were right
  form_rsvp: 'form_dskhach',
  form_phuongan_dontiep: 'form_giaymoi_vip',
  form_the_daibieu: 'form_bienban_giaothe',
  form_the_baochi: 'form_ds_baochi',
  form_hopdong_mc: 'form_kichban_mc',
  form_khaosat_diadiem: 'form_checklist_hientruong',
  form_checklist_kythuat: 'form_checklist_hientruong',
  form_thumoi_hpa: 'form_thongcao_baochi',
  form_giaymoi_dn: 'form_giaymoi_vip',
  form_giaymoi_en: 'form_giaymoi_vip',
  form_so_buudien: 'form_giaymoi_vip',
  form_thoa_thuan_gianhang: 'form_truc_gianhang',
  // legacy aliases that opened the wrong form (B09): now none
  form_bienten: null,
  form_sodo_chongoi: null,
  form_duyet_anpham: null,
  // keys legacy left unmapped (B08)
  form_giaymoi: 'form_giaymoi_vip',
  form_baocao_nhom1: 'form_baocao_tiendo_hangngay',
  form_baocao_nhom2: 'form_baocao_tiendo_hangngay',
  form_baocao_nhom3: 'form_baocao_tiendo_hangngay',
  form_baocao_nhom4: 'form_baocao_tiendo_hangngay',
  form_baocao_nhom5: 'form_baocao_tiendo_hangngay',
  form_duyet_mou: 'form_congvan_mou_ngoaivu',
  form_kehoach_truyenthong: null,
  form_checkin_letan: 'form_checklist_hientruong',
};

describe('every step key against an independent table', () => {
  it('has 32 keys, and the implementation declares exactly those', () => {
    expect(Object.keys(EXPECTED)).toHaveLength(32);
    expect(Object.keys(STEP_TEMPLATE_KEYS).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(Object.entries(EXPECTED))('%s -> %s', (key, target) => {
    expect(resolveTemplateKey(key)).toBe(target);
    expect(resolveTemplateKey(` ${key} `)).toBe(target);
  });

  it('agrees with the legacy alias map everywhere except the three declared mismatches', () => {
    const html = readFileSync(join(process.cwd(), 'legacy', 'index.html'), 'utf8');
    const start = html.indexOf('const aliasMap = {');
    const block = html.slice(start, html.indexOf('};', start));
    const legacy = Object.fromEntries([...block.matchAll(/'(form_\w+)':\s*'(form_\w+)'/g)].map((m) => [m[1]!, m[2]!]));
    expect(Object.keys(legacy)).toHaveLength(15);
    const changed = ['form_bienten', 'form_sodo_chongoi', 'form_duyet_anpham'];
    for (const [key, target] of Object.entries(legacy)) {
      if (changed.includes(key)) expect(resolveTemplateKey(key), key).toBeNull();
      else expect(resolveTemplateKey(key), key).toBe(target);
    }
  });
});
