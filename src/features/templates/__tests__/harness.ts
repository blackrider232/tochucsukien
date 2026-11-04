// Runs templates commands through the real pipeline on a memoryDb, as any actor.

import type { Actor, RequestContext } from '@/core/auth';
import type { TemplateId, Uuid } from '@/core/brand';
import { newId } from '@/core/brand';
import type { CommandId, CommandResult, InputOf, Inverse, OutputOf } from '@/core/commands';
import { commandLookup, runCommand } from '@/core/commands/pipeline';
import { buildWorkCalendar } from '@/core/dates';
import { memoryDb } from '@/core/db';
import { inspectMemoryDb } from '@/core/db/memory';
import { testActor } from '@/core/testing/actors';
import { builtinDraft, type TemplateDraft } from '../domain/catalog';
import { commands } from '../server/commands';
import { listTemplates } from '../server/reads';
import { NOW, SETTINGS } from './fixtures';

export const admin = testActor('admin', null);

export function draft(over: Partial<TemplateDraft> = {}): TemplateDraft {
  return { level: 'cap_trungtam', code: 'BM-01', title: 'Biểu mẫu thử', kind: 'doc', description: 'Mô tả', content: '<p>Chương trình {{TEN_SU_KIEN}}</p>', ...over };
}

/** The built-in's own fields with one change, so it is a real override. */
export function edited(id: string, over: Partial<TemplateDraft> = {}): TemplateDraft {
  return { ...builtinDraft(id)!, title: 'Tiêu đề đã sửa', ...over };
}

export function harness() {
  const seed = { sce_tcsk_templates: [], sce_tcsk_audit_logs: [] };
  const lookup = commandLookup({ templates: { commands } });
  const ctx = (actor: Actor): RequestContext => ({ actor, db: memoryDb(seed, actor), settings: SETTINGS, calendar: buildWorkCalendar([]), now: NOW });
  const run = <K extends CommandId>(actor: Actor, id: K, input: InputOf<K>) => runCommand(ctx(actor), lookup, id, input) as Promise<CommandResult<OutputOf<K>>>;
  /**
   * Runs as `actor` against a Db that answers like an admin's, so row-level security lets everything through.
   * Whatever is refused here is refused by the command's own authorize and checks, not by the emulated RLS.
   */
  const runWithoutRls = <K extends CommandId>(actor: Actor, id: K, input: InputOf<K>) =>
    runCommand({ ...ctx(actor), db: memoryDb(seed, admin) }, lookup, id, input) as Promise<CommandResult<OutputOf<K>>>;
  const ok = async <K extends CommandId>(actor: Actor, id: K, input: InputOf<K>) => {
    const r = await run(actor, id, input);
    if (!r.ok) throw new Error(`${id} failed: ${r.kind} ${r.message} ${JSON.stringify(r.fieldErrors ?? {})}`);
    return r;
  };
  const undo = (actor: Actor, inverse: Inverse | undefined) => {
    if (!inverse) throw new Error('no inverse');
    return run(actor, inverse.command, inverse.input as never);
  };
  const catalog = (actor: Actor = admin) => listTemplates(ctx(actor));
  const customId = () => newId<'Template'>() as Uuid<'Template'> & TemplateId;
  return { seed, ctx, run, runWithoutRls, ok, undo, catalog, customId, audits: () => inspectMemoryDb(seed, 'sce_tcsk_audit_logs'), rows: () => inspectMemoryDb(seed, 'sce_tcsk_templates') };
}
