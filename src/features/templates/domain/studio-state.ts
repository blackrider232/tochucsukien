// The studio's state is a function of the address: template, event, search and level.
// Everything the preview shows derives from these four values on every render (m3 B20).

import type { IsoDate } from '@/core/brand';
import type { DocumentTemplate, TemplateLevel } from '../contract';
import { TEMPLATE_LEVEL_VALUES } from './levels';

/** Shown first and kept when the address names nothing (m3 §1.1: initial template form_kh_ubnd). */
export const DEFAULT_TEMPLATE_ID = 'form_kh_ubnd';
export const NO_EVENT = '';

export interface StudioState {
  templateId: string;
  /** NO_EVENT for the blank template. */
  eventId: string;
  query: string;
  level: 'all' | TemplateLevel;
}

export interface StudioParams {
  t?: string;
  event?: string;
  q?: string;
  level?: string;
}

type EventRef = { id: string; eventDate: IsoDate };

/** The requested event when it is visible; otherwise the next event on or after today, else the latest one; none when there are none. */
export function defaultEventId(events: ReadonlyArray<EventRef>, today: IsoDate, requested?: string): string {
  if (requested !== undefined && events.some((e) => e.id === requested)) return requested;
  const sorted = [...events].sort((a, b) => (a.eventDate < b.eventDate ? -1 : a.eventDate > b.eventDate ? 1 : 0));
  return (sorted.find((e) => e.eventDate >= today) ?? sorted.at(-1))?.id ?? NO_EVENT;
}

/**
 * The template the address names, or null when it is not in the list (deleted or never existed).
 * There is no fallback: opening another document for a dead link was legacy bug B08.
 */
export function pickTemplate(list: ReadonlyArray<DocumentTemplate>, id: string): DocumentTemplate | null {
  return list.find((t) => t.id === id) ?? null;
}

export function initialState(params: StudioParams, events: ReadonlyArray<EventRef>, today: IsoDate): StudioState {
  const level = TEMPLATE_LEVEL_VALUES.find((l) => l === params.level);
  return {
    templateId: params.t || DEFAULT_TEMPLATE_ID,
    eventId: params.event === NO_EVENT ? NO_EVENT : defaultEventId(events, today, params.event),
    query: params.q ?? '',
    level: level ?? 'all',
  };
}

/** The shareable address of a state. Defaults are left out so a plain /templates stays plain. */
export function studioHref(s: StudioState, path = '/templates'): string {
  const q = new URLSearchParams();
  if (s.templateId !== DEFAULT_TEMPLATE_ID) q.set('t', s.templateId);
  if (s.eventId) q.set('event', s.eventId);
  if (s.query.trim()) q.set('q', s.query.trim());
  if (s.level !== 'all') q.set('level', s.level);
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}
