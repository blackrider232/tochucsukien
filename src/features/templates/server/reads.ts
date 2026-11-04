import type * as C from '../contract';
import { resolveCatalog } from '../domain/catalog';
import { templatesTable } from './tables';

/** Every template the actor may read: built-ins, with overrides applied, then custom templates. */
export const listTemplates: typeof C.listTemplates = async (ctx) => resolveCatalog(await ctx.db.table(templatesTable).list());
