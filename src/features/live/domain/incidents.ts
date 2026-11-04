// The incident log: urgency and status registries, the code, the order of the
// list and the allowed status changes (m5 §3.4, BUG-28).

import type { EnumRegistry } from '@/core/vocab';
import type { Incident, IncidentStatus, IncidentUrgency } from '../contract';

export const URGENCY: EnumRegistry<IncidentUrgency> = {
  high: { label: 'Khẩn cấp (báo Giám đốc SCE xử lý ngay)', short: 'Khẩn cấp', tone: 'rose' },
  medium: { label: 'Trung bình (cần khắc phục trong 15 phút)', short: 'Trung bình', tone: 'amber' },
  low: { label: 'Thấp (ghi nhận điều chỉnh)', short: 'Thấp', tone: 'slate' },
};

export const INCIDENT_STATUS: EnumRegistry<IncidentStatus> = {
  open: { label: 'Mới tiếp nhận', short: 'Mới tiếp nhận', tone: 'rose' },
  in_progress: { label: 'Đang xử lý', short: 'Đang xử lý', tone: 'amber' },
  resolved: { label: 'Đã khắc phục', short: 'Đã khắc phục', tone: 'emerald' },
};

/** The legacy location list; a stored location outside it (legacy text) is kept and offered as its own option. */
export const INCIDENT_LOCATIONS: ReadonlyArray<string> = [
  'Sân khấu / Bục phát biểu',
  'Bàn Lễ tân đón tiếp',
  'Hội trường Khu A (VIP)',
  'Hội trường Khu B / Khu C',
  'Khu gian hàng Hội chợ OCOP',
  'Phòng Khánh tiết VIP Lầu 1',
  'Sảnh đón xe & Bãi đỗ xe',
];

export const DEFAULT_RESOLUTION_NOTE = 'Đã kiểm tra và xử lý thành công.';

/** 'SC-01'. The sequence is per event and never reused while the incident exists. */
export const incidentCode = (seq: number) => `SC-${String(seq).padStart(2, '0')}`;

/** Next number for a new incident: one above the highest existing, so a gap never yields a duplicate (BUG-28). */
export const nextIncidentSeq = (incidents: ReadonlyArray<Pick<Incident, 'seq'>>) => incidents.reduce((max, i) => Math.max(max, i.seq), 0) + 1;

const URGENCY_RANK: Readonly<Record<IncidentUrgency, number>> = { high: 0, medium: 1, low: 2 };
const STATUS_RANK: Readonly<Record<IncidentStatus, number>> = { open: 0, in_progress: 0, resolved: 1 };

/** Open and in-progress first, then by urgency, then newest report first (m5 §3.4 intended). */
export function sortIncidents<I extends Pick<Incident, 'status' | 'urgency' | 'reportedAt' | 'seq'>>(list: ReadonlyArray<I>): I[] {
  return [...list].sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] ||
      b.reportedAt.localeCompare(a.reportedAt) ||
      b.seq - a.seq,
  );
}

/** Every status change a person can make; anything else is refused by the command. */
export const INCIDENT_TRANSITIONS: { readonly [S in IncidentStatus]: ReadonlyArray<IncidentStatus> } = {
  open: ['in_progress', 'resolved'],
  in_progress: ['open', 'resolved'],
  // Reopen; in_progress only as the undo of "in progress -> resolved".
  resolved: ['open', 'in_progress'],
};

export const isOpenIncident = (i: Pick<Incident, 'status'>) => i.status !== 'resolved';
