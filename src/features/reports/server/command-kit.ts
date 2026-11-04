// What every reports command shares: the permission rules and the audit and
// inverse shapes.

import type { z } from 'zod';
import type { EventId } from '@/core/brand';
import type { AuditEntry, CommandSpec, InputOf, Inverse, OutputOf } from '@/core/commands';
import type { Schema } from '@/core/db';

export type Spec<K extends Inverse['command']> = CommandSpec<InputOf<K>, OutputOf<K>>;
export const asSchema = <T>(s: z.ZodType): Schema<T> => s as unknown as Schema<T>;
export const inverse = <K extends Inverse['command']>(command: K, input: InputOf<K>, label: string) => ({ command, input, label }) as Inverse;
export const audit = (action: string, summary: string, eventId: EventId, entity: string, entityId: string): AuditEntry => ({ action, summary, eventId, entity, entityId });

const onEvent = (i: { eventId: EventId }) => i.eventId;
export const writeReports = { perm: 'reports.write', event: onEvent } as const;
export const issueReports = { perm: 'reports.issue', event: onEvent } as const;
