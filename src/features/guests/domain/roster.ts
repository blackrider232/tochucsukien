// Pure selectors over the roster. Every count, filter and print set on every
// screen, export and other feature comes from here, so the KPI cards, the
// pop-ups, the print studio and the Excel stats can never disagree (m4a B38,
// B39, B43, B45).

import type { SeatCode } from '@/core/brand';
import { guestQuota, type SystemSettings } from '@/core/settings';
import { foldVi, matchesQuery, normalizePhone } from '@/core/text';
import { isAttending, type GuestGroup, type RsvpStatus } from '@/core/vocab';
import type { Guest, GuestDraft, GuestKpis, RosterEntry } from '../contract';

/** Banquet = registered and not declined (m4a B39, Q10). The flag itself is kept, so an undone decline restores it. */
export function isBanquetGuest(g: Pick<Guest, 'hasBanquet' | 'rsvpStatus'>): boolean {
  return g.hasBanquet && g.rsvpStatus !== 'declined';
}

export function guestKpis(roster: ReadonlyArray<RosterEntry>, targetGuests: number): GuestKpis {
  const count = (status: RsvpStatus) => roster.filter((g) => g.rsvpStatus === status).length;
  return {
    total: roster.length,
    target: targetGuests,
    attending: roster.filter((g) => isAttending(g.rsvpStatus)).length,
    declined: count('declined'),
    substituted: count('substituted'),
    pending: count('pending'),
    banquet: roster.filter(isBanquetGuest).length,
    seated: roster.filter((g) => g.seatCode !== null).length,
  };
}

/** The invite quota of decision 2, against the guests invited so far. */
export interface QuotaProgress {
  target: number;
  /** ceil(target * guestQuotaPercent / 100), from settings. */
  quota: number;
  percentOfTarget: number;
  invited: number;
  reached: boolean;
  missing: number;
  surplus: number;
  /** invited / quota, rounded; 0 when there is no quota. */
  percent: number;
}
export function quotaProgress(invited: number, targetGuests: number, settings: SystemSettings): QuotaProgress {
  const quota = guestQuota(targetGuests, settings);
  return {
    target: targetGuests,
    quota,
    percentOfTarget: settings.guestQuotaPercent,
    invited,
    reached: invited >= quota,
    missing: Math.max(0, quota - invited),
    surplus: Math.max(0, invited - quota),
    percent: quota > 0 ? Math.round((invited / quota) * 100) : 0,
  };
}

/** Name-cards set (m4a §3.7, m4b BUG-32): group VIP, or seated in a zone flagged vipZone. */
export function isNamecardGuest(g: RosterEntry, vipSeat: (code: SeatCode) => boolean): boolean {
  return g.group === 'VIP' || (g.seatCode !== null && vipSeat(g.seatCode));
}

/**
 * What the print studio prints and KPI 3 counts. A guest gets a table tent or a badge, never both (m4a B38), and a guest
 * who declined gets neither.
 */
export function printSets(roster: ReadonlyArray<RosterEntry>, vipSeat: (code: SeatCode) => boolean) {
  const printable = roster.filter((g) => g.rsvpStatus !== 'declined');
  return {
    namecards: printable.filter((g) => isNamecardGuest(g, vipSeat)),
    badges: printable.filter((g) => !isNamecardGuest(g, vipSeat)),
  };
}

/**
 * The one dedupe identity (m4a B41): folded email, else normalized phone, else folded name+organization. Two records are
 * the same person exactly when their keys are equal, so a record that has an email is never the same as one that lacks it.
 */
export function guestIdentityKey(g: Pick<Guest, 'name' | 'organization' | 'email' | 'phone'>): string {
  const email = g.email ? foldVi(g.email) : '';
  if (email) return `email:${email}`;
  const phone = normalizePhone(g.phone);
  if (phone.length >= 8) return `phone:${phone}`;
  return `name:${foldVi(g.name)}|${foldVi(g.organization)}`;
}

export interface GuestFilter {
  q: string;
  group: GuestGroup | 'all';
  rsvp: RsvpStatus | 'all';
}
export const NO_FILTER: GuestFilter = { q: '', group: 'all', rsvp: 'all' };

/** One search for the table and every pop-up: tone-insensitive, every token must match (m4a B45). */
export function filterGuests<G extends RosterEntry>(roster: ReadonlyArray<G>, f: GuestFilter): G[] {
  return roster.filter(
    (g) =>
      (f.group === 'all' || g.group === f.group) &&
      (f.rsvp === 'all' || g.rsvpStatus === f.rsvp) &&
      matchesQuery(f.q, g.name, g.title, g.organization, g.phone, g.email, g.substituteName, g.notes, g.checkinCode, g.seatCode),
  );
}

/**
 * The one RSVP transition, for the form, the row menu, the undo and the form sync (m4a B18): what the patch becomes
 * against the current row, whether the seat must be released, and whether the result is a substitution nobody is named
 * for (a command that takes an answer from outside refuses that).
 */
export function rsvpTransition(current: Pick<Guest, 'rsvpStatus' | 'substituteName'>, patch: Partial<GuestDraft>): {
  patch: Partial<GuestDraft>;
  statusChanged: boolean;
  releasesSeat: boolean;
  needsSubstitute: boolean;
} {
  const status = patch.rsvpStatus ?? current.rsvpStatus;
  const substitute = patch.substituteName ?? current.substituteName;
  const next = status !== 'substituted' && substitute ? { ...patch, substituteName: '' } : patch;
  return { patch: next, statusChanged: status !== current.rsvpStatus, releasesSeat: status === 'declined', needsSubstitute: status === 'substituted' && !substitute };
}

/** Display fallback of an empty title, as the legacy table and cards show it. */
export const titleOrDefault = (g: Pick<Guest, 'title'>): string => g.title || 'Đại biểu';
