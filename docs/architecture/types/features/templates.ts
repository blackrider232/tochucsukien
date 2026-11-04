// Contract of feature `templates` (M3). Built-ins ship as a typed constant;
// sce_tcsk_templates holds only admin overrides and custom templates (m3 B10).

import type { EventId, Instant, SanitizedHtml, TemplateId, Version } from '../core/brand';
import type { RequestContext } from '../core/auth';
import type { SystemSettings } from '../core/settings';
import type { IsoDate } from '../core/brand';
import type { SceEvent } from './progress';

export type TemplateLevel = 'cap_ubnd' | 'cap_stc' | 'cap_trungtam';
export type TemplateKind = 'doc' | 'grid';

export interface DocumentTemplate {
  id: TemplateId;
  level: TemplateLevel;
  code: string;
  title: string;
  kind: TemplateKind;
  description: string;
  content: SanitizedHtml;
  origin: 'builtin' | 'override' | 'custom';
  updatedAt: Instant | null;
  version: Version | null;
}

export interface MergeContext {
  event: SceEvent;
  settings: SystemSettings;
  today: IsoDate;
}
/** Pure; every value escaped; missing values render as dotted blanks, never invented (m3 B01/B12). */
export function renderTemplate(t: DocumentTemplate, ctx: MergeContext): SanitizedHtml {
  throw new Error('not implemented');
}
/** Step templateKey -> template id via the explicit alias table; null when unmapped (m3 B08/B09, m2 BUG-40). */
export function resolveTemplateKey(key: string): TemplateId | null {
  throw new Error('not implemented');
}
/** The only way other features link to a template. */
export function templateHref(id: TemplateId, eventId: EventId | null): string {
  throw new Error('not implemented');
}

export function listTemplates(ctx: RequestContext): Promise<ReadonlyArray<DocumentTemplate>> {
  throw new Error('not implemented');
}

declare module '../core/permissions' {
  interface PermissionMap {
    'templates.read': true;
    'templates.admin': true;
  }
}
