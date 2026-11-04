// The visible catalog is built-ins plus what the table holds: an override
// replaces its built-in, a custom row adds one. Reset is deleting the row, so
// the built-in text always shows through (m3 B10).

import type { Instant, SanitizedHtml, TemplateId, Version } from '@/core/brand';
import { matchesQuery, sanitizeRichHtml } from '@/core/text';
import type { DocumentTemplate, TemplateKind, TemplateLevel } from '../contract';
import { BUILTIN_TEMPLATES, builtinById, type BuiltinTemplate } from './builtin-templates';
import { TEMPLATE_LEVEL_VALUES } from './levels';

/** A sce_tcsk_templates row, as the catalog needs it. */
export interface StoredTemplate {
  templateKey: string;
  baseBuiltinKey: string | null;
  level: TemplateLevel;
  code: string;
  title: string;
  kind: TemplateKind;
  description: string;
  contentHtml: string;
  version: Version;
  updatedAt: Instant;
}

/** The fields an admin edits. */
export interface TemplateDraft {
  level: TemplateLevel;
  code: string;
  title: string;
  kind: TemplateKind;
  description: string;
  content: string;
}

const fromBuiltin = (b: BuiltinTemplate): DocumentTemplate => ({
  id: b.id as TemplateId, level: b.level, code: b.code, title: b.title, kind: b.kind, description: b.description,
  content: sanitizeRichHtml(b.content), origin: 'builtin', updatedAt: null, version: null,
});

const fromStored = (s: StoredTemplate, origin: 'override' | 'custom'): DocumentTemplate => ({
  id: s.templateKey as TemplateId, level: s.level, code: s.code, title: s.title, kind: s.kind, description: s.description,
  content: sanitizeRichHtml(s.contentHtml), origin, updatedAt: s.updatedAt, version: s.version,
});

/** Built-ins in catalog order (an override in place), then custom templates in the order given. */
export function resolveCatalog(stored: ReadonlyArray<StoredTemplate>): DocumentTemplate[] {
  const overrides = new Map(stored.filter((s) => s.baseBuiltinKey !== null && builtinById(s.baseBuiltinKey)).map((s) => [s.baseBuiltinKey!, s]));
  const builtins = BUILTIN_TEMPLATES.map((b) => {
    const o = overrides.get(b.id);
    return o ? fromStored(o, 'override') : fromBuiltin(b);
  });
  const custom = stored.filter((s) => s.baseBuiltinKey === null || !builtinById(s.baseBuiltinKey)).map((s) => fromStored(s, 'custom'));
  return [...builtins, ...custom];
}

export const draftOf = (t: DocumentTemplate): TemplateDraft => ({
  level: t.level, code: t.code, title: t.title, kind: t.kind, description: t.description, content: t.content,
});

export function builtinDraft(id: string): TemplateDraft | null {
  const b = builtinById(id);
  return b ? { level: b.level, code: b.code, title: b.title, kind: b.kind, description: b.description, content: b.content } : null;
}

const normalized = (html: string) => sanitizeRichHtml(html).replace(/\s+/g, ' ').trim();

/** Same fields and the same document once sanitized (whitespace aside): saving this as an override would change nothing. */
export function sameAsBuiltin(id: string, draft: TemplateDraft): boolean {
  const b = builtinDraft(id);
  return b !== null
    && b.level === draft.level && b.code === draft.code && b.title === draft.title && b.kind === draft.kind
    && b.description === draft.description && normalized(b.content) === normalized(draft.content);
}

/** Only tables with header cells are data. Letterhead and signature layout tables never export (m3 B17). */
export const hasDataTable = (content: string | SanitizedHtml): boolean => /<th[\s>]/i.test(content);

export interface CatalogFilter {
  level: 'all' | TemplateLevel;
  query: string;
}
export function filterTemplates(list: ReadonlyArray<DocumentTemplate>, f: CatalogFilter): DocumentTemplate[] {
  return list.filter((t) => (f.level === 'all' || t.level === f.level) && matchesQuery(f.query, t.title, t.code, t.description));
}

export interface CatalogCounts {
  total: number;
  byLevel: Readonly<Record<TemplateLevel, number>>;
  overrides: number;
  custom: number;
}
export function catalogCounts(list: ReadonlyArray<DocumentTemplate>): CatalogCounts {
  const byLevel = Object.fromEntries(TEMPLATE_LEVEL_VALUES.map((l) => [l, list.filter((t) => t.level === l).length])) as Record<TemplateLevel, number>;
  return { total: list.length, byLevel, overrides: list.filter((t) => t.origin === 'override').length, custom: list.filter((t) => t.origin === 'custom').length };
}

/** Plain text of an HTML fragment, for word counts and copy; whitespace collapsed. */
export function plainText(html: string): string {
  return foldWhitespace(html.replace(/<(br|\/p|\/div|\/tr|\/h[1-6]|\/li)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ''));
}
function foldWhitespace(s: string): string {
  return decodeEntities(s).replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function decodeEntities(s: string): string {
  return s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}
