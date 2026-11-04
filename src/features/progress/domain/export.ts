// The legacy "Xuất báo cáo Excel / CSV" columns (m2 §4.4), one definition for
// both formats. Strings pass through safeSpreadsheetText in toCsv and the
// xlsx writer, so a name starting with "=" stays text (m2 BUG-41).

import { fileDateStamp } from '@/core/dates';
import { toCsv } from '@/core/text';
import { EVENT_TYPES } from '@/core/vocab';
import type { Instant } from '@/core/brand';
import { statusLabel, type PlanSummary } from './dashboard';

export const EXPORT_COLUMNS: ReadonlyArray<{ header: string; width: number; value: (row: PlanSummary, i: number) => string | number }> = [
  { header: 'STT', width: 6, value: (_r, i) => i + 1 },
  { header: 'Tên Sự Kiện', width: 44, value: (r) => r.plan.event.name },
  { header: 'Loại Hình', width: 16, value: (r) => EVENT_TYPES[r.plan.event.type].short },
  { header: 'Ngày Tổ Chức T0', width: 14, value: (r) => r.plan.event.eventDate },
  { header: 'Địa Điểm', width: 30, value: (r) => r.plan.event.location },
  { header: 'Phòng Ban Chủ Trì', width: 28, value: (r) => r.plan.event.department },
  { header: 'Người Phụ Trách', width: 22, value: (r) => r.plan.event.leadPerson },
  { header: 'Tổng Bước', width: 10, value: (r) => r.progress.total },
  { header: 'Đã Hoàn Thành', width: 12, value: (r) => r.progress.done },
  { header: 'Việc Chậm', width: 10, value: (r) => r.progress.overdue },
  { header: 'Tỷ Lệ %', width: 9, value: (r) => `${r.progress.percent}%` },
  { header: 'Trạng Thái', width: 16, value: statusLabel },
];

/** 'SCE_BaoCao_TienDo_SuKien_2026-11-04', dated in VN time (m2 BUG-31). */
export function exportFileStem(now?: Instant): string {
  return `SCE_BaoCao_TienDo_SuKien_${fileDateStamp(now)}`;
}

export function eventsCsv(rows: ReadonlyArray<PlanSummary>): Blob {
  return toCsv(rows, EXPORT_COLUMNS);
}
