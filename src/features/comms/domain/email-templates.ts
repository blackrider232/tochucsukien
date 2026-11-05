// The six invitation templates of the legacy dispatcher (L18109-18190), as
// content. Subjects are verbatim. Bodies keep the wording; the agency names
// come from orgIdentity through merge fields (decision 18), and the emoji
// and inline colours are gone (ui-rules 5, a formal letter needs neither).

export type EmailTemplateKey = 'invitation' | 'banquet' | 'seating_qr' | 'rsvp_reminder' | 'thank_you' | 'custom';

export interface EmailTemplate {
  key: EmailTemplateKey;
  label: string;
  subject: string;
  html: string;
  /** The recipient filter the template opens with; nobody is preselected (m4a B32, m4c B64). */
  suggestedFilter: 'all' | 'pending' | 'attending';
  /** Whether the personal QR check-in card is attached by default. */
  attachQr: boolean;
}

export const EMAIL_TEMPLATES: ReadonlyArray<EmailTemplate> = [
  {
    key: 'invitation',
    label: '1. Giấy mời tham dự Hội nghị / Tọa đàm (Trang trọng)',
    subject: '[Giấy Mời] Tham dự {ten_su_kien} - Kính gửi {danh_xung} {ho_ten}',
    suggestedFilter: 'all',
    attachQr: true,
    html: [
      '<p>Kính gửi: <strong>{danh_xung} {ho_ten}</strong></p>',
      '<p>Chức vụ: <strong>{chuc_vu}</strong> - Đơn vị: <strong>{co_quan}</strong></p>',
      '<br>',
      '<p>{ten_don_vi} ({ten_viet_tat}) trực thuộc {co_quan_chu_quan} trân trọng kính mời {danh_xung} tới tham dự chương trình:</p>',
      '<h3>{ten_su_kien}</h3>',
      '<p><strong>Thời gian khai mạc:</strong> {thoi_gian}</p>',
      '<p><strong>Địa điểm tổ chức:</strong> {dia_diem}</p>',
      '<p><strong>Vị trí danh dự:</strong> <strong>{so_ghe}</strong></p>',
      '<br>',
      '<p>Sự hiện diện của {danh_xung} là niềm vinh hạnh lớn đối với Ban Tổ chức và đóng góp quan trọng vào thành công của sự kiện.</p>',
      '<p>Kính đề nghị {danh_xung} phản hồi xác nhận tham dự hoặc liên hệ cán bộ đón tiếp: <strong>{can_bo_lien_he}</strong> (Điện thoại/Zalo: <strong>{sdt_lien_he}</strong>).</p>',
      '<br>',
      '<p><em>(Giấy mời chính thức và Thẻ đại biểu có mã QR Check-in được đính kèm thư này)</em></p>',
      '<br>',
      '<p>Trân trọng cảm ơn!</p>',
      '<p><strong>BAN TỔ CHỨC SỰ KIỆN - {ten_don_vi}</strong></p>',
    ].join('\n'),
  },
  {
    key: 'banquet',
    label: '2. Thư mời dự Tiệc chiêu đãi VIP',
    subject: '[Thư Mời Tiệc Chiêu Đãi] {ten_su_kien} - Kính gửi {danh_xung} {ho_ten}',
    suggestedFilter: 'attending',
    attachQr: false,
    html: [
      '<p>Kính gửi: <strong>{danh_xung} {ho_ten}</strong> ({chuc_vu} - {co_quan})</p>',
      '<br>',
      '<p>Nhân dịp tổ chức chương trình <strong>{ten_su_kien}</strong>, Ban Tổ chức {ten_viet_tat} trân trọng kính mời {danh_xung} tới tham dự buổi <strong>Tiệc Chiêu Đãi Giao Lưu Thân Mật</strong> cùng Lãnh đạo Thành phố và các đại biểu khách quý.</p>',
      '<p><strong>Thời gian:</strong> Sau phiên bế mạc chương trình ({thoi_gian})</p>',
      '<p><strong>Địa điểm:</strong> Sảnh Tiệc VIP - {dia_diem}</p>',
      '<p><strong>Bàn tiệc danh dự:</strong> Khu vực Bàn Tiệc VIP Trung tâm</p>',
      '<br>',
      '<p>Rất hân hạnh được đón tiếp {danh_xung}!</p>',
      '<p>Cán bộ phụ trách lễ tân tiệc: <strong>{can_bo_lien_he}</strong> ({sdt_lien_he})</p>',
    ].join('\n'),
  },
  {
    key: 'seating_qr',
    label: '3. Thông báo Sơ đồ chỗ ngồi & Thẻ QR Check-in',
    subject: '[Thẻ Check-in & Chỗ Ngồi] {ten_su_kien} - Đại biểu: {ho_ten}',
    suggestedFilter: 'attending',
    attachQr: true,
    html: [
      '<p>Kính gửi: <strong>{danh_xung} {ho_ten}</strong></p>',
      '<p>Cơ quan công tác: <strong>{co_quan}</strong></p>',
      '<br>',
      '<p>Ban Tổ chức xin gửi tới {danh_xung} thông tin chỗ ngồi và Thẻ Check-in điện tử phục vụ công tác đón tiếp tại sự kiện <strong>{ten_su_kien}</strong>:</p>',
      '<blockquote>',
      '<p><strong>Địa điểm:</strong> {dia_diem}</p>',
      '<p><strong>Thời gian đón tiếp:</strong> {thoi_gian}</p>',
      '<p><strong>Vị trí phân khu & Chỗ ngồi:</strong> <strong>{so_ghe}</strong></p>',
      '<p><strong>Mã check-in:</strong> {ma_checkin}</p>',
      '</blockquote>',
      '<p>Đại biểu vui lòng xuất trình Thẻ có mã QR đính kèm thư này tại Bàn Lễ tân để được quét mã check-in tự động nhận tài liệu và huy hiệu đại biểu.</p>',
      '<p>Hotline hỗ trợ dẫn chỗ: <strong>{can_bo_lien_he}</strong> ({sdt_lien_he})</p>',
    ].join('\n'),
  },
  {
    key: 'rsvp_reminder',
    label: '4. Thư đôn đốc & Nhắc lịch xác nhận tham dự',
    subject: '[Nhắc Lịch & Đôn Đốc RSVP] Tham dự {ten_su_kien} - Kính gửi {danh_xung} {ho_ten}',
    suggestedFilter: 'pending',
    attachQr: false,
    html: [
      '<p>Kính gửi: <strong>{danh_xung} {ho_ten}</strong> ({chuc_vu} - {co_quan})</p>',
      '<br>',
      '<p>Ban Tổ chức chương trình <strong>{ten_su_kien}</strong> xin phép được nhắc lịch và kính đề nghị {danh_xung} phản hồi xác nhận khả năng tham dự sự kiện (hoặc cử đại diện tham dự thay thế).</p>',
      '<p>Sự kiện sẽ chính thức khai mạc vào lúc <strong>{thoi_gian}</strong> tại <strong>{dia_diem}</strong>.</p>',
      '<p>Kính mời {danh_xung} xác nhận tham dự tại: {link_google_form}</p>',
      '<p>Để Ban Tổ chức kịp thời hoàn tất công tác in biển tên để bàn chữ A, sắp xếp chỗ ngồi trang trọng và chuẩn bị tiệc chiêu đãi, kính mong {danh_xung} hồi đáp qua email này hoặc tin nhắn tới cán bộ phụ trách: <strong>{can_bo_lien_he}</strong> - Hotline: <strong>{sdt_lien_he}</strong>.</p>',
      '<br>',
      '<p>Trân trọng cảm ơn sự phối hợp của {danh_xung}!</p>',
    ].join('\n'),
  },
  {
    key: 'thank_you',
    label: '5. Thư cảm ơn & Gửi tài liệu kỷ yếu (T + 3)',
    subject: '[Thư Cảm Ơn] Tham dự {ten_su_kien} - Trung tâm {ten_viet_tat}',
    suggestedFilter: 'attending',
    attachQr: false,
    html: [
      '<p>Kính gửi: <strong>{danh_xung} {ho_ten}</strong></p>',
      '<p>Đơn vị: <strong>{co_quan}</strong></p>',
      '<br>',
      '<p>Chương trình <strong>{ten_su_kien}</strong> diễn ra tại {dia_diem} đã thành công tốt đẹp. Ban Tổ chức {ten_don_vi} ({ten_viet_tat}) xin trân trọng gửi lời cảm ơn sâu sắc nhất tới {danh_xung} đã dành thời gian quý báu tham dự và đóng góp tích cực cho sự kiện.</p>',
      '<p>Ban Tổ chức xin gửi tới {danh_xung} kỷ yếu tóm tắt, hình ảnh hội nghị và tài liệu tham luận đã được số hóa đính kèm theo thư này.</p>',
      '<p>Kính chúc {danh_xung} sức khỏe, hạnh phúc và thành công. Rất mong tiếp tục nhận được sự đồng hành của {danh_xung} trong các chương trình tiếp theo của Thành phố!</p>',
      '<br>',
      '<p>Trân trọng kính thư!</p>',
      '<p><strong>GIÁM ĐỐC {ten_don_vi}</strong></p>',
    ].join('\n'),
  },
  {
    key: 'custom',
    label: '-- Soạn thảo mẫu tùy chỉnh --',
    subject: '[Thông Báo] {ten_su_kien} - Kính gửi {danh_xung} {ho_ten}',
    suggestedFilter: 'all',
    attachQr: false,
    html: ['<p>Kính gửi: <strong>{danh_xung} {ho_ten}</strong></p>', '<p>Đơn vị: <strong>{co_quan}</strong></p>', '<br>', '<p>Nội dung thông báo gửi đại biểu...</p>'].join('\n'),
  },
];

export const EMAIL_TEMPLATE_KEYS = EMAIL_TEMPLATES.map((t) => t.key) as [EmailTemplateKey, ...EmailTemplateKey[]];

export function emailTemplate(key: EmailTemplateKey): EmailTemplate {
  return EMAIL_TEMPLATES.find((t) => t.key === key) ?? EMAIL_TEMPLATES[0]!;
}
