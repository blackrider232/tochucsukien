import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildWorkCalendar } from '@/core/dates';
import { deterministicIds, normalizeBlob, type ImportContext, type LegacyBlob } from '@/core/legacy';
import { legacyImporter } from '../server/legacy-importer';

const blob = normalizeBlob(JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'legacy-progress.json'), 'utf8')));
const ctx: ImportContext = { ids: deterministicIds, calendar: buildWorkCalendar([]), includeDemo: false };
const plan = (b: LegacyBlob = blob, c: ImportContext = ctx) => legacyImporter.plan(b, c);
const rows = (table: string, p = plan()) => p.batches.find((b) => b.table === table)!.rows;

describe('progress legacy importer', () => {
  it('imports events, skips the demo event and the programs key, and is deterministic', () => {
    const events = rows('sce_tcsk_events');
    expect(events.map((e) => e.name)).toEqual([
      'Hội nghị XTĐT Hà Nội - Hàn Quốc 2026',
      'Hội chợ OCOP mùa thu (mã trùng)',
      'Chương trình không ngày',
    ]);
    expect(plan().issues).toContainEqual(expect.objectContaining({ severity: 'skipped_demo', legacyId: 'evt_demo' }));
    expect(plan()).toEqual(plan());
    expect(rows('sce_tcsk_events', plan(blob, { ...ctx, includeDemo: true }))).toHaveLength(4);
  });

  it('maps fields: VND budget, guests, time, department scope, created_at', () => {
    const [first] = rows('sce_tcsk_events');
    expect(first).toMatchObject({
      id: deterministicIds.eventId('evt_1767000000000'), legacy_id: 'evt_1767000000000', type: 'hoi_nghi', event_date: '2026-12-15', event_time: '14:00',
      budget_vnd: 350_000_000, target_guests: 200, department: 'Phòng Xúc tiến đầu tư', note: 'Chỉ đạo: mời Đại sứ quán', created_at: '2026-10-01T03:00:00.000Z',
      supporting_departments: ['Phòng Hành chính - Tổ chức', 'Phòng Phát triển doanh nghiệp', 'Phòng Tư vấn doanh nghiệp'],
    });
    expect(first).not.toHaveProperty('calculatedDeadline');
  });

  it('gives a colliding legacy event id its own uuid and reports it (m2 BUG-01)', () => {
    const [a, b] = rows('sce_tcsk_events');
    expect(a!.id).not.toBe(b!.id);
    expect(b).toMatchObject({ legacy_id: 'evt_1767000000000#2', budget_vnd: null });
    const groups = rows('sce_tcsk_task_groups');
    const steps = rows('sce_tcsk_steps');
    expect(new Set(groups.map((g) => g.id)).size).toBe(groups.length);
    expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);
    expect(plan().issues).toContainEqual(expect.objectContaining({ severity: 'coerced', legacyId: 'evt_1767000000000', message: expect.stringContaining('bị trùng') }));
    expect(plan().issues).toContainEqual(expect.objectContaining({ message: 'Kinh phí "khoảng 1 tỷ" không đọc được; để trống.' }));
  });

  it('keeps completion, coerces string offsets, drops unsafe links and template keys (m2 BUG-18/19)', () => {
    const [s1, dup, dday] = rows('sce_tcsk_steps');
    expect(s1).toMatchObject({
      offset_days: 20, day_type: 'calendar', completed_at: '2026-10-10T02:00:00.000Z', completed_by: 'Nguyễn Thị C', template_key: 'form_dskhach',
      sub_tasks: [{ id: '1', name: 'VIP', completed: true }, { id: '1#2', name: 'Doanh nghiệp', completed: false }],
      links: [{ id: expect.any(String), name: 'Danh sách VIP.xlsx', url: 'https://drive.google.com/file/d/abc' }],
    });
    expect(s1).not.toHaveProperty('calculatedDeadline');
    expect(dup).toMatchObject({ legacy_id: 'grp_1_1767000000000|step_1a#2', template_key: '', completed_at: '2026-10-05T03:00:00.000Z' });
    expect(dday).toMatchObject({ target_phase: 'dday', offset_days: 0 });
    const messages = plan().issues.map((i) => i.message);
    expect(messages).toContain('Liên kết "javascript:alert(document.cookie)" không phải http(s); đã bỏ.');
    expect(messages.some((m) => m.includes("x');alert(1);//"))).toBe(true);
  });

  it('puts a group of an unknown phase in phase I, and dates a dateless event from created_at in VN time (m2 BUG-04)', () => {
    expect(rows('sce_tcsk_task_groups').find((g) => g.legacy_id === 'grp_x')).toMatchObject({ phase: 'phase_prepare' });
    const nodate = rows('sce_tcsk_events').find((e) => e.legacy_id === 'evt_nodate');
    expect(nodate).toMatchObject({ event_date: '2026-04-01', department: 'Phòng Xúc tiến đầu tư' });
    expect(plan().issues).toContainEqual(expect.objectContaining({ severity: 'dropped_invalid', legacyId: 'evt_bad' }));
  });

  it('reads programs when events is empty', () => {
    const r = plan({ programs: [{ id: 'evt_p', name: 'Cũ', eventDate: '2025-05-05', groups: [] }], events: [] });
    expect(rows('sce_tcsk_events', r)).toEqual([expect.objectContaining({ legacy_id: 'evt_p', event_date: '2025-05-05' })]);
  });

  it('keeps imported numbers inside what the forms accept, and reports each change (review finding 3)', () => {
    const r = plan({
      events: [
        { id: 'big', name: 'Offset lớn', eventDate: '2026-12-15', targetGuests: 250_000, groups: [{ id: 'g', steps: [{ id: 'a', name: 'A', offsetDays: 999 }, { id: 'b', name: 'B', offsetDays: 365 }] }] },
        { id: 'zero', name: 'Không khách', eventDate: '2026-12-16', targetGuests: 0, groups: [] },
        { id: 'fine', name: 'Bình thường', eventDate: '2026-12-17', department: 'Phòng Xúc tiến đầu tư', targetGuests: 1, groups: [] },
      ],
    });
    expect(rows('sce_tcsk_steps', r).map((s) => s.offset_days)).toEqual([365, 365]);
    expect(rows('sce_tcsk_events', r).map((e) => e.target_guests)).toEqual([150, 150, 1]);
    const messages = r.issues.map((i) => i.message);
    expect(messages).toContain('Bước "A" có số ngày lệch 999 vượt 365; đã giảm còn 365.');
    expect(messages).toContain('Số khách dự kiến 250000 của "Offset lớn" ngoài khoảng 1 đến 100000; đặt 150.');
    expect(messages).toContain('Số khách dự kiến 0 của "Không khách" ngoài khoảng 1 đến 100000; đặt 150.');
    expect(r.issues.filter((i) => i.legacyId === 'fine' || i.message.includes('"B"'))).toEqual([]);
  });
});
