import { describe, expect, it } from 'vitest';
import { sanitizeRichHtml } from '@/core/text';
import { BUILTIN_IDS, BUILTIN_TEMPLATES } from '../domain/builtin-templates';
import { TEMPLATE_LEVELS } from '../domain/levels';
import { tagNamesIn, unknownTags } from '../domain/merge-tags';
import { fixedLegacyTemplates, LEGACY_FIXES, loadLegacyTemplates } from './legacy-templates';

const legacy = loadLegacyTemplates();
const fixed = fixedLegacyTemplates();

describe('the 23 built-in templates against legacy/index.html', () => {
  it('has the legacy ids in the legacy order, 4 UBND, 2 STC and 17 Trung tâm', () => {
    expect(BUILTIN_TEMPLATES.map((t) => t.id)).toEqual(legacy.map((t) => t.id));
    expect([...BUILTIN_IDS]).toEqual(legacy.map((t) => t.id));
    expect(BUILTIN_TEMPLATES).toHaveLength(23);
    const count = (level: string) => BUILTIN_TEMPLATES.filter((t) => t.level === level).length;
    expect([count('cap_ubnd'), count('cap_stc'), count('cap_trungtam')]).toEqual([4, 2, 17]);
  });

  it('equals legacy plus exactly the listed fixes, field by field', () => {
    expect(BUILTIN_TEMPLATES.map((t) => ({ id: t.id, level: t.level, code: t.code, kind: t.kind, title: t.title, description: t.description, content: t.content })))
      .toEqual(fixed.map((t) => ({ id: t.id, level: t.group, code: t.code, kind: t.type, title: t.title, description: t.description, content: t.content })));
  });

  it('differs from raw legacy only where a fix says so', () => {
    const touched = new Set(LEGACY_FIXES.flatMap((f) => (f.id === '*' ? legacy.filter((t) => t.content.includes(f.from) || t.description.includes(f.from)).map((t) => t.id) : [f.id])));
    const changed = legacy.filter((t, i) => {
      const b = BUILTIN_TEMPLATES[i]!;
      return t.content !== b.content || t.description !== b.description || t.title !== b.title || t.code !== b.code;
    }).map((t) => t.id);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every((id) => touched.has(id))).toBe(true);
  });

  it('keeps the legacy catalog facts of m3 §2.1: eight without a symbol (the spec says nine), six with header cells with header cells', () => {
    expect(BUILTIN_TEMPLATES.filter((t) => t.code === '')).toHaveLength(8);
    expect(BUILTIN_TEMPLATES.filter((t) => t.kind === 'grid').map((t) => t.id)).toEqual(['form_dskhach', 'form_ds_baochi', 'form_checklist_hientruong', 'form_truc_gianhang']);
    expect(BUILTIN_TEMPLATES.filter((t) => /<th[\s>]/.test(t.content)).map((t) => t.id).sort()).toEqual(
      ['form_bienban_giaothe', 'form_checklist_hientruong', 'form_dskhach', 'form_ds_baochi', 'form_kichban_mc', 'form_truc_gianhang'].sort(),
    );
  });

  it('applies the data fixes of B35, B36 and B37', () => {
    const by = (id: string) => BUILTIN_TEMPLATES.find((t) => t.id === id)!;
    const settlement = by('form_baocao_stc_quyettoan').content;
    expect(settlement).toContain('{{KINH_PHI_DU_TOAN}} VNĐ</strong>.<br>');
    expect(settlement).toContain('giải ngân quyết toán: <strong>{{KINH_PHI_THUC_TE}} VNĐ');
    expect(by('form_qd_sce_btc').content).toContain('/QĐ-TTXT</span>');
    expect(by('form_qd_sce_btc').content).not.toContain('/QĐ-SCE');
    expect(by('form_checklist_hientruong').description).toContain('5 hạng mục');
    const letterheads = BUILTIN_TEMPLATES.map((t) => t.content).join('\n');
    expect(letterheads).not.toContain('<strong>SỞ TÀI CHÍNH THÀNH PHỐ HÀ NỘI</strong>');
    expect(letterheads).not.toContain('<strong>TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP</strong>');
    expect(by('form_qd_sce_btc').content).toContain('<strong>{{CO_QUAN_CHU_QUAN}}</strong>');
    expect(by('form_qd_sce_btc').content).toContain('<strong>{{TEN_CO_QUAN}}</strong>');
  });

  it('uses only tags the registry knows, and no hard-coded quota or "ngày ngày" date', () => {
    const all = BUILTIN_TEMPLATES.map((t) => t.content).join('\n');
    expect(unknownTags(all)).toEqual([]);
    expect(all).not.toMatch(/130\s?%|120\s?%/);
    expect(all).not.toContain('ngày {{NGAY_HOM_NAY}}');
    expect(tagNamesIn(all)).not.toContain('DINH_MUC_MOI_130');
  });

  it('survives the sanitizer with every element and all of its text', () => {
    for (const t of BUILTIN_TEMPLATES) {
      const clean = new DOMParser().parseFromString(sanitizeRichHtml(t.content), 'text/html');
      const raw = new DOMParser().parseFromString(t.content, 'text/html');
      expect(clean.body.textContent, t.id).toBe(raw.body.textContent);
      expect(clean.body.querySelectorAll('*').length, t.id).toBe(raw.body.querySelectorAll('*').length);
    }
  });

  it('labels every level once, derived from the group (m3 B03)', () => {
    expect(Object.values(TEMPLATE_LEVELS).map((l) => l.label)).toEqual(['1. Cấp UBND Thành phố Hà Nội', '2. Cấp Sở Tài chính', '3. Cấp Trung tâm (SCE)']);
  });
});
