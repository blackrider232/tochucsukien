import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildWorkCalendar } from '@/core/dates';
import { deterministicIds, normalizeBlob, type ImportContext } from '@/core/legacy';
import { legacyImporter } from '../server/legacy-importer';

const blob = normalizeBlob(JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'legacy-live.json'), 'utf8')));
const ctx: ImportContext = { ids: deterministicIds, calendar: buildWorkCalendar([]), includeDemo: false };
const plan = (c: ImportContext = ctx) => legacyImporter.plan(blob, c);
const rows = (table: string, p = plan()) => p.batches.find((b) => b.table === table)!.rows;
const issues = (severity: string, p = plan()) => p.issues.filter((i) => i.severity === severity);
const guest = (legacyId: string) => deterministicIds.idFor('Guest', legacyId, 'evt_real');
const EVT = deterministicIds.eventId('evt_real');

describe('live legacy importer', () => {
  it('is deterministic', () => {
    expect(plan()).toEqual(plan());
  });

  it('imports real check-ins with HH:MM:SS on the event day in Vietnam time, and an ISO time as it is', () => {
    const checkins = rows('sce_tcsk_checkins');
    expect(checkins).toEqual([
      { id: deterministicIds.idFor('Checkin', guest('gst_real_1')), event_id: EVT, guest_id: guest('gst_real_1'), checked_in_at: '2026-12-15T00:58:41.000Z', checked_in_by: null, desk: null, gift_given_at: '2026-12-15T00:58:41.000Z' },
      { id: deterministicIds.idFor('Checkin', guest('gst_real_2')), event_id: EVT, guest_id: guest('gst_real_2'), checked_in_at: '2026-12-15T01:05:00.000Z', checked_in_by: null, desk: null, gift_given_at: null },
    ]);
  });

  it('skips the check-ins the legacy seeder faked (m5 BUG-01), unless demo rows are asked for', () => {
    expect(issues('skipped_demo').map((i) => i.legacyId)).toEqual(expect.arrayContaining(['gst_seed_0']));
    expect(rows('sce_tcsk_checkins', plan({ ...ctx, includeDemo: true })).map((r) => r.guest_id)).toContain(guest('gst_seed_0'));
  });

  it('reports a gift without a check-in and an unreadable time instead of inventing either', () => {
    const dropped = issues('dropped_invalid').map((i) => i.legacyId);
    expect(dropped).toEqual(expect.arrayContaining(['gst_gift_only', 'gst_bad_time']));
    expect(rows('sce_tcsk_checkins').map((r) => r.guest_id)).not.toContain(guest('gst_absent'));
  });

  it('imports the duty roster with the desk read from the role, skipping duty_01..04 and a nameless row', () => {
    const duty = rows('sce_tcsk_duty_staff');
    expect(duty.map((d) => [d.legacy_id, d.name, d.department, d.desk, d.role_label, d.checked_in_at])).toEqual([
      ['duty_1767', 'Đinh Thị Trực', 'Phòng Xúc tiến đầu tư', 3, '', '2026-12-14T23:45:00.000Z'],
      ['duty_1768', '<script>alert(1)</script>', 'Phòng Hành chính - Tổ chức', 1, 'Tổ hậu cần', null],
    ]);
    expect(issues('skipped_demo').map((i) => i.legacyId)).toContain('duty_01');
    expect(issues('orphan').map((i) => i.legacyId)).toContain('evt_missing');
    expect(plan().issues.map((i) => i.message)).toContain('1 giờ quy định nhập tay của sự kiện evt_real không được nhập; nay tính từ giờ khai mạc trừ số giờ có mặt trong cấu hình.');
  });

  it('imports incidents with the seq from SC-NN, a fresh number for a duplicate or missing code, and consistent resolution times', () => {
    const list = rows('sce_tcsk_incidents');
    expect(list.map((i) => [i.legacy_id, i.seq, i.urgency, i.status, i.reported_at, i.resolved_at])).toEqual([
      ['sc_1767', 3, 'medium', 'resolved', '2026-12-15T00:40:00.000Z', '2026-12-15T00:40:00.000Z'],
      ['sc_1768', 4, 'high', 'in_progress', '2026-12-15T16:50:00.000Z', null],
      ['sc_1769', 5, 'low', 'open', '2026-12-15T01:30:00.000Z', null],
    ]);
    expect(list[1]!.description).toBe('<img src=x onerror=alert(2)> trùng ghế');
    expect(issues('skipped_demo').map((i) => i.legacyId)).toContain('sc_01');
    for (const i of list) expect(i.status === 'resolved').toBe(i.resolved_at !== null);
  });
});
