// SCE_DEV_MEMORY=1 only (docs/rewrite/dev-runtime.md): plainly fake guests on
// progress's fake dev event, one per state the screens show (every group and
// RSVP, a substitute, banquet with and without decline, an empty title, a
// markup-looking name). Never runs in production (decision 13).

import type { DraftOf } from '@/core/db';
import type { DevSeed } from '@/core/dev/runtime';
import type { GuestDraft } from '../contract';
import { NEW_GUEST_DEFAULTS } from '../domain/schemas';
import { guestsTable, type GuestRow } from './tables';

type Fixture = [key: string, overrides: Partial<GuestDraft>];

const FIXTURES: ReadonlyArray<Fixture> = [
  ['vip-1', { name: 'Đại biểu Thử Nghiệm A', group: 'VIP', title: 'Phó Chủ tịch (giả)', organization: 'Cơ quan Thử nghiệm Một', phone: '0900.000.001', inviteStatus: 'received', rsvpStatus: 'confirmed', hasBanquet: true }],
  ['vip-2', { name: 'Đại biểu Thử Nghiệm B', group: 'VIP', title: 'Đại sứ (giả)', organization: 'Đại sứ quán Thử nghiệm', inviteStatus: 'sent', rsvpStatus: 'pending', hasBanquet: true, notes: 'Đón tại phòng VIP' }],
  ['sn-1', { name: 'Cán bộ Thử Nghiệm C', group: 'SoNganh', title: 'Giám đốc (giả)', organization: 'Sở Thử nghiệm', sendMethod: 'ems', inviteStatus: 'received', rsvpStatus: 'substituted', substituteName: 'Người Thay Thử - Phó Giám đốc (giả)' }],
  ['sn-2', { name: 'Cán bộ Thử Nghiệm D', group: 'SoNganh', organization: 'Ban Quản lý Thử nghiệm', sendMethod: 'ems', inviteStatus: 'sent', rsvpStatus: 'declined', hasBanquet: true }],
  ['dn-1', { name: 'Doanh nhân Thử Nghiệm E', group: 'DoanhNghiep', title: 'Tổng Giám đốc (giả)', organization: 'Công ty Thử Nghiệm Một', email: 'thu.nghiem.e@example.com' as GuestDraft['email'], sendMethod: 'email', inviteStatus: 'sent', rsvpStatus: 'confirmed', hasBanquet: true }],
  ['dn-2', { name: 'Doanh nhân Thử Nghiệm F', group: 'DoanhNghiep', title: 'Chủ tịch HĐQT (giả)', organization: 'Tập đoàn Thử Nghiệm', phone: '0900.000.006', rsvpStatus: 'pending' }],
  ['qt-1', { name: 'Test Guest G', group: 'QuocTe', title: 'Country Director (fake)', organization: 'Example International Org', email: 'guest.g@example.org' as GuestDraft['email'], sendMethod: 'email', inviteStatus: 'sent', rsvpStatus: 'confirmed' }],
  ['bc-1', { name: 'Phóng viên Thử Nghiệm H', group: 'BaoChi', title: 'Phóng viên (giả)', organization: 'Báo Thử Nghiệm', sendMethod: 'email', inviteStatus: 'pending', rsvpStatus: 'pending' }],
  ['xss', { name: '<img src=x onerror=alert(1)> Thử XSS', group: 'DoanhNghiep', organization: '<script>alert(2)</script> Công ty XSS', notes: '=HYPERLINK("http://evil","x")', rsvpStatus: 'confirmed' }],
];

export const devSeed: DevSeed = async (db, { id }) => {
  const eventId = id('Event', 'progress-dev');
  await db.table(guestsTable).insertMany(
    FIXTURES.map(([key, overrides]) => {
      const draft = { ...NEW_GUEST_DEFAULTS, ...overrides };
      // checkin_code is the DB default, as for every guest.
      return { ...draft, id: id('Guest', `guests-dev|${key}`), eventId, legacyId: null, rsvpAt: null } as Omit<DraftOf<GuestRow>, 'checkinCode'> as DraftOf<GuestRow>;
    }),
  );
};
