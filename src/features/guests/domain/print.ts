// What the print studio prints: the two sets, the background themes and the
// physical sizes (m4a §1.4, §1.6.4-5, B37). Themes are a tone from the kit's
// token set plus a frame, so a sheet never carries a hand-picked colour.

import type { GuestId } from '@/core/brand';
import type { EnumRegistry, Tone } from '@/core/vocab';
import type { RosterEntry } from '../contract';

export type PrintKind = 'namecards' | 'badges';

export interface ThemeEntry {
  label: string;
  short: string;
  tone: Tone;
  /** Tinted paper (true) or white paper with a coloured frame. */
  fill: boolean;
}

export type NamecardTheme = 'red_gold' | 'imperial_gold' | 'diplomatic_blue' | 'classic_white';
export const NAMECARD_THEMES: EnumRegistry<NamecardTheme> & { readonly [K in NamecardTheme]: ThemeEntry } = {
  red_gold: { label: 'Đỏ đô và vàng gold (mặc định)', short: 'Đỏ đô & vàng', tone: 'red', fill: true },
  imperial_gold: { label: 'Hoàng gia vàng champagne', short: 'Vàng champagne', tone: 'amber', fill: true },
  diplomatic_blue: { label: 'Xanh dương ngoại giao', short: 'Xanh ngoại giao', tone: 'blue', fill: true },
  classic_white: { label: 'Trắng tối giản viền đỏ chuẩn công vụ', short: 'Trắng viền đỏ', tone: 'red', fill: false },
};

export type BadgeTheme = 'navy_sce' | 'red_prestige' | 'modern_emerald' | 'dark_gold' | 'clean_white';
export const BADGE_THEMES: EnumRegistry<BadgeTheme> & { readonly [K in BadgeTheme]: ThemeEntry } = {
  navy_sce: { label: 'Xanh navy và vàng gold (mặc định)', short: 'Xanh navy', tone: 'indigo', fill: true },
  red_prestige: { label: 'Đỏ cờ sang trọng sự kiện cấp cao', short: 'Đỏ cờ', tone: 'red', fill: true },
  modern_emerald: { label: 'Xanh ngọc lục bảo (đổi mới và đầu tư)', short: 'Xanh ngọc', tone: 'emerald', fill: true },
  dark_gold: { label: 'Gold đẳng cấp VIP', short: 'Gold', tone: 'amber', fill: true },
  clean_white: { label: 'Trắng thanh lịch tiêu chuẩn', short: 'Trắng', tone: 'slate', fill: false },
};

export const DEFAULT_THEME = { namecards: 'red_gold', badges: 'navy_sce' } as const satisfies { namecards: NamecardTheme; badges: BadgeTheme };

export function themeOf(kind: PrintKind, raw: unknown): ThemeEntry & { id: string } {
  const registry: Readonly<Record<string, ThemeEntry>> = kind === 'namecards' ? NAMECARD_THEMES : BADGE_THEMES;
  const id = typeof raw === 'string' && Object.hasOwn(registry, raw) ? raw : DEFAULT_THEME[kind];
  return { id, ...registry[id]! };
}

/** Physical sizes, in millimetres, printed at 100% (m4a B37). */
export const SIZES = {
  /**
   * A table tent: two 280 mm wide faces and the fold band between them, centred on one A4 landscape sheet (210 mm high).
   * 2 x 97 + 5 + the 2 mm frame leaves the printer margin, so a tent never spills onto a second sheet.
   */
  tent: { width: 280, face: 97, fold: 5, top: 4 },
  /** A delegate badge, four to an A4 portrait sheet (2 x 2) with cut lines. */
  badge: { width: 90, height: 130, gap: 6, perPage: 4 },
} as const;

export function chunk<T>(items: ReadonlyArray<T>, size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The set filtered to one guest for a single print; a guest outside the set prints nothing (m4a §3.7). */
export const onlyGuest = (set: ReadonlyArray<RosterEntry>, id: GuestId | null) => (id ? set.filter((g) => g.id === id) : [...set]);

export function printHref(eventId: string, kind: PrintKind, opts: { guest?: GuestId; theme?: string; preview?: boolean } = {}): string {
  const q = new URLSearchParams({ kind });
  if (opts.guest) q.set('guest', opts.guest);
  if (opts.theme) q.set('theme', opts.theme);
  if (opts.preview) q.set('noprint', '1');
  return `/events/${eventId}/guests/print?${q.toString()}`;
}
