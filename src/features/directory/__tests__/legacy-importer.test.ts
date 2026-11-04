import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildWorkCalendar } from '@/core/dates';
import { memoryDb } from '@/core/db';
import { deterministicIds, normalizeBlob, type ImportContext, type LegacyBlob } from '@/core/legacy';
import { testActor } from '@/core/testing/actors';
import { searchTextOf } from '../domain/search';
import { legacyImporter } from '../server/legacy-importer';
import { searchContacts } from '../server/reads';
import { NOW, SETTINGS } from './harness';

const blob = normalizeBlob(JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'legacy-master.json'), 'utf8')));
const ctx: ImportContext = { ids: deterministicIds, calendar: buildWorkCalendar([]), includeDemo: false };
const plan = (b: LegacyBlob = blob, c: ImportContext = ctx) => legacyImporter.plan(b, c);
const rows = (p = plan()) => p.batches.find((b) => b.table === 'sce_tcsk_master_contacts')?.rows ?? [];
const byLegacy = (id: string) => rows().find((r) => r.legacy_id === id)!;
const issuesOf = (id: string | null) => plan().issues.filter((i) => i.legacyId === id);

describe('directory legacy importer', () => {
  it('declares the key it reads and the table it writes', () => {
    expect(legacyImporter).toMatchObject({ feature: 'directory', dependsOn: ['core'] });
    expect(plan().batches.map((b) => b.table)).toEqual(['sce_tcsk_master_contacts']);
  });

  it('skips the seed records the legacy app wrote by itself, and keeps the ones an admin edited (decision 13, m4c B29)', () => {
    expect(rows().map((r) => r.legacy_id)).not.toContain('mdb_vip_01');
    expect(issuesOf('mdb_vip_01')).toEqual([expect.objectContaining({ severity: 'skipped_demo' })]);
    expect(byLegacy('mdb_sn_02')).toMatchObject({ name: 'Giám đốc Sở Đã Sửa', updated_at: '2026-08-01T03:00:00.000Z' });
    expect(issuesOf('mdb_sn_02')).toEqual([expect.objectContaining({ severity: 'coerced', message: expect.stringContaining('đã được Admin chỉnh sửa') })]);
    expect(rows(plan(blob, { ...ctx, includeDemo: true })).map((r) => r.legacy_id)).toContain('mdb_vip_01');
  });

  it('maps every field to its column, lowercases the email, and gives the id by uuid v5 of the legacy id', () => {
    expect(byLegacy('mdb_dn_1767000000000')).toEqual({
      id: deterministicIds.idFor('MasterContact', 'mdb_dn_1767000000000'), legacy_id: 'mdb_dn_1767000000000', name: 'Trần Thị Doanh', guest_group: 'DoanhNghiep', title: 'Tổng giám đốc',
      organization: 'Công ty ABC', phone: '0988111222', email: 'doanh@example.com', address: 'Số 1 Phố X', tax_code: '0100123456', notes: 'Khách quen', has_banquet: false,
      search_text: 'tran thi doanh tong giam doc cong ty abc 0988111222 doanh@example.com', updated_at: '2026-09-01T03:00:00.000Z',
    });
  });

  it('keeps the first of two records of one person and says which it dropped, by email and by name and organization', () => {
    const ids = rows().map((r) => r.legacy_id);
    expect(ids).toContain('mdb_dn_1767000000000');
    expect(ids).not.toContain('mdb_dn_1767000000001');
    expect(issuesOf('mdb_dn_1767000000001')[0]).toMatchObject({ severity: 'dropped_invalid', message: expect.stringContaining('trùng với đối tượng mdb_dn_1767000000000') });
    expect(ids).toContain('mdb_dn_1767000000002');
    expect(ids).not.toContain('mdb_dn_1767000000003');
  });

  it('clears an unparseable email or phone but keeps the original text in the notes, and reports it', () => {
    expect(byLegacy('mdb_bc_1767000000005')).toMatchObject({ email: null, phone: '', notes: 'Email gốc: khong-phai-email\nĐiện thoại gốc: gọi anh Ba' });
    expect(issuesOf('mdb_bc_1767000000005').map((i) => i.severity)).toEqual(['coerced', 'coerced']);
  });

  it('puts an unknown group under Doanh nghiệp and an unusable banquet value to false, with a report', () => {
    expect(byLegacy('mdb_qt_1767000000004')).toMatchObject({ guest_group: 'DoanhNghiep', has_banquet: false });
    expect(issuesOf('mdb_qt_1767000000004')).toEqual([expect.objectContaining({ severity: 'coerced', message: expect.stringContaining('Nhóm "Khác"') })]);
  });

  it('drops records without a name, an organization or an id, repeated ids, and non-objects', () => {
    for (const id of ['mdb_bc_1767000000006', 'mdb_bc_1767000000007']) {
      expect(rows().map((r) => r.legacy_id)).not.toContain(id);
      expect(issuesOf(id)[0]).toMatchObject({ severity: 'dropped_invalid' });
    }
    expect(issuesOf('mdb_dn_1767000000000').some((i) => i.message.includes('bị trùng'))).toBe(true);
    expect(issuesOf(null).map((i) => i.message)).toEqual(['Đối tượng thứ 13 không có mã.', 'Mục thứ 14 của CSDL khách mời không hợp lệ.']);
    expect(rows().map((r) => r.name)).not.toContain('Trùng mã');
  });

  it('imports a hostile record verbatim as data, never as markup', () => {
    expect(byLegacy('mdb_bc_1767000000008')).toMatchObject({ name: '<img src=x onerror=alert(1)>', organization: '<script>alert(2)</script>', notes: '=HYPERLINK("http://evil","x")' });
  });

  it('is deterministic and imports nothing from an absent or empty key', () => {
    expect(plan()).toEqual(plan());
    for (const v of [undefined, [], null, 'x', {}]) expect(plan(normalizeBlob({ events: [], masterGuestDb: v })).batches).toEqual([]);
  });

  it('plans rows that parse back through the table, searchable by the stored search_text', async () => {
    const stamped = rows().map((r) => ({ version: 1, created_at: NOW, created_by: null, updated_by: null, updated_at: NOW, ...r }));
    const admin = testActor('admin', null);
    const seed = { sce_tcsk_master_contacts: stamped, sce_tcsk_audit_logs: [] };
    const rctx = { actor: admin, db: memoryDb(seed, admin), settings: SETTINGS, calendar: buildWorkCalendar([]), now: NOW };
    const all = await searchContacts(rctx, { q: '' });
    expect(all.total).toBe(rows().length);
    expect((await searchContacts(rctx, { q: 'tran thi doanh' })).items.map((c) => c.name)).toEqual(['Trần Thị Doanh']);
    expect((await searchContacts(rctx, { q: 'sở ngoại vụ' })).items[0]).toMatchObject({ name: 'Giám đốc Sở Đã Sửa', updatedAt: '2026-08-01T03:00:00.000Z' });
    for (const r of rows()) expect(r.search_text).toBe(searchTextOf({ name: r.name as string, title: r.title as string, organization: r.organization as string, phone: r.phone as string, email: r.email as never }));
  });
});
