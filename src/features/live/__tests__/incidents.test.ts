import { describe, expect, it } from 'vitest';
import { newId, type EventId, type IncidentId } from '@/core/brand';
import type { CommandResult, OutputOf } from '@/core/commands';
import { incidentCode, sortIncidents } from '../domain/incidents';
import type { IncidentDraft } from '../domain/schemas';
import { desk, harness, interleave } from './harness';

const draft = (description: string, urgency: IncidentDraft['urgency'] = 'high'): IncidentDraft => ({ location: 'Sân khấu / Bục phát biểu', urgency, description, assignee: '' });

async function setup() {
  const h = harness();
  const eventId = await h.createEvent();
  const report = (d: IncidentDraft, id: IncidentId = newId<'Incident'>()) => h.ok(desk, 'live.createIncident', { eventId, id, draft: d });
  return { h, eventId, report };
}

describe('incident codes', () => {
  it('count per event: two events each start at SC-01', async () => {
    const { h, eventId, report } = await setup();
    await report(draft('Mất micro'));
    await report(draft('Màn hình LED lỗi'));
    const elsewhere: EventId = await h.createEvent();
    await h.ok(desk, 'live.createIncident', { eventId: elsewhere, id: newId<'Incident'>(), draft: draft('Mất điện') });
    expect((await h.incidents(eventId)).map((i) => incidentCode(i.seq))).toEqual(['SC-01', 'SC-02']);
    expect((await h.incidents(elsewhere)).map((i) => incidentCode(i.seq))).toEqual(['SC-01']);
  });

  it('two desks reporting at once get two codes, never one twice', async () => {
    const { h, eventId } = await setup();
    let inner: CommandResult<OutputOf<'live.createIncident'>> | null = null;
    const outer = await h.runWith(desk, (db) => interleave(db, 'sce_tcsk_incidents', 'insert', async () => {
      inner = await h.run(desk, 'live.createIncident', { eventId, id: newId<'Incident'>(), draft: draft('Báo từ bàn 2') });
    }), 'live.createIncident', { eventId, id: newId<'Incident'>(), draft: draft('Báo từ bàn 1') });
    expect(inner).toMatchObject({ ok: true, value: { seq: 1 } });
    expect(outer).toMatchObject({ ok: true, value: { seq: 2 } });
    expect((await h.incidents(eventId)).map((i) => i.seq)).toEqual([1, 2]);
  });

  it('a retried report with the same id is the same incident', async () => {
    const { h, eventId, report } = await setup();
    const id = newId<'Incident'>();
    await report(draft('Mất micro'), id);
    await report(draft('Mất micro'), id);
    expect(await h.incidents(eventId)).toHaveLength(1);
  });

  it('a new code is one above the highest, so an undone report in the middle leaves no duplicate (m5 BUG-28)', async () => {
    const { h, report } = await setup();
    await report(draft('1'));
    const two = await report(draft('2'));
    await report(draft('3'));
    await h.undo(desk, two.inverse);
    const four = await report(draft('4'));
    expect(four.value.seq).toBe(4);
  });
});

describe('incident lifecycle', () => {
  it('open -> in progress -> resolved with the default note, reopen clears the resolution, undo walks back', async () => {
    const { h, eventId, report } = await setup();
    const r = await report(draft('Mất micro'));
    const { id } = r.value;
    const p = await h.ok(desk, 'live.setIncidentStatus', { eventId, id, version: r.value.version, status: 'in_progress', note: '' });
    const s = await h.ok(desk, 'live.setIncidentStatus', { eventId, id, version: p.value.version, status: 'resolved', note: '' });
    expect(s.value).toMatchObject({ status: 'resolved', resolutionNote: 'Đã kiểm tra và xử lý thành công.' });
    expect(s.value.resolvedAt).not.toBeNull();
    expect(h.audits().at(-1)).toMatchObject({ action: 'XỬ LÝ SỰ CỐ', summary: 'Sự cố SC-01 đã khắc phục: Đã kiểm tra và xử lý thành công.' });
    await h.undo(desk, s.inverse);
    expect((await h.incidents(eventId))[0]).toMatchObject({ status: 'in_progress', resolvedAt: null, resolutionNote: '' });
  });

  it('refuses a change the lifecycle has no arrow for, and a stale version', async () => {
    const { h, eventId, report } = await setup();
    const r = await report(draft('Mất micro'));
    expect(await h.run(desk, 'live.setIncidentStatus', { eventId, id: r.value.id, version: r.value.version, status: 'open', note: '' })).toMatchObject({ ok: false, kind: 'conflict' });
    await h.ok(desk, 'live.setIncidentStatus', { eventId, id: r.value.id, version: r.value.version, status: 'resolved', note: 'Đã thay mic' });
    expect(await h.run(desk, 'live.setIncidentStatus', { eventId, id: r.value.id, version: r.value.version, status: 'in_progress', note: '' })).toMatchObject({ ok: false, kind: 'conflict' });
  });

  it('the undo of a report is refused once someone acted on it', async () => {
    const { h, eventId, report } = await setup();
    const r = await report(draft('Mất micro'));
    await h.ok(desk, 'live.setIncidentStatus', { eventId, id: r.value.id, version: r.value.version, status: 'in_progress', note: '' });
    expect(await h.undo(desk, r.inverse)).toMatchObject({ ok: false, kind: 'conflict' });
    expect(await h.incidents(eventId)).toHaveLength(1);
  });

  it('deleting is refused for an incident someone acted on, even when the caller sends its current version (review M23)', async () => {
    const { h, eventId, report } = await setup();
    const r = await report(draft('Mất micro'));
    const working = await h.ok(desk, 'live.setIncidentStatus', { eventId, id: r.value.id, version: r.value.version, status: 'in_progress', note: '' });
    expect(await h.run(desk, 'live.deleteIncident', { eventId, id: r.value.id, version: working.value.version })).toMatchObject({ ok: false, kind: 'conflict' });
    const reopened = await h.ok(desk, 'live.setIncidentStatus', { eventId, id: r.value.id, version: working.value.version, status: 'open', note: '' });
    expect(reopened.value.status).toBe('open');
    expect(await h.run(desk, 'live.deleteIncident', { eventId, id: r.value.id, version: reopened.value.version })).toMatchObject({ ok: false, kind: 'conflict' });
    expect(await h.incidents(eventId)).toHaveLength(1);
  });

  it('the assignee stays empty unless given: no seeded person is assigned (m5 BUG-27)', async () => {
    const { report } = await setup();
    expect((await report(draft('Mất micro'))).value.assignee).toBe('');
  });

  it('sorts open first, then urgency, then newest', () => {
    const base = { reportedAt: '2026-12-15T01:00:00.000Z' as never };
    const list = [
      { seq: 1, status: 'resolved', urgency: 'high', ...base },
      { seq: 2, status: 'open', urgency: 'low', ...base },
      { seq: 3, status: 'in_progress', urgency: 'high', ...base },
      { seq: 4, status: 'open', urgency: 'high', reportedAt: '2026-12-15T02:00:00.000Z' as never },
    ] as const;
    expect(sortIncidents(list).map((i) => i.seq)).toEqual([4, 3, 2, 1]);
  });
});
