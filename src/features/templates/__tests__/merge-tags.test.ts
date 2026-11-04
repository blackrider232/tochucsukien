import { describe, expect, it } from 'vitest';
import { BLANK_HTML, MERGE_TAGS, missingTags, renderTemplate, unknownTags } from '../domain/merge-tags';
import { BUILTIN_TEMPLATES } from '../domain/builtin-templates';
import { resolveCatalog } from '../domain/catalog';
import { mergeCtx, SETTINGS, template } from './fixtures';

const render = (content: string, e = {}, settings = SETTINGS) => renderTemplate(template(content), mergeCtx(e, settings));

describe('renderTemplate: substitution', () => {
  it('fills the eleven legacy tags from the event, with quotas from settings (m3 B15)', () => {
    const out = render('{{TEN_SU_KIEN}}|{{NGAY_TO_CHUC}}|{{GIO_KHAI_MAC}}|{{DIA_DIEM}}|{{PHONG_BAN_CHU_TRI}}|{{CAN_BO_PHU_TRACH}}|{{SO_KHACH_DU_KIEN}}|{{DINH_MUC_MOI}}|{{DINH_MUC_THE}}|{{KINH_PHI_DU_TOAN}}|{{NGAY_HOM_NAY}}');
    expect(out).toBe('Hội nghị Xúc tiến Đầu tư Hà Nội - Hàn Quốc 2026|09/11/2026|08:30|Trung tâm Hội nghị Quốc tế|Phòng Xúc tiến đầu tư|Nguyễn Văn A|150|195|180|350.000.000|ngày 04 tháng 11 năm 2026');
  });

  it('reads the quota percentages from settings, not from the tag name', () => {
    const out = render('{{DINH_MUC_MOI}}/{{DINH_MUC_THE}}/{{TY_LE_MOI}}%/{{TY_LE_THE}}%', {}, { ...SETTINGS, guestQuotaPercent: 140, badgeQuotaPercent: 125 });
    expect(out).toBe('210/188/140%/125%');
  });

  it('keeps the old tag names as aliases', () => {
    expect(render('{{DINH_MUC_MOI_130}}-{{DINH_MUC_THE_120}}')).toBe('195-180');
  });

  it('prints the NĐ30 place and date line and a separate weekday tag (m3 B13)', () => {
    expect(render('Hà Nội, {{NGAY_HOM_NAY}}')).toBe('Hà Nội, ngày 04 tháng 11 năm 2026');
    expect(render('{{THU_TO_CHUC}}, ngày {{NGAY_TO_CHUC}}')).toBe('Thứ Hai, ngày 09/11/2026');
  });

  it('takes the agency lines from settings (decision 18, m3 B37)', () => {
    expect(render('{{CO_QUAN_CHU_QUAN}} / {{TEN_CO_QUAN}} ({{TEN_VIET_TAT}})')).toBe('SỞ TÀI CHÍNH HÀ NỘI / TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP HÀ NỘI (SCE)');
    expect(render('{{TEN_CO_QUAN}}', {}, { ...SETTINGS, agencyName: 'TRUNG TÂM THỬ' })).toBe('TRUNG TÂM THỬ');
  });

  it('leaves unknown tags literal and accepts spaces inside the braces', () => {
    expect(render('{{KHONG_CO}} {{ TEN_SU_KIEN }}', { name: 'A' })).toBe('{{KHONG_CO}} A');
    expect(unknownTags('{{KHONG_CO}} {{TEN_SU_KIEN}} {{DINH_MUC_MOI_130}}')).toEqual(['KHONG_CO']);
  });

  it('substitutes in one pass: a value that looks like a tag is not expanded', () => {
    expect(render('{{TEN_SU_KIEN}} {{DIA_DIEM}}', { name: '{{DIA_DIEM}}', location: 'X' })).toBe('{{DIA_DIEM}} X');
  });
});

describe('renderTemplate: escaping (m3 B01, B29)', () => {
  const payload = '<img src=x onerror=alert(1)> & "q" \'s\'';

  it('escapes the event name wherever it lands', () => {
    const out = render('<p>{{TEN_SU_KIEN}}</p><p title="{{TEN_SU_KIEN}}">x</p>', { name: payload });
    expect(out).not.toMatch(/<img/i);
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; "q" \'s\'');
    const doc = new DOMParser().parseFromString(out, 'text/html');
    expect(doc.querySelector('img')).toBeNull();
    expect(doc.querySelector('p')!.textContent).toBe(payload);
    expect(doc.querySelectorAll('p')[1]!.getAttribute('title')).toBe(payload);
  });

  it('cannot break out of an attribute with a quote', () => {
    const out = render('<a href="#" title="{{TEN_SU_KIEN}}">x</a>', { name: '" onmouseover="alert(1)' });
    expect(new DOMParser().parseFromString(out, 'text/html').querySelector('a')!.getAttribute('onmouseover')).toBeNull();
  });

  it('escapes every text value of the event and the settings', () => {
    const evil = '<script>alert(1)</script>';
    const out = render('{{DIA_DIEM}}{{CAN_BO_PHU_TRACH}}{{TEN_CO_QUAN}}', { location: evil, leadPerson: evil }, { ...SETTINGS, agencyName: evil });
    expect(out).not.toContain('<script');
    expect(out.match(/&lt;script&gt;/g)).toHaveLength(3);
  });

  it('strips script and handlers that an admin pasted into the template itself', () => {
    const out = render('<p onclick="x()">a</p><script>alert(1)</script><a href="javascript:alert(1)">b</a>');
    expect(out).not.toMatch(/script|onclick|javascript:/i);
  });
});

describe('renderTemplate: missing values (m3 B12)', () => {
  it('shows a dotted blank, not an invented default', () => {
    const out = render('{{DIA_DIEM}}|{{KINH_PHI_DU_TOAN}}|{{CAN_BO_PHU_TRACH}}|{{SO_KHACH_DU_KIEN}}|{{DINH_MUC_MOI}}', { location: '', budget: null, leadPerson: '  ', targetGuests: 0 });
    expect(out).toBe([BLANK_HTML, BLANK_HTML, BLANK_HTML, BLANK_HTML, BLANK_HTML].join('|'));
    expect(out).not.toMatch(/350\.000\.000|Hội trường Trung tâm|Cán bộ phụ trách|150|195/);
  });

  it('leaves the manual actual-cost tag blank and does not flag it as missing event data', () => {
    const c = mergeCtx();
    expect(render('{{KINH_PHI_THUC_TE}}')).toBe(BLANK_HTML);
    expect(missingTags('{{KINH_PHI_THUC_TE}}', c)).toEqual([]);
  });

  it('names the event fields a template needs and the event lacks', () => {
    const c = mergeCtx({ location: '', budget: null });
    expect(missingTags('{{TEN_SU_KIEN}} {{DIA_DIEM}} {{KINH_PHI_DU_TOAN}} {{DIA_DIEM}}', c).map((t) => t.tag)).toEqual(['DIA_DIEM', 'KINH_PHI_DU_TOAN']);
  });

  it('treats zero as a value, not a blank (core B28)', () => {
    expect(render('{{KINH_PHI_DU_TOAN}}', { budget: 0 as never })).toBe('0');
  });
});

describe('the registry', () => {
  it('has one entry per tag with a label', () => {
    expect(new Set(MERGE_TAGS.map((t) => t.tag)).size).toBe(MERGE_TAGS.length);
    expect(MERGE_TAGS.every((t) => t.label.length > 0)).toBe(true);
  });

  it('renders every built-in with no tag left over and no blank for a complete event', () => {
    const ctx = mergeCtx();
    for (const t of resolveCatalog([])) {
      const out = renderTemplate(t, ctx);
      expect(out, t.id).not.toMatch(/\{\{/);
      if (t.id !== 'form_baocao_stc_quyettoan') expect(out, t.id).not.toContain('tpl-blank');
      expect(unknownTags(t.content), t.id).toEqual([]);
    }
  });

  it('renders the settlement report with a blank for the actual cost (m3 B35)', () => {
    const t = resolveCatalog([]).find((x) => x.id === 'form_baocao_stc_quyettoan')!;
    const out = renderTemplate(t, mergeCtx());
    expect(out).toContain('350.000.000 VNĐ');
    expect(out.match(/tpl-blank/g)).toHaveLength(1);
  });

  it('puts the configured agency in the letterhead of the Trung tâm templates', () => {
    const t = resolveCatalog([]).find((x) => x.id === 'form_qd_sce_btc')!;
    const out = renderTemplate(t, mergeCtx({}, { ...SETTINGS, agencyName: 'TRUNG TÂM KIỂM THỬ' }));
    expect(out).toContain('TRUNG TÂM KIỂM THỬ');
    expect(out).toContain('SỞ TÀI CHÍNH HÀ NỘI');
    expect(BUILTIN_TEMPLATES.find((x) => x.id === 'form_qd_sce_btc')!.content).not.toContain('KIỂM THỬ');
  });
});
