import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { legacyScanKey } from '@/core/checkin-code';
import { buildWorkCalendar, combineVN } from '@/core/dates';
import { deterministicIds, normalizeBlob, type ImportContext, type LegacyBlob } from '@/core/legacy';
import { legacyCheckins, legacyEmailStatuses, legacyGuestIndex, legacyImporter } from '../server/legacy-importer';

const blob = normalizeBlob(JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'legacy-guests.json'), 'utf8')));
const ctx: ImportContext = { ids: deterministicIds, calendar: buildWorkCalendar([]), includeDemo: false };
const plan = (b: LegacyBlob = blob, c: ImportContext = ctx) => legacyImporter.plan(b, c);
const rows = (p = plan()) => p.batches.find((b) => b.table === 'sce_tcsk_guests')!.rows;
const byKey = (key: string) => rows().find((r) => r.legacy_id === key)!;
const issuesOf = (legacyId: string) => plan().issues.filter((i) => i.legacyId === legacyId).map((i) => i.message);
const EVENT = deterministicIds.eventId('evt_real');
const DUP = 'gst_1767000000000_ab12';

describe('guests legacy importer', () => {
  it('imports the real event’s guests, skips demo rows and events, reports orphans, and is deterministic (decision 13, m4a B10)', () => {
    expect(rows().map((r) => r.name)).toEqual(['Lê Văn Một', 'Trần Thị Hai', '<img src=x onerror=alert(1)>', 'Phạm Bốn']);
    expect(rows().every((r) => r.event_id === EVENT)).toBe(true);
    expect(plan().issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'skipped_demo', legacyId: 'gst_vip_01' }),
      expect.objectContaining({ severity: 'skipped_demo', legacyId: 'evt_demo' }),
      expect.objectContaining({ severity: 'orphan', legacyId: 'evt_missing' }),
      expect.objectContaining({ severity: 'dropped_invalid', legacyId: 'gst_noname' }),
      expect.objectContaining({ severity: 'dropped_invalid', legacyId: null }),
    ]));
    expect(plan()).toEqual(plan());
    expect(rows(plan(blob, { ...ctx, includeDemo: true })).map((r) => r.legacy_id)).toContain('gst_vip_01');
  });

  it('gives a colliding legacy id its own uuid scoped by event, and reports it (m4a B42)', () => {
    const [a, b] = [byKey(DUP), byKey(`${DUP}#2`)];
    expect(a.id).toBe(deterministicIds.idFor('Guest', DUP, 'evt_real'));
    expect(b.id).not.toBe(a.id);
    expect(issuesOf(DUP).some((m) => m.includes('bị trùng'))).toBe(true);
  });

  it('maps fields and leaves checkin_code and seats to the database and venue', () => {
    expect(byKey(DUP)).toEqual({
      id: deterministicIds.idFor('Guest', DUP, 'evt_real'), event_id: EVENT, legacy_id: DUP, name: 'Lê Văn Một', guest_group: 'SoNganh', title: 'Giám đốc',
      organization: 'Sở Ngoại vụ', phone: '0912.000.001', email: 'mot@hanoi.gov.vn', send_method: 'ems', invite_status: 'received', rsvp_status: 'confirmed',
      rsvp_source: 'import', rsvp_at: null, substitute_name: '', has_banquet: true, notes: 'Đón cửa A',
    });
    expect(byKey('gst_sub')).toMatchObject({ phone: '912345678', rsvp_status: 'substituted', substitute_name: 'Vũ Năm - Phó Giám đốc' });
  });

  it('reads legacy free text and unparseable values leniently, and reports each coercion', () => {
    expect(byKey(`${DUP}#2`)).toMatchObject({ guest_group: 'DoanhNghiep', send_method: 'direct', invite_status: 'pending', rsvp_status: 'pending', has_banquet: true });
    expect(issuesOf(`${DUP}#2`).join('\n')).toMatch(/BanToChuc[\s\S]*maybe/);
    expect(byKey('gst_sub').send_method).toBe('direct');
    expect(issuesOf('gst_sub')).toEqual([expect.stringContaining('carrier pigeon')]);
    const gf = byKey('GF-abc-1');
    expect(gf).toMatchObject({ email: null, rsvp_status: 'declined', rsvp_source: 'google_form', rsvp_at: null, substitute_name: '', notes: 'Ghi chú cũ về người thay: Đi thay cho: Ông B' });
    expect(issuesOf('GF-abc-1').join('\n')).toMatch(/khong-hop-le[\s\S]*15\/11\/2026/);
  });

  it('keeps markup and formula text as plain text: escaping is the renderer’s and the exporter’s job', () => {
    expect(byKey('GF-abc-1')).toMatchObject({ name: '<img src=x onerror=alert(1)>', organization: "=cmd|' /C calc'!A0" });
  });

  it('reports when the guest’s seatCode, assignedSeat and eventSeating disagree; eventSeating stays the source (design key mapping)', () => {
    const gf = issuesOf('GF-abc-1').join('\n');
    expect(gf).toContain('seatCode A-05, assignedSeat A-06');
    expect(gf).toContain('Ghế A-05 trên hồ sơ "<img src=x onerror=alert(1)>" không khớp sơ đồ chỗ ngồi (A-07)');
    expect(issuesOf(`${DUP}#2`).join('\n')).toContain('Ghế C-09');
    expect(issuesOf(DUP).some((m) => m.includes('không khớp'))).toBe(false);
    expect(byKey(DUP)).not.toHaveProperty('seat_code');
  });

  it('exposes the guest index, check-ins and email results for venue, live and comms importers', () => {
    const index = legacyGuestIndex(blob, ctx);
    expect(index.get(legacyScanKey('evt_real', DUP))).toBe(byKey(DUP).id);
    expect(index.get(legacyScanKey('evt_real', 'gst_vip_01'))).toBeUndefined();
    expect(legacyCheckins(blob, ctx)).toEqual([{
      eventId: EVENT, guestId: byKey(DUP).id, legacyGuestId: DUP, checkedInAt: combineVN('2026-12-15' as never, '08:15' as never), checkedInAtCoerced: true, giftGiven: true, staff: 'Cán bộ X',
    }]);
    expect(legacyEmailStatuses(blob, ctx)).toEqual([
      { eventId: EVENT, guestId: byKey(DUP).id, status: 'sent', sentAt: '2026-11-01T02:00:00.000Z', error: '' },
      { eventId: EVENT, guestId: byKey('GF-abc-1').id, status: 'error', sentAt: null, error: 'HTTP 401' },
    ]);
  });
});
