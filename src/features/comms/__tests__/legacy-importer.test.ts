import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildWorkCalendar } from '@/core/dates';
import { deterministicIds, normalizeBlob, type ImportContext } from '@/core/legacy';
import { legacyImporter } from '../server/legacy-importer';

const blob = normalizeBlob(JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'legacy-comms.json'), 'utf8')));
const ctx: ImportContext = { ids: deterministicIds, calendar: buildWorkCalendar([]), includeDemo: false };
const plan = (c: ImportContext = ctx) => legacyImporter.plan(blob, c);
const rows = (table: string, c: ImportContext = ctx) => plan(c).batches.find((b) => b.table === table)!.rows;
const messages = () => plan().issues.map((i) => `${i.severity} ${i.legacyId}: ${i.message}`);

describe('comms legacy importer', () => {
  it('imports unit mailboxes: seed entries skipped while unchanged, invalid and duplicate addresses dropped, one default', () => {
    expect(rows('sce_tcsk_sender_mailboxes').map((r) => [r.legacy_id, r.email, r.display_name, r.client_id, r.is_default])).toEqual([
      ['gmail_cfg_2', 'xuctiendautu.hanoi@gmail.com', 'Hòm thư Xúc Tiến Đầu Tư Hà Nội', '987654-abcdef.apps.googleusercontent.com', true],
      ['gmail_cfg_1700000000000', 'ptdn@example.vn', 'Hòm thư Phòng PTDN', null, false],
    ]);
    expect(messages()).toEqual(expect.arrayContaining([
      expect.stringMatching(/^skipped_demo gmail_cfg_1: /),
      expect.stringMatching(/^dropped_invalid gmail_cfg_dup: .*trùng email ptdn@example.vn/),
      expect.stringMatching(/^dropped_invalid gmail_cfg_bad: /),
      expect.stringMatching(/^coerced gmail_cfg_1700000000000: Client ID không hợp lệ/),
    ]));
    expect(rows('sce_tcsk_sender_mailboxes', { ...ctx, includeDemo: true }).map((r) => r.legacy_id)).toContain('gmail_cfg_1');
  });

  it('imports Google Form settings per imported event, keeping the tab and refusing unsafe links', () => {
    const forms = rows('sce_tcsk_rsvp_forms');
    expect(forms).toEqual([
      expect.objectContaining({
        event_id: deterministicIds.eventId('evt_real'),
        form_url: 'https://forms.gle/abcXYZ123',
        sheet_csv_url: 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/export?format=csv&gid=42',
        auto_sync: true,
        auto_add_new_guests: true,
        last_sync_at: '2026-11-01T03:00:00.000Z',
      }),
      expect.objectContaining({ event_id: deterministicIds.eventId('evt_bad_links'), form_url: null, sheet_csv_url: null, auto_add_new_guests: false }),
    ]);
    expect(forms.some((f) => 'form_responses_count' in f)).toBe(false);
    expect(messages().filter((m) => m.startsWith('coerced evt_bad_links'))).toHaveLength(2);
  });

  it('imports email results as flagged legacy rows: no Gmail id, one per address per event, and never "idle"', () => {
    const deliveries = rows('sce_tcsk_email_deliveries');
    expect(deliveries.map((d) => [d.email, d.status, d.imported, d.provider_message_id, d.error])).toEqual([
      ['mot@hanoi.gov.vn', 'sent', true, null, null],
      ['hai@congty.vn', 'error', true, null, 'HTTP 401'],
    ]);
    expect(new Set(deliveries.map((d) => d.campaign_id)).size).toBe(1);
    expect(messages()).toEqual(expect.arrayContaining([expect.stringContaining('cùng email hai@congty.vn'), expect.stringContaining('không có email hợp lệ')]));
  });

  it('is deterministic, so a re-run upserts the same ids', () => {
    expect(plan()).toEqual(plan());
  });
});
