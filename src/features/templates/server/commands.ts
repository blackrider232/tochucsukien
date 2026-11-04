// Every write of the templates feature. All of them are admin-only (the RBAC
// matrix: templates.admin) and all are audited. Each returns the inverse its
// undo runs. Reset removes an override, so the built-in text shows through again (m3 B10).

import { z } from 'zod';
import type { TemplateId, Uuid, Version } from '@/core/brand';
import { CommandError, defineCommands, type AuditEntry, type CommandContext, type CommandSpec, type InputOf, type Inverse, type Sig } from '@/core/commands';
import { DbError, type Schema } from '@/core/db';
import { sanitizeRichHtml } from '@/core/text';
import type { DocumentTemplate } from '../contract';
import { builtinById } from '../domain/builtin-templates';
import { draftOf, resolveCatalog, sameAsBuiltin, type TemplateDraft } from '../domain/catalog';
import { customIdSchema, templateDraftSchema, templateIdSchema, versionSchema } from '../domain/schemas';
import { overrideRowId } from './ids';
import { templatesTable, type TemplateRow } from './tables';

declare module '@/core/commands' {
  interface CommandMap {
    'templates.saveOverride': Sig<{ id: TemplateId; version: Version | null; draft: TemplateDraft }, DocumentTemplate>;
    'templates.resetOne': Sig<{ id: TemplateId }, DocumentTemplate>;
    'templates.resetAll': Sig<Record<string, never>, { restored: number; keptCustom: number }>;
    'templates.restoreOverrides': Sig<{ overrides: ReadonlyArray<{ id: TemplateId; draft: TemplateDraft }> }, number>;
    'templates.createCustom': Sig<{ id: Uuid<'Template'> & TemplateId; draft: TemplateDraft }, DocumentTemplate>;
    'templates.updateCustom': Sig<{ id: Uuid<'Template'> & TemplateId; version: Version; draft: TemplateDraft }, DocumentTemplate>;
    'templates.deleteCustom': Sig<{ id: Uuid<'Template'> & TemplateId; version: Version }, null>;
  }
}

const asSchema = <T>(s: z.ZodType): Schema<T> => s as unknown as Schema<T>;
const inverse = <K extends Inverse['command']>(command: K, input: InputOf<K>, label: string) => ({ command, input, label }) as Inverse;
const audit = (action: string, summary: string, id: string): AuditEntry => ({ action, summary, eventId: null, entity: 'template', entityId: id });
const adminOnly = { perm: 'templates.admin', global: true } as const;

const named = (t: { title: string; code: string }) => `"${t.title}" (${t.code || 'không số hiệu'})`;
const fields = (d: TemplateDraft) => ({
  level: d.level, code: d.code, title: d.title, kind: d.kind, description: d.description, contentHtml: sanitizeRichHtml(d.content),
});
const present = (row: TemplateRow): DocumentTemplate => resolveCatalog([row]).find((t) => t.id === row.templateKey)!;
const rowDraft = (row: TemplateRow): TemplateDraft => draftOf(present(row));

const builtinOrThrow = (id: string) => {
  const b = builtinById(id);
  if (!b) throw new CommandError('not_found', 'Không tìm thấy biểu mẫu gốc này.');
  return b;
};
const overrideOf = async (ctx: CommandContext, builtinId: string): Promise<TemplateRow | null> => (await ctx.db.table(templatesTable).list({ templateKey: builtinId }))[0] ?? null;
const customOf = async (ctx: CommandContext, id: string): Promise<TemplateRow> => {
  const row = await ctx.db.table(templatesTable).get(id);
  if (!row || row.baseBuiltinKey !== null) throw new DbError('not_found');
  return row;
};
const builtinView = (id: string) => resolveCatalog([]).find((t) => t.id === id)!;

type Spec<I, O> = CommandSpec<I, O>;
const draftField = templateDraftSchema;

const saveOverride: Spec<InputOf<'templates.saveOverride'>, DocumentTemplate> = {
  kind: 'mutation',
  input: asSchema(z.object({ id: templateIdSchema, version: versionSchema.nullable(), draft: draftField })),
  authorize: adminOnly,
  async run(ctx, { id, version, draft }) {
    const builtin = builtinOrThrow(id);
    const before = await overrideOf(ctx, id);
    // Concurrency: the form loaded override `version` (or none). Anything else means someone saved or reset in between.
    if (before === null ? version !== null : version !== before.version) throw new DbError('conflict');

    if (sameAsBuiltin(id, draft)) {
      if (before) await ctx.db.table(templatesTable).remove(before.id, { expectedVersion: before.version });
      return {
        value: builtinView(id),
        audit: audit('CẬP NHẬT BIỂU MẪU CHUẨN', `Admin cập nhật biểu mẫu chuẩn: ${named(builtin)}, nội dung trùng mẫu gốc nên bỏ bản sửa`, id),
        ...(before ? { inverse: inverse('templates.saveOverride', { id, version: null, draft: rowDraft(before) }, `Sửa biểu mẫu "${builtin.title}"`) } : {}),
      };
    }
    const row = before
      ? await ctx.db.table(templatesTable).update(before.id, fields(draft), { expectedVersion: before.version })
      : await ctx.db.table(templatesTable).insert({ id: overrideRowId(id), templateKey: id, baseBuiltinKey: id, ...fields(draft) });
    return {
      value: present(row),
      audit: audit('CẬP NHẬT BIỂU MẪU CHUẨN', `Admin cập nhật biểu mẫu chuẩn: ${named(draft)}`, id),
      inverse: before
        ? inverse('templates.saveOverride', { id, version: row.version, draft: rowDraft(before) }, `Sửa biểu mẫu "${draft.title}"`)
        : inverse('templates.resetOne', { id }, `Sửa biểu mẫu "${draft.title}"`),
    };
  },
};

const resetOne: Spec<InputOf<'templates.resetOne'>, DocumentTemplate> = {
  kind: 'mutation',
  input: asSchema(z.object({ id: templateIdSchema })),
  authorize: adminOnly,
  async run(ctx, { id }) {
    const builtin = builtinOrThrow(id);
    const before = await overrideOf(ctx, id);
    if (before) await ctx.db.table(templatesTable).remove(before.id, { expectedVersion: before.version });
    return {
      value: builtinView(id),
      audit: audit('KHÔI PHỤC BIỂU MẪU GỐC', before ? `Admin khôi phục biểu mẫu về mẫu gốc: ${named(builtin)}` : `Biểu mẫu ${named(builtin)} đã là mẫu gốc`, id),
      ...(before ? { inverse: inverse('templates.saveOverride', { id, version: null, draft: rowDraft(before) }, `Khôi phục mẫu gốc "${builtin.title}"`) } : {}),
    };
  },
};

const resetAll: Spec<InputOf<'templates.resetAll'>, { restored: number; keptCustom: number }> = {
  kind: 'mutation',
  input: asSchema(z.object({}).strict()),
  authorize: adminOnly,
  async run(ctx) {
    const rows = await ctx.db.table(templatesTable).list();
    const overrides = rows.filter((r) => r.baseBuiltinKey !== null);
    for (const r of overrides) await ctx.db.table(templatesTable).remove(r.id, { expectedVersion: r.version });
    const keptCustom = rows.length - overrides.length;
    return {
      value: { restored: overrides.length, keptCustom },
      audit: audit('KHÔI PHỤC TOÀN BỘ BIỂU MẪU GỐC', `Admin khôi phục ${overrides.length} biểu mẫu về mẫu gốc, giữ nguyên ${keptCustom} biểu mẫu do Admin tạo`, 'all'),
      ...(overrides.length > 0
        ? { inverse: inverse('templates.restoreOverrides', { overrides: overrides.map((r) => ({ id: r.templateKey as TemplateId, draft: rowDraft(r) })) }, `Khôi phục ${overrides.length} biểu mẫu gốc`) }
        : {}),
    };
  },
};

const restoreOverrides: Spec<InputOf<'templates.restoreOverrides'>, number> = {
  kind: 'mutation',
  input: asSchema(z.object({ overrides: z.array(z.object({ id: templateIdSchema, draft: draftField })).min(1).max(100) })),
  authorize: adminOnly,
  async run(ctx, { overrides }) {
    for (const { id, draft } of overrides) {
      builtinOrThrow(id);
      await ctx.db.table(templatesTable).upsertOn(['templateKey'], { id: overrideRowId(id), templateKey: id, baseBuiltinKey: id, ...fields(draft) });
    }
    return {
      value: overrides.length,
      audit: audit('CẬP NHẬT BIỂU MẪU CHUẨN', `Admin đặt lại ${overrides.length} bản sửa biểu mẫu chuẩn`, 'all'),
      inverse: inverse('templates.resetAll', {}, `Đặt lại ${overrides.length} bản sửa biểu mẫu`),
    };
  },
};

const createCustom: Spec<InputOf<'templates.createCustom'>, DocumentTemplate> = {
  kind: 'mutation',
  input: asSchema(z.object({ id: customIdSchema, draft: draftField })),
  authorize: adminOnly,
  async run(ctx, { id, draft }) {
    const row = await ctx.db.table(templatesTable).insert({ id, templateKey: id, baseBuiltinKey: null, ...fields(draft) });
    return {
      value: present(row),
      audit: audit('THÊM BIỂU MẪU CHUẨN', `Admin thêm biểu mẫu chuẩn mới: ${named(draft)}`, id),
      inverse: inverse('templates.deleteCustom', { id, version: row.version }, `Thêm biểu mẫu "${draft.title}"`),
    };
  },
};

const updateCustom: Spec<InputOf<'templates.updateCustom'>, DocumentTemplate> = {
  kind: 'mutation',
  input: asSchema(z.object({ id: customIdSchema, version: versionSchema, draft: draftField })),
  authorize: adminOnly,
  async run(ctx, { id, version, draft }) {
    const before = await customOf(ctx, id);
    const row = await ctx.db.table(templatesTable).update(id, fields(draft), { expectedVersion: version });
    return {
      value: present(row),
      audit: audit('CẬP NHẬT BIỂU MẪU CHUẨN', `Admin cập nhật biểu mẫu chuẩn: ${named(draft)}`, id),
      inverse: inverse('templates.updateCustom', { id, version: row.version, draft: rowDraft(before) }, `Sửa biểu mẫu "${draft.title}"`),
    };
  },
};

const deleteCustom: Spec<InputOf<'templates.deleteCustom'>, null> = {
  kind: 'mutation',
  input: asSchema(z.object({ id: customIdSchema, version: versionSchema })),
  authorize: adminOnly,
  async run(ctx, { id, version }) {
    const before = await customOf(ctx, id);
    await ctx.db.table(templatesTable).remove(id, { expectedVersion: version });
    return {
      value: null,
      audit: audit('XÓA BIỂU MẪU CHUẨN', `Admin xóa biểu mẫu chuẩn: ${named(before)}`, id),
      inverse: inverse('templates.createCustom', { id: id as Uuid<'Template'> & TemplateId, draft: rowDraft(before) }, `Xóa biểu mẫu "${before.title}"`),
    };
  },
};

export const commands = defineCommands('templates', { saveOverride, resetOne, resetAll, restoreOverrides, createCustom, updateCustom, deleteCustom });
