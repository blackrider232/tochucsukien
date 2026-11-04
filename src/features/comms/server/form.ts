// Google Form RSVP (m4c §1.12, §3.8). Config per event, a server-side sync
// that claims each response row before it touches a guest, and the review
// actions for responses no rule could place. Guests change only through
// guests.applyRsvp and guests.upsertMany (ctx.call), and only with a definite
// answer that is newer than the guest's last RSVP change (m4a B15, m4c B21).

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { newId, type EventId, type GuestId, type Instant } from '@/core/brand';
import { CommandError, type CommandContext, type CommandSpec, type InputOf, type OutputOf } from '@/core/commands';
import { DbError, type DraftOf } from '@/core/db';
import { normalizePhone } from '@/core/text';
import { readRoster, type GuestDraft, type RosterEntry } from '@/features/guests/server';
import { canIdentify, detectColumns, hasPhrase, words } from '../domain/columns';
import { CsvError, parseCsv } from '../domain/csv';
import { buildMatchIndex, matchResponse, type MatchIndex } from '../domain/matching';
import { detectDateOrder, parseColumnMap, parseResponseRow } from '../domain/responses';
import type { SyncReport } from '../domain/sync-report';
import { columnMapSchema, eventIdSchema, formConfigSchema, guestIdSchema, responseIdSchema, versionSchema } from '../domain/schemas';
import { asSchema, audit, auditPartial, failureReason, inverse } from './command-kit';
import type { SheetSource } from './sheet-source';
import { formsTable, responsesTable, type FormRow, type ResponseRow } from './tables';

const manage = { perm: 'comms.rsvp.manage', event: (i: { eventId: EventId }) => i.eventId } as const;

export async function formOf(ctx: Pick<CommandContext, 'db'>, eventId: EventId): Promise<FormRow | null> {
  return (await ctx.db.table(formsTable).list({ eventId }))[0] ?? null;
}

export const saveForm: CommandSpec<InputOf<'comms.saveForm'>, FormRow> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, version: versionSchema.nullable(), config: formConfigSchema })),
  authorize: manage,
  async run(ctx, { eventId, version, config }) {
    const before = await formOf(ctx, eventId);
    if ((before === null) !== (version === null) || (before && before.version !== version)) throw new DbError('conflict');
    const fields = { formUrl: config.formUrl, sheetCsvUrl: config.sheetUrl, autoSync: config.autoSync, autoAddNewGuests: config.autoAddNewGuests };
    // A different sheet has different columns: its mapping starts over.
    const sheetChanged = before !== null && before.sheetCsvUrl !== config.sheetUrl;
    const row = before
      ? await ctx.db.table(formsTable).update(before.id, { ...fields, ...(sheetChanged ? { columnMap: null, sheetHeaders: [] } : {}) }, { expectedVersion: before.version })
      : await ctx.db.table(formsTable).insert({ ...fields, eventId, columnMap: null, lastSyncAt: null, lastAttemptAt: null, lastSyncError: null, sheetHeaders: [] });
    const parts = [config.formUrl ? 'link Form' : 'chưa có link Form', config.sheetUrl ? 'Sheet phản hồi' : 'chưa gắn Sheet', `tự đồng bộ ${config.autoSync ? 'bật' : 'tắt'}`, `tự nạp khách mới ${config.autoAddNewGuests ? 'bật' : 'tắt'}`];
    return {
      value: row,
      audit: audit('CẤU HÌNH GOOGLE FORM', `Lưu cấu hình Google Form: ${parts.join(', ')}`, eventId, 'rsvp_form', row.id),
      ...(before
        ? {
            inverse: inverse(
              'comms.saveForm',
              { eventId, version: row.version, config: { formUrl: before.formUrl, sheetUrl: before.sheetCsvUrl, autoSync: before.autoSync, autoAddNewGuests: before.autoAddNewGuests } },
              'Cấu hình Google Form',
            ),
          }
        : {}),
    };
  },
};

export const saveColumnMap: CommandSpec<InputOf<'comms.saveColumnMap'>, FormRow> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, version: versionSchema, columnMap: columnMapSchema.nullable() })),
  authorize: manage,
  async run(ctx, { eventId, version, columnMap }) {
    const before = await formOf(ctx, eventId);
    if (!before) throw new DbError('not_found');
    const row = await ctx.db.table(formsTable).update(before.id, { columnMap }, { expectedVersion: version });
    return {
      value: row,
      audit: audit('CẤU HÌNH GOOGLE FORM', columnMap ? `Ghép cột Google Sheet: ${Object.keys(columnMap).length} cột` : 'Ghép cột Google Sheet: tự nhận diện', eventId, 'rsvp_form', row.id),
      inverse: inverse('comms.saveColumnMap', { eventId, version: row.version, columnMap: parseColumnMap(before.columnMap) }, 'Ghép cột Google Sheet'),
    };
  },
};


interface Tally {
  applied: number;
  stale: number;
  noAnswer: number;
  review: number;
  created: number;
  failed: number;
  failures: string[];
}

const emptyTally = (): Tally => ({ applied: 0, stale: 0, noAnswer: 0, review: 0, created: 0, failed: 0, failures: [] });

const rowHashOf = (rowKey: string) => createHash('sha256').update(rowKey, 'utf8').digest('hex');

/** Whether the guest's RSVP is this response's: given by the Form at exactly its time (a create, or an earlier try). */
async function holdsAnswer(ctx: CommandContext, eventId: EventId, guestId: GuestId, respondedAt: Instant) {
  const guest = (await readRoster(ctx, eventId)).find((g) => g.id === guestId);
  return guest?.rsvpSource === 'google_form' && guest.rsvpAt !== null && Date.parse(guest.rsvpAt) === Date.parse(respondedAt);
}

/** Gives a response to a guest: claim the row against its version first, then ask guests, then record the outcome. */
async function applyToGuest(ctx: CommandContext, row: ResponseRow, guestId: GuestId, match: ResponseRow['match'], respondedAt: Instant, t: Tally): Promise<void> {
  const claimed = await ctx.db.table(responsesTable).update(row.id, { matchedGuestId: guestId, match, candidateGuestIds: [] }, { expectedVersion: row.version });
  // A named substitute is needed for 'substituted' (guests refuses it otherwise): without one the answer is unclear.
  const status = row.rsvp === 'substituted' && !row.substitute ? null : row.rsvp;
  if (status === null || status === 'pending') {
    await ctx.db.table(responsesTable).update(row.id, { applyStatus: 'no_answer' }, { expectedVersion: claimed.version });
    t.noAnswer += 1;
    return;
  }
  try {
    const { applied } = await ctx.call('guests.applyRsvp', {
      eventId: row.eventId,
      id: guestId,
      status,
      source: 'google_form',
      respondedAt,
      ...(row.substitute ? { substituteName: row.substitute } : {}),
      ...(row.hasBanquet === null ? {} : { hasBanquet: row.hasBanquet }),
    });
    const done = applied || (await holdsAnswer(ctx, row.eventId, guestId, respondedAt));
    await ctx.db.table(responsesTable).update(row.id, done ? { applyStatus: 'applied', appliedAt: ctx.now } : { applyStatus: 'stale' }, { expectedVersion: claimed.version });
    if (done) t.applied += 1;
    else t.stale += 1;
  } catch (e) {
    // guests may have saved the RSVP and then failed on the seat; the guest row tells which.
    const saved = await holdsAnswer(ctx, row.eventId, guestId, respondedAt);
    if (saved) await ctx.db.table(responsesTable).update(row.id, { applyStatus: 'applied', appliedAt: ctx.now }, { expectedVersion: claimed.version });
    if (saved) t.applied += 1;
    else t.failed += 1;
    t.failures.push(`${row.name || row.email || 'Phản hồi'}: ${e instanceof Error ? e.message : 'lỗi không xác định'}`);
  }
}

const clip = (s: string, max: number) => s.trim().slice(0, max);

/** A Sở is named "Sở …"; anywhere else "sở"/"số" is too common a word. Folded, so it reads typed-without-diacritics too. */
const isGovernment = (organization: string) => {
  const w = words(organization);
  return w.startsWith(' so ') || ['ubnd', 'uy ban', 'hdnd'].some((p) => hasPhrase(w, p));
};

/**
 * A guest made from a response nobody matched (auto-add on): pending invite, flagged in notes, and no RSVP yet. The
 * answer then goes through guests.applyRsvp at the response's own time, so a later answer of the same person wins.
 */
function draftFromResponse(r: ResponseRow): GuestDraft {
  const digits = normalizePhone(r.phone);
  const phoneOk = r.phone === '' || (/^[\d\s.+()-]+$/.test(r.phone) && digits.length >= 8 && digits.length <= 15);
  const notes = ['Tự đăng ký qua Google Form', r.notes, phoneOk ? '' : `SĐT trong phản hồi: ${r.phone}`].filter(Boolean).join(' | ');
  return {
    name: clip(r.name, 200),
    group: isGovernment(r.organization) ? 'SoNganh' : 'DoanhNghiep',
    title: clip(r.title, 300),
    organization: clip(r.organization, 300) || 'Đăng ký trực tuyến',
    phone: phoneOk ? clip(r.phone, 40) : '',
    email: r.email,
    sendMethod: 'email',
    inviteStatus: 'pending',
    rsvpStatus: 'pending',
    rsvpSource: 'google_form',
    substituteName: '',
    hasBanquet: false,
    notes: clip(notes, 2000),
    masterContactId: null,
  };
}

const targetsOf = (roster: ReadonlyArray<RosterEntry>) => buildMatchIndex(roster.map((g) => ({ id: g.id, name: g.name, organization: g.organization, email: g.email, phone: g.phone })));

/** Matches or parks one unresolved response; returns the row when it should be auto-added. */
async function place(ctx: CommandContext, row: ResponseRow, index: MatchIndex, autoAdd: boolean, t: Tally): Promise<ResponseRow | null> {
  const m = matchResponse(index, row);
  if (m.kind === 'email' || m.kind === 'phone' || m.kind === 'name') {
    if (row.applyStatus === 'no_time') {
      await ctx.db.table(responsesTable).update(row.id, { matchedGuestId: m.guestId, match: m.kind, candidateGuestIds: [] }, { expectedVersion: row.version });
      t.review += 1;
      return null;
    }
    await applyToGuest(ctx, row, m.guestId, m.kind, row.respondedAt, t);
    return null;
  }
  if (m.kind === 'none' && autoAdd && row.name.trim() && row.applyStatus === 'pending') return row;
  const candidates = m.kind === 'ambiguous' ? [...m.candidates] : [];
  if (row.match !== m.kind || row.candidateGuestIds.join() !== candidates.join()) {
    await ctx.db.table(responsesTable).update(row.id, { match: m.kind, matchedGuestId: null, candidateGuestIds: candidates }, { expectedVersion: row.version });
  }
  t.review += 1;
  return null;
}

async function syncError(ctx: CommandContext, form: FormRow, message: string) {
  await ctx.db.table(formsTable).update(form.id, { lastAttemptAt: ctx.now, lastSyncError: message }, { overwrite: 'idempotent-set' });
  return { value: { status: 'error', message } as SyncReport, audit: audit('ĐỒNG BỘ GOOGLE FORM', `Đồng bộ Google Form thất bại: ${message}`, form.eventId, 'rsvp_form', form.id) };
}

const UNRESOLVED: ReadonlySet<ResponseRow['match']> = new Set(['none', 'ambiguous']);

/** The sync, reading the sheet through `sheets` (Google in the app, the fake in dev memory and tests). */
export const syncFormWith = (sheets: SheetSource): CommandSpec<InputOf<'comms.syncForm'>, SyncReport> => ({
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema })),
  authorize: manage,
  async run(ctx, { eventId }) {
    const form = await formOf(ctx, eventId);
    if (!form?.sheetCsvUrl) throw new CommandError('invalid', 'Chưa gắn link Google Sheet phản hồi. Hãy dán link Sheet ở mục cấu hình.');
    const fetched = await sheets.read(form.sheetCsvUrl);
    if (!fetched.ok) return syncError(ctx, form, fetched.message);
    let rows: string[][];
    try {
      rows = parseCsv(fetched.text);
    } catch (e) {
      return syncError(ctx, form, e instanceof CsvError ? e.message : 'Dữ liệu Google Sheet không đọc được.');
    }
    const headers = rows[0];
    if (!headers) return syncError(ctx, form, 'Google Sheet trống.');
    const map = parseColumnMap(form.columnMap) ?? detectColumns(headers);
    if (!canIdentify(map)) return syncError(ctx, form, 'Không nhận diện được cột Họ và tên, Email hoặc Số điện thoại. Hãy ghép cột ở mục "Ghép cột".');

    const parsed = new Map<string, NonNullable<ReturnType<typeof parseResponseRow>>>();
    const time = { order: detectDateOrder(map.timestamp === undefined ? [] : rows.slice(1).map((r) => r[map.timestamp!] ?? '')), now: ctx.now };
    for (const cells of rows.slice(1)) {
      const r = parseResponseRow(headers, cells, map, time);
      if (r) parsed.set(rowHashOf(r.rowKey), r);
    }
    const existing = await ctx.db.table(responsesTable).list({ eventId });
    const known = new Set(existing.map((r) => r.rowHash));
    const drafts: DraftOf<ResponseRow>[] = [...parsed].filter(([hash]) => !known.has(hash)).map(([rowHash, r]) => ({
      id: newId<'RsvpResponse'>(),
      eventId,
      rowHash,
      respondedAt: r.respondedAt ?? ctx.now,
      name: r.name,
      organization: r.organization,
      title: r.title,
      email: r.email,
      phone: r.phone,
      rsvp: r.rsvp,
      hasBanquet: r.hasBanquet,
      substitute: r.substitute,
      notes: r.notes,
      raw: r.raw,
      matchedGuestId: null,
      match: 'none',
      candidateGuestIds: [],
      applyStatus: r.respondedAt ? 'pending' : 'no_time',
      appliedAt: null,
    }));
    // Claim the new rows before any guest effect: a second sync running at once fails here and changes nothing.
    let inserted: ResponseRow[] = [];
    try {
      inserted = drafts.length > 0 ? await ctx.db.table(responsesTable).insertMany(drafts) : [];
    } catch (e) {
      if (e instanceof DbError && (e.kind === 'conflict' || e.kind === 'constraint')) throw new CommandError('conflict', 'Một lần đồng bộ khác đang chạy. Vui lòng thử lại sau ít phút.');
      throw e;
    }

    const t = emptyTally();
    const work = [...existing.filter((r) => r.applyStatus === 'pending' || (r.applyStatus === 'no_time' && UNRESOLVED.has(r.match))), ...inserted]
      .sort((a, b) => Date.parse(a.respondedAt) - Date.parse(b.respondedAt));
    try {
      // Oldest first, so when one guest answered twice the later answer is the one that stays.
      const index = targetsOf(await readRoster(ctx, eventId));
      const toAdd: ResponseRow[] = [];
      for (const row of work) {
        const add = await place(ctx, row, index, form.autoAddNewGuests, t);
        if (add) toAdd.push(add);
      }
      if (toAdd.length > 0) await autoAdd(ctx, eventId, toAdd, t);
      await ctx.db.table(formsTable).update(form.id, { lastSyncAt: ctx.now, lastAttemptAt: ctx.now, lastSyncError: null, sheetHeaders: headers }, { overwrite: 'idempotent-set' });
    } catch (e) {
      // The new responses are stored and what was applied stays applied; the rest waits as pending for the next sync.
      if (inserted.length > 0 || t.applied + t.created + t.stale + t.noAnswer + t.review > 0) {
        const reason = failureReason(e);
        await auditPartial(
          ctx,
          manage.perm,
          audit('ĐỒNG BỘ GOOGLE FORM', `Đồng bộ Google Form dừng giữa chừng (${reason}): lưu ${inserted.length} phản hồi mới; áp dụng ${t.applied}, thêm khách mới ${t.created}; phần còn lại chờ lần đồng bộ sau`, eventId, 'rsvp_form', form.id),
        );
        throw new CommandError('conflict', `Đồng bộ dừng giữa chừng: đã áp dụng ${t.applied} phản hồi và thêm ${t.created} khách mới. Bấm "Đồng bộ ngay" để xử lý phần còn lại.`);
      }
      throw e;
    }
    const report: SyncReport = { status: 'ok', rows: parsed.size, fresh: inserted.length, ...t, failures: t.failures.slice(0, 10) };
    const summary =
      `Đồng bộ Google Form: ${parsed.size} phản hồi, ${inserted.length} mới; áp dụng ${t.applied}, bỏ qua ${t.stale} (cũ hơn thay đổi gần nhất), ` +
      `chưa có câu trả lời rõ ${t.noAnswer}, cần xem lại ${t.review}, thêm khách mới ${t.created}${t.failed ? `, lỗi ${t.failed}` : ''}`;
    return { value: report, audit: audit('ĐỒNG BỘ GOOGLE FORM', summary, eventId, 'rsvp_form', form.id) };
  },
});

async function autoAdd(ctx: CommandContext, eventId: EventId, rows: ReadonlyArray<ResponseRow>, t: Tally): Promise<void> {
  const ids = new Map(rows.map((r) => [r.id, newId<'Guest'>()]));
  await ctx.call('guests.upsertMany', { eventId, items: rows.map((r) => ({ id: ids.get(r.id)!, draft: draftFromResponse(r) })), onExisting: 'skip' });
  const roster = await readRoster(ctx, eventId);
  const present = new Set(roster.map((g) => g.id));
  const index = targetsOf(roster);
  for (const r of rows) {
    const id = ids.get(r.id)!;
    if (present.has(id)) {
      // A newcomer counts as created, whatever became of its answer; only a failure to apply it is reported.
      const own = emptyTally();
      await applyToGuest(ctx, r, id, 'created', r.respondedAt, own);
      t.created += 1;
      t.failed += own.failed;
      t.failures.push(...own.failures);
    } else {
      // guests skipped it as a person already on the list (two responses of one newcomer, or a guest added meanwhile).
      await place(ctx, r, index, false, t);
    }
  }
}

export type ResolveAction = InputOf<'comms.resolveResponse'>['action'];

export const resolveResponse: CommandSpec<InputOf<'comms.resolveResponse'>, OutputOf<'comms.resolveResponse'>> = {
  kind: 'mutation',
  input: asSchema(
    z.object({
      eventId: eventIdSchema,
      id: responseIdSchema,
      version: versionSchema,
      action: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('match'), guestId: guestIdSchema }),
        z.object({ kind: z.literal('create') }),
        z.object({ kind: z.literal('dismiss') }),
        z.object({ kind: z.literal('reopen') }),
      ]),
    }),
  ),
  authorize: manage,
  async run(ctx, { eventId, id, version, action }) {
    const row = await ctx.db.table(responsesTable).get(id);
    if (!row || row.eventId !== eventId) throw new DbError('not_found');
    if (row.version !== version) throw new DbError('conflict');
    const who = row.name || row.email || row.phone || 'phản hồi';
    if (action.kind === 'dismiss' || action.kind === 'reopen') {
      if ((action.kind === 'dismiss') === (row.applyStatus === 'dismissed') || row.applyStatus === 'applied') {
        throw new CommandError('invalid', action.kind === 'dismiss' ? 'Phản hồi này không còn chờ xử lý.' : 'Phản hồi này chưa bị bỏ qua.');
      }
      const after = await ctx.db.table(responsesTable).update(id, { applyStatus: action.kind === 'dismiss' ? 'dismissed' : 'pending' }, { expectedVersion: version });
      return {
        value: { applyStatus: after.applyStatus },
        audit: audit('XỬ LÝ PHẢN HỒI FORM', `${action.kind === 'dismiss' ? 'Bỏ qua' : 'Mở lại'} phản hồi Google Form của "${who}"`, eventId, 'rsvp_response', id),
        inverse: inverse('comms.resolveResponse', { eventId, id, version: after.version, action: { kind: action.kind === 'dismiss' ? 'reopen' : 'dismiss' } }, `Phản hồi của "${who}"`),
      };
    }
    if (row.applyStatus === 'applied') throw new CommandError('invalid', 'Phản hồi này đã được áp dụng.');
    const t = emptyTally();
    if (action.kind === 'match') {
      const guest = (await readRoster(ctx, eventId)).find((g) => g.id === action.guestId);
      if (!guest) throw new CommandError('not_found', 'Không tìm thấy khách mời này trong sự kiện.');
      // A response whose time could not be read counts from the moment staff place it.
      await applyToGuest(ctx, row, guest.id, 'manual', row.applyStatus === 'no_time' ? ctx.now : row.respondedAt, t);
      const outcome = t.applied ? 'áp dụng' : t.stale ? 'bỏ qua vì cũ hơn thay đổi gần nhất' : t.noAnswer ? 'chưa có câu trả lời rõ' : `lỗi: ${t.failures[0] ?? ''}`;
      const after = await ctx.db.table(responsesTable).get(id);
      return {
        value: { applyStatus: after?.applyStatus ?? row.applyStatus },
        audit: audit('XỬ LÝ PHẢN HỒI FORM', `Ghép phản hồi Google Form của "${who}" với khách mời "${guest.name}": ${outcome}`, eventId, 'rsvp_response', id),
      };
    }
    const guestId = newId<'Guest'>();
    const { added } = await ctx.call('guests.upsertMany', { eventId, items: [{ id: guestId, draft: draftFromResponse(row) }], onExisting: 'skip' });
    if (added === 0) throw new CommandError('conflict', 'Đã có khách mời trùng email, số điện thoại hoặc họ tên và cơ quan. Hãy chọn ghép với khách mời đó.');
    let after: ResponseRow | null;
    try {
      await applyToGuest(ctx, row, guestId, 'created', row.applyStatus === 'no_time' ? ctx.now : row.respondedAt, t);
      after = await ctx.db.table(responsesTable).get(id);
    } catch {
      await auditPartial(ctx, manage.perm, audit('XỬ LÝ PHẢN HỒI FORM', `Thêm khách mời mới từ phản hồi Google Form của "${who}", nhưng chưa ghi được phản hồi là đã xử lý; lần đồng bộ sau sẽ ghép phản hồi với khách mới này`, eventId, 'rsvp_response', id));
      throw new CommandError('conflict', `Đã thêm khách mời "${who}" nhưng chưa ghi được phản hồi là đã xử lý. Tải lại trang để xem.`);
    }
    const outcome = t.applied ? '' : t.noAnswer ? ', chưa có câu trả lời rõ' : t.failures.length ? `, chưa áp dụng được câu trả lời: ${t.failures[0]}` : '';
    return {
      value: { applyStatus: after?.applyStatus ?? row.applyStatus },
      audit: audit('XỬ LÝ PHẢN HỒI FORM', `Thêm khách mời mới từ phản hồi Google Form của "${who}"${outcome}`, eventId, 'rsvp_response', id),
    };
  },
};
