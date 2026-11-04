// Small pieces every comms command shares.

import type { z } from 'zod';
import type { EventId } from '@/core/brand';
import type { AuditEntry, Inverse, InputOf } from '@/core/commands';
import type { Schema } from '@/core/db';

export const asSchema = <T>(s: z.ZodType): Schema<T> => s as unknown as Schema<T>;

export const inverse = <K extends Inverse['command']>(command: K, input: InputOf<K>, label: string) => ({ command, input, label }) as Inverse;

export const audit = (action: string, summary: string, eventId: EventId | null, entity: string, entityId: string): AuditEntry => ({ action, summary, eventId, entity, entityId });
