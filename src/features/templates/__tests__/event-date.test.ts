import { describe, expect, it } from 'vitest';
import type { IsoDate } from '@/core/brand';
import { BUILTIN_TEMPLATES } from '../domain/builtin-templates';
import { renderTemplate } from '../domain/merge-tags';
import { mergeCtx, template } from './fixtures';
import { loadLegacyTemplates } from './legacy-templates';

const textOf = (html: string) => new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
const render = (id: string, eventDate: string) => {
  const b = BUILTIN_TEMPLATES.find((t) => t.id === id)!;
  return textOf(renderTemplate(template(b.content, { id: b.id as never }), mergeCtx({ eventDate: eventDate as IsoDate })));
};

/** Legacy printed the event date with its weekday ("Thứ Hai, 09/11/2026") wherever a template named the event day (m3 B13). */
const withEventDate = loadLegacyTemplates().filter((t) => t.content.includes('{{NGAY_TO_CHUC}}')).map((t) => t.id);

describe('the event date keeps its weekday in the built-ins', () => {
  it('finds the templates that name the event day', () => {
    expect(withEventDate).toEqual([
      'form_kh_ubnd', 'form_giaymoi_ubnd', 'form_congvan_ubnd_phoihop', 'form_baocao_ubnd_ketqua', 'form_totrinh_stc_ubnd', 'form_kh_sce_chitiet',
      'form_giaymoi_vip', 'form_the_xe_vip', 'form_bienban_giaothe', 'form_kichban_mc', 'form_thongcao_baochi', 'form_thu_camon',
    ]);
  });

  it.each(withEventDate)('%s prints "Thứ Hai, ngày 09/11/2026" for a Monday event and never a bare date', (id) => {
    const text = render(id, '2026-11-09');
    expect(text).toContain('Thứ Hai, ngày 09/11/2026');
    expect(text.match(/09\/11\/2026/g)!.length).toBe(text.match(/Thứ Hai, ngày 09\/11\/2026/g)!.length);
    expect(text).not.toMatch(/ngày\s+ngày/i);
    expect(text).not.toContain('{{');
  });

  it.each(withEventDate)('%s follows the event date to a Sunday', (id) => {
    const text = render(id, '2026-11-08');
    expect(text).toContain('Chủ Nhật, ngày 08/11/2026');
    expect(text).not.toContain('Thứ Hai');
  });

  it('puts the weekday tag in front of every use of the date tag, in the template text itself', () => {
    for (const t of BUILTIN_TEMPLATES) {
      const uses = t.content.match(/\{\{NGAY_TO_CHUC\}\}/g)?.length ?? 0;
      const withDay = t.content.match(/\{\{THU_TO_CHUC\}\}, ngày \{\{NGAY_TO_CHUC\}\}/g)?.length ?? 0;
      expect(withDay, t.id).toBe(uses);
    }
  });
});
