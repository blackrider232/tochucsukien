// The one table from a workflow step's templateKey to a template. Legacy left 9
// keys of the standard process without a template (and opened the UBND plan
// instead) and mapped 3 to the wrong form (m3 B08, B09, m2 BUG-40). Here a key
// either maps to a form that fits the step or is declared as having none.

import type { EventId, TemplateId } from '@/core/brand';
import { parseUuid } from '@/core/brand';
import type { BuiltinId } from './builtin-templates';
import { isBuiltinId } from './builtin-templates';

export interface StepKeyEntry {
  /** null: no form fits this step; the UI says "Chưa gắn biểu mẫu" instead of opening another one. */
  readonly template: BuiltinId | null;
  readonly why: string;
}

const same = (id: BuiltinId): StepKeyEntry => ({ template: id, why: 'Cùng mã với biểu mẫu.' });
const to = (template: BuiltinId | null, why: string): StepKeyEntry => ({ template, why });

export const STEP_TEMPLATE_KEYS = {
  // Nhóm 1: khách mời và lễ tân
  form_dskhach: same('form_dskhach'),
  form_giaymoi: to('form_giaymoi_vip', 'Bước "Viết và gửi Giấy mời": mẫu giấy mời đại biểu (legacy mở nhầm Kế hoạch UBND).'),
  form_rsvp: to('form_dskhach', 'Danh sách khách mời có cột tình trạng xác nhận (legacy).'),
  form_phuongan_dontiep: to('form_giaymoi_vip', 'Phương án đón tiếp đại biểu VIP (legacy).'),
  form_baocao_nhom1: to('form_baocao_tiendo_hangngay', 'Báo cáo Lãnh đạo Trung tâm theo từng nhóm (legacy mở nhầm Kế hoạch UBND).'),
  // Nhóm 2: biển tên, thẻ, chỗ ngồi
  form_bienten: to(null, 'Chưa có mẫu biển tên. Legacy mở Thẻ xe VIP, là mẫu sai.'),
  form_the_daibieu: to('form_bienban_giaothe', 'Biên bản bàn giao thẻ đại biểu (legacy).'),
  form_sodo_chongoi: to(null, 'Chưa có mẫu sơ đồ chỗ ngồi. Legacy mở danh sách khách mời, là mẫu sai.'),
  form_baocao_nhom2: to('form_baocao_tiendo_hangngay', 'Báo cáo Lãnh đạo Trung tâm theo từng nhóm.'),
  // Nhóm 3: nội dung, tham luận, MOU, MC
  form_duyet_anpham: to(null, 'Chưa có mẫu duyệt ấn phẩm. Legacy mở báo cáo truyền thông, là mẫu sai.'),
  form_duyet_mou: to('form_congvan_mou_ngoaivu', 'Công văn gửi Sở Ngoại vụ rà soát dự thảo MOU (legacy mở nhầm Kế hoạch UBND).'),
  form_hopdong_mc: to('form_kichban_mc', 'Kịch bản và lời dẫn MC (legacy).'),
  form_kichban_mc: same('form_kichban_mc'),
  form_baocao_nhom3: to('form_baocao_tiendo_hangngay', 'Báo cáo Lãnh đạo Trung tâm theo từng nhóm.'),
  // Nhóm 4: địa điểm và kỹ thuật
  form_khaosat_diadiem: to('form_checklist_hientruong', 'Checklist hiện trường (legacy).'),
  form_checklist_kythuat: to('form_checklist_hientruong', 'Checklist hiện trường (legacy).'),
  form_baocao_nhom4: to('form_baocao_tiendo_hangngay', 'Báo cáo Lãnh đạo Trung tâm theo từng nhóm.'),
  // Nhóm 5: truyền thông
  form_kehoach_truyenthong: to(null, 'Chưa có mẫu phương án truyền thông. Legacy mở Kế hoạch UBND, là mẫu sai.'),
  form_thumoi_hpa: to('form_thongcao_baochi', 'Thông cáo báo chí đăng cổng HPA (legacy).'),
  form_ds_baochi: same('form_ds_baochi'),
  form_baocao_nhom5: to('form_baocao_tiendo_hangngay', 'Báo cáo Lãnh đạo Trung tâm theo từng nhóm.'),
  form_baocao_truyenthong: same('form_baocao_truyenthong'),
  // Nhóm 6 và ngày diễn ra
  form_baocao_tiendo_hangngay: same('form_baocao_tiendo_hangngay'),
  form_checklist_hientruong: same('form_checklist_hientruong'),
  form_checkin_letan: to('form_checklist_hientruong', 'Checklist có hạng mục bàn lễ tân (legacy mở nhầm Kế hoạch UBND).'),
  form_truc_gianhang: same('form_truc_gianhang'),
  form_thu_camon: same('form_thu_camon'),
  // Keys legacy accepted that no standard step uses today but saved events may still carry.
  form_the_baochi: to('form_ds_baochi', 'Danh sách báo chí (legacy).'),
  form_giaymoi_dn: to('form_giaymoi_vip', 'Giấy mời doanh nghiệp (legacy).'),
  form_giaymoi_en: to('form_giaymoi_vip', 'Giấy mời tiếng Anh (legacy).'),
  form_so_buudien: to('form_giaymoi_vip', 'Giấy mời gửi qua bưu điện (legacy).'),
  form_thoa_thuan_gianhang: to('form_truc_gianhang', 'Phân công trực gian hàng (legacy).'),
} as const satisfies Readonly<Record<string, StepKeyEntry>>;

/**
 * Step templateKey -> template id. A built-in id maps to itself; a custom
 * template is addressed by its uuid; anything else is null ("Chưa gắn biểu mẫu").
 */
export function resolveTemplateKey(key: string): TemplateId | null {
  const k = key.trim();
  if (isBuiltinId(k)) return k as TemplateId;
  if (Object.hasOwn(STEP_TEMPLATE_KEYS, k)) return (STEP_TEMPLATE_KEYS[k as keyof typeof STEP_TEMPLATE_KEYS].template as TemplateId | null);
  return parseUuid<'Template'>(k) as TemplateId | null;
}

/** The only way other features link to a template. The event is optional: the library picks it from the page. */
export function templateHref(id: TemplateId, eventId: EventId | null): string {
  const q = new URLSearchParams({ t: id });
  if (eventId) q.set('event', eventId);
  return `/templates?${q}`;
}

/** The print page of the same template and event. */
export function templatePrintHref(id: TemplateId, eventId: EventId | null): string {
  const q = new URLSearchParams({ t: id });
  if (eventId) q.set('event', eventId);
  return `/templates/print?${q}`;
}
