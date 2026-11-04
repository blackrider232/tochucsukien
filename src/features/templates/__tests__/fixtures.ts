import type { EventId, HHmm, Instant, IsoDate, SanitizedHtml, TemplateId, UserId, Version, Vnd } from '@/core/brand';
import { DEFAULT_SETTINGS } from '@/core/settings';
import type { DocumentTemplate, MergeContext } from '../contract';
import type { SceEvent } from '@/features/progress';

export const SETTINGS = { ...DEFAULT_SETTINGS, version: 1 as Version };
export const TODAY = '2026-11-04' as IsoDate;
export const NOW = '2026-11-04T02:00:00.000Z' as Instant;

export function event(overrides: Partial<SceEvent> = {}): SceEvent {
  return {
    id: '11111111-1111-4111-8111-111111111111' as EventId,
    name: 'Hội nghị Xúc tiến Đầu tư Hà Nội - Hàn Quốc 2026',
    type: 'hoi_nghi',
    eventDate: '2026-11-09' as IsoDate,
    eventTime: '08:30' as HHmm,
    location: 'Trung tâm Hội nghị Quốc tế',
    department: 'Phòng Xúc tiến đầu tư',
    supportingDepartments: [],
    leadPerson: 'Nguyễn Văn A',
    budget: 350_000_000 as Vnd,
    targetGuests: 150,
    status: 'preparing',
    note: '',
    deletedAt: null,
    version: 1 as Version,
    createdAt: NOW,
    createdBy: null as UserId | null,
    updatedAt: NOW,
    ...overrides,
  };
}

export const mergeCtx = (e: Partial<SceEvent> = {}, settings = SETTINGS): MergeContext => ({ event: event(e), settings, today: TODAY });

export function template(content: string, overrides: Partial<DocumentTemplate> = {}): DocumentTemplate {
  return {
    id: 'form_test' as TemplateId, level: 'cap_trungtam', code: 'TT', title: 'Mẫu thử', kind: 'doc', description: '',
    content: content as SanitizedHtml, origin: 'custom', updatedAt: null, version: null, ...overrides,
  };
}
