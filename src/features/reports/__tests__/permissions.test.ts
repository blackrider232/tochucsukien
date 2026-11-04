import { describe, expect, it } from 'vitest';
import { newId, type EventId, type Version } from '@/core/brand';
import type { CommandId, InputOf } from '@/core/commands';
import { can } from '@/core/permissions';
import { testActor } from '@/core/testing/actors';
import { readEvent } from '@/features/progress/server';
import { reportsScreen } from '../server/screen-data';
import { admin, harness, head, ISSUE, outsider, staff } from './harness';

const V1 = 1 as Version;
const clip = { outlet: 'Báo A', title: 'Tin A', publishedOn: '2026-12-01', mediaType: 'Báo điện tử', url: null, author: '' } as never;
const press = { title: 'TCBC', timing: 'before', contact: '', content: 'Nội dung' } as const;

/** One valid input per verb, against rows that exist in the event. */
async function world() {
  const h = harness();
  const eventId = await h.createEvent();
  const c = await h.ok(admin, 'reports.createClipping', { eventId, id: newId<'MediaClipping'>(), draft: clip });
  const p = await h.addPackage(eventId, 'TB-1', 100, null);
  const pr = await h.ok(admin, 'reports.createPressRelease', { eventId, id: newId<'PressRelease'>(), draft: press });
  const inputs: { [K in CommandId as K extends `reports.${string}` ? K : never]: InputOf<K> } = {
    'reports.createClipping': { eventId, id: newId<'MediaClipping'>(), draft: clip },
    'reports.updateClipping': { eventId, id: c.value.id, version: V1, draft: clip },
    'reports.deleteClipping': { eventId, id: c.value.id, version: V1 },
    'reports.createPackage': { eventId, id: newId<'BiddingPackage'>(), draft: h.packageDraft('TB-2', 100, null) },
    'reports.updatePackage': { eventId, id: p.value.id, version: V1, draft: h.packageDraft('TB-1', 100, 50) },
    'reports.deletePackage': { eventId, id: p.value.id, version: V1 },
    'reports.createPressRelease': { eventId, id: newId<'PressRelease'>(), draft: press },
    'reports.updatePressRelease': { eventId, id: pr.value.id, version: V1, draft: { ...press, title: 'Sửa' } },
    'reports.deletePressRelease': { eventId, id: pr.value.id, version: V1 },
    'reports.issueDailyReport': { eventId, id: newId<'DailyReport'>(), draft: ISSUE },
  };
  return { h, eventId, inputs };
}

const TABLES = ['sce_tcsk_media_clippings', 'sce_tcsk_bidding_packages', 'sce_tcsk_press_releases', 'sce_tcsk_daily_reports'];
const snapshot = (h: ReturnType<typeof harness>) => JSON.stringify([...TABLES.map((t) => h.rows(t)), h.audits()]);

describe('every reports command refuses another department, and writes nothing', () => {
  const verbs = [
    'reports.createClipping', 'reports.updateClipping', 'reports.deleteClipping', 'reports.createPackage', 'reports.updatePackage', 'reports.deletePackage',
    'reports.createPressRelease', 'reports.updatePressRelease', 'reports.deletePressRelease', 'reports.issueDailyReport',
  ] as const;

  it.each(verbs)('%s, through RLS', async (verb) => {
    const { h, inputs } = await world();
    const before = snapshot(h);
    const r = await h.run(outsider, verb, inputs[verb] as never);
    expect(r.ok).toBe(false);
    expect(snapshot(h)).toBe(before);
  });

  it.each(verbs)('%s, with RLS bypassed: the command\'s own authorize refuses', async (verb) => {
    const { h, inputs } = await world();
    const before = snapshot(h);
    expect(await h.runWithoutRls(outsider, verb, inputs[verb] as never)).toMatchObject({ ok: false, kind: 'forbidden' });
    expect(snapshot(h)).toBe(before);
  });

  it.each(verbs.filter((v) => v !== 'reports.issueDailyReport'))('%s is open to a chuyên viên of the event department', async (verb) => {
    const { h, inputs } = await world();
    expect((await h.run(staff, verb, inputs[verb] as never)).ok).toBe(true);
  });
});

describe('issuing is the lead department\'s: its head signs (decision 17)', () => {
  async function supported() {
    const h = harness();
    const eventId = await h.createEvent({ supportingDepartments: [outsider.profile.department!] });
    return { h, eventId };
  }
  const issueInput = (eventId: EventId) => ({ eventId, id: newId<'DailyReport'>(), draft: ISSUE });

  it('the head of a supporting department is refused, through RLS and by the command itself, and nothing is written', async () => {
    const { h, eventId } = await supported();
    const before = snapshot(h);
    expect(await h.run(outsider, 'reports.issueDailyReport', issueInput(eventId))).toMatchObject({ ok: false, kind: 'forbidden' });
    expect(await h.runWithoutRls(outsider, 'reports.issueDailyReport', issueInput(eventId))).toMatchObject({ ok: false, kind: 'forbidden' });
    expect(snapshot(h)).toBe(before);
  });

  it('the supporting department still edits the event\'s clippings; the lead department head issues', async () => {
    const { h, eventId } = await supported();
    expect((await h.run(outsider, 'reports.createClipping', { eventId, id: newId<'MediaClipping'>(), draft: clip })).ok).toBe(true);
    expect((await h.run(head, 'reports.issueDailyReport', issueInput(eventId))).ok).toBe(true);
  });

  it('the screen offers the issue form to the lead department head only', async () => {
    const { h, eventId } = await supported();
    const event = (await readEvent(h.ctx(admin), eventId))!;
    expect((await reportsScreen(h.ctx(outsider), event)).can).toEqual({ write: true, issue: false });
    expect((await reportsScreen(h.ctx(head), event)).can).toEqual({ write: true, issue: true });
    expect((await reportsScreen(h.ctx(staff), event)).can).toEqual({ write: true, issue: false });
  });
});

describe('the matrix (design RBAC table, decision 17)', () => {
  const scope = { departments: ['Phòng Xúc tiến đầu tư' as const] };
  it.each([
    ['admin', null, true, true],
    ['leader', null, true, true],
    ['dept_leader', 'Phòng Xúc tiến đầu tư', true, true],
    ['dept_leader', 'Phòng Phát triển doanh nghiệp', false, false],
    ['user', 'Phòng Xúc tiến đầu tư', true, false],
  ] as const)('%s of %s: write %s, issue %s', (role, dept, write, issue) => {
    const actor = testActor(role, dept);
    expect(can(actor, 'reports.write', scope)).toBe(write);
    expect(can(actor, 'reports.read', scope)).toBe(write);
    expect(can(actor, 'reports.issue', scope)).toBe(issue);
  });
});

describe('reads go through RLS', () => {
  it('another department sees none of the event\'s report rows', async () => {
    const { h, eventId } = await world();
    await h.issue(admin, eventId);
    const ctx = h.ctx(outsider);
    const { readClippings, readPackages, readPressReleases, readDailyReports } = await import('../server/reads');
    const seen = await Promise.all([readClippings(ctx, eventId), readPackages(ctx, eventId), readPressReleases(ctx, eventId), readDailyReports(ctx, eventId as EventId)]);
    expect(seen.map((rows) => rows.length)).toEqual([0, 0, 0, 0]);
  });
});

describe('the permission each command checks and audits under', () => {
  // reports.read and reports.write grant the same roles today, so no actor tells them apart; the declared permission is
  // what the pipeline checks and what sce_tcsk_audit_command re-checks in SQL, so it is pinned here.
  it('edits are reports.write, issuing is reports.issue, all on the event', async () => {
    const { commands } = await import('../server/commands');
    const perms = Object.fromEntries(Object.entries(commands).map(([verb, spec]) => [verb, spec.authorize.perm]));
    expect(perms).toEqual({
      createClipping: 'reports.write', updateClipping: 'reports.write', deleteClipping: 'reports.write',
      createPackage: 'reports.write', updatePackage: 'reports.write', deletePackage: 'reports.write',
      createPressRelease: 'reports.write', updatePressRelease: 'reports.write', deletePressRelease: 'reports.write',
      issueDailyReport: 'reports.issue',
    });
  });
});
