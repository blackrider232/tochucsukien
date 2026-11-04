// Delivery rows (decision 16, m4a B12/B28/B31/B33, m4c B19/B33).
//
// A campaign is one message: its id is derived from the event and the subject
// and body templates, so composing the same message again, after a reload or
// from the log's "Gửi lại thư lỗi", lands in the same campaign. Each run of
// the send loop carries a random token. Before it sends, the run claims each
// address (startCampaign): the row becomes 'queued' under its token, and an
// address that already received this message, or that another run holds, is
// refused, so nobody gets the same message twice. Another run means another
// token: a second tab or a reload of the same officer is one too, and may
// only take over the claims explicitly. Just before handing a message to
// Gmail the run marks its claim 'sending' (markSending). A run that dies there
// leaves the row 'sending', which nobody claims again: once the lease runs
// out (or the officer takes the run over), it becomes 'unknown' for a person
// to check the Sent folder. Each outcome then completes its claim
// (recordDeliveries), only from the run that holds it: 'sent' only with
// Gmail's message id, 'error' with Gmail's reason, and a later failure never
// erases a success. Claims a stopped run did not use are released.
// A real send marks the guest invited through guests.markInvited (m4a B33).

import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { CampaignId, Email, EventId, GuestId, Instant } from '@/core/brand';
import { CommandError, type CommandContext, type CommandSpec, type InputOf, type OutputOf } from '@/core/commands';
import { DbError } from '@/core/db';
import { devMemoryEnabled } from '@/core/dev/mode';
import { CLAIM_LEASE_MS, CLAIM_SKEW_MS } from '../domain/campaign';
import { campaignIdSchema, deliveryResultSchema, eventIdSchema, guestIdSchema, MAX_CLAIM_BATCH, requiredEmailSchema, runTokenSchema, type RunToken } from '../domain/schemas';
import { DEV_FAKE_ID_PREFIX } from '../domain/transport';
import { asSchema, audit, auditPartial } from './command-kit';
import { campaignsTable, deliveriesTable, type DeliveryRow } from './tables';

export const MAX_DELIVERY_BATCH = 50;
export { CLAIM_LEASE_MS, CLAIM_SKEW_MS };

const send = { perm: 'comms.send', event: (i: { eventId: EventId }) => i.eventId } as const;

/** The campaign of one message: same event, same subject and body templates, same id. Formatted as a v5 uuid. */
export function campaignIdFor(eventId: EventId, subject: string, body: string): CampaignId {
  const hash = createHash('sha256').update(`sce-comms-campaign|${eventId}|${subject.trim()}\u0000${body.trim()}`, 'utf8').digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}` as CampaignId;
}

const byEmail = async (ctx: CommandContext, eventId: EventId, campaignId: CampaignId) =>
  new Map((await ctx.db.table(deliveriesTable).list({ eventId, campaignId })).map((d) => [d.email, d]));

/** updated_at is the database's clock, ctx.now the app server's: the skew margin keeps a live claim from ending early. */
const leaseExpired = (ctx: CommandContext, d: DeliveryRow) => Date.parse(ctx.now) - Date.parse(d.updatedAt) >= CLAIM_LEASE_MS + CLAIM_SKEW_MS;
/** Held by the run `runToken` names: claimed, or being sent. */
const heldBy = (d: DeliveryRow, runToken: RunToken) => (d.status === 'queued' || d.status === 'sending') && d.claimToken === runToken;
const IN_FLIGHT_LOST = 'Phiên gửi đã dừng khi đang gửi thư này, nên chưa rõ thư đã đi hay chưa. Kiểm tra mục Đã gửi của Gmail.';

const recipientSchema = z.object({ guestId: guestIdSchema.nullable(), email: requiredEmailSchema, recipientName: z.string().trim().max(300) });

export const startCampaign: CommandSpec<InputOf<'comms.startCampaign'>, OutputOf<'comms.startCampaign'>> = {
  kind: 'mutation',
  input: asSchema(
    z.object({
      eventId: eventIdSchema,
      senderEmail: requiredEmailSchema,
      subject: z.string().trim().min(1).max(300),
      body: z.string().trim().min(1).max(100_000),
      attachQr: z.boolean(),
      runToken: runTokenSchema,
      takeOver: z.boolean(),
      recipients: z.array(recipientSchema).min(1).max(MAX_CLAIM_BATCH),
    }),
  ),
  authorize: send,
  async run(ctx, { eventId, senderEmail, subject, body, attachQr, runToken, takeOver, recipients }) {
    const campaignId = campaignIdFor(eventId, subject, body);
    // Kept for "Gửi lại thư lỗi"; written before any claim, so a claim never lacks its message.
    await ctx.db.table(campaignsTable).upsertOn(['id'], { id: campaignId, eventId, subjectTemplate: subject, bodyTemplate: body, attachQr });
    const existing = await byEmail(ctx, eventId, campaignId);
    const claimed: Email[] = [];
    const alreadySent: Email[] = [];
    const inFlight: Email[] = [];
    const ownInFlight: Email[] = [];
    const unclear: Email[] = [];
    let takenOver = 0;
    let orphaned = 0;
    const seen = new Set<string>();
    try {
      for (const r of recipients) {
        if (seen.has(r.email)) continue;
        seen.add(r.email);
        const before = existing.get(r.email);
        const mine = before?.updatedBy === ctx.actor.profile.id;
        const heldElsewhere = (before?.status === 'queued' || before?.status === 'sending') && before.claimToken !== runToken && !leaseExpired(ctx, before);
        if (before?.status === 'sent') alreadySent.push(r.email);
        else if (before?.status === 'unknown') unclear.push(r.email);
        else if (heldElsewhere && !(takeOver && mine)) (mine ? ownInFlight : inFlight).push(r.email);
        else if (before?.status === 'sending') {
          // Its run died, or was taken over, with this message handed to Gmail or about to be: maybe sent.
          try {
            await ctx.db.table(deliveriesTable).update(before.id, { status: 'unknown', error: IN_FLIGHT_LOST }, { expectedVersion: before.version });
            orphaned += 1;
            unclear.push(r.email);
          } catch (e) {
            if (e instanceof DbError && e.kind === 'conflict') inFlight.push(r.email);
            else throw e;
          }
        } else {
          const row = { guestId: r.guestId, recipientName: r.recipientName, subject, senderEmail, status: 'queued' as const, claimToken: runToken, sentAt: null, error: null, providerMessageId: null, imported: false };
          try {
            if (before) await ctx.db.table(deliveriesTable).update(before.id, row, { expectedVersion: before.version });
            else await ctx.db.table(deliveriesTable).insert({ ...row, eventId, campaignId, email: r.email });
            claimed.push(r.email);
            if (heldElsewhere) takenOver += 1;
          } catch (e) {
            // Another run claimed or completed it between the read and this write.
            if (e instanceof DbError && (e.kind === 'conflict' || e.kind === 'constraint')) inFlight.push(r.email);
            else throw e;
          }
        }
      }
    } catch (e) {
      if (claimed.length > 0 || orphaned > 0) {
        await auditPartial(ctx, send.perm, audit('BẮT ĐẦU GỬI THƯ', `Bắt đầu đợt gửi "${subject}" từ ${senderEmail}: đã giữ chỗ ${claimed.length} người nhận${orphaned ? `, chuyển ${orphaned} thư đang gửi dở sang "Không rõ đã gửi"` : ''} rồi dừng vì lỗi; các thư đã giữ chỗ chưa được gửi`, eventId, 'email_campaign', campaignId));
        throw new CommandError('conflict', `Đã giữ chỗ ${claimed.length} người nhận nhưng không giữ được những người còn lại. Hãy bấm gửi lại sau ít phút.`);
      }
      throw e;
    }
    const parts = [
      `giữ chỗ ${claimed.length} người nhận`,
      ...(takenOver ? [`trong đó tiếp quản ${takenOver} người từ một phiên gửi khác của bạn`] : []),
      ...(alreadySent.length ? [`bỏ qua ${alreadySent.length} người đã nhận thư này`] : []),
      ...(orphaned ? [`${orphaned} người có thư đang gửi dở khi phiên gửi trước dừng, chuyển sang "Không rõ đã gửi"`] : []),
      ...(unclear.length ? [`bỏ qua ${unclear.length} người chưa rõ đã nhận thư này hay chưa`] : []),
      ...(ownInFlight.length ? [`bỏ qua ${ownInFlight.length} người đang được gửi ở một phiên khác của bạn`] : []),
      ...(inFlight.length ? [`bỏ qua ${inFlight.length} người đang được gửi ở phiên khác`] : []),
    ];
    return {
      value: { campaignId, claimed, alreadySent, inFlight, ownInFlight, unclear },
      audit: audit('BẮT ĐẦU GỬI THƯ', `Bắt đầu đợt gửi "${subject}" từ ${senderEmail}: ${parts.join(', ')}`, eventId, 'email_campaign', campaignId),
    };
  },
};

export const recordDeliveries: CommandSpec<InputOf<'comms.recordDeliveries'>, OutputOf<'comms.recordDeliveries'>> = {
  kind: 'mutation',
  input: asSchema(
    z.object({
      eventId: eventIdSchema,
      campaignId: campaignIdSchema,
      runToken: runTokenSchema,
      senderEmail: requiredEmailSchema,
      subject: z.string().trim().max(500),
      results: z.array(deliveryResultSchema).min(1).max(MAX_DELIVERY_BATCH),
    }),
  ),
  authorize: send,
  async run(ctx, { eventId, campaignId, runToken, senderEmail, subject, results }) {
    // The fake transport exists for the dev memory runtime; its ids are refused anywhere else.
    if (!devMemoryEnabled() && results.some((r) => r.providerMessageId?.startsWith(DEV_FAKE_ID_PREFIX))) {
      throw new CommandError('invalid', 'Kết quả gửi thử nghiệm không được ghi vào nhật ký thật.');
    }
    const existing = await byEmail(ctx, eventId, campaignId);
    const unclaimed = results.find((r) => !existing.has(r.email));
    if (unclaimed) throw new CommandError('conflict', `Thư tới ${unclaimed.email} chưa được giữ chỗ trong đợt gửi này. Hãy bắt đầu lại đợt gửi.`);
    // This run's own row: held (claimed or being sent), already holding this very result (an answer lost on the way
    // back), or turned unknown after the run lost touch, which Gmail's message id settles.
    const recorded = (r: (typeof results)[number], d: DeliveryRow) => d.claimToken === runToken && d.status === r.status;
    const notHeld = results.find((r) => {
      const d = existing.get(r.email)!;
      return d.status !== 'sent' && !heldBy(d, runToken) && !recorded(r, d) && !(d.status === 'unknown' && d.claimToken === runToken && r.status === 'sent');
    });
    if (notHeld) throw new CommandError('conflict', `Thư tới ${notHeld.email} không còn do phiên gửi này giữ chỗ (đã có kết quả, hoặc một phiên khác đã tiếp quản). Kiểm tra Nhật ký gửi trước khi gửi tiếp.`);

    let sent = 0;
    let failed = 0;
    let unknown = 0;
    let kept = 0;
    const invited: GuestId[] = [];
    try {
      for (const r of results) {
        const before = existing.get(r.email)!;
        // A success stays: a later failure, or a second success after a run that died mid-message, changes nothing.
        if (before.status === 'sent' || recorded(r, before)) {
          kept += 1;
          continue;
        }
        const row: Partial<DeliveryRow> = {
          guestId: r.guestId,
          recipientName: r.recipientName,
          subject,
          senderEmail,
          status: r.status,
          sentAt: r.status === 'sent' ? (ctx.now as Instant) : null,
          error: r.error,
          providerMessageId: r.providerMessageId,
          imported: false,
        };
        await ctx.db.table(deliveriesTable).update(before.id, row, { expectedVersion: before.version });
        if (r.status === 'sent') {
          sent += 1;
          if (r.guestId) invited.push(r.guestId);
        } else if (r.status === 'unknown') {
          unknown += 1;
        } else {
          failed += 1;
        }
      }
    } catch (e) {
      if (sent + failed + unknown > 0) {
        await auditPartial(ctx, send.perm, audit('GỬI THƯ MỜI', `Gửi thư "${subject}" từ ${senderEmail}: ghi được ${sent} thư đã gửi, ${failed} thư lỗi${unknown ? `, ${unknown} thư không rõ đã gửi hay chưa` : ''} rồi dừng vì lỗi; ${results.length - sent - failed - unknown - kept} kết quả chưa ghi`, eventId, 'email_campaign', campaignId));
        throw new CommandError('conflict', `Chỉ ghi được ${sent + failed + unknown}/${results.length} kết quả gửi. Kiểm tra Nhật ký gửi trước khi gửi tiếp.`);
      }
      throw e;
    }
    // The delivery rows are facts whatever guests answers: a refusal here is reported, not undone.
    let notInvited = 0;
    if (invited.length > 0) {
      try {
        await ctx.call('guests.markInvited', { eventId, ids: invited, method: 'email' });
      } catch {
        notInvited = invited.length;
      }
    }
    const parts = [
      `${sent} thư đã gửi`,
      `${failed} thư lỗi`,
      ...(unknown ? [`${unknown} thư không rõ đã gửi hay chưa (mất kết nối khi chờ Gmail trả lời), cần kiểm tra mục Đã gửi của Gmail`] : []),
      ...(kept ? [`${kept} kết quả bỏ qua vì đã gửi thành công trước đó`] : []),
      ...(notInvited ? [`chưa cập nhật được trạng thái giấy mời của ${notInvited} khách, cần cập nhật thủ công`] : []),
    ];
    return {
      value: { recorded: sent + failed + unknown, notInvited },
      audit: audit('GỬI THƯ MỜI', `Gửi thư "${subject}" từ ${senderEmail}: ${parts.join(', ')}`, eventId, 'email_campaign', campaignId),
    };
  },
};

/**
 * The officer checked Gmail's Sent folder: these messages whose answer was lost did not go. They become errors, which
 * "Gửi lại thư lỗi" or a new run of the message may send. A message that did go stays unknown, never sent again.
 */
export const markNotSent: CommandSpec<InputOf<'comms.markNotSent'>, OutputOf<'comms.markNotSent'>> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, campaignId: campaignIdSchema, emails: z.array(requiredEmailSchema).min(1).max(MAX_CLAIM_BATCH) })),
  authorize: send,
  async run(ctx, { eventId, campaignId, emails }) {
    const existing = await byEmail(ctx, eventId, campaignId);
    let marked = 0;
    try {
      for (const email of new Set(emails)) {
        const d = existing.get(email);
        if (d?.status !== 'unknown') continue;
        await ctx.db.table(deliveriesTable).update(d.id, { status: 'error', error: `Cán bộ đã kiểm tra: thư chưa được gửi (${d.error ?? 'mất kết nối'})`.slice(0, 500) }, { expectedVersion: d.version });
        marked += 1;
      }
    } catch (e) {
      if (marked > 0) {
        await auditPartial(ctx, send.perm, audit('XÁC NHẬN THƯ CHƯA GỬI', `Xác nhận ${marked} thư không rõ kết quả là chưa gửi rồi dừng vì lỗi; các thư còn lại vẫn "Không rõ đã gửi"`, eventId, 'email_campaign', campaignId));
        throw new CommandError('conflict', `Chỉ xác nhận được ${marked} thư là chưa gửi. Tải lại Nhật ký gửi.`);
      }
      throw e;
    }
    return { value: { marked }, audit: audit('XÁC NHẬN THƯ CHƯA GỬI', `Xác nhận ${marked} thư không rõ kết quả là chưa gửi, có thể gửi lại`, eventId, 'email_campaign', campaignId) };
  },
};

/** A live run's heartbeat: restarts the lease of every claim this run still holds, and names them. */
export const renewClaims: CommandSpec<InputOf<'comms.renewClaims'>, OutputOf<'comms.renewClaims'>> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, campaignId: campaignIdSchema, runToken: runTokenSchema })),
  authorize: send,
  async run(ctx, { eventId, campaignId, runToken }) {
    const held: Email[] = [];
    for (const d of (await byEmail(ctx, eventId, campaignId)).values()) {
      if (d.status !== 'queued' || d.claimToken !== runToken) continue;
      try {
        await ctx.db.table(deliveriesTable).update(d.id, { claimToken: runToken }, { expectedVersion: d.version });
        held.push(d.email);
      } catch (e) {
        // Recorded or taken over since the read: no longer this run's.
        if (!(e instanceof DbError && e.kind === 'conflict')) throw e;
      }
    }
    return { value: { held }, audit: audit('GIA HẠN GIỮ CHỖ', `Gia hạn giữ chỗ ${held.length} thư chưa gửi của đợt gửi đang chạy`, eventId, 'email_campaign', campaignId) };
  },
};

/**
 * Marks this run's claim of one address 'sending', just before the message is handed to Gmail, so a run that dies
 * after Gmail took it never leaves a claim another run would send again.
 */
export const markSending: CommandSpec<InputOf<'comms.markSending'>, OutputOf<'comms.markSending'>> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, campaignId: campaignIdSchema, runToken: runTokenSchema, email: requiredEmailSchema })),
  authorize: send,
  async run(ctx, { eventId, campaignId, runToken, email }) {
    const d = (await byEmail(ctx, eventId, campaignId)).get(email);
    if (!d || !heldBy(d, runToken)) throw new CommandError('conflict', `Thư tới ${email} không còn do phiên gửi này giữ chỗ (đã có kết quả, hoặc một phiên khác đã tiếp quản). Kiểm tra Nhật ký gửi trước khi gửi tiếp.`);
    if (d.status === 'queued') await ctx.db.table(deliveriesTable).update(d.id, { status: 'sending' }, { expectedVersion: d.version });
    return { value: null, audit: audit('ĐANG GỬI THƯ', `Bắt đầu gửi thư "${d.subject}" tới ${email}`, eventId, 'email_campaign', campaignId) };
  },
};

/**
 * Frees the claims of addresses a stopped run never handed to Gmail. Only this run's 'queued' or 'sending' rows go (the
 * run knows which messages it never sent); a result already recorded stays.
 */
export const releaseDeliveries: CommandSpec<InputOf<'comms.releaseDeliveries'>, OutputOf<'comms.releaseDeliveries'>> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, campaignId: campaignIdSchema, runToken: runTokenSchema, emails: z.array(requiredEmailSchema).min(1).max(MAX_CLAIM_BATCH) })),
  authorize: send,
  async run(ctx, { eventId, campaignId, runToken, emails }) {
    const existing = await byEmail(ctx, eventId, campaignId);
    let released = 0;
    try {
      for (const email of new Set(emails)) {
        const d = existing.get(email);
        if (!d || !heldBy(d, runToken)) continue;
        await ctx.db.table(deliveriesTable).remove(d.id, { expectedVersion: d.version });
        released += 1;
      }
    } catch (e) {
      if (released > 0) {
        await auditPartial(ctx, send.perm, audit('DỪNG GỬI THƯ', `Bỏ giữ chỗ ${released} thư chưa gửi rồi dừng vì lỗi; các thư còn lại vẫn hiện "Đang gửi" ở Nhật ký gửi`, eventId, 'email_campaign', campaignId));
        throw new CommandError('conflict', `Chỉ bỏ giữ chỗ được ${released} thư chưa gửi.`);
      }
      throw e;
    }
    return { value: { released }, audit: audit('DỪNG GỬI THƯ', `Bỏ giữ chỗ ${released} thư chưa gửi của đợt gửi`, eventId, 'email_campaign', campaignId) };
  },
};
