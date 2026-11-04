// Every write of the guests feature. Each mutation is audited (m4a B27) and,
// where a person can take it back, returns the inverse command its undo runs.

import { z } from 'zod';
import type { EventId, GuestId, SeatCode, Version } from '@/core/brand';
import { CommandError, type AuditEntry, type CommandContext, type CommandsOf, type CommandSpec, type Inverse, type InputOf, type Sig } from '@/core/commands';
import { DbError, type DraftOf, type Schema } from '@/core/db';
import { RSVP, SEND_METHOD } from '@/core/vocab';
import type { Guest, GuestDraft } from '../contract';
import { guestIdentityKey, rsvpTransition } from '../domain/roster';
import {
  MAX_BATCH, RSVP_SOURCE_VALUES, RSVP_VALUES, SEND_METHOD_VALUES, eventIdSchema, guestDraftSchema, guestIdSchema, guestPatchSchema,
  draftOf, guestSnapshotSchema, instantSchema, seatCodeSchema, versionSchema, type GuestSnapshot,
} from '../domain/schemas';
import { readRosterEntry, toGuest } from './reads';
import { guestsTable, seatsTable, type GuestRow } from './tables';

declare module '@/core/commands' {
  interface CommandMap {
    /** The undo of guests.delete: the same id and printed check-in code, and the seat asked back from venue. */
    'guests.restore': Sig<{ eventId: EventId; guest: GuestSnapshot }, Guest>;
    /** The undo of a decline that freed a seat: the RSVP patch, and the seat venue is asked to give back (read by the server, not typed by a person). */
    'guests.undoRsvp': Sig<{ eventId: EventId; id: GuestId; version: Version; patch: Partial<GuestDraft>; seatCode: SeatCode | null }, Guest>;
  }
}

const inverse = <K extends Inverse['command']>(command: K, input: InputOf<K>, label: string) => ({ command, input, label }) as Inverse;

const audit = (action: string, summary: string, eventId: EventId, entityId: string): AuditEntry => ({ action, summary, eventId, entity: 'guest', entityId });

const asSchema = <T>(s: z.ZodType): Schema<T> => s as unknown as Schema<T>;

const writeOnEvent = { perm: 'guests.write', event: (i: { eventId: EventId }) => i.eventId } as const;

const who = (g: Pick<Guest, 'name' | 'organization'>) => (g.organization ? `"${g.name}" (${g.organization})` : `"${g.name}"`);

/** The guest, only if it belongs to the event the permission was checked on. */
async function guestOf(ctx: CommandContext, eventId: EventId, id: GuestId): Promise<GuestRow> {
  const guest = await ctx.db.table(guestsTable).get(id);
  if (!guest || guest.eventId !== eventId) throw new DbError('not_found');
  return guest;
}

const seatOf = async (ctx: CommandContext, eventId: EventId, guestId: GuestId): Promise<SeatCode | null> =>
  (await ctx.db.table(seatsTable).list({ eventId, guestId }))[0]?.seatCode ?? null;

/**
 * A declined guest gives the seat back; venue owns the seat, so venue is asked (m4a B18, B57). Always after the guest
 * row is saved, so a stale version fails before any seat is freed. When venue refuses, the error carries the saved
 * change's audit entry, which the pipeline writes under the command's own permission: the decline stays applied and
 * the seat is flagged for a person to release.
 */
async function releaseSeat(ctx: CommandContext, eventId: EventId, guestId: GuestId, seat: SeatCode, saved: AuditEntry): Promise<void> {
  try {
    await ctx.call('venue.releaseGuestSeat', { eventId, guestId });
  } catch {
    throw new CommandError('conflict', `Đã ghi nhận báo vắng nhưng chưa giải phóng được ghế ${seat}. Vui lòng giải phóng ghế này thủ công ở sơ đồ chỗ ngồi.`, undefined, {
      ...saved,
      summary: `${saved.summary}; chưa giải phóng được ghế ${seat}, cần giải phóng thủ công`,
    });
  }
}

/** Asks venue for the seat a decline freed; the RSVP is already undone either way, and the note says what became of the seat. */
async function reseat(ctx: CommandContext, eventId: EventId, guestId: GuestId, seat: SeatCode): Promise<string> {
  try {
    await ctx.call('venue.assignSeat', { eventId, guestId, seatCode: seat });
    return `, xếp lại ghế ${seat}`;
  } catch {
    const taken = (await ctx.db.table(seatsTable).list({ eventId, seatCode: seat })).some((s) => s.guestId !== guestId);
    return `, không xếp lại được ghế ${seat} (${taken ? 'ghế không còn trống' : 'venue không xếp được ghế'})`;
  }
}

/** What undoes an RSVP change: a plain update, or, when the change freed a seat, the command that also asks for it back. */
const rsvpInverse = (eventId: EventId, after: GuestRow, patch: Partial<GuestDraft>, seatCode: SeatCode | null, label: string) =>
  seatCode
    ? inverse('guests.undoRsvp', { eventId, id: after.id, version: after.version, patch, seatCode }, label)
    : inverse('guests.update', { eventId, id: after.id, version: after.version, patch }, label);

const sameFields = (row: GuestRow, draft: Partial<GuestDraft>) => (Object.keys(draft) as (keyof GuestDraft)[]).every((k) => row[k] === draft[k]);

/**
 * Insert with a client id. A retry of the same create (live's walk-in after a partial failure) converges on the row it
 * made; the same id with another payload is a conflict.
 */
async function insertGuest(ctx: CommandContext, row: DraftOf<GuestRow>): Promise<{ row: GuestRow; created: boolean }> {
  try {
    return { row: await ctx.db.table(guestsTable).insert(row), created: true };
  } catch (e) {
    if (!(e instanceof DbError) || e.kind !== 'conflict') throw e;
    const existing = await ctx.db.table(guestsTable).get(row.id as GuestId);
    if (existing && existing.eventId === row.eventId && sameFields(existing, row)) return { row: existing, created: false };
    throw e;
  }
}

/** The DB generates checkin_code (contract); a draft row leaves it out. */
const newRow = (eventId: EventId, id: GuestId, draft: GuestDraft, rsvpAt: GuestRow['rsvpAt']) =>
  ({ ...draft, id, eventId, legacyId: null, rsvpAt }) as Omit<DraftOf<GuestRow>, 'checkinCode'> as DraftOf<GuestRow>;

type Spec<I, O> = CommandSpec<I, O>;

const create: Spec<InputOf<'guests.create'>, Guest> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, id: guestIdSchema, draft: guestDraftSchema })),
  authorize: writeOnEvent,
  async run(ctx, { eventId, id, draft }) {
    const { row } = await insertGuest(ctx, newRow(eventId, id, draft, draft.rsvpStatus === 'pending' ? null : ctx.now));
    return {
      value: toGuest(row),
      audit: audit('THÊM KHÁCH MỜI', `Thêm khách mời: ${who(row)}`, eventId, id),
      inverse: inverse('guests.delete', { eventId, id, version: row.version }, `Thêm khách mời "${row.name}"`),
    };
  },
};

/**
 * Saves a patch through the one RSVP transition (m4a B18). The guest row goes first, against the version; the seat a
 * decline frees is read here from the database, so the inverse can ask for it back.
 */
async function savePatch(ctx: CommandContext, eventId: EventId, id: GuestId, version: Version, patch: Partial<GuestDraft>) {
  const before = await guestOf(ctx, eventId, id);
  const t = rsvpTransition(before, patch);
  const next: Partial<GuestDraft> = t.statusChanged ? { ...t.patch, rsvpSource: t.patch.rsvpSource ?? 'manual' } : t.patch;
  const seat = t.statusChanged && t.releasesSeat ? await seatOf(ctx, eventId, id) : null;
  const after = await ctx.db.table(guestsTable).update(id, t.statusChanged ? { ...next, rsvpAt: ctx.now } : next, { expectedVersion: version });
  const old = Object.fromEntries(Object.keys(next).map((k) => [k, before[k as keyof GuestDraft]])) as Partial<GuestDraft>;
  const onlyRsvp = Object.keys(patch).every((k) => k === 'rsvpStatus' || k === 'substituteName' || k === 'rsvpSource');
  return { before, after, old, seat, onlyRsvp, statusChanged: t.statusChanged };
}

const update: Spec<InputOf<'guests.update'>, Guest> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, id: guestIdSchema, version: versionSchema, patch: guestPatchSchema })),
  authorize: writeOnEvent,
  async run(ctx, { eventId, id, version, patch }) {
    const { before, after, old, seat, onlyRsvp, statusChanged } = await savePatch(ctx, eventId, id, version, patch);
    const entry = onlyRsvp && statusChanged
      ? audit('CẬP NHẬT RSVP', `Cập nhật RSVP: ${who(after)}: ${RSVP[before.rsvpStatus].label} → ${RSVP[after.rsvpStatus].label}`, eventId, id)
      : audit('CẬP NHẬT KHÁCH MỜI', `Cập nhật hồ sơ đại biểu: ${who(after)}`, eventId, id);
    if (seat) await releaseSeat(ctx, eventId, id, seat, entry);
    return { value: toGuest(after), audit: entry, inverse: rsvpInverse(eventId, after, old, seat, onlyRsvp ? `RSVP của "${after.name}"` : `Sửa khách mời "${after.name}"`) };
  },
};

const undoRsvp: Spec<InputOf<'guests.undoRsvp'>, Guest> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, id: guestIdSchema, version: versionSchema, patch: guestPatchSchema, seatCode: seatCodeSchema.nullable() })),
  authorize: writeOnEvent,
  async run(ctx, { eventId, id, version, patch, seatCode }) {
    const { before, after, old, seat } = await savePatch(ctx, eventId, id, version, patch);
    const note = seatCode && after.rsvpStatus !== 'declined' ? await reseat(ctx, eventId, id, seatCode) : '';
    const entry = audit('HOÀN TÁC RSVP', `Hoàn tác RSVP: ${who(after)}: ${RSVP[before.rsvpStatus].label} → ${RSVP[after.rsvpStatus].label}${note}`, eventId, id);
    if (seat) await releaseSeat(ctx, eventId, id, seat, entry);
    return { value: toGuest(after), audit: entry, inverse: rsvpInverse(eventId, after, old, seat, `RSVP của "${after.name}"`) };
  },
};

const remove: Spec<InputOf<'guests.delete'>, null> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, id: guestIdSchema, version: versionSchema })),
  authorize: writeOnEvent,
  async run(ctx, { eventId, id, version }) {
    const row = await guestOf(ctx, eventId, id);
    const entry = await readRosterEntry(ctx, eventId, id);
    // Postgres cascades the seat and the check-in with the guest (FKs in 0002).
    await ctx.db.table(guestsTable).remove(id, { expectedVersion: version });
    const snapshot: GuestSnapshot = { id, draft: draftOf(row), checkinCode: row.checkinCode, rsvpAt: row.rsvpAt, seatCode: entry?.seatCode ?? null };
    return {
      value: null,
      audit: audit('XÓA KHÁCH MỜI', `Xóa khách mời: ${who(row)}${entry?.seatCode ? `, giải phóng ghế ${entry.seatCode}` : ''}`, eventId, id),
      inverse: inverse('guests.restore', { eventId, guest: snapshot }, `Xóa khách mời "${row.name}"`),
    };
  },
};

const restore: Spec<InputOf<'guests.restore'>, Guest> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, guest: guestSnapshotSchema })),
  authorize: writeOnEvent,
  async run(ctx, { eventId, guest }) {
    const { row } = await insertGuest(ctx, { ...newRow(eventId, guest.id, guest.draft, guest.rsvpAt), checkinCode: guest.checkinCode });
    let seatNote = '';
    if (guest.seatCode) {
      try {
        await ctx.call('venue.assignSeat', { eventId, guestId: guest.id, seatCode: guest.seatCode });
        seatNote = `, xếp lại ghế ${guest.seatCode}`;
      } catch {
        // The seat may have gone to someone else since the delete: the guest comes back unseated, and the audit says so.
        seatNote = `, không xếp lại được ghế ${guest.seatCode}`;
      }
    }
    return {
      value: toGuest(row),
      audit: audit('KHÔI PHỤC KHÁCH MỜI', `Khôi phục khách mời: ${who(row)}${seatNote}`, eventId, guest.id),
      inverse: inverse('guests.delete', { eventId, id: guest.id, version: row.version }, `Khôi phục khách mời "${row.name}"`),
    };
  },
};

const applyRsvp: Spec<InputOf<'guests.applyRsvp'>, { applied: boolean }> = {
  kind: 'mutation',
  input: asSchema(
    z.object({
      eventId: eventIdSchema,
      id: guestIdSchema,
      status: z.enum(RSVP_VALUES),
      source: z.enum(RSVP_SOURCE_VALUES),
      respondedAt: instantSchema,
      substituteName: z.string().trim().max(300).optional(),
      hasBanquet: z.boolean().optional(),
    }),
  ),
  authorize: writeOnEvent,
  async run(ctx, { eventId, id, status, source, respondedAt, substituteName, hasBanquet }) {
    const before = await guestOf(ctx, eventId, id);
    // Latest wins: a response older than the last change, by staff or by an earlier response, is ignored; so is one made
    // at the very moment of the last change (m4a B15, Q5).
    if (before.rsvpAt && Date.parse(respondedAt) <= Date.parse(before.rsvpAt)) {
      return { value: { applied: false }, audit: audit('BỎ QUA PHẢN HỒI RSVP', `Bỏ qua phản hồi cũ hơn thay đổi gần nhất: ${who(before)}`, eventId, id) };
    }
    // A named substitute means someone else attends (m4a B17, Q12).
    const final = status === 'confirmed' && substituteName ? 'substituted' : status;
    const t = rsvpTransition(before, { rsvpStatus: final, rsvpSource: source, ...(substituteName ? { substituteName } : {}), ...(hasBanquet === undefined ? {} : { hasBanquet }) });
    if (t.needsSubstitute) {
      throw new CommandError('invalid', 'Cần nhập tên người đi thay khi chọn "Cử người đi thay".', { substituteName: 'Nhập tên người đi thay.' });
    }
    const seat = t.releasesSeat ? await seatOf(ctx, eventId, id) : null;
    const after = await ctx.db.table(guestsTable).update(id, { ...t.patch, rsvpAt: respondedAt }, { expectedVersion: before.version });
    const old = { rsvpStatus: before.rsvpStatus, substituteName: before.substituteName, hasBanquet: before.hasBanquet, rsvpSource: before.rsvpSource };
    const entry = audit('CẬP NHẬT RSVP', `Cập nhật RSVP từ phản hồi: ${who(after)}: ${RSVP[before.rsvpStatus].label} → ${RSVP[final].label}`, eventId, id);
    if (seat) await releaseSeat(ctx, eventId, id, seat, entry);
    return { value: { applied: true }, audit: entry, inverse: rsvpInverse(eventId, after, old, seat, `RSVP của "${after.name}"`) };
  },
};

/** Fields an import may fill when the event's guest has them empty; nothing is ever overwritten (m4a B41). */
const BLANK_FILLABLE = ['title', 'phone', 'email', 'notes', 'masterContactId'] as const;

const upsertMany: Spec<InputOf<'guests.upsertMany'>, { added: number; updated: number; skipped: number }> = {
  kind: 'mutation',
  input: asSchema(
    z.object({
      eventId: eventIdSchema,
      items: z.array(z.object({ id: guestIdSchema, draft: guestDraftSchema })).min(1).max(MAX_BATCH),
      onExisting: z.enum(['skip', 'fill_blanks']),
    }),
  ),
  authorize: writeOnEvent,
  async run(ctx, { eventId, items, onExisting }) {
    // Every identity key is folded once; the lookups below are map hits, so an import is linear in guests plus items.
    const byKey = new Map<string, GuestRow>();
    const byContact = new Map<string, GuestRow>();
    for (const g of await ctx.db.table(guestsTable).list({ eventId })) {
      const key = guestIdentityKey(g);
      if (!byKey.has(key)) byKey.set(key, g);
      if (g.masterContactId && !byContact.has(g.masterContactId)) byContact.set(g.masterContactId, g);
    }
    const seen = new Set<string>();
    const fresh: DraftOf<GuestRow>[] = [];
    let [updated, skipped] = [0, 0];
    for (const { id, draft } of items) {
      const key = guestIdentityKey(draft);
      const link = draft.masterContactId ? `contact:${draft.masterContactId}` : null;
      // A second item for a guest this import already added or filled changes nothing; the first one won.
      if (seen.has(key) || (link && seen.has(link))) {
        skipped += 1;
        continue;
      }
      seen.add(key);
      if (link) seen.add(link);
      // The guest copied from the same contact is that person, even after the contact gained an email (m4c B27).
      const match = (draft.masterContactId && byContact.get(draft.masterContactId)) || byKey.get(key);
      if (!match) {
        fresh.push(newRow(eventId, id, draft, draft.rsvpStatus === 'pending' ? null : ctx.now));
        continue;
      }
      const fill = onExisting === 'fill_blanks' ? Object.fromEntries(BLANK_FILLABLE.filter((k) => !match[k] && draft[k]).map((k) => [k, draft[k]])) : {};
      if (Object.keys(fill).length === 0) {
        skipped += 1;
        continue;
      }
      await ctx.db.table(guestsTable).update(match.id, fill, { expectedVersion: match.version });
      updated += 1;
    }
    if (fresh.length > 0) await ctx.db.table(guestsTable).insertMany(fresh);
    return {
      value: { added: fresh.length, updated, skipped },
      audit: audit('NHẬP KHÁCH MỜI', `Nhập khách mời: thêm ${fresh.length}, bổ sung thông tin ${updated}, bỏ qua ${skipped} (trùng)`, eventId, fresh.map((r) => r.id).join(',')),
    };
  },
};

const markInvited: Spec<InputOf<'guests.markInvited'>, null> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, ids: z.array(guestIdSchema).min(1).max(MAX_BATCH), method: z.enum(SEND_METHOD_VALUES) })),
  authorize: writeOnEvent,
  async run(ctx, { eventId, ids, method }) {
    const rows = await ctx.db.table(guestsTable).list({ eventId, id: [...ids] });
    let changed = 0;
    for (const g of rows) {
      // A sent invitation never moves a guest back from 'Đã nhận được thư'.
      const inviteStatus = g.inviteStatus === 'pending' ? 'sent' : g.inviteStatus;
      if (inviteStatus === g.inviteStatus && g.sendMethod === method) continue;
      await ctx.db.table(guestsTable).update(g.id, { inviteStatus, sendMethod: method }, { overwrite: 'idempotent-set' });
      changed += 1;
    }
    return {
      value: null,
      audit: audit('PHÁT HÀNH GIẤY MỜI', `Đánh dấu đã phát hành giấy mời (${SEND_METHOD[method].label}): ${changed}/${rows.length} khách mời`, eventId, rows.map((g) => g.id).join(',')),
    };
  },
};

export const commands: CommandsOf<'guests'> = { create, update, undoRsvp, delete: remove, restore, applyRsvp, upsertMany, markInvited };
