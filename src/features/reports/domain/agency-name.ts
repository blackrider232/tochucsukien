// Settings hold the agency names as the letterhead prints them, in capitals
// ('SỞ TÀI CHÍNH HÀ NỘI'). Running text such as "Kính gửi" needs the proper
// case of decision 18 ('Sở Tài chính Hà Nội'). Casing Vietnamese proper names
// by rule cannot be made reliable (what is a function, what is a place, what is
// an acronym), so the known org names are listed here, and any other name
// prints as stored rather than guessed. The lasting fix is proper-case fields
// in settings (status, change request 3), after which this table goes.

/**
 * Letterhead (capitals) -> proper case, for the org names the docs, the legacy
 * app, the dev seed and the settings defaults carry, and the agencies the
 * report is addressed to. Keys are NFC, single-spaced and use `ỦY` (not `UỶ`).
 */
export const KNOWN_AGENCIES: Readonly<Record<string, string>> = {
  'SỞ TÀI CHÍNH HÀ NỘI': 'Sở Tài chính Hà Nội',
  'SỞ TÀI CHÍNH THÀNH PHỐ HÀ NỘI': 'Sở Tài chính Thành phố Hà Nội',
  'SỞ TÀI CHÍNH': 'Sở Tài chính',
  'TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP HÀ NỘI': 'Trung tâm Xúc tiến đầu tư và Hỗ trợ doanh nghiệp Hà Nội',
  'TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP': 'Trung tâm Xúc tiến đầu tư và Hỗ trợ doanh nghiệp',
  'TRUNG TÂM XÚC TIẾN ĐẦU TƯ, THƯƠNG MẠI VÀ DU LỊCH HÀ NỘI': 'Trung tâm Xúc tiến đầu tư, Thương mại và Du lịch Hà Nội',
  'TRUNG TÂM SCE HÀ NỘI': 'Trung tâm SCE Hà Nội',
  'TRUNG TÂM SCE': 'Trung tâm SCE',
  'ỦY BAN NHÂN DÂN THÀNH PHỐ HÀ NỘI': 'Ủy ban nhân dân Thành phố Hà Nội',
  'UBND THÀNH PHỐ HÀ NỘI': 'UBND Thành phố Hà Nội',
  'UBND TP HÀ NỘI': 'UBND TP Hà Nội',
  'UBND TP. HÀ NỘI': 'UBND TP. Hà Nội',
  'HĐND THÀNH PHỐ HÀ NỘI': 'HĐND Thành phố Hà Nội',
  'ĐOÀN ĐBQH THÀNH PHỐ HÀ NỘI': 'Đoàn ĐBQH Thành phố Hà Nội',
  'BAN QUẢN LÝ CÁC KHU CÔNG NGHIỆP VÀ CHẾ XUẤT HÀ NỘI': 'Ban Quản lý các khu công nghiệp và chế xuất Hà Nội',
  'SỞ KẾ HOẠCH VÀ ĐẦU TƯ': 'Sở Kế hoạch và Đầu tư',
  'SỞ KẾ HOẠCH VÀ ĐẦU TƯ HÀ NỘI': 'Sở Kế hoạch và Đầu tư Hà Nội',
  'SỞ KH&ĐT HÀ NỘI': 'Sở KH&ĐT Hà Nội',
  'BỘ KẾ HOẠCH VÀ ĐẦU TƯ': 'Bộ Kế hoạch và Đầu tư',
  'TỔNG CỤC THỐNG KÊ': 'Tổng cục Thống kê',
  'CỤC THUẾ TP. HÀ NỘI': 'Cục Thuế TP. Hà Nội',
  'CỤC THUẾ THÀNH PHỐ HÀ NỘI': 'Cục Thuế Thành phố Hà Nội',
};

/** 'SỞ TÀI CHÍNH HÀ NỘI' -> 'Sở Tài chính Hà Nội'. An unlisted name prints as stored (spacing tidied); a mixed-case name is kept. */
export function agencyName(raw: string): string {
  const name = raw.normalize('NFC').trim().split(/\s+/).filter(Boolean).join(' ');
  return KNOWN_AGENCIES[name.replace(/UỶ/g, 'ỦY')] ?? name;
}
