// Server reads. RLS decides what the actor sees.

import type { RequestContext } from '@/core/auth';
import type { EventId } from '@/core/brand';
import type { SenderMailbox } from '../contract';
import { formOf } from './form';
import { toMailbox } from './mailboxes';
import { deliveriesTable, mailboxesTable, responsesTable, type DeliveryRow, type FormRow, type ResponseRow } from './tables';

export async function listMailboxes(ctx: RequestContext): Promise<ReadonlyArray<SenderMailbox>> {
  return (await ctx.db.table(mailboxesTable).list()).map(toMailbox);
}

export const readForm = (ctx: RequestContext, eventId: EventId): Promise<FormRow | null> => formOf(ctx, eventId);

export const listResponses = (ctx: RequestContext, eventId: EventId): Promise<ReadonlyArray<ResponseRow>> => ctx.db.table(responsesTable).list({ eventId });

export const listDeliveries = (ctx: RequestContext, eventId: EventId): Promise<ReadonlyArray<DeliveryRow>> => ctx.db.table(deliveriesTable).list({ eventId });
