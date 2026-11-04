// Every write of the venue feature. Each mutation audits and, where a reverse
// exists, returns the inverse its undo runs. Seats change only through
// writeSeatChanges(): each change names the occupant the client saw, so a seat
// edited by someone else in the meantime is a conflict, never a silent eviction
// (m4b BUG-06, BUG-09, BUG-17).

import { z } from 'zod';
import { newId, type BoothId, type BoothShiftId, type EventId, type GuestId, type HallTemplateId, type SeatCode, type Version } from '@/core/brand';
import { CommandError, defineCommands, type AuditEntry, type CommandContext, type CommandSpec, type InputOf, type Inverse, type OutputOf, type Sig } from '@/core/commands';
import type { Schema } from '@/core/db';
import type { RosterEntry } from '@/features/guests';
import type { Booth, BoothShift, EventHall, HallTemplate, HallZone, SeatAssignment } from '../contract';
import { AUTO_ASSIGN_MODES, planAutoAssign, seededRandom, type AutoAssignMode } from '../domain/auto-assign';
import { DEFAULT_HALL_TEMPLATES } from '../domain/default-halls';
import { findFreeSeat, orphanSeats, remapSeats, zoneOfSeat } from '../domain/halls';
import {
  boothDraftSchema, boothIdSchema, boothShiftIdSchema, eventIdSchema, guestIdSchema, hallTemplateDraftSchema, hallTemplateIdSchema, seatCodeSchema,
  SEAT_POLICIES, shiftDraftSchema, versionSchema, zonesSchema, type BoothDraft, type HallTemplateDraft, type SeatPolicy, type ShiftDraft,
} from '../domain/schemas';
import { defaultHallId } from './default-hall-ids';
import { boothShiftsTable, boothsTable, eventHallsTable, hallTemplatesTable, seatsTable, type BoothRow, type EventHallRow, type SeatRow } from './tables';
import { requireRoster } from './upstream';

export interface SeatChange {
  seatCode: SeatCode;
  /** The occupant the client saw; the change is refused when the seat holds someone else now. */
  from: GuestId | null;
  to: GuestId | null;
}
export interface AutoAssignSummary {
  attending: number;
  placed: number;
  unplaced: number;
  perZone: ReadonlyArray<{ key: string; name: string; assigned: number; seats: number }>;
}
type HallState = { templateId: HallTemplateId | null; zones: ReadonlyArray<HallZone> };

declare module '@/core/commands' {
  interface CommandMap {
    'venue.applySeats': Sig<{ eventId: EventId; changes: ReadonlyArray<SeatChange> }, ReadonlyArray<SeatAssignment>>;
    'venue.autoAssign': Sig<{ eventId: EventId; mode: AutoAssignMode; seed?: number }, AutoAssignSummary>;
    'venue.clearSeats': Sig<{ eventId: EventId }, null>;
    'venue.releaseOrphans': Sig<{ eventId: EventId }, null>;
    'venue.setEventHall': Sig<{ eventId: EventId; version: Version | null; templateId: HallTemplateId; seats: SeatPolicy }, EventHall>;
    'venue.updateEventZones': Sig<{ eventId: EventId; version: Version; zones: ReadonlyArray<HallZone>; releaseOrphans: boolean }, EventHall>;
    'venue.restoreEventHall': Sig<{ eventId: EventId; version: Version | null; hall: HallState | null; release: ReadonlyArray<SeatCode>; add: ReadonlyArray<{ seatCode: SeatCode; guestId: GuestId }> }, EventHall | null>;
    'venue.createHallTemplate': Sig<{ id: HallTemplateId; draft: HallTemplateDraft }, HallTemplate>;
    'venue.updateHallTemplate': Sig<{ id: HallTemplateId; version: Version; draft: HallTemplateDraft }, HallTemplate>;
    'venue.deleteHallTemplate': Sig<{ id: HallTemplateId; version: Version }, null>;
    'venue.restoreDefaultHallTemplates': Sig<Record<string, never>, ReadonlyArray<HallTemplate>>;
    'venue.createBooth': Sig<{ eventId: EventId; id: BoothId; draft: BoothDraft }, Booth>;
    'venue.updateBooth': Sig<{ eventId: EventId; id: BoothId; version: Version; draft: BoothDraft }, Booth>;
    'venue.deleteBooth': Sig<{ eventId: EventId; id: BoothId; version: Version }, null>;
    'venue.createShift': Sig<{ eventId: EventId; id: BoothShiftId; draft: ShiftDraft }, BoothShift>;
    'venue.updateShift': Sig<{ eventId: EventId; id: BoothShiftId; version: Version; draft: ShiftDraft }, BoothShift>;
    'venue.deleteShift': Sig<{ eventId: EventId; id: BoothShiftId; version: Version }, null>;
  }
}

type Spec<K extends Inverse['command']> = CommandSpec<InputOf<K>, OutputOf<K>>;
const asSchema = <T>(s: z.ZodType): Schema<T> => s as unknown as Schema<T>;
const inverse = <K extends Inverse['command']>(command: K, input: InputOf<K>, label: string) => ({ command, input, label }) as Inverse;
const audit = (action: string, summary: string, eventId: EventId | null, entity: string, entityId: string): AuditEntry => ({ action, summary, eventId, entity, entityId });

const seating = { perm: 'venue.seating.write', event: (i: { eventId: EventId }) => i.eventId } as const;
const boothsWrite = { perm: 'venue.booths.write', event: (i: { eventId: EventId }) => i.eventId } as const;
const hallsAdmin = { perm: 'venue.halls.admin', global: true } as const;

// ---------- seats ----------

async function hallRow(ctx: CommandContext, eventId: EventId): Promise<EventHallRow | null> {
  return (await ctx.db.table(eventHallsTable).list({ eventId }))[0] ?? null;
}
async function requireHall(ctx: CommandContext, eventId: EventId): Promise<EventHallRow> {
  const hall = await hallRow(ctx, eventId);
  if (!hall) throw new CommandError('conflict', 'Sự kiện chưa chọn hội trường. Vui lòng chọn hội trường trước khi xếp chỗ.');
  return hall;
}
const seatsOf = (ctx: CommandContext, eventId: EventId) => ctx.db.table(seatsTable).list({ eventId });

const nameOf = (roster: ReadonlyArray<RosterEntry> | null, id: GuestId) => roster?.find((g) => g.id === id)?.name ?? 'đại biểu';

/**
 * Applies seat changes after checking that each seat still holds `from`, that every newly seated guest exists, has not
 * declined, and either has no seat or leaves one named in the same changes. Rows are deleted before they are inserted,
 * so the unique (event, seat) and (event, guest) keys hold throughout.
 */
async function writeSeatChanges(ctx: CommandContext, eventId: EventId, hall: Pick<EventHall, 'zones'>, raw: ReadonlyArray<SeatChange>): Promise<{ changes: SeatChange[]; roster: ReadonlyArray<RosterEntry> | null; rows: SeatRow[] }> {
  const changes = raw.filter((c) => c.from !== c.to);
  if (new Set(changes.map((c) => c.seatCode)).size !== changes.length) throw new CommandError('invalid', 'Một ghế được chỉ định hai lần.');
  const incoming = changes.flatMap((c) => (c.to ? [c.to] : []));
  if (new Set(incoming).size !== incoming.length) throw new CommandError('invalid', 'Một đại biểu chỉ được xếp một ghế.');

  const current = await seatsOf(ctx, eventId);
  const bySeat = new Map(current.map((s) => [s.seatCode, s]));
  const byGuest = new Map(current.map((s) => [s.guestId, s]));
  const changed = new Map(changes.map((c) => [c.seatCode, c]));
  for (const c of changes) {
    if ((bySeat.get(c.seatCode)?.guestId ?? null) !== c.from) throw new CommandError('conflict', `Ghế ${c.seatCode} vừa được người khác thay đổi. Đang tải lại…`);
    if (c.to && !zoneOfSeat(hall, c.seatCode)) throw new CommandError('invalid', `Ghế ${c.seatCode} không có trong sơ đồ hội trường.`);
  }
  const roster = incoming.length > 0 ? await requireRoster(ctx, eventId) : null;
  for (const guestId of incoming) {
    const guest = roster!.find((g) => g.id === guestId);
    if (!guest) throw new CommandError('not_found', 'Không tìm thấy đại biểu trong danh sách khách mời của sự kiện.');
    if (guest.rsvpStatus === 'declined') throw new CommandError('invalid', `${guest.name} đã báo vắng, không xếp chỗ.`);
    const seat = byGuest.get(guestId);
    if (seat && changed.get(seat.seatCode)?.from !== guestId) throw new CommandError('conflict', `${guest.name} đang ngồi ghế ${seat.seatCode}. Đang tải lại…`);
  }

  const vacated = changes.filter((c) => c.from !== null).map((c) => bySeat.get(c.seatCode)!.id);
  if (vacated.length > 0) await ctx.db.table(seatsTable).removeWhere({ eventId, id: vacated });
  const rows = await ctx.db.table(seatsTable).insertMany(changes.flatMap((c) => (c.to ? [{ id: newId(), eventId, seatCode: c.seatCode, guestId: c.to }] : [])));
  return { changes, roster, rows };
}

/** The reverse changes, minus seats the hall no longer has (a guest is not put back on an orphan seat). */
function reverse(hall: Pick<EventHall, 'zones'>, changes: ReadonlyArray<SeatChange>): SeatChange[] {
  return changes.map((c) => ({ seatCode: c.seatCode, from: c.to, to: c.from })).filter((c) => !c.to || zoneOfSeat(hall, c.seatCode));
}

function seatSummary(changes: ReadonlyArray<SeatChange>, roster: ReadonlyArray<RosterEntry> | null): string {
  const parts = changes.map((c) => (c.to ? `ghế ${c.seatCode}: ${nameOf(roster, c.to)}` : `ghế ${c.seatCode}: để trống`));
  return parts.length <= 6 ? parts.join('; ') : `${parts.slice(0, 6).join('; ')} và ${parts.length - 6} ghế khác`;
}

const seatOutcome = (eventId: EventId, hall: Pick<EventHall, 'zones'>, action: string, summary: string, changes: ReadonlyArray<SeatChange>, label: string) => {
  const back = reverse(hall, changes);
  return {
    audit: audit(action, summary, eventId, 'seating', eventId),
    ...(back.length > 0 ? { inverse: inverse('venue.applySeats', { eventId, changes: back }, label) } : {}),
  };
};

const toSeat = ({ eventId, seatCode, guestId }: SeatRow): SeatAssignment => ({ eventId, seatCode, guestId });

const changeSchema = z.object({ seatCode: seatCodeSchema, from: guestIdSchema.nullable(), to: guestIdSchema.nullable() });

const applySeats: Spec<'venue.applySeats'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, changes: z.array(changeSchema).min(1).max(2000) })),
  authorize: seating,
  async run(ctx, { eventId, changes }) {
    const hall = await requireHall(ctx, eventId);
    const done = await writeSeatChanges(ctx, eventId, hall, changes);
    return {
      value: done.rows.map(toSeat),
      ...seatOutcome(eventId, hall, 'XẾP CHỖ NGỒI', `Xếp chỗ: ${seatSummary(done.changes, done.roster)}`, done.changes, `Xếp chỗ ${done.changes.map((c) => c.seatCode).join(', ')}`),
    };
  },
};

/** Asked by live (walk-in) and the guest list. 'auto' picks findFreeSeat for the guest's group; a seated guest keeps the seat. */
const assignSeat: Spec<'venue.assignSeat'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, guestId: guestIdSchema, seatCode: z.union([z.literal('auto'), seatCodeSchema]) })),
  authorize: seating,
  async run(ctx, { eventId, guestId, seatCode }) {
    const hall = await requireHall(ctx, eventId);
    const roster = await requireRoster(ctx, eventId);
    const guest = roster.find((g) => g.id === guestId);
    if (!guest) throw new CommandError('not_found', 'Không tìm thấy đại biểu trong danh sách khách mời của sự kiện.');
    const seats = await seatsOf(ctx, eventId);
    const own = seats.find((s) => s.guestId === guestId);
    const target = seatCode === 'auto'
      ? (own && zoneOfSeat(hall, own.seatCode) ? own.seatCode : findFreeSeat(hall, new Set(seats.map((s) => s.seatCode)), guest.group))
      : seatCode;
    const noop = (summary: string) => audit('XẾP CHỖ NGỒI', summary, eventId, 'seating', guestId);
    if (!target) return { value: null, audit: noop(`Không còn ghế trống phù hợp cho ${guest.name}`) };
    if (own?.seatCode === target) return { value: toSeat(own), audit: noop(`${guest.name} giữ nguyên ghế ${target}`) };
    const occupant = seats.find((s) => s.seatCode === target);
    if (occupant) throw new CommandError('conflict', `Ghế ${target} đã có ${nameOf(roster, occupant.guestId)} ngồi.`);
    const changes: SeatChange[] = [{ seatCode: target, from: null, to: guestId }, ...(own ? [{ seatCode: own.seatCode, from: guestId, to: null }] : [])];
    const done = await writeSeatChanges(ctx, eventId, hall, changes);
    return {
      value: toSeat(done.rows[0]!),
      ...seatOutcome(eventId, hall, 'XẾP CHỖ NGỒI', `Xếp chỗ: ${seatSummary(done.changes, roster)}`, done.changes, `Xếp ${guest.name} vào ghế ${target}`),
    };
  },
};

/** Asked by guests when an RSVP turns to declined or a guest is deleted. No-op without a seat. */
const releaseGuestSeat: Spec<'venue.releaseGuestSeat'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, guestId: guestIdSchema })),
  authorize: seating,
  async run(ctx, { eventId, guestId }) {
    const own = (await ctx.db.table(seatsTable).list({ eventId, guestId }))[0];
    if (!own) return { value: null, audit: audit('HỦY XẾP CHỖ', 'Đại biểu chưa có ghế, không cần giải phóng', eventId, 'seating', guestId) };
    await ctx.db.table(seatsTable).remove(own.id);
    const hall = await hallRow(ctx, eventId);
    const back = hall && zoneOfSeat(hall, own.seatCode) ? [{ seatCode: own.seatCode, from: null, to: guestId }] : [];
    return {
      value: null,
      audit: audit('HỦY XẾP CHỖ', `Giải phóng ghế ${own.seatCode}`, eventId, 'seating', guestId),
      ...(back.length > 0 ? { inverse: inverse('venue.applySeats', { eventId, changes: back }, `Hủy xếp chỗ ghế ${own.seatCode}`) } : {}),
    };
  },
};

const autoAssign: Spec<'venue.autoAssign'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, mode: z.enum(AUTO_ASSIGN_MODES), seed: z.number().int().nonnegative().optional() })),
  authorize: seating,
  async run(ctx, { eventId, mode, seed }) {
    const hall = await requireHall(ctx, eventId);
    const roster = await requireRoster(ctx, eventId);
    const attending = roster.filter((g) => g.rsvpStatus === 'confirmed' || g.rsvpStatus === 'substituted');
    if (attending.length === 0) {
      throw new CommandError('invalid', 'Không có đại biểu nào đã xác nhận tham dự (RSVP) để tự động xếp chỗ. Vui lòng cập nhật trạng thái RSVP trước!');
    }
    const current = await seatsOf(ctx, eventId);
    const random = seededRandom(seed ?? crypto.getRandomValues(new Uint32Array(1))[0]!);
    const plan = planAutoAssign(hall.zones, attending.map((g) => ({ id: g.id, group: g.group })), current, mode, random);

    const next = new Map<SeatCode, GuestId | null>(mode === 'reassign-all' ? current.map((s) => [s.seatCode, null]) : []);
    for (const p of plan.placed) next.set(p.seatCode, p.guestId);
    const occupant = new Map(current.map((s) => [s.seatCode, s.guestId]));
    const changes = [...next].map(([seatCode, to]) => ({ seatCode, from: occupant.get(seatCode) ?? null, to }));
    const done = await writeSeatChanges(ctx, eventId, hall, changes);
    const summary: AutoAssignSummary = {
      attending: attending.length,
      placed: attending.length - plan.unplaced.length,
      unplaced: plan.unplaced.length,
      perZone: plan.perZone.map((z) => ({ key: z.zone.key, name: z.zone.name, assigned: z.assigned, seats: z.seats })),
    };
    const how = mode === 'fill-empty' ? 'chỉ xếp người chưa có ghế' : 'xếp lại toàn bộ';
    return {
      value: summary,
      ...seatOutcome(eventId, hall, 'TỰ ĐỘNG XẾP CHỖ', `Tự động xếp chỗ (${how}): ${summary.placed}/${summary.attending} đại biểu có ghế, ${plan.placed.length} ghế mới`, done.changes, 'Tự động xếp chỗ'),
    };
  },
};

const clearSeats: Spec<'venue.clearSeats'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema })),
  authorize: seating,
  async run(ctx, { eventId }) {
    const hall = await requireHall(ctx, eventId);
    const current = await seatsOf(ctx, eventId);
    const done = await writeSeatChanges(ctx, eventId, hall, current.map((s) => ({ seatCode: s.seatCode, from: s.guestId, to: null })));
    return { value: null, ...seatOutcome(eventId, hall, 'HỦY XẾP CHỖ', `Hủy tất cả xếp chỗ (${done.changes.length} ghế)`, done.changes, 'Hủy tất cả xếp chỗ') };
  },
};

/** Releases the seats the hall no longer has (m4b BUG-05). Not undoable: a guest is never put back on a seat that does not exist. */
const releaseOrphans: Spec<'venue.releaseOrphans'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema })),
  authorize: seating,
  async run(ctx, { eventId }) {
    const hall = await requireHall(ctx, eventId);
    const orphans = orphanSeats(hall, (await seatsOf(ctx, eventId)).map(toSeat));
    const done = await writeSeatChanges(ctx, eventId, hall, orphans.map((s) => ({ seatCode: s.seatCode, from: s.guestId, to: null })));
    return { value: null, audit: audit('HỦY XẾP CHỖ', `Giải phóng ${done.changes.length} ghế không còn trong sơ đồ: ${done.changes.map((c) => c.seatCode).join(', ')}`, eventId, 'seating', eventId) };
  },
};

// ---------- the event's hall ----------

/** Writes hall and seats in one place for setEventHall, updateEventZones and their undo; returns the undo of what it did. */
async function writeHall(ctx: CommandContext, eventId: EventId, version: Version | null, hall: HallState | null, release: ReadonlyArray<SeatCode>, add: ReadonlyArray<{ seatCode: SeatCode; guestId: GuestId }>) {
  const before = await hallRow(ctx, eventId);
  if ((before?.version ?? null) !== version) throw new CommandError('conflict', 'Cấu hình hội trường vừa được người khác thay đổi. Đang tải lại…');
  const current = await seatsOf(ctx, eventId);
  const released = current.filter((s) => release.includes(s.seatCode));
  let after: EventHallRow | null = null;
  if (hall && before) after = await ctx.db.table(eventHallsTable).update(before.id, { templateId: hall.templateId, zones: [...hall.zones] }, { expectedVersion: before.version });
  else if (hall) after = await ctx.db.table(eventHallsTable).insert({ id: newId(), eventId, templateId: hall.templateId, zones: [...hall.zones] });
  else if (before) await ctx.db.table(eventHallsTable).remove(before.id, { expectedVersion: before.version });
  if (released.length > 0) await ctx.db.table(seatsTable).removeWhere({ eventId, id: released.map((s) => s.id) });
  if (add.length > 0) await ctx.db.table(seatsTable).insertMany(add.map((s) => ({ id: newId(), eventId, seatCode: s.seatCode, guestId: s.guestId })));
  const undo: InputOf<'venue.restoreEventHall'> = {
    eventId,
    version: after?.version ?? null,
    hall: before ? { templateId: before.templateId, zones: before.zones } : null,
    release: add.map((s) => s.seatCode),
    add: released.map((s) => ({ seatCode: s.seatCode, guestId: s.guestId })),
  };
  return { after, released, undo };
}

const toHall = (row: EventHallRow): EventHall => ({ eventId: row.eventId, templateId: row.templateId, zones: row.zones, version: row.version });

/**
 * Copies a template's zones into the event (m4b §1.7). The seats either keep their zone position and number where the
 * new hall has them ('remap'), or are all released to start over ('release'); the dialog shows both counts first (m4b BUG-05).
 */
const setEventHall: Spec<'venue.setEventHall'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, version: versionSchema.nullable(), templateId: hallTemplateIdSchema, seats: z.enum(SEAT_POLICIES) })),
  authorize: seating,
  async run(ctx, { eventId, version, templateId, seats: policy }) {
    const template = await ctx.db.table(hallTemplatesTable).get(templateId);
    if (!template) throw new CommandError('not_found', 'Không tìm thấy hội trường mẫu này. Có thể mẫu vừa bị xóa khỏi danh mục.');
    const before = await hallRow(ctx, eventId);
    const current = (await seatsOf(ctx, eventId)).map(toSeat);
    const kept = policy === 'release' ? [] : before ? remapSeats(before.zones, template.zones, current).kept : current.filter((s) => zoneOfSeat(template, s.seatCode));
    const keptSame = kept.filter((k) => current.some((c) => c.guestId === k.guestId && c.seatCode === k.seatCode));
    const moved = kept.filter((k) => !keptSame.includes(k));
    const release = current.filter((c) => !keptSame.some((k) => k.guestId === c.guestId)).map((c) => c.seatCode);
    const { after, released, undo } = await writeHall(ctx, eventId, version, { templateId, zones: template.zones }, release, moved);
    const lost = released.length - moved.length;
    return {
      value: toHall(after!),
      audit: audit('CẤU HÌNH HỘI TRƯỜNG', `Chuyển sang hội trường "${template.name}"${lost > 0 ? `, hủy xếp chỗ ${lost} đại biểu` : ''}`, eventId, 'event_hall', eventId),
      inverse: inverse('venue.restoreEventHall', undo, `Chuyển hội trường "${template.name}"`),
    };
  },
};

/**
 * Customizes the event's copy: name, target group, seat count and the VIP flag per zone. Zones are not added, removed,
 * re-prefixed or re-coloured per event (m4b §1.6). Shrinking below a seated guest needs releaseOrphans (m4b BUG-05).
 */
const updateEventZones: Spec<'venue.updateEventZones'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, version: versionSchema, zones: zonesSchema, releaseOrphans: z.boolean() })),
  authorize: seating,
  async run(ctx, { eventId, version, zones, releaseOrphans }) {
    const before = await requireHall(ctx, eventId);
    const same = zones.length === before.zones.length && zones.every((z, i) => {
      const b = before.zones[i]!;
      return z.key === b.key && z.prefix === b.prefix && z.color === b.color;
    });
    if (!same) throw new CommandError('invalid', 'Chỉ được đổi tên, nhóm đại biểu, số ghế và khu VIP của từng khu. Thêm, bớt khu hoặc đổi tiền tố thực hiện ở Quản trị Hội trường.');
    const orphans = orphanSeats({ zones }, (await seatsOf(ctx, eventId)).map(toSeat));
    if (orphans.length > 0 && !releaseOrphans) {
      throw new CommandError('conflict', `Giảm số ghế sẽ hủy xếp chỗ của ${orphans.length} đại biểu (${orphans.map((s) => s.seatCode).join(', ')}). Hãy xác nhận để tiếp tục.`);
    }
    const { after, undo } = await writeHall(ctx, eventId, version, { templateId: before.templateId, zones }, orphans.map((s) => s.seatCode), []);
    return {
      value: toHall(after!),
      audit: audit('CẤU HÌNH HỘI TRƯỜNG', `Cấu hình phân khu: ${zones.map((z) => `${z.name} ${z.seatCount} ghế`).join('; ')}${orphans.length > 0 ? `; hủy xếp chỗ ${orphans.length} ghế` : ''}`, eventId, 'event_hall', eventId),
      inverse: inverse('venue.restoreEventHall', undo, 'Cấu hình phân khu'),
    };
  },
};

/** The undo of a hall change: puts back the hall (or none) and exactly the seats the change released or added. */
const restoreEventHall: Spec<'venue.restoreEventHall'> = {
  kind: 'mutation',
  input: asSchema(z.object({
    eventId: eventIdSchema,
    version: versionSchema.nullable(),
    hall: z.object({ templateId: hallTemplateIdSchema.nullable(), zones: zonesSchema }).nullable(),
    release: z.array(seatCodeSchema).max(5000),
    add: z.array(z.object({ seatCode: seatCodeSchema, guestId: guestIdSchema })).max(5000),
  })),
  authorize: seating,
  async run(ctx, { eventId, version, hall, release, add }) {
    const { after, undo } = await writeHall(ctx, eventId, version, hall, release, add);
    return {
      value: after && toHall(after),
      audit: audit('CẤU HÌNH HỘI TRƯỜNG', `Hoàn tác cấu hình hội trường (${add.length} ghế xếp lại, ${release.length} ghế giải phóng)`, eventId, 'event_hall', eventId),
      inverse: inverse('venue.restoreEventHall', undo, 'Hoàn tác cấu hình hội trường'),
    };
  },
};

// ---------- hall catalog (admin) ----------

const templateDraftOf = (t: HallTemplate): HallTemplateDraft => ({ name: t.name, location: t.location, description: t.description, zones: [...t.zones] });

const createHallTemplate: Spec<'venue.createHallTemplate'> = {
  kind: 'mutation',
  input: asSchema(z.object({ id: hallTemplateIdSchema, draft: hallTemplateDraftSchema })),
  authorize: hallsAdmin,
  async run(ctx, { id, draft }) {
    const row = await ctx.db.table(hallTemplatesTable).insert({ id, legacyId: null, ...draft, zones: [...draft.zones] });
    return {
      value: row,
      audit: audit('QUẢN TRỊ HỘI TRƯỜNG', `Thêm hội trường mẫu: "${row.name}"`, null, 'hall_template', id),
      inverse: inverse('venue.deleteHallTemplate', { id, version: row.version }, `Thêm hội trường mẫu "${row.name}"`),
    };
  },
};

/** Events keep the zones they copied: editing a template never changes an event's seating (m4b §1.3). */
const updateHallTemplate: Spec<'venue.updateHallTemplate'> = {
  kind: 'mutation',
  input: asSchema(z.object({ id: hallTemplateIdSchema, version: versionSchema, draft: hallTemplateDraftSchema })),
  authorize: hallsAdmin,
  async run(ctx, { id, version, draft }) {
    const before = await ctx.db.table(hallTemplatesTable).get(id);
    if (!before) throw new CommandError('not_found', 'Không tìm thấy hội trường mẫu này.');
    const row = await ctx.db.table(hallTemplatesTable).update(id, { ...draft, zones: [...draft.zones] }, { expectedVersion: version });
    return {
      value: row,
      audit: audit('QUẢN TRỊ HỘI TRƯỜNG', `Cập nhật hội trường mẫu: "${row.name}"`, null, 'hall_template', id),
      inverse: inverse('venue.updateHallTemplate', { id, version: row.version, draft: templateDraftOf(before) }, `Sửa hội trường mẫu "${row.name}"`),
    };
  },
};

/** Events that copied the template keep their zones; their link to it is cleared, as the FK's ON DELETE SET NULL does (m4b BUG-12). */
const deleteHallTemplate: Spec<'venue.deleteHallTemplate'> = {
  kind: 'mutation',
  input: asSchema(z.object({ id: hallTemplateIdSchema, version: versionSchema })),
  authorize: hallsAdmin,
  async run(ctx, { id, version }) {
    const all = await ctx.db.table(hallTemplatesTable).list();
    const row = all.find((t) => t.id === id);
    if (!row) throw new CommandError('not_found', 'Không tìm thấy hội trường mẫu này.');
    if (all.length <= 1) throw new CommandError('invalid', 'Hệ thống cần duy trì ít nhất 1 hội trường mẫu.');
    const users = await ctx.db.table(eventHallsTable).list({ templateId: id });
    await ctx.db.table(hallTemplatesTable).remove(id, { expectedVersion: version });
    for (const h of users) await ctx.db.table(eventHallsTable).update(h.id, { templateId: null }, { overwrite: 'idempotent-set' });
    return {
      value: null,
      audit: audit('QUẢN TRỊ HỘI TRƯỜNG', `Xóa hội trường mẫu: "${row.name}"${users.length > 0 ? ` (${users.length} sự kiện giữ nguyên sơ đồ đã sao chép)` : ''}`, null, 'hall_template', id),
      inverse: inverse('venue.createHallTemplate', { id, draft: templateDraftOf(row) }, `Xóa hội trường mẫu "${row.name}"`),
    };
  },
};

/** Puts the three issued halls back to their issued content by id and keeps every custom template (m4b BUG-37). */
const restoreDefaultHallTemplates: Spec<'venue.restoreDefaultHallTemplates'> = {
  kind: 'mutation',
  input: asSchema(z.object({}).strict()),
  authorize: hallsAdmin,
  async run(ctx) {
    const table = ctx.db.table(hallTemplatesTable);
    const out: HallTemplate[] = [];
    for (const d of DEFAULT_HALL_TEMPLATES) {
      const id = defaultHallId(d.legacyId);
      const fields = { name: d.name, location: d.location, description: d.description, zones: [...d.zones] };
      out.push((await table.get(id)) ? await table.update(id, fields, { overwrite: 'idempotent-set' }) : await table.insert({ id, legacyId: d.legacyId, ...fields }));
    }
    return { value: out, audit: audit('QUẢN TRỊ HỘI TRƯỜNG', `Khôi phục ${out.length} hội trường mẫu ban hành (giữ các mẫu tự tạo)`, null, 'hall_template', out.map((t) => t.id).join(',')) };
  },
};

// ---------- booths and duty shifts ----------

async function boothOf(ctx: CommandContext, eventId: EventId, id: BoothId): Promise<BoothRow> {
  const row = await ctx.db.table(boothsTable).get(id);
  if (!row || row.eventId !== eventId) throw new CommandError('not_found', 'Không tìm thấy gian hàng này.');
  return row;
}

/** One code per event (m4b BUG-22), checked before the unique key would refuse it with a generic message. */
async function assertFreeCode(ctx: CommandContext, eventId: EventId, code: string, self: BoothId) {
  const clash = (await ctx.db.table(boothsTable).list({ eventId, code })).find((b) => b.id !== self);
  if (clash) throw new CommandError('invalid', `Mã gian ${code} đã có trong sự kiện này.`, { 'draft.code': `Mã gian ${code} đã có trong sự kiện này` });
}

const boothDraftOf = (b: Booth): BoothDraft => ({
  code: b.code, size: b.size, company: b.company, products: b.products, subsidyPercent: b.subsidyPercent, status: b.status, contact: b.contact, staff: b.staff,
});

const createBooth: Spec<'venue.createBooth'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, id: boothIdSchema, draft: boothDraftSchema })),
  authorize: boothsWrite,
  async run(ctx, { eventId, id, draft }) {
    await assertFreeCode(ctx, eventId, draft.code, id);
    const row = await ctx.db.table(boothsTable).insert({ id, eventId, ...draft });
    return {
      value: row,
      audit: audit('CẬP NHẬT GIAN HÀNG', `Thêm gian hàng ${row.code}${row.company ? `: ${row.company}` : ''}`, eventId, 'booth', id),
      inverse: inverse('venue.deleteBooth', { eventId, id, version: row.version }, `Thêm gian hàng ${row.code}`),
    };
  },
};

const updateBooth: Spec<'venue.updateBooth'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, id: boothIdSchema, version: versionSchema, draft: boothDraftSchema })),
  authorize: boothsWrite,
  async run(ctx, { eventId, id, version, draft }) {
    const before = await boothOf(ctx, eventId, id);
    await assertFreeCode(ctx, eventId, draft.code, id);
    const row = await ctx.db.table(boothsTable).update(id, draft, { expectedVersion: version });
    return {
      value: row,
      audit: audit('CẬP NHẬT GIAN HÀNG', `Cập nhật gian hàng ${row.code}${row.company ? `: ${row.company}` : ''}`, eventId, 'booth', id),
      inverse: inverse('venue.updateBooth', { eventId, id, version: row.version, draft: boothDraftOf(before) }, `Sửa gian hàng ${row.code}`),
    };
  },
};

const deleteBooth: Spec<'venue.deleteBooth'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, id: boothIdSchema, version: versionSchema })),
  authorize: boothsWrite,
  async run(ctx, { eventId, id, version }) {
    const before = await boothOf(ctx, eventId, id);
    await ctx.db.table(boothsTable).remove(id, { expectedVersion: version });
    return {
      value: null,
      audit: audit('XÓA GIAN HÀNG', `Xóa gian hàng ${before.code}${before.company ? `: ${before.company}` : ''}`, eventId, 'booth', id),
      inverse: inverse('venue.createBooth', { eventId, id, draft: boothDraftOf(before) }, `Xóa gian hàng ${before.code}`),
    };
  },
};

async function shiftOf(ctx: CommandContext, eventId: EventId, id: BoothShiftId): Promise<BoothShift> {
  const row = await ctx.db.table(boothShiftsTable).get(id);
  if (!row || row.eventId !== eventId) throw new CommandError('not_found', 'Không tìm thấy ca trực này.');
  return row;
}
const shiftDraftOf = (s: BoothShift): ShiftDraft => ({ shiftDate: s.shiftDate, shiftLabel: s.shiftLabel, officerName: s.officerName, department: s.department, phone: s.phone, zone: s.zone });
const shiftText = (s: Pick<BoothShift, 'officerName' | 'shiftDate' | 'shiftLabel'>) => `${s.officerName}, ${s.shiftLabel} ngày ${s.shiftDate.split('-').reverse().join('/')}`;

const createShift: Spec<'venue.createShift'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, id: boothShiftIdSchema, draft: shiftDraftSchema })),
  authorize: boothsWrite,
  async run(ctx, { eventId, id, draft }) {
    const row = await ctx.db.table(boothShiftsTable).insert({ id, eventId, officerUserId: null, ...draft });
    return {
      value: row,
      audit: audit('PHÂN CÔNG CA TRỰC', `Thêm ca trực: ${shiftText(row)}`, eventId, 'booth_shift', id),
      inverse: inverse('venue.deleteShift', { eventId, id, version: row.version }, `Thêm ca trực ${row.officerName}`),
    };
  },
};

const updateShift: Spec<'venue.updateShift'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, id: boothShiftIdSchema, version: versionSchema, draft: shiftDraftSchema })),
  authorize: boothsWrite,
  async run(ctx, { eventId, id, version, draft }) {
    const before = await shiftOf(ctx, eventId, id);
    const row = await ctx.db.table(boothShiftsTable).update(id, draft, { expectedVersion: version });
    return {
      value: row,
      audit: audit('PHÂN CÔNG CA TRỰC', `Cập nhật ca trực: ${shiftText(row)}`, eventId, 'booth_shift', id),
      inverse: inverse('venue.updateShift', { eventId, id, version: row.version, draft: shiftDraftOf(before) }, `Sửa ca trực ${row.officerName}`),
    };
  },
};

const deleteShift: Spec<'venue.deleteShift'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, id: boothShiftIdSchema, version: versionSchema })),
  authorize: boothsWrite,
  async run(ctx, { eventId, id, version }) {
    const before = await shiftOf(ctx, eventId, id);
    await ctx.db.table(boothShiftsTable).remove(id, { expectedVersion: version });
    return {
      value: null,
      audit: audit('PHÂN CÔNG CA TRỰC', `Xóa ca trực: ${shiftText(before)}`, eventId, 'booth_shift', id),
      inverse: inverse('venue.createShift', { eventId, id, draft: shiftDraftOf(before) }, `Xóa ca trực ${before.officerName}`),
    };
  },
};

export const commands = defineCommands('venue', {
  assignSeat, releaseGuestSeat, applySeats, autoAssign, clearSeats, releaseOrphans,
  setEventHall, updateEventZones, restoreEventHall,
  createHallTemplate, updateHallTemplate, deleteHallTemplate, restoreDefaultHallTemplates,
  createBooth, updateBooth, deleteBooth, createShift, updateShift, deleteShift,
});
