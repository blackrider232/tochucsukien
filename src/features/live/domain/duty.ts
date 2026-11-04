// The duty roster: one desk registry and the presence rule (m5 §3.3, BUG-18,
// BUG-26). Arrival is compared with the event's opening in Vietnam time minus
// the configured fieldPresenceHours; nothing here reads a clock.

import type { HHmm, Instant, IsoDate } from '@/core/brand';
import { addHours, combineVN } from '@/core/dates';
import type { SystemSettings } from '@/core/settings';
import type { DutyDesk, DutyStaff } from '../contract';
import type { IconName } from '@/components/ui';

/** One label set per desk, replacing the card names and the option labels that disagreed (BUG-26). */
export const DUTY_DESKS: { readonly [D in DutyDesk]: { short: string; label: string; icon: IconName } } = {
  1: { short: 'Bàn 1: Tiếp đón VIP', label: 'Bàn 1: Đón tiếp Lãnh đạo UBND TP & VIP', icon: 'star' },
  2: { short: 'Bàn 2: Tiếp đón đại biểu', label: 'Bàn 2: Đón tiếp Sở ngành & Doanh nghiệp (phát thẻ, tài liệu)', icon: 'users' },
  3: { short: 'Bàn 3: Điều phối sân khấu', label: 'Bàn 3: Điều phối hội trường, sân khấu & cabin dịch', icon: 'smartphone' },
  4: { short: 'Bàn 4: Trực hội chợ', label: 'Bàn 4: Trực hiện trường hội chợ & hỗ trợ gian hàng', icon: 'store' },
};

/** combineVN(eventDate, eventTime) - fieldPresenceHours (m5 §3.3). */
export function dutyRequiredAt(event: { eventDate: IsoDate; eventTime: HHmm }, s: Pick<SystemSettings, 'fieldPresenceHours'>): Instant {
  return addHours(combineVN(event.eventDate, event.eventTime), -s.fieldPresenceHours);
}

export type DutyState = { kind: 'pending' } | { kind: 'on_time' } | { kind: 'late'; minutes: number };

/** Arriving exactly at the required time is on time; any later is late, rounded up to the next whole minute. */
export function dutyStatus(staff: Pick<DutyStaff, 'checkedInAt'>, requiredAt: Instant): DutyState {
  if (!staff.checkedInAt) return { kind: 'pending' };
  const lateMs = Date.parse(staff.checkedInAt) - Date.parse(requiredAt);
  return lateMs <= 0 ? { kind: 'on_time' } : { kind: 'late', minutes: Math.ceil(lateMs / 60_000) };
}

/** Desk number from a legacy role label ('Bàn 3: Điều phối…'); null when it names none. */
export function deskOfLegacyRole(role: string): DutyDesk | null {
  const m = /Bàn\s*([1-4])\b/i.exec(role);
  return m ? (Number(m[1]) as DutyDesk) : null;
}
