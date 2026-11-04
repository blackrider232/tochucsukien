// The 23 built-in templates as typed data. Only admin overrides and custom
// templates live in sce_tcsk_templates, so a fix to the text here reaches
// everyone (m3 B10). The data is generated from legacy/index.html plus
// LEGACY_FIXES and diffed by builtin-templates.test.ts.

import { BUILTIN_IDS, type BuiltinId } from './builtins/ids';
import { STC_TEMPLATES } from './builtins/stc';
import { TRUNGTAM_TEMPLATES } from './builtins/trungtam';
import type { BuiltinTemplate } from './builtins/types';
import { UBND_TEMPLATES } from './builtins/ubnd';

export type { BuiltinId, BuiltinTemplate };
export { BUILTIN_IDS };

export const BUILTIN_TEMPLATES: ReadonlyArray<BuiltinTemplate> = [...UBND_TEMPLATES, ...STC_TEMPLATES, ...TRUNGTAM_TEMPLATES];

const BY_ID: ReadonlyMap<string, BuiltinTemplate> = new Map(BUILTIN_TEMPLATES.map((t) => [t.id, t]));

export const isBuiltinId = (id: string): id is BuiltinId => BY_ID.has(id);
export const builtinById = (id: string): BuiltinTemplate | undefined => BY_ID.get(id);
