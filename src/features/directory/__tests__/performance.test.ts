import { describe, expect, it } from 'vitest';
import { newId, type ContactId, type Email } from '@/core/brand';
import type { MasterContact } from '../contract';
import { previewContactImport } from '../domain/csv-import';
import { serializeCsv } from '../domain/csv';
import { CONTACT_CSV_COLUMNS } from '../domain/csv-import';
import { buildIndex, rankContacts } from '../domain/search';
import { admin, draft, harness } from './harness';

const GIVEN = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Đặng', 'Vũ', 'Bùi'];
const LAST = ['An', 'Bình', 'Chi', 'Dũng', 'Hà', 'Khánh', 'Lan', 'Minh', 'Nam', 'Quang'];
const contacts = (n: number): MasterContact[] =>
  Array.from({ length: n }, (_, i) => ({
    id: newId<'MasterContact'>() as ContactId, name: `${GIVEN[i % 8]} Văn ${LAST[(i >> 3) % 10]} ${i}`, group: (['VIP', 'SoNganh', 'DoanhNghiep', 'QuocTe', 'BaoChi'] as const)[i % 5]!,
    title: i % 3 ? 'Giám đốc' : '', organization: `Công ty ${i % 200}`, phone: `09${String(10000000 + i)}`, email: `k${i}@example.com` as Email, address: '', taxCode: '', notes: '', hasBanquet: false,
    updatedAt: '' as never, version: 1 as never,
  }));

// Bounds are several times what a laptop needs, to catch a quadratic loop and not a slow machine.
describe('big lists', () => {
  it('searches 5000 contacts: one index, then 100 queries', () => {
    const list = contacts(5000);
    const started = performance.now();
    const index = buildIndex(list);
    const builtMs = performance.now() - started;
    let found = 0;
    for (let i = 0; i < 100; i++) found += rankContacts(index, ['nguyen', 'tran van binh', 'cong ty 17', '0910', 'dung'][i % 5]!, { limit: 8 }).total;
    const totalMs = performance.now() - started;
    expect(found).toBeGreaterThan(0);
    expect(builtMs).toBeLessThan(1500);
    expect(totalMs).toBeLessThan(4000);
  });

  it('previews a 2000-row CSV', () => {
    const rows = contacts(2000);
    const csv = serializeCsv(rows, CONTACT_CSV_COLUMNS);
    return csv.text().then((text) => {
      const started = performance.now();
      const preview = previewContactImport(text, { defaultGroup: 'VIP', existingKeys: new Set() });
      const ms = performance.now() - started;
      expect(preview.error).toBeNull();
      expect(preview.counts).toMatchObject({ total: 2000, created: 2000, invalid: 0 });
      expect(ms).toBeLessThan(5000);
    });
  });

  it('commits a 2000-row import into 3000 existing contacts', async () => {
    const h = harness();
    const existing = contacts(3000).map((c, i) => ({ id: c.id, draft: draft({ name: c.name, organization: c.organization, email: c.email, phone: c.phone, group: c.group, hasBanquet: i % 2 === 0 }) }));
    for (let i = 0; i < existing.length; i += 2000) await h.ok(admin, 'directory.importCsv', { items: existing.slice(i, i + 2000) });
    // 1000 of the batch are the people already there, 1000 are new.
    const items = [...existing.slice(0, 1000), ...contacts(1000).map((c) => ({ id: c.id, draft: draft({ name: `Mới ${c.name}`, organization: c.organization, email: `moi.${c.email}` as Email }) }))];
    const started = performance.now();
    const r = await h.ok(admin, 'directory.importCsv', { items });
    const ms = performance.now() - started;
    expect(r.value).toEqual({ created: 1000, skipped: 1000 });
    expect(ms).toBeLessThan(15_000);
  }, 120_000);

  it('answers a ranked search over 5000 stored contacts', async () => {
    const h = harness();
    const rows = contacts(5000);
    for (let i = 0; i < rows.length; i += 2000) {
      await h.ok(admin, 'directory.importCsv', { items: rows.slice(i, i + 2000).map((c) => ({ id: c.id, draft: draft({ name: c.name, organization: c.organization, email: c.email, phone: c.phone, group: c.group }) })) });
    }
    const started = performance.now();
    const r = await h.ok(admin, 'directory.search', { q: 'nguyen van an' });
    expect(performance.now() - started).toBeLessThan(5000);
    expect(r.value.length).toBeGreaterThan(0);
    expect(r.value.every((c) => c.name.startsWith('Nguyễn Văn An'))).toBe(true);
  }, 120_000);
});
