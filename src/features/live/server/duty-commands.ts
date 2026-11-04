// The duty roster (m5 §3.3): assign, edit, remove, and presence against the
// 2-hour rule (BUG-18, BUG-25). Presence is always the server's clock: no
// undo payload can carry an arrival time, so lateness cannot be rewritten.

import { z } from 'zod';
import type { DutyStaffId, EventId } from '@/core/brand';
import { CommandError, type CommandContext } from '@/core/commands';
import { DbError } from '@/core/db';
import { readEvent } from '@/features/progress/server';
import { formatAt } from '../domain/desk';
import { DUTY_DESKS, dutyRequiredAt, dutyStatus } from '../domain/duty';
import { dutyFields, dutyIdSchema, eventIdSchema, versionSchema, type DutyDraft } from '../domain/schemas';
import { asSchema, audit, inverse, manage, type Spec } from './command-kit';
import { toDuty } from './reads';
import { dutyStaffTable, type DutyRow } from './tables';

async function staffOf(ctx: CommandContext, eventId: EventId, id: DutyStaffId): Promise<DutyRow> {
  const row = await ctx.db.table(dutyStaffTable).get(id);
  if (!row || row.eventId !== eventId) throw new DbError('not_found');
  return row;
}
const draftOf = ({ name, department, desk, roleLabel }: DutyRow): DutyDraft => ({ name, department, desk, roleLabel });
const label = (d: DutyDraft) => `${d.name} (${d.department}), ${DUTY_DESKS[d.desk].short}${d.roleLabel ? `, ${d.roleLabel}` : ''}`;

export const createDuty: Spec<'live.createDuty'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, id: dutyIdSchema, draft: dutyFields })),
  authorize: manage,
  async run(ctx, { eventId, id, draft }) {
    const row = await ctx.db.table(dutyStaffTable).insert({ id, eventId, legacyId: null, userId: null, checkedInAt: null, ...draft });
    return {
      value: toDuty(row),
      audit: audit('PHÂN CÔNG TRỰC', `Phân công trực: ${label(draft)}`, eventId, 'duty_staff', id),
      inverse: inverse('live.deleteDuty', { eventId, id, version: row.version }, `Phân công ${draft.name}`),
    };
  },
};

export const updateDuty: Spec<'live.updateDuty'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, id: dutyIdSchema, version: versionSchema, draft: dutyFields })),
  authorize: manage,
  async run(ctx, { eventId, id, version, draft }) {
    const before = await staffOf(ctx, eventId, id);
    const after = await ctx.db.table(dutyStaffTable).update(id, draft, { expectedVersion: version });
    return {
      value: toDuty(after),
      audit: audit('SỬA PHÂN CÔNG TRỰC', `Sửa phân công trực: ${label(draftOf(before))} → ${label(draft)}`, eventId, 'duty_staff', id),
      inverse: inverse('live.updateDuty', { eventId, id, version: after.version, draft: draftOf(before) }, `Sửa phân công ${before.name}`),
    };
  },
};

/** A staff member who has checked in is kept: their arrival time could not come back with an undo. */
export const deleteDuty: Spec<'live.deleteDuty'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, id: dutyIdSchema, version: versionSchema })),
  authorize: manage,
  async run(ctx, { eventId, id, version }) {
    const row = await staffOf(ctx, eventId, id);
    if (row.checkedInAt) throw new CommandError('invalid', `${row.name} đã điểm danh. Hủy điểm danh trước khi xóa phân công.`);
    await ctx.db.table(dutyStaffTable).remove(id, { expectedVersion: version });
    return {
      value: null,
      audit: audit('XÓA PHÂN CÔNG TRỰC', `Xóa phân công trực: ${label(draftOf(row))}`, eventId, 'duty_staff', id),
      inverse: inverse('live.createDuty', { eventId, id, draft: draftOf(row) }, `Xóa phân công ${row.name}`),
    };
  },
};

/** "Điểm danh" and its reverse. The audit says on time or how late, against the configured presence hours. */
export const setDutyPresence: Spec<'live.setDutyPresence'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, id: dutyIdSchema, version: versionSchema, present: z.boolean() })),
  authorize: manage,
  async run(ctx, { eventId, id, version, present }) {
    const row = await staffOf(ctx, eventId, id);
    if (present === (row.checkedInAt !== null)) {
      const text = row.checkedInAt ? `đã điểm danh lúc ${formatAt(row.checkedInAt, ctx.now)}` : 'chưa điểm danh';
      return { value: toDuty(row), audit: audit('ĐIỂM DANH TRỰC', `${row.name}: ${text}; không thay đổi`, eventId, 'duty_staff', id) };
    }
    const after = await ctx.db.table(dutyStaffTable).update(id, { checkedInAt: present ? ctx.now : null }, { expectedVersion: version });
    if (!present) {
      return {
        value: toDuty(after),
        audit: audit('HỦY ĐIỂM DANH TRỰC', `Hủy điểm danh lúc ${formatAt(row.checkedInAt!, ctx.now)}: ${row.name}`, eventId, 'duty_staff', id),
        inverse: inverse('live.setDutyPresence', { eventId, id, version: after.version, present: true }, `Hủy điểm danh ${row.name} (điểm danh lại theo giờ hiện tại)`),
      };
    }
    const event = await readEvent(ctx, eventId);
    const requiredAt = event ? dutyRequiredAt(event, ctx.settings) : null;
    const state = requiredAt ? dutyStatus(after, requiredAt) : null;
    const verdict = !requiredAt || !state ? '' : state.kind === 'late' ? `, trễ ${state.minutes} phút so với giờ quy định ${formatAt(requiredAt, ctx.now)}` : `, đúng giờ quy định (trước ${formatAt(requiredAt, ctx.now)})`;
    return {
      value: toDuty(after),
      audit: audit('ĐIỂM DANH TRỰC', `Điểm danh ${row.name} lúc ${formatAt(ctx.now, ctx.now)}${verdict}`, eventId, 'duty_staff', id),
      inverse: inverse('live.setDutyPresence', { eventId, id, version: after.version, present: false }, `Điểm danh ${row.name}`),
    };
  },
};
