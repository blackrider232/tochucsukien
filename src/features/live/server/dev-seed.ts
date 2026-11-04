// SCE_DEV_MEMORY=1 only (docs/rewrite/dev-runtime.md): plainly fake duty staff
// and one open incident on progress's fake dev event. Never a guest check-in
// (m5 BUG-01), and never in production (decision 13).

import type { DevSeed } from '@/core/dev/runtime';
import { dutyStaffTable, incidentsTable } from './tables';

export const devSeed: DevSeed = async (db, { id, now }) => {
  const eventId = id('Event', 'progress-dev');
  await db.table(dutyStaffTable).insertMany([
    { id: id('DutyStaff', 'live-dev-1'), eventId, legacyId: null, name: 'Cán bộ trực Thử nghiệm A', userId: null, department: 'Phòng Hành chính - Tổ chức', desk: 1, roleLabel: 'Trưởng bàn (giả)', checkedInAt: now },
    { id: id('DutyStaff', 'live-dev-2'), eventId, legacyId: null, name: 'Cán bộ trực Thử nghiệm B', userId: null, department: 'Phòng Phát triển doanh nghiệp', desk: 2, roleLabel: '', checkedInAt: null },
    { id: id('DutyStaff', 'live-dev-3'), eventId, legacyId: null, name: '<b>Cán bộ XSS</b> Thử nghiệm C', userId: null, department: 'Phòng Xúc tiến đầu tư', desk: 3, roleLabel: '', checkedInAt: null },
  ]);
  await db.table(incidentsTable).insert({
    id: id('Incident', 'live-dev-1'), eventId, legacyId: null, seq: 1, location: 'Sân khấu / Bục phát biểu', description: 'Micro bục phát biểu bị rè khi thử (dữ liệu giả)',
    urgency: 'medium', assignee: 'Tổ âm thanh (giả)', status: 'open', reportedAt: now, resolvedAt: null, resolutionNote: '',
  });
};
