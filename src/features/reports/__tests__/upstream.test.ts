import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId } from '@/core/brand';
import { ISSUE, admin, harness, head } from './harness';

const missing = vi.hoisted(() => ({ roster: false }));
vi.mock('@/features/guests/server', async (original) => {
  const real = await original<typeof import('@/features/guests/server')>();
  return {
    ...real,
    readRoster: (...args: Parameters<typeof real.readRoster>) => {
      if (missing.roster) throw new Error('not implemented');
      return real.readRoster(...args);
    },
  };
});
afterEach(() => {
  missing.roster = false;
});

describe('an upstream feature that is not ready', () => {
  it('reads as "chưa sẵn sàng" with its name, never as zero guests', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    missing.roster = true;
    const { sourcesOf, missingSources } = await import('../server/upstream');
    const s = await sourcesOf(h.ctx(admin), eventId);
    expect(s.roster).toEqual({ ready: false });
    expect(s.plan.ready && s.booths.ready).toBe(true);
    expect(missingSources(s)).toEqual(['Khách mời']);
  });

  it('refuses to issue, writing nothing', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    missing.roster = true;
    const before = h.audits().length;
    const r = await h.run(head, 'reports.issueDailyReport', { eventId, id: newId<'DailyReport'>(), draft: ISSUE });
    expect(r).toMatchObject({ ok: false, kind: 'conflict', message: 'Chức năng phát hành báo cáo chưa sẵn sàng: chưa đọc được số liệu Khách mời. Vui lòng thử lại sau.' });
    expect(h.rows('sce_tcsk_daily_reports')).toEqual([]);
    expect(h.audits()).toHaveLength(before);
  });

  it('passes any other failure through', async () => {
    const h = harness();
    const { sourcesOf } = await import('../server/upstream');
    const broken = { ...h.ctx(admin), db: { ...h.ctx(admin).db, table: () => { throw new Error('boom'); } } } as never;
    await expect(sourcesOf(broken, newId<'Event'>())).rejects.toThrow('boom');
  });
});
