import { describe, expect, it } from 'vitest';
import { newId, type ContactId, type Email } from '@/core/brand';
import { MAX_CHUNK_ROWS, chunkBySize, jsonBytes } from '../domain/chunks';
import type { ContactDraft } from '../domain/schemas';
import { admin, cid, draft, harness } from './harness';

/** Next refuses a server-action body over 1 MB; a chunk keeps well under it. */
const BODY_BOUND = 700_000;

const longest = (i: number): ContactDraft => ({
  name: `Đại biểu ${i} `.padEnd(200, 'ộ'),
  group: 'DoanhNghiep',
  title: 'ữ'.repeat(300),
  organization: `Công ty ${i} `.padEnd(300, 'ặ'),
  phone: '0912.345.678',
  email: `${'a'.repeat(60)}${i}@example.com` as Email,
  address: 'ừ'.repeat(500),
  taxCode: 'ẫ'.repeat(100),
  notes: 'ệ'.repeat(2000),
  hasBanquet: true,
});

describe('a large import or bulk delete is sent in chunks a server action accepts (Next 1 MB body cap)', () => {
  it('splits 2000 worst-case rows so every importCsv request is under the bound, in order and complete', () => {
    const items = Array.from({ length: 2000 }, (_, i) => ({ id: newId<'MasterContact'>() as ContactId, draft: longest(i) }));
    const chunks = chunkBySize(items);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(MAX_CHUNK_ROWS);
      expect(jsonBytes(['directory.importCsv', { items: chunk }])).toBeLessThan(BODY_BOUND);
    }
    expect(chunks.flat()).toEqual(items);
  });

  it('splits a bulk delete by what its undo carries back, so the restore of each chunk is under the bound too', () => {
    const contacts = Array.from({ length: 2000 }, (_, i) => ({ id: cid(), version: 1, draft: longest(i) }));
    const chunks = chunkBySize(contacts, (c) => jsonBytes({ id: c.id, draft: c.draft }));
    for (const chunk of chunks) {
      expect(jsonBytes(['directory.deleteMany', { items: chunk.map((c) => ({ id: c.id, version: c.version })) }])).toBeLessThan(BODY_BOUND);
      expect(jsonBytes(['directory.restore', { contacts: chunk.map((c) => ({ id: c.id, draft: c.draft })) }])).toBeLessThan(BODY_BOUND);
    }
    expect(chunks.flat()).toHaveLength(2000);
  });

  it('sends ordinary rows in chunks of the row cap', () => {
    const items = Array.from({ length: 1200 }, (_, i) => ({ id: cid(), draft: draft({ name: `Khách ${i}`, organization: 'Sở A' }) }));
    expect(chunkBySize(items).map((c) => c.length)).toEqual([MAX_CHUNK_ROWS, MAX_CHUNK_ROWS, 1200 - 2 * MAX_CHUNK_ROWS]);
  });

  it('the server refuses a chunk over the row cap for importCsv, deleteMany and restore', async () => {
    const h = harness();
    const over = MAX_CHUNK_ROWS + 1;
    expect(await h.run(admin, 'directory.importCsv', { items: Array.from({ length: over }, () => ({ id: cid(), draft: draft() })) })).toMatchObject({ ok: false, kind: 'invalid' });
    expect(await h.run(admin, 'directory.deleteMany', { items: Array.from({ length: over }, () => ({ id: cid(), version: 1 as never })) })).toMatchObject({ ok: false, kind: 'invalid' });
    expect(await h.run(admin, 'directory.restore', { contacts: Array.from({ length: over }, () => ({ id: cid(), draft: draft() })) })).toMatchObject({ ok: false, kind: 'invalid' });
  });
});
