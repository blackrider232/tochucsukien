// SCE_DEV_MEMORY=1 only (docs/rewrite/dev-runtime.md): plainly fake clippings,
// hand-entered packages and one press release on progress's fake dev event.
// Never an issued daily report: a signed report is only ever issued by a
// person (m6 BUG-01, decision 13). Never runs in production.

import type { SafeUrl, Vnd } from '@/core/brand';
import type { DevSeed } from '@/core/dev/runtime';
import { addCalendarDays, todayVN } from '@/core/dates';
import { clippingsTable, packagesTable, pressReleasesTable } from './tables';

export const devSeed: DevSeed = async (db, { id, now }) => {
  const eventId = id('Event', 'progress-dev');
  const today = todayVN(now);
  await db.table(clippingsTable).insertMany([
    {
      id: id('MediaClipping', 'reports-dev-1'), eventId, legacyId: null, outlet: '[DEV] Báo Thử Nghiệm', title: 'Tin thử nghiệm về công tác chuẩn bị (dữ liệu giả)',
      publishedOn: addCalendarDays(today, -2), mediaType: 'Báo điện tử', url: 'https://example.com/tin-thu-nghiem' as SafeUrl, author: 'Phóng viên giả',
    },
    {
      id: id('MediaClipping', 'reports-dev-2'), eventId, legacyId: null, outlet: '[DEV] Đài Thử Nghiệm', title: '<b>Phóng sự</b> thử XSS (dữ liệu giả)',
      publishedOn: addCalendarDays(today, -1), mediaType: 'Truyền hình', url: null, author: '',
    },
  ]);
  const vnd = (n: number) => n as Vnd;
  await db.table(packagesTable).insertMany([
    { id: id('BiddingPackage', 'reports-dev-1'), eventId, legacyId: null, code: 'TB-DEV-001', name: '[DEV] Thuê hội trường (giả)', department: 'Phòng Hành chính - Tổ chức', budget: vnd(120_000_000), winningPrice: vnd(114_000_000), contractor: 'Công ty giả A', status: 'Đang thực hiện hợp đồng' },
    { id: id('BiddingPackage', 'reports-dev-2'), eventId, legacyId: null, code: 'TB-DEV-002', name: '[DEV] Âm thanh, ánh sáng (giả, vượt dự toán)', department: 'Phòng Xúc tiến đầu tư', budget: vnd(80_000_000), winningPrice: vnd(84_000_000), contractor: 'Công ty giả B', status: 'Đã nghiệm thu thanh lý' },
    { id: id('BiddingPackage', 'reports-dev-3'), eventId, legacyId: null, code: 'TB-DEV-003', name: '[DEV] In ấn tài liệu (giả)', department: 'Phòng Phát triển doanh nghiệp', budget: vnd(40_000_000), winningPrice: null, contractor: null, status: 'Đang thẩm định hồ sơ' },
  ]);
  await db.table(pressReleasesTable).insert({
    id: id('PressRelease', 'reports-dev-1'), eventId, title: '[DEV] Thông cáo báo chí thử nghiệm', timing: 'before', contact: 'Cán bộ Dev',
    content: 'Nội dung thông cáo giả để kiểm thử giao diện.',
  });
};
