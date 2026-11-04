import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildWorkCalendar } from '@/core/dates';
import { deterministicIds, normalizeBlob, type ImportContext, type LegacyBlob } from '@/core/legacy';
import { zonesSchema } from '../domain/schemas';
import { defaultHallId } from '../server/default-hall-ids';
import { legacyImporter } from '../server/legacy-importer';

const blob = normalizeBlob(JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'legacy-venue.json'), 'utf8')));
const ctx: ImportContext = { ids: deterministicIds, calendar: buildWorkCalendar([]), includeDemo: false };
const plan = (b: LegacyBlob = blob, c: ImportContext = ctx) => legacyImporter.plan(b, c);
const rows = (table: string, p = plan()) => p.batches.find((b) => b.table === table)!.rows;
const messages = (p = plan()) => p.issues.map((i) => i.message);
const ev = (id: string) => deterministicIds.eventId(id);

describe('venue legacy importer', () => {
  it('is deterministic, and every zone list it writes passes the app schema', () => {
    expect(plan()).toEqual(plan());
    for (const r of [...rows('sce_tcsk_hall_templates'), ...rows('sce_tcsk_event_halls')]) expect(zonesSchema.safeParse(r.zones).success).toBe(true);
  });

  it('imports templates on the seed ids, drops totalSeats, keeps markup as text and skips a template without zones', () => {
    const templates = rows('sce_tcsk_hall_templates');
    expect(templates.map((t) => t.legacy_id)).toEqual(['hall_ncc', 'hall_custom']);
    expect(templates[0]).toMatchObject({ id: defaultHallId('hall_ncc'), description: 'Đã sửa tại đơn vị' });
    expect(templates[0]).not.toHaveProperty('total_seats');
    expect(templates[0]).not.toHaveProperty('totalSeats');
    expect(templates[1]!.name).toBe('<img src=x onerror=alert(1)> Hội trường riêng');
    expect(plan().issues).toContainEqual(expect.objectContaining({ severity: 'dropped_invalid', blobKey: 'hallTemplates', legacyId: 'hall_empty' }));
  });

  it('renames duplicate and missing prefixes, clamps seat counts, and reports each (m4b BUG-04, BUG-13)', () => {
    const custom = rows('sce_tcsk_hall_templates')[1]!.zones as Array<{ key: string; prefix: string; seatCount: number; color: string; assignedGroup: string; vipZone: boolean }>;
    expect(custom.map((z) => [z.key, z.prefix, z.seatCount, z.color, z.assignedGroup, z.vipZone])).toEqual([
      ['A', 'A-', 10, 'red', 'VIP', true],
      ['C', 'B-', 500, 'slate', 'all', false],
      ['D', 'D-', 1, 'slate', 'all', false],
    ]);
    expect(messages()).toContain('Tiền tố "A-" của khu "Khu C trùng" (hội trường mẫu "<img src=x onerror=alert(1)> Hội trường riêng") bị trùng; đổi thành B-.');
    expect(messages()).toContain('Số ghế "100000" của khu "Khu C trùng" (hội trường mẫu "<img src=x onerror=alert(1)> Hội trường riêng") ngoài khoảng 1 đến 500; đặt 500.');
    const evt1 = rows('sce_tcsk_event_halls').find((h) => h.event_id === ev('evt_1'))!;
    expect((evt1.zones as Array<{ prefix: string }>).map((z) => z.prefix)).toEqual(['A-', 'B-', 'C-']);
  });

  it('links event halls to templates that exist, keeps a deleted template as a private hall, and drops events not imported', () => {
    const halls = rows('sce_tcsk_event_halls');
    expect(halls.find((h) => h.event_id === ev('evt_1'))).toMatchObject({ template_id: deterministicIds.idFor('HallTemplate', 'hall_custom') });
    expect(halls.find((h) => h.event_id === ev('evt_2'))).toMatchObject({ template_id: null });
    expect(halls.some((h) => h.event_id === ev('evt_gone'))).toBe(false);
    expect(plan().issues).toContainEqual(expect.objectContaining({ severity: 'orphan', blobKey: 'eventHallConfig', legacyId: 'evt_gone' }));
    expect(halls.find((h) => h.event_id === ev('evt_nohall'))).toMatchObject({ template_id: defaultHallId('hall_ncc') });
  });

  it('keeps one seat per guest, drops ghost and demo guests, and keeps seats outside the hall as reported orphans', () => {
    const seats = rows('sce_tcsk_seat_assignments');
    expect(seats.map((s) => [s.seat_code, s.guest_id])).toEqual([
      ['A-01', deterministicIds.idFor('Guest', 'g1', 'evt_1')],
      ['B-40', deterministicIds.idFor('Guest', 'g2', 'evt_1')],
      ['A-05', deterministicIds.idFor('Guest', 'g9', 'evt_nohall')],
    ]);
    const m = messages();
    expect(m).toContain('Khách "g1" giữ nhiều ghế; chỉ giữ ghế đầu tiên, bỏ ghế A-02.');
    expect(m).toContain('Mã ghế "X" không hợp lệ; đã bỏ.');
    expect(m).toContain('Ghế C-01 trỏ tới khách "ghost" không có trong danh sách; đã bỏ.');
    expect(m).toContain('Ghế A-03 của khách mẫu "gst_vip_01" không được nhập.');
    expect(m).toContain('Ghế B-40 không có trong sơ đồ hội trường của sự kiện; vẫn nhập để cán bộ giải phóng.');
    expect(plan().issues).toContainEqual(expect.objectContaining({ severity: 'orphan', blobKey: 'eventSeating', legacyId: 'evt_demo' }));
  });

  it('imports booths: demo booths skipped, codes normalized, duplicates renumbered, status and subsidy made valid (m4b BUG-02, BUG-21, BUG-22)', () => {
    const booths = rows('sce_tcsk_booths');
    expect(booths.map((b) => [b.code, b.company, b.status, b.subsidy_percent])).toEqual([
      ['A01', '<img src=x onerror=alert(1)>', 'confirmed', 100],
      ['A02', 'Trùng mã', 'reviewing', 50],
      ['B02', '', 'available', 0],
    ]);
    expect(booths[2]).toMatchObject({ size: '01 gian tiêu chuẩn (9m²)', event_id: ev('evt_2') });
    const m = messages();
    expect(m).toContain('Gian hàng mẫu A01 không được nhập.');
    expect(m).toContain('Mã gian A01 bị trùng; gian "Trùng mã" nhận mã A02.');
    expect(m).toContain('Mã gian "??" không đọc được; đã bỏ.');
    expect(new Set(booths.map((b) => b.id)).size).toBe(3);
  });

  it('imports demo rows with --include-demo', () => {
    const withDemo = plan(blob, { ...ctx, includeDemo: true });
    expect(rows('sce_tcsk_booths', withDemo).map((b) => b.legacy_id)).toContain('bth_01');
    expect(rows('sce_tcsk_booths', withDemo).some((b) => b.event_id === ev('evt_demo'))).toBe(true);
  });
});
