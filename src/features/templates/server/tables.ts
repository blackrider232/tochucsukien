// The one table templates owns (0002_domain_tables.sql). It holds admin
// overrides of built-ins (base_builtin_key set) and custom templates only.

import { z } from 'zod';
import type { Instant, UserId, Version } from '@/core/brand';
import { parseInstant } from '@/core/dates';
import { defineTable, type BaseRow } from '@/core/db';
import { TEMPLATE_KIND_VALUES, TEMPLATE_LEVEL_VALUES } from '../domain/levels';
import type { StoredTemplate } from '../domain/catalog';

export interface TemplateRow extends BaseRow, StoredTemplate {
  id: string;
}

const instant = z.string().transform((v) => (parseInstant(v) ?? v) as Instant);

export const templatesTable = defineTable<TemplateRow>({
  name: 'sce_tcsk_templates',
  owner: 'templates',
  eventScoped: false,
  orderBy: [{ column: 'createdAt', ascending: true }],
  row: z.object({
    id: z.string(),
    templateKey: z.string(),
    baseBuiltinKey: z.string().nullable(),
    level: z.enum(TEMPLATE_LEVEL_VALUES),
    code: z.string(),
    title: z.string(),
    kind: z.enum(TEMPLATE_KIND_VALUES),
    description: z.string(),
    contentHtml: z.string(),
    version: z.number().transform((v) => v as Version),
    createdAt: instant,
    createdBy: z.string().nullable().transform((v) => v as UserId | null),
    updatedAt: instant,
    updatedBy: z.string().nullable().transform((v) => v as UserId | null),
  }),
});
