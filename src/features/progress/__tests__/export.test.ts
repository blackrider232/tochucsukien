import { describe, expect, it } from 'vitest';
import type { EventId, Instant, IsoDate, Version } from '@/core/brand';
import { buildWorkCalendar } from '@/core/dates';
import type { EventPlan } from '../contract';
import { summarize } from '../domain/dashboard';
import { eventsCsv, exportFileStem } from '../domain/export';
import { SETTINGS } from './harness';

const at = '2026-11-01T00:00:00.000Z' as Instant;
const plan = (name: string, department: EventPlan['event']['department'] = 'Phòng Xúc tiến đầu tư'): EventPlan => ({
  event: {
    id: 'e0000000-0000-4000-8000-000000000001' as EventId, name, type: 'hoi_cho', eventDate: '2026-12-15' as IsoDate, eventTime: '08:30' as EventPlan['event']['eventTime'],
    location: '@Hà Nội', department, supportingDepartments: [], leadPerson: '-Lead', budget: null, targetGuests: 150, status: 'preparing', note: '',
    deletedAt: null, version: 1 as Version, createdAt: at, createdBy: null, updatedAt: at,
  },
  groups: [],
});
const rows = (...plans: EventPlan[]) => plans.map((p) => summarize(buildWorkCalendar([]), p, '2026-11-04' as IsoDate, SETTINGS));

describe('events CSV export (m2 §4.4, BUG-41)', () => {
  it('has the legacy columns and neutralises formula prefixes', async () => {
    const text = await eventsCsv(rows(plan('=HYPERLINK("http://evil","x")'), plan('+cmd|calc', 'Phòng Phát triển doanh nghiệp'))).text();
    const [header, first, second] = text.replace(/^﻿/, '').split('\r\n');
    expect(header).toBe('STT,Tên Sự Kiện,Loại Hình,Ngày tổ chức T0,Địa Điểm,Phòng ban chủ trì,Người Phụ Trách,Tổng Bước,Đã Hoàn Thành,Việc Chậm,Tỷ Lệ %,Trạng Thái');
    expect(first).toBe(`1,"'=HYPERLINK(""http://evil"",""x"")",Hội chợ,2026-12-15,'@Hà Nội,Phòng Xúc tiến đầu tư,'-Lead,0,0,0,0%,Đang chuẩn bị`);
    expect(second!.startsWith("2,'+cmd|calc,")).toBe(true);
  });

  it('names the file by the VN date, not UTC (m2 BUG-31)', () => {
    expect(exportFileStem('2026-11-04T18:30:00.000Z' as Instant)).toBe('SCE_BaoCao_TienDo_SuKien_2026-11-05');
  });
});
