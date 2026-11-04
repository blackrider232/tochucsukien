// Check-in, its undo and the welcome pack. A check-in is a set, never a toggle
// (m5 BUG-08): checking in a checked-in guest keeps the first time and says
// so. Two desks racing on one guest both succeed; the later one is told the
// earlier time (BUG-05). Nothing here writes the guest row.

import { z } from 'zod';
import { newId, type EventId, type GuestId } from '@/core/brand';
import { legacyScanKey, parseScannedCode } from '@/core/checkin-code';
import { CommandError, type CommandContext } from '@/core/commands';
import { addHours } from '@/core/dates';
import { DbError } from '@/core/db';
import { deterministicIds } from '@/core/legacy';
import type { RosterEntry } from '@/features/guests';
import { readLegacyGuestIds, readRoster } from '@/features/guests/server';
import { readEvent } from '@/features/progress/server';
import { matchScan, type ScanOutcome } from '../contract';
import { formatAt } from '../domain/desk';
import { deskSchema, eventIdSchema, guestIdSchema, instantSchema, undoTokenIdSchema, type UndoTokenId } from '../domain/schemas';
import { asSchema, audit, checkinWrite, declinedMessage, guestOf, inverse, readLive, who, type Spec } from './command-kit';
import { toCheckIn } from './reads';
import { checkinsTable, undoTokensTable, type CheckinRow } from './tables';

const currentCheckin = async (ctx: CommandContext, eventId: EventId, guestId: GuestId): Promise<CheckinRow | null> =>
  (await ctx.db.table(checkinsTable).list({ eventId, guestId }))[0] ?? null;

const lostRace = (e: unknown) => e instanceof DbError && (e.kind === 'constraint' || e.kind === 'conflict');

/** Sets checkedInAt once. The unique (event, guest) key decides between two desks; the loser reads the winner's time. */
async function recordCheckIn(ctx: CommandContext, eventId: EventId, guest: RosterEntry, desk: string | null): Promise<{ already: boolean; row: CheckinRow }> {
  const existing = await currentCheckin(ctx, eventId, guest.id);
  if (existing?.checkedInAt) return { already: true, row: existing };
  const values = { checkedInAt: ctx.now, checkedInBy: ctx.actor.profile.id, desk };
  const table = ctx.db.table(checkinsTable);
  try {
    // A row without a time is a gift recorded before arrival by the legacy app.
    const row = existing
      ? await table.update(existing.id, values, { expectedVersion: existing.version })
      : await table.insert({ eventId, guestId: guest.id, giftGivenAt: null, ...values });
    return { already: false, row };
  } catch (e) {
    if (!lostRace(e)) throw e;
    const winner = await currentCheckin(ctx, eventId, guest.id);
    if (winner?.checkedInAt) return { already: true, row: winner };
    throw e;
  }
}

const seatText = (g: RosterEntry) => (g.seatCode ? `, ghế ${g.seatCode}` : '');

async function checkInOutcome(ctx: CommandContext, eventId: EventId, guest: RosterEntry, desk: string | null, declined: boolean) {
  const { already, row } = await recordCheckIn(ctx, eventId, guest, desk);
  const value = { already, checkIn: toCheckIn(row) };
  if (already) {
    return { value, audit: audit('QUÉT LẠI CHECK-IN', `${who(guest)} đã check-in lúc ${formatAt(row.checkedInAt!, ctx.now)}; không thay đổi`, eventId, 'checkin', guest.id) };
  }
  return {
    value,
    audit: declined
      ? audit('CHECK-IN ĐẠI BIỂU BÁO VẮNG', `Xác nhận check-in đại biểu đã báo vắng: ${who(guest)}${seatText(guest)}`, eventId, 'checkin', guest.id)
      : audit('CHECK-IN ĐẠI BIỂU', `Check-in: ${who(guest)}${seatText(guest)}`, eventId, 'checkin', guest.id),
    inverse: inverse('live.undoCheckIn', { eventId, guestId: guest.id, checkedInAt: row.checkedInAt! }, `Check-in ${guest.name}`),
  };
}

const checkInInput = asSchema<{ eventId: EventId; guestId: GuestId; desk: string | null }>(z.object({ eventId: eventIdSchema, guestId: guestIdSchema, desk: deskSchema }));

export const checkIn: Spec<'live.checkIn'> = {
  kind: 'mutation',
  input: checkInInput,
  authorize: checkinWrite,
  async run(ctx, { eventId, guestId, desk }) {
    const guest = await guestOf(ctx, eventId, guestId);
    if (guest.rsvpStatus === 'declined' && !guest.checkedInAt) throw new CommandError('conflict', declinedMessage(guest));
    return checkInOutcome(ctx, eventId, guest, desk, false);
  },
};

/** The "Vẫn check-in" of decision 7: the person confirmed, and the audit says that it was a declined guest. */
export const checkInDeclined: Spec<'live.checkInDeclined'> = {
  kind: 'mutation',
  input: checkInInput,
  authorize: checkinWrite,
  async run(ctx, { eventId, guestId, desk }) {
    const guest = await guestOf(ctx, eventId, guestId);
    return checkInOutcome(ctx, eventId, guest, desk, guest.rsvpStatus === 'declined');
  },
};

/** How long the undo of a removed check-in stays possible. */
export const UNDO_MINUTES = 15;

const ALREADY_CANCELLED = 'Đã có người hủy check-in này. Đang tải lại…';

/**
 * Removes a check-in and keeps a copy of it as a one-time undo token, so the undo restores what the server saw and the
 * inverse carries only the token id. A newer removal of the same guest replaces an older token, but never the token of
 * this very check-in: that one belongs to the desk that cancelled it first, and this desk is told so. The unique
 * (event, guest) key of the token table decides between two desks cancelling at once.
 */
async function removeCheckin(ctx: CommandContext, row: CheckinRow, guest: RosterEntry): Promise<{ eventId: EventId; guestId: GuestId; tokenId: UndoTokenId }> {
  const tokens = ctx.db.table(undoTokensTable);
  const cancelled = () => new CommandError('conflict', ALREADY_CANCELLED);
  for (const old of await tokens.list({ eventId: row.eventId, guestId: row.guestId })) {
    if (old.checkedInAt === row.checkedInAt && !old.consumedAt) throw cancelled();
    await tokens.remove(old.id).catch((e) => {
      if (!(e instanceof DbError && e.kind === 'not_found')) throw e;
    });
  }
  let token;
  try {
    token = await tokens.insert({
      id: newId<'CheckinUndoToken'>(),
      eventId: row.eventId,
      guestId: row.guestId,
      checkedInAt: row.checkedInAt!,
      checkedInBy: row.checkedInBy,
      desk: row.desk,
      giftGivenAt: row.giftGivenAt,
      declinedConfirmed: guest.rsvpStatus === 'declined',
      expiresAt: addHours(ctx.now, UNDO_MINUTES / 60),
      consumedAt: null,
      consumedBy: null,
    });
  } catch (e) {
    // The database refuses a token for a check-in that is gone (42501, which reads as forbidden): the other desk won.
    if (lostRace(e) || (e instanceof DbError && e.kind === 'forbidden' && !(await currentCheckin(ctx, row.eventId, row.guestId))?.checkedInAt)) throw cancelled();
    throw e;
  }
  try {
    await ctx.db.table(checkinsTable).remove(row.id, { expectedVersion: row.version });
  } catch (e) {
    await tokens.remove(token.id).catch(() => undefined);
    throw e;
  }
  return { eventId: row.eventId, guestId: row.guestId, tokenId: token.id };
}

const giftText = (row: Pick<CheckinRow, 'giftGivenAt'>) => (row.giftGivenAt ? ', bỏ cả ghi nhận phát quà' : '');

/** "Hủy check-in" from the desk table, after a confirm (BUG-09). Clears the check-in and its welcome pack (BUG-30). */
export const cancelCheckIn: Spec<'live.cancelCheckIn'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, guestId: guestIdSchema })),
  authorize: checkinWrite,
  async run(ctx, { eventId, guestId }) {
    const guest = await guestOf(ctx, eventId, guestId);
    const row = await currentCheckin(ctx, eventId, guestId);
    if (!row?.checkedInAt) return { value: null, audit: audit('HỦY CHECK-IN', `${who(guest)} chưa check-in; không có gì để hủy`, eventId, 'checkin', guestId) };
    const token = await removeCheckin(ctx, row, guest);
    return {
      value: null,
      audit: audit('HỦY CHECK-IN', `Hủy check-in lúc ${formatAt(row.checkedInAt, ctx.now)}: ${who(guest)}${giftText(row)}`, eventId, 'checkin', guestId),
      inverse: inverse('live.restoreCheckIn', token, `Hủy check-in ${guest.name}`),
    };
  },
};

/** The undo of one check-in: only while that check-in is still the guest's, never a later one another desk made. */
export const undoCheckIn: Spec<'live.undoCheckIn'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, guestId: guestIdSchema, checkedInAt: instantSchema })),
  authorize: checkinWrite,
  async run(ctx, { eventId, guestId, checkedInAt }) {
    const guest = await guestOf(ctx, eventId, guestId);
    const row = await currentCheckin(ctx, eventId, guestId);
    if (row?.checkedInAt !== checkedInAt) {
      throw new CommandError('conflict', `Check-in của ${guest.name} đã thay đổi sau đó (đã hủy hoặc check-in lại), nên không hoàn tác được. Đang tải lại…`);
    }
    const token = await removeCheckin(ctx, row, guest);
    return {
      value: null,
      audit: audit('HOÀN TÁC CHECK-IN', `Hoàn tác check-in lúc ${formatAt(checkedInAt, ctx.now)}: ${who(guest)}${giftText(row)}`, eventId, 'checkin', guestId),
      inverse: inverse('live.restoreCheckIn', token, `Hoàn tác check-in ${guest.name}`),
    };
  },
};

const NO_UNDO = 'Không còn gì để hoàn tác: thao tác này đã được hoàn tác, hoặc đã có thay đổi khác sau đó. Đang tải lại…';

/**
 * The undo of a removal. The token is the only source of what comes back: time, desk, gift time and the person who
 * checked the guest in. It is used once, within UNDO_MINUTES, for its own guest, and only while the guest has no
 * check-in. A guest who declined after the removal is refused unless the removed check-in was itself a confirmed one.
 */
export const restoreCheckIn: Spec<'live.restoreCheckIn'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, guestId: guestIdSchema, tokenId: undoTokenIdSchema })),
  authorize: checkinWrite,
  async run(ctx, { eventId, guestId, tokenId }) {
    const guest = await guestOf(ctx, eventId, guestId);
    const tokens = ctx.db.table(undoTokensTable);
    const token = await tokens.get(tokenId);
    if (!token || token.eventId !== eventId || token.guestId !== guestId || token.consumedAt) throw new CommandError('conflict', NO_UNDO);
    if (Date.parse(token.expiresAt) <= Date.parse(ctx.now)) {
      await tokens.remove(token.id, { expectedVersion: token.version }).catch(() => undefined);
      throw new CommandError('conflict', `Đã quá ${UNDO_MINUTES} phút nên không hoàn tác được. Check-in lại cho ${guest.name} nếu đại biểu vẫn có mặt.`);
    }
    const existing = await currentCheckin(ctx, eventId, guestId);
    if (existing?.checkedInAt) throw new CommandError('conflict', `${guest.name} đã được check-in lại lúc ${formatAt(existing.checkedInAt, ctx.now)}; giữ nguyên lần check-in đó.`);
    if (guest.rsvpStatus === 'declined' && !token.declinedConfirmed) throw new CommandError('conflict', declinedMessage(guest));
    try {
      await tokens.update(token.id, { consumedAt: ctx.now, consumedBy: ctx.actor.profile.id }, { expectedVersion: token.version });
    } catch (e) {
      if (lostRace(e)) throw new CommandError('conflict', NO_UNDO);
      throw e;
    }
    const values = { checkedInAt: token.checkedInAt, checkedInBy: token.checkedInBy, desk: token.desk, giftGivenAt: token.giftGivenAt };
    const table = ctx.db.table(checkinsTable);
    let row: CheckinRow;
    try {
      row = existing ? await table.update(existing.id, values, { expectedVersion: existing.version }) : await table.insert({ eventId, guestId, ...values });
    } catch (e) {
      if (lostRace(e)) throw new CommandError('conflict', `${guest.name} vừa được check-in ở bàn khác. Đang tải lại…`);
      throw e;
    }
    await tokens.remove(token.id).catch(() => undefined);
    const gift = row.giftGivenAt ? `, đã phát quà lúc ${formatAt(row.giftGivenAt, ctx.now)}` : '';
    return {
      value: toCheckIn(row),
      audit: audit('KHÔI PHỤC CHECK-IN', `Khôi phục check-in lúc ${formatAt(token.checkedInAt, ctx.now)} (hoàn tác): ${who(guest)}${gift}`, eventId, 'checkin', guestId),
      inverse: inverse('live.undoCheckIn', { eventId, guestId, checkedInAt: token.checkedInAt }, `Khôi phục check-in ${guest.name}`),
    };
  },
};

/** Decision 8: the welcome pack is its own toggle, for a guest who is checked in (BUG-30). */
export const setGift: Spec<'live.setGift'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, guestId: guestIdSchema, given: z.boolean() })),
  authorize: checkinWrite,
  async run(ctx, { eventId, guestId, given }) {
    const guest = await guestOf(ctx, eventId, guestId);
    const row = await currentCheckin(ctx, eventId, guestId);
    const unchanged = (text: string) => ({ value: row ? toCheckIn(row) : null, audit: audit('PHÁT QUÀ', `${who(guest)}: ${text}; không thay đổi`, eventId, 'checkin', guestId) });
    const table = ctx.db.table(checkinsTable);
    if (given) {
      if (!row?.checkedInAt) throw new CommandError('invalid', `${guest.name} chưa check-in. Check-in trước khi phát túi quà & tài liệu.`);
      if (row.giftGivenAt) return unchanged('đã phát túi quà & tài liệu từ trước');
      const after = await table.update(row.id, { giftGivenAt: ctx.now }, { expectedVersion: row.version });
      return {
        value: toCheckIn(after),
        audit: audit('PHÁT QUÀ', `Đã phát túi quà & tài liệu: ${who(guest)}`, eventId, 'checkin', guestId),
        inverse: inverse('live.setGift', { eventId, guestId, given: false }, `Phát quà cho ${guest.name}`),
      };
    }
    if (!row?.giftGivenAt) return unchanged('chưa phát túi quà & tài liệu');
    const after = row.checkedInAt ? await table.update(row.id, { giftGivenAt: null }, { expectedVersion: row.version }) : null;
    if (!after) await table.remove(row.id, { expectedVersion: row.version });
    return {
      value: after ? toCheckIn(after) : null,
      audit: audit('PHÁT QUÀ', `Bỏ ghi nhận phát túi quà & tài liệu: ${who(guest)}`, eventId, 'checkin', guestId),
      ...(after ? { inverse: inverse('live.setGift', { eventId, guestId, given: true }, `Bỏ phát quà cho ${guest.name}`) } : {}),
    };
  },
};

/**
 * Resolves what a scanner, a camera or a person typed (m5 BUG-06, BUG-07) against the roster as it is now, so a guest
 * another desk just checked in reads as 'already'. A legacy badge names its legacy event: the importer gave that event
 * the uuid v5 of that id, so comparing ids needs no legacy_id column.
 */
export const scan: Spec<'live.scan'> = {
  kind: 'query',
  input: asSchema(z.object({ eventId: eventIdSchema, raw: z.string().trim().min(1, 'Nhập hoặc quét mã').max(500) })),
  authorize: readLive,
  async run(ctx, { eventId, raw }) {
    const code = parseScannedCode(raw);
    const otherEvent = async (id: EventId): Promise<ScanOutcome> => ({ kind: 'other_event', eventName: (await readEvent(ctx, id))?.name ?? null });
    if (code.kind === 'canonical' && code.eventId !== eventId) return { value: await otherEvent(code.eventId), audit: null };
    let legacyIds: ReadonlyMap<string, GuestId> = new Map();
    if (code.kind === 'legacy') {
      const legacyEvent = deterministicIds.eventId(code.legacyEventId);
      if (legacyEvent !== eventId) return { value: await otherEvent(legacyEvent), audit: null };
      const byGuest = await readLegacyGuestIds(ctx, eventId);
      legacyIds = new Map([...byGuest].map(([legacyGuestId, id]) => [legacyScanKey(code.legacyEventId, legacyGuestId), id]));
    }
    return { value: matchScan(code, eventId, await readRoster(ctx, eventId), legacyIds), audit: null };
  },
};

