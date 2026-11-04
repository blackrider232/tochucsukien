// Delivery rows: written only after Gmail answered, 'sent' only with Gmail's
// message id, 'error' with Gmail's reason (decision 16, m4a B12, m4c B19).
// A real send marks the guest invited through guests.markInvited (m4a B33).
// The audit counts exactly what this call recorded (m4c B33).

import { z } from 'zod';
import type { GuestId } from '@/core/brand';
import { CommandError, type CommandSpec, type InputOf } from '@/core/commands';
import { devMemoryEnabled } from '@/core/dev/mode';
import { campaignIdSchema, deliveryResultSchema, eventIdSchema, requiredEmailSchema } from '../domain/schemas';
import { DEV_FAKE_ID_PREFIX } from '../domain/transport';
import { asSchema, audit } from './command-kit';
import { deliveriesTable, type DeliveryRow } from './tables';

export const MAX_DELIVERY_BATCH = 50;

export const recordDeliveries: CommandSpec<InputOf<'comms.recordDeliveries'>, { recorded: number }> = {
  kind: 'mutation',
  input: asSchema(
    z.object({
      eventId: eventIdSchema,
      campaignId: campaignIdSchema,
      senderEmail: requiredEmailSchema,
      subject: z.string().trim().max(500),
      results: z.array(deliveryResultSchema).min(1).max(MAX_DELIVERY_BATCH),
    }),
  ),
  authorize: { perm: 'comms.send', event: (i) => i.eventId },
  async run(ctx, { eventId, campaignId, senderEmail, subject, results }) {
    // The fake transport exists for the dev memory runtime; its ids are refused anywhere else.
    if (!devMemoryEnabled() && results.some((r) => r.providerMessageId?.startsWith(DEV_FAKE_ID_PREFIX))) {
      throw new CommandError('invalid', 'Kết quả gửi thử nghiệm không được ghi vào nhật ký thật.');
    }
    const existing = new Map((await ctx.db.table(deliveriesTable).list({ eventId, campaignId })).map((d) => [d.email, d]));
    let sent = 0;
    let failed = 0;
    let kept = 0;
    const invited: GuestId[] = [];
    for (const r of results) {
      const before = existing.get(r.email);
      // A later failure never erases an earlier success of the same campaign.
      if (before?.status === 'sent' && r.status === 'error') {
        kept += 1;
        continue;
      }
      const row: Partial<DeliveryRow> = {
        guestId: r.guestId,
        recipientName: r.recipientName,
        subject,
        senderEmail,
        status: r.status,
        sentAt: r.status === 'sent' ? ctx.now : null,
        error: r.error,
        providerMessageId: r.providerMessageId,
        imported: false,
      };
      if (before) await ctx.db.table(deliveriesTable).update(before.id, row, { expectedVersion: before.version });
      else await ctx.db.table(deliveriesTable).insert({ ...(row as DeliveryRow), eventId, campaignId, email: r.email });
      if (r.status === 'sent') {
        sent += 1;
        if (r.guestId) invited.push(r.guestId);
      } else {
        failed += 1;
      }
    }
    if (invited.length > 0) await ctx.call('guests.markInvited', { eventId, ids: invited, method: 'email' });
    const parts = [`${sent} thư đã gửi`, `${failed} thư lỗi`, ...(kept ? [`${kept} lỗi bỏ qua vì đã gửi thành công trước đó`] : [])];
    return {
      value: { recorded: sent + failed },
      audit: audit('GỬI THƯ MỜI', `Gửi thư "${subject}" từ ${senderEmail}: ${parts.join(', ')}`, eventId, 'email_campaign', campaignId),
    };
  },
};
