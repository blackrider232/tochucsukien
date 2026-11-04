import type { TemplateDraft } from './catalog';

/**
 * A new template starts as a NĐ 30 letterhead with the agency lines from
 * settings (m3 §1.3). The symbol stays empty: inventing "BM-SCE/2026" would
 * print a number the admin never chose (m3 B11).
 */
export const NEW_TEMPLATE_DRAFT: TemplateDraft = {
  level: 'cap_trungtam',
  code: '',
  title: '',
  kind: 'doc',
  description: '',
  content: `<div style="font-family: 'Times New Roman', serif; line-height: 1.6; font-size: 14pt;">
<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;"><tr>
<td style="width: 50%; text-align: center; vertical-align: top;"><strong>{{CO_QUAN_CHU_QUAN}}</strong><br><strong>{{TEN_CO_QUAN}}</strong><br><span style="font-size: 11pt;">Số: ........</span></td>
<td style="width: 50%; text-align: center; vertical-align: top;"><strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong><br><strong>Độc lập - Tự do - Hạnh phúc</strong><br><span style="font-size: 11pt; font-style: italic;">Hà Nội, {{NGAY_HOM_NAY}}</span></td>
</tr></table>
<div style="text-align: center; margin: 25px 0;"><h2 style="font-size: 16pt; font-weight: bold; margin: 0; text-transform: uppercase;">TIÊU ĐỀ BIỂU MẪU MỚI</h2>
<p style="font-size: 14pt; font-weight: bold; margin: 5px 0;">Về việc phục vụ chương trình: {{TEN_SU_KIEN}}</p></div>
<p style="text-indent: 30px; text-align: justify;">Nhập nội dung biểu mẫu tại đây. Dùng nút "Chèn thẻ trộn" để điền tự động tên, ngày giờ, địa điểm của sự kiện.</p>
</div>`,
};

/** The table the editor inserts: header cells (so it exports to Excel) and two sample rows (m3 §1.3). */
export const NEW_TABLE_HTML = `<table border="1" style="width: 100%; border-collapse: collapse;"><tr><th style="padding: 6px;">STT</th><th style="padding: 6px;">Nội dung công việc</th><th style="padding: 6px;">Số lượng / Định mức</th><th style="padding: 6px;">Ghi chú</th></tr><tr><td style="padding: 6px; text-align: center;">1</td><td style="padding: 6px;">Mời đại biểu tham dự</td><td style="padding: 6px; text-align: center;">{{DINH_MUC_MOI}}</td><td style="padding: 6px;"></td></tr><tr><td style="padding: 6px; text-align: center;">2</td><td style="padding: 6px;">Đón tiếp đại biểu</td><td style="padding: 6px; text-align: center;">{{SO_KHACH_DU_KIEN}}</td><td style="padding: 6px;"></td></tr></table><p><br></p>`;
