// SCE_DEV_MEMORY=1 only (docs/rewrite/dev-runtime.md): the issued hall catalog
// as the migration seeds it, one plainly fake hall on the progress dev event,
// a few fake booths and duty shifts. Never runs in production.

import type { DevSeed } from '@/core/dev/runtime';
import { addCalendarDays, todayVN } from '@/core/dates';
import { DEFAULT_HALL_TEMPLATES } from '../domain/default-halls';
import { defaultHallId } from './default-hall-ids';
import { boothShiftsTable, boothsTable, eventHallsTable, hallTemplatesTable } from './tables';

export const DEV_HALL_NAME = '[DEV] Hội trường thử nghiệm (dữ liệu giả)';

export const devSeed: DevSeed = async (db, { id, now }) => {
  await db.table(hallTemplatesTable).insertMany(
    DEFAULT_HALL_TEMPLATES.map((d) => ({ id: defaultHallId(d.legacyId), legacyId: d.legacyId, name: d.name, location: d.location, description: d.description, zones: [...d.zones] })),
  );
  const zones = [
    { key: 'A', name: 'Khu A: Đại biểu VIP (giả)', prefix: 'A-', seatCount: 6, color: 'red', assignedGroup: 'VIP', vipZone: true },
    { key: 'B', name: 'Khu B: Sở ngành (giả)', prefix: 'B-', seatCount: 12, color: 'blue', assignedGroup: 'SoNganh', vipZone: false },
    { key: 'C', name: 'Khu C: Khách chung (giả)', prefix: 'C-', seatCount: 18, color: 'emerald', assignedGroup: 'all', vipZone: false },
  ] as const;
  const hallId = id('HallTemplate', 'venue-dev');
  await db.table(hallTemplatesTable).insert({ id: hallId, legacyId: null, name: DEV_HALL_NAME, location: 'Phòng họp thử nghiệm (không có thật)', description: 'Hội trường giả để kiểm thử giao diện.', zones: [...zones] });

  const eventId = id('Event', 'progress-dev');
  await db.table(eventHallsTable).insert({ id: id('EventHall', 'venue-dev'), eventId, templateId: hallId, zones: [...zones] });
  await db.table(boothsTable).insertMany([
    { id: id('Booth', 'venue-dev-1'), eventId, code: 'A01', size: '01 gian tiêu chuẩn (9m²)', company: '[DEV] Công ty giả A', products: 'Sản phẩm giả', subsidyPercent: 50, status: 'confirmed', contact: 'Người giả - 0900000001', staff: 'Cán bộ Dev' },
    { id: id('Booth', 'venue-dev-2'), eventId, code: 'A02', size: '01 gian tiêu chuẩn (9m²)', company: '[DEV] HTX giả B', products: '', subsidyPercent: 100, status: 'reviewing', contact: '', staff: '' },
    { id: id('Booth', 'venue-dev-3'), eventId, code: 'B01', size: '02 gian (18m²)', company: '', products: '', subsidyPercent: 0, status: 'available', contact: '', staff: '' },
  ]);
  const today = todayVN(now);
  await db.table(boothShiftsTable).insertMany([
    { id: id('BoothShift', 'venue-dev-1'), eventId, shiftDate: today, shiftLabel: '07:30 - 12:00', officerName: 'Cán bộ Dev', officerUserId: null, department: 'Phòng Phát triển doanh nghiệp', phone: '0900000002', zone: 'Dãy A' },
    { id: id('BoothShift', 'venue-dev-2'), eventId, shiftDate: addCalendarDays(today, 1), shiftLabel: '13:00 - 17:30', officerName: 'Cán bộ Dev 2', officerUserId: null, department: 'Phòng Xúc tiến đầu tư', phone: '', zone: 'Dãy B' },
  ]);
};
