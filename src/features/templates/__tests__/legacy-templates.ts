// Reads STANDARD_TEMPLATES out of legacy/index.html and applies the one list of
// deliberate changes (LEGACY_FIXES). The generator writes domain/builtins from
// this, and builtin-templates.test.ts proves the shipped data equals legacy plus
// exactly these fixes, so a change to built-in text cannot slip in unlisted.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface LegacyTemplate {
  id: string;
  group: string;
  groupName: string;
  code: string;
  title: string;
  type: string;
  description: string;
  content: string;
}

export type FixedField = 'content' | 'description' | 'code' | 'title';

/** `id: '*'` applies to every template; `count` is the total number of replacements and must match exactly. */
export interface LegacyFix {
  bug: string;
  id: string;
  field: FixedField;
  from: string;
  to: string;
  count: number;
  why: string;
}

export function loadLegacyTemplates(): LegacyTemplate[] {
  const html = readFileSync(join(process.cwd(), 'legacy', 'index.html'), 'utf8');
  const start = html.indexOf('const STANDARD_TEMPLATES = ');
  if (start < 0) throw new Error('legacy/index.html: STANDARD_TEMPLATES not found');
  const line = html.slice(start, html.indexOf('\n', start));
  return JSON.parse(line.slice(line.indexOf('['), line.lastIndexOf(']') + 1)) as LegacyTemplate[];
}

const PRE_RENAME = 'Tên cũ của cơ quan trong câu văn; thay bằng tên hiện hành (câu văn cần dạng viết thường nên không dùng thẻ).';
const WEEKDAY = 'Giữ thứ trong tuần như legacy ("Thứ Hai, 09/11/2026"), viết đúng thể thức: thứ, ngày dd/mm/yyyy, bằng thẻ {{THU_TO_CHUC}}.';
const LETTERHEAD = 'Tên cơ quan lấy từ cài đặt hệ thống (orgIdentity), không viết cứng.';

export const LEGACY_FIXES: ReadonlyArray<LegacyFix> = [
  { bug: 'B15', id: '*', field: 'content', from: '{{DINH_MUC_MOI_130}}', to: '{{DINH_MUC_MOI}}', count: 3, why: 'Thẻ không còn nhúng số 130; tên cũ vẫn được nhận như bí danh.' },
  { bug: 'B15', id: '*', field: 'content', from: '{{DINH_MUC_THE_120}}', to: '{{DINH_MUC_THE}}', count: 2, why: 'Thẻ không còn nhúng số 120; tên cũ vẫn được nhận như bí danh.' },
  { bug: 'B15', id: '*', field: 'content', from: '≥ 130%', to: '≥ {{TY_LE_MOI}}%', count: 2, why: 'Tỷ lệ mời lấy từ cài đặt.' },
  { bug: 'B15', id: 'form_dskhach', field: 'title', from: 'định mức ≥ 130%', to: 'định mức mời', count: 1, why: 'Tiêu đề không nêu số cố định.' },
  { bug: 'B15', id: 'form_dskhach', field: 'description', from: 'tối thiểu 130% số lượng dự kiến', to: 'theo định mức so với số lượng dự kiến', count: 1, why: 'Mô tả không nêu số cố định.' },
  { bug: 'B13', id: '*', field: 'content', from: 'ngày {{NGAY_HOM_NAY}}', to: '{{NGAY_HOM_NAY}}', count: 3, why: 'Thẻ ngày hôm nay đã in "ngày 04 tháng 11 năm 2026" (NĐ 30), nên bỏ chữ "ngày" đứng trước.' },
  { bug: 'B35', id: 'form_baocao_stc_quyettoan', field: 'content', from: 'giải ngân quyết toán: <strong>{{KINH_PHI_DU_TOAN}} VNĐ', to: 'giải ngân quyết toán: <strong>{{KINH_PHI_THUC_TE}} VNĐ', count: 1, why: 'Kinh phí thực tế khác kinh phí dự toán: thẻ riêng, để trống cho người dùng điền.' },
  { bug: 'B36', id: 'form_qd_sce_btc', field: 'content', from: '/QĐ-SCE</span>', to: '/QĐ-TTXT</span>', count: 1, why: 'Ký hiệu trong thân bài trùng mã hiệu QĐ-TTXT.' },
  { bug: 'B36', id: 'form_checklist_hientruong', field: 'description', from: '12 hạng mục', to: '5 hạng mục', count: 1, why: 'Bảng có 5 hạng mục.' },
  { bug: 'B37', id: '*', field: 'content', from: '<strong>SỞ TÀI CHÍNH</strong>', to: '<strong>{{CO_QUAN_CHU_QUAN}}</strong>', count: 2, why: LETTERHEAD },
  { bug: 'B37', id: 'form_totrinh_stc_ubnd', field: 'content', from: 'GIÁM ĐỐC SỞ TÀI CHÍNH', to: 'GIÁM ĐỐC {{CO_QUAN_CHU_QUAN}}', count: 1, why: LETTERHEAD },
  { bug: 'B37', id: '*', field: 'content', from: '<strong>SỞ TÀI CHÍNH THÀNH PHỐ HÀ NỘI</strong>', to: '<strong>{{CO_QUAN_CHU_QUAN}}</strong>', count: 3, why: LETTERHEAD },
  { bug: 'B37', id: '*', field: 'content', from: '<strong>TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP</strong>', to: '<strong>{{TEN_CO_QUAN}}</strong>', count: 3, why: LETTERHEAD },
  { bug: 'B37', id: 'form_qd_sce_btc', field: 'content', from: 'GIÁM ĐỐC TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP HÀ NỘI', to: 'GIÁM ĐỐC {{TEN_CO_QUAN}}', count: 1, why: LETTERHEAD },
  { bug: 'B37', id: '*', field: 'content', from: '>TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP HÀ NỘI</p>', to: '>{{TEN_CO_QUAN}}</p>', count: 2, why: LETTERHEAD },
  { bug: 'B37', id: 'form_thu_camon', field: 'content', from: '>SỞ TÀI CHÍNH THÀNH PHỐ HÀ NỘI</p>', to: '>{{CO_QUAN_CHU_QUAN}}</p>', count: 1, why: LETTERHEAD },
  { bug: 'B37', id: 'form_mou_template', field: 'content', from: '<strong>TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP HÀ NỘI (SCE)</strong>', to: '<strong>{{TEN_CO_QUAN}} ({{TEN_VIET_TAT}})</strong>', count: 1, why: LETTERHEAD },
  { bug: 'B37', id: 'form_baocao_tiendo_hangngay', field: 'content', from: 'SỞ TÀI CHÍNH HÀ NỘI - TRUNG TÂM XÚC TIẾN SCE', to: '{{CO_QUAN_CHU_QUAN}} - {{TEN_CO_QUAN}}', count: 1, why: LETTERHEAD },
  { bug: 'B37', id: 'form_the_xe_vip', field: 'content', from: 'UBND THÀNH PHỐ HÀ NỘI - TRUNG TÂM XÚC TIẾN SCE', to: 'UBND THÀNH PHỐ HÀ NỘI - {{TEN_CO_QUAN}}', count: 1, why: LETTERHEAD },
  { bug: 'B37', id: 'form_thongcao_baochi', field: 'content', from: 'ỦY BAN NHÂN DÂN THÀNH PHỐ HÀ NỘI - SỞ TÀI CHÍNH', to: 'ỦY BAN NHÂN DÂN THÀNH PHỐ HÀ NỘI - {{CO_QUAN_CHU_QUAN}}', count: 1, why: LETTERHEAD },
  { bug: 'B37', id: 'form_congvan_ubnd_phoihop', field: 'content', from: 'Trung tâm Xúc tiến Đầu tư và Hỗ trợ Doanh nghiệp chủ động', to: 'Trung tâm Xúc tiến Đầu tư và Hỗ trợ Doanh nghiệp Hà Nội chủ động', count: 1, why: PRE_RENAME },
  { bug: 'B37', id: 'form_congvan_mou_ngoaivu', field: 'content', from: 'giữa Trung tâm Xúc tiến Đầu tư SCE và', to: 'giữa Trung tâm Xúc tiến Đầu tư và Hỗ trợ Doanh nghiệp Hà Nội (SCE) và', count: 1, why: PRE_RENAME },
  { bug: 'B37', id: 'form_thongcao_baochi', field: 'content', from: 'Tổ Truyền thông - Trung tâm Xúc tiến Đầu tư SCE<br>', to: 'Tổ Truyền thông - Trung tâm Xúc tiến Đầu tư và Hỗ trợ Doanh nghiệp Hà Nội (SCE)<br>', count: 1, why: PRE_RENAME },
  // Applied in this order: the lowercase form first, because the capital form's result contains it.
  { bug: 'B13', id: '*', field: 'content', from: 'ngày {{NGAY_TO_CHUC}}', to: '{{THU_TO_CHUC}}, ngày {{NGAY_TO_CHUC}}', count: 3, why: WEEKDAY },
  { bug: 'B13', id: '*', field: 'content', from: 'Ngày {{NGAY_TO_CHUC}}', to: '{{THU_TO_CHUC}}, ngày {{NGAY_TO_CHUC}}', count: 4, why: WEEKDAY },
  { bug: 'B13', id: '*', field: 'content', from: 'Ngày <strong>{{NGAY_TO_CHUC}}</strong>', to: '<strong>{{THU_TO_CHUC}}, ngày {{NGAY_TO_CHUC}}</strong>', count: 2, why: WEEKDAY },
  { bug: 'B13', id: '*', field: 'content', from: 'ngày <strong>{{NGAY_TO_CHUC}}</strong>', to: '<strong>{{THU_TO_CHUC}}, ngày {{NGAY_TO_CHUC}}</strong>', count: 3, why: WEEKDAY },
  { bug: 'UI-5', id: 'form_giaymoi_vip', field: 'content', from: '<li>⏰ <strong>', to: '<li><strong>', count: 1, why: 'Biểu tượng cảm xúc không thuộc văn bản hành chính và bị cấm trong mã nguồn (quy tắc UI 5).' },
  { bug: 'UI-5', id: 'form_giaymoi_vip', field: 'content', from: '<li>📍 <strong>', to: '<li><strong>', count: 1, why: 'Biểu tượng cảm xúc không thuộc văn bản hành chính và bị cấm trong mã nguồn (quy tắc UI 5).' },
  { bug: 'UI-5', id: 'form_giaymoi_vip', field: 'content', from: '<li>👔 <strong>', to: '<li><strong>', count: 1, why: 'Biểu tượng cảm xúc không thuộc văn bản hành chính và bị cấm trong mã nguồn (quy tắc UI 5).' },
  { bug: 'UI-5', id: 'form_giaymoi_vip', field: 'content', from: '<li>⭐ <strong>', to: '<li><strong>', count: 1, why: 'Biểu tượng cảm xúc không thuộc văn bản hành chính và bị cấm trong mã nguồn (quy tắc UI 5).' },
];

function applyFix(templates: LegacyTemplate[], fix: LegacyFix): void {
  let seen = 0;
  for (const t of templates) {
    if (fix.id !== '*' && t.id !== fix.id) continue;
    const parts = t[fix.field].split(fix.from);
    seen += parts.length - 1;
    t[fix.field] = parts.join(fix.to);
  }
  if (seen !== fix.count) throw new Error(`legacy fix ${fix.bug} "${fix.from}": expected ${fix.count} replacement(s), found ${seen}`);
}

/** The legacy catalog with every deliberate fix applied. Throws when a fix no longer matches. */
export function fixedLegacyTemplates(): LegacyTemplate[] {
  const templates = loadLegacyTemplates().map((t) => ({ ...t }));
  for (const fix of LEGACY_FIXES) applyFix(templates, fix);
  return templates;
}
