// SCE_DEV_MEMORY=1 only: the responses sheet of progress's dev event, served
// by the fake sheet source in place of Google. Plainly fake people: two dev
// guests answer (by email), one newcomer registers, one answer has no time,
// and one name is markup, so every review state and the escaping show.

/** The dev event's sheet (devSeed stores its export URL). */
export const DEV_SHEET_ID = '1DevSheetFixture00000000000000000000';
export const DEV_SHEET_URL = `https://docs.google.com/spreadsheets/d/${DEV_SHEET_ID}/export?format=csv`;

const DEV_SHEET_CSV = [
  'Dấu thời gian,Họ và tên,Tên cơ quan,Email,Số điện thoại,Xác nhận tham dự,Anh/chị có dự tiệc chiêu đãi?,Họ tên người đi thay',
  '04/11/2026 08:15:00,Doanh nhân Thử Nghiệm E,Công ty Thử Nghiệm Một,thu.nghiem.e@example.com,,Có tham dự,Có,',
  '04/11/2026 08:40:00,Test Guest G,Example International Org,guest.g@example.org,,Không tham dự,Không,',
  '04/11/2026 09:05:00,Người Đăng Ký Thử,Công ty Đăng Ký Thử,dang.ky.thu@example.com,0900.000.099,Có tham dự,Không,',
  ',Khách Không Rõ Giờ,Cơ quan Thử nghiệm Hai,khong.ro.gio@example.com,,Có tham dự,,',
  '"04/11/2026 09:30:00","<img src=x onerror=alert(3)> Thử XSS",Công ty XSS,xss.form@example.com,,Có,,',
].join('\r\n');

export const DEV_SHEETS: Readonly<Record<string, string>> = { [DEV_SHEET_URL]: DEV_SHEET_CSV };
