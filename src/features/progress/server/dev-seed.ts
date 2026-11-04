// SCE_DEV_MEMORY=1 only (docs/rewrite/dev-runtime.md): one plainly fake event
// on the standard process, a few weeks out, with some steps done and some late,
// so every state of the plan screens shows. Never runs in production.

import type { HHmm, Version } from '@/core/brand';
import type { DevSeed } from '@/core/dev/runtime';
import { addWorkdays, buildWorkCalendar, todayVN } from '@/core/dates';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { instantiateTemplate } from '../domain/instantiate';
import { eventsTable, groupsTable, stepInsertRow, stepsTable } from './tables';

export const DEV_EVENT_NAME = '[DEV] Hội nghị thử nghiệm Tiến độ (dữ liệu giả)';

export const devSeed: DevSeed = async (db, { id, now }) => {
  const eventId = id('Event', 'progress-dev');
  const today = todayVN(now);
  const eventDate = addWorkdays(buildWorkCalendar([]), today, 8);
  await db.table(eventsTable).insert({
    id: eventId,
    name: DEV_EVENT_NAME,
    type: 'hoi_nghi',
    eventDate,
    eventTime: '08:30' as HHmm,
    location: 'Phòng họp thử nghiệm (không có thật)',
    department: 'Phòng Xúc tiến đầu tư',
    supportingDepartments: [],
    leadPerson: 'Cán bộ Dev',
    budget: null,
    targetGuests: 120,
    note: 'Sự kiện giả để kiểm thử giao diện. Có thể xóa.',
    deletedAt: null,
  });

  const groups = instantiateTemplate('hoi_nghi', { leadPerson: 'Cán bộ Dev', settings: { ...DEFAULT_SETTINGS, version: 1 as Version } }, {
    group: (key) => id('TaskGroup', `progress-dev|${key}`),
    step: (key) => id('Step', `progress-dev|${key}`),
    subTask: (key, i) => `${key}-${i + 1}`,
  });
  // The first two steps of Nhóm 1 are done; with T0 eight working days out the long-lead steps are late.
  const done = new Set(groups[0]!.steps.slice(0, 2).map((s) => s.id));
  const stamp = { at: now, by: 'Cán bộ Dev' };
  await db.table(groupsTable).insertMany(groups.map((g) => ({ id: g.id, eventId, phase: g.phase, name: g.name, leadPerson: g.leadPerson, note: g.note, sort: g.sort })));
  await db.table(stepsTable).insertMany(
    groups.flatMap((g) =>
      g.steps.map((s) => stepInsertRow({ ...s, done: done.has(s.id) }, eventId, g.id, stamp)),
    ),
  );
};
