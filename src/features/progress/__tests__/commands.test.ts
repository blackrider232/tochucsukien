import { describe, expect, it } from 'vitest';
import { newId, type EventId, type IsoDate, type SafeUrl } from '@/core/brand';
import type { CommandId, InputOf } from '@/core/commands';
import { testActor, PTDN, XTDT } from '@/core/testing/actors';
import type { Step } from '../contract';
import { commands } from '../server/commands';
import { draft, harness } from './harness';

const admin = testActor('admin', null);
const leader = testActor('leader', null);
const xtdtLeader = testActor('dept_leader', XTDT);
const xtdtUser = testActor('user', XTDT);
const ptdnUser = testActor('user', PTDN);
const ptdnLeader = testActor('dept_leader', PTDN);

async function setup() {
  const h = harness();
  const eventId = await h.createEvent(xtdtUser);
  const plan = (await h.plan(xtdtUser, eventId))!;
  const group = plan.groups[0]!;
  const step = group.steps[0]!;
  return { h, eventId, plan, group, step };
}

describe('progress.createEvent', () => {
  it('creates the event with the standard process and audits the legacy summary', async () => {
    const { h, eventId, plan } = await setup();
    expect(plan.event.name).toBe(draft().name);
    expect(plan.groups).toHaveLength(7);
    expect(plan.groups.flatMap((g) => g.steps)).toHaveLength(32);
    expect(h.audits().at(-1)).toMatchObject({ action: 'TẠO SỰ KIỆN', summary: `Tạo sự kiện mới: "${draft().name}" (15/12/2026)`, event_id: eventId });
  });

  it('offers undo of a create only to an actor who may delete the event', async () => {
    const h = harness();
    const asUser = await h.ok(xtdtUser, 'progress.createEvent', { id: newId<'Event'>(), draft: draft() });
    expect(asUser.inverse).toBeUndefined();
    const asLeader = await h.ok(xtdtLeader, 'progress.createEvent', { id: newId<'Event'>(), draft: draft() });
    expect(asLeader.inverse).toMatchObject({ command: 'progress.deleteEvent' });
    expect((await h.undo(xtdtLeader, asLeader.inverse)).ok).toBe(true);
  });

  it('creates a blank event without groups when the template is off', async () => {
    const h = harness();
    const id = await h.createEvent(xtdtUser, { applyStandardTemplate: false });
    expect((await h.plan(xtdtUser, id))!.groups).toEqual([]);
  });

  it('refuses a chuyên viên creating an event for another department', async () => {
    const h = harness();
    const r = await h.run(xtdtUser, 'progress.createEvent', { id: newId<'Event'>(), draft: draft({ department: PTDN }) });
    expect(r).toMatchObject({ ok: false, kind: 'forbidden' });
    expect(h.rows('sce_tcsk_events')).toHaveLength(0);
    expect(h.audits()).toHaveLength(0);
  });

  it('keeps event ids unique: a retry with the same id converges, another payload conflicts (m2 BUG-01)', async () => {
    const h = harness();
    const id = newId<'Event'>();
    await h.ok(xtdtUser, 'progress.createEvent', { id, draft: draft() });
    await h.ok(xtdtUser, 'progress.createEvent', { id, draft: draft() });
    expect(h.rows('sce_tcsk_events')).toHaveLength(1);
    expect(h.rows('sce_tcsk_steps')).toHaveLength(32);
    expect(await h.run(xtdtUser, 'progress.createEvent', { id, draft: draft({ name: 'Khác' }) })).toMatchObject({ ok: false, kind: 'conflict' });
  });

  it('gives two events of one template distinct group and step ids (m2 BUG-01)', async () => {
    const h = harness();
    const [a, b] = [await h.createEvent(xtdtUser), await h.createEvent(xtdtUser)];
    const ids = (id: EventId) => h.plan(xtdtUser, id).then((p) => p!.groups.flatMap((g) => [g.id, ...g.steps.map((s) => s.id)]));
    const [ia, ib] = [await ids(a), await ids(b)];
    expect(new Set([...ia, ...ib]).size).toBe(ia.length + ib.length);
  });

  it('rejects a draft without name or date with field errors', async () => {
    const h = harness();
    const r = await h.run(xtdtUser, 'progress.createEvent', { id: newId<'Event'>(), draft: { ...draft(), name: ' ', eventDate: '' as IsoDate } });
    expect(r).toMatchObject({ ok: false, kind: 'invalid' });
    expect(!r.ok && r.fieldErrors).toMatchObject({ 'draft.name': 'Vui lòng nhập tên sự kiện', 'draft.eventDate': 'Vui lòng chọn ngày tổ chức' });
  });
});

describe('progress.updateEvent', () => {
  it('updates, audits, and its inverse restores the old values', async () => {
    const { h, eventId, plan } = await setup();
    const r = await h.ok(xtdtUser, 'progress.updateEvent', { id: eventId, version: plan.event.version, patch: { name: 'Tên mới', eventDate: '2026-12-22' as IsoDate } });
    expect(r.value).toMatchObject({ name: 'Tên mới', eventDate: '2026-12-22' });
    expect(h.audits().at(-1)).toMatchObject({ summary: 'Cập nhật thông tin sự kiện: "Tên mới"' });
    expect((await h.undo(xtdtUser, r.inverse)).ok).toBe(true);
    expect((await h.plan(xtdtUser, eventId))!.event).toMatchObject({ name: draft().name, eventDate: '2026-12-15' });
  });

  it('answers a stale version with conflict', async () => {
    const { h, eventId, plan } = await setup();
    await h.ok(xtdtUser, 'progress.updateEvent', { id: eventId, version: plan.event.version, patch: { note: 'a' } });
    expect(await h.run(xtdtUser, 'progress.updateEvent', { id: eventId, version: plan.event.version, patch: { note: 'b' } })).toMatchObject({ ok: false, kind: 'conflict' });
  });

  it('lets a supporting department work the plan but not edit the event row', async () => {
    const h = harness();
    const id = await h.createEvent(xtdtUser, { supportingDepartments: [PTDN] });
    const plan = (await h.plan(ptdnUser, id))!;
    expect(await h.run(ptdnUser, 'progress.updateEvent', { id, version: plan.event.version, patch: { name: 'x' } })).toMatchObject({ ok: false, kind: 'forbidden' });
    expect((await h.run(ptdnUser, 'progress.setStepDone', { eventId: id, stepId: plan.groups[0]!.steps[0]!.id, done: true })).ok).toBe(true);
  });

  it('refuses handing the event to a department the actor does not belong to', async () => {
    const { h, eventId, plan } = await setup();
    expect(await h.run(xtdtUser, 'progress.updateEvent', { id: eventId, version: plan.event.version, patch: { department: PTDN } })).toMatchObject({ ok: false, kind: 'forbidden' });
    expect((await h.run(leader, 'progress.updateEvent', { id: eventId, version: plan.event.version, patch: { department: PTDN } })).ok).toBe(true);
  });
});

describe('progress.deleteEvent and restoreEvent', () => {
  it('a chuyên viên may not delete; a lãnh đạo phòng soft-deletes and an admin undo restores', async () => {
    const { h, eventId, plan } = await setup();
    expect(await h.run(xtdtUser, 'progress.deleteEvent', { id: eventId, version: plan.event.version })).toMatchObject({ ok: false, kind: 'forbidden' });
    expect(await h.run(ptdnLeader, 'progress.deleteEvent', { id: eventId, version: plan.event.version })).toMatchObject({ ok: false });
    const r = await h.ok(xtdtLeader, 'progress.deleteEvent', { id: eventId, version: plan.event.version });
    expect(h.audits().at(-1)).toMatchObject({ action: 'XÓA SỰ KIỆN', summary: `Xóa sự kiện: "${draft().name}"` });
    expect(await h.plan(xtdtLeader, eventId)).toBeNull();
    expect(h.rows('sce_tcsk_steps')).toHaveLength(32);
    expect(r.inverse).toMatchObject({ command: 'progress.restoreEvent', input: { id: eventId } });
    expect((await h.undo(admin, r.inverse)).ok).toBe(true);
    expect(await h.plan(xtdtLeader, eventId)).not.toBeNull();
  });
});

describe('progress.setStepDone', () => {
  it('stamps who and when, audits, and undo reopens the step', async () => {
    const { h, eventId, step } = await setup();
    const r = await h.ok(xtdtUser, 'progress.setStepDone', { eventId, stepId: step.id, done: true });
    expect(r.value).toMatchObject({ completedBy: xtdtUser.profile.fullname });
    expect(r.value.completedAt).not.toBeNull();
    expect(h.audits().at(-1)).toMatchObject({ action: 'CẬP NHẬT TIẾN ĐỘ', summary: `Cập nhật tiến độ: Hoàn thành bước "${step.name}" (${draft().name})` });
    const back = await h.undo(xtdtUser, r.inverse);
    expect(back.ok && back.value).toMatchObject({ completedAt: null, completedBy: null });
  });

  it('is idempotent: completing a completed step keeps the first stamp', async () => {
    const { h, eventId, step } = await setup();
    const first = await h.ok(xtdtUser, 'progress.setStepDone', { eventId, stepId: step.id, done: true });
    const again = await h.ok(xtdtLeader, 'progress.setStepDone', { eventId, stepId: step.id, done: true });
    expect(again.value.completedBy).toBe(first.value.completedBy);
  });

  it('refuses a step id that belongs to another event', async () => {
    const { h, step } = await setup();
    const other = await h.createEvent(xtdtUser, { applyStandardTemplate: false });
    expect(await h.run(xtdtUser, 'progress.setStepDone', { eventId: other, stepId: step.id, done: true })).toMatchObject({ ok: false, kind: 'not_found' });
  });
});

describe('steps, sub-tasks, links, notes and groups round-trip through undo', () => {
  it('createStep / updateStep / deleteStep', async () => {
    const { h, eventId, group } = await setup();
    const id = newId<'Step'>();
    const input = { id, name: 'Bước mới', requirement: '', targetPhase: 'before' as const, offsetDays: 4, dayType: 'workday' as const, assignee: '', templateKey: '', subTasks: [], links: [], sort: 99, completedAt: null, completedBy: null };
    const created = await h.ok(xtdtUser, 'progress.createStep', { eventId, groupId: group.id, step: input });
    const updated = await h.ok(xtdtUser, 'progress.updateStep', { eventId, stepId: id, version: created.value.version, patch: { name: 'Đổi tên', targetPhase: 'dday', offsetDays: 9 } });
    expect(updated.value).toMatchObject({ name: 'Đổi tên', targetPhase: 'dday', offsetDays: 0 });
    await h.ok(xtdtUser, 'progress.setStepDone', { eventId, stepId: id, done: true });
    await h.ok(xtdtUser, 'progress.addSubTask', { eventId, stepId: id, subTask: { id: 's1', name: 'Việc nhỏ', completed: false } });
    const current = (await h.plan(xtdtUser, eventId))!.groups[0]!.steps.find((s) => s.id === id)!;
    const deleted = await h.ok(xtdtUser, 'progress.deleteStep', { eventId, stepId: id, version: current.version });
    expect(h.audits().at(-1)).toMatchObject({ summary: `Xóa bước việc: "Đổi tên" (${draft().name})` });
    expect((await h.undo(xtdtUser, deleted.inverse)).ok).toBe(true);
    const restored = (await h.plan(xtdtUser, eventId))!.groups[0]!.steps.find((s) => s.id === id)!;
    expect(restored).toMatchObject({ name: 'Đổi tên', completedBy: xtdtUser.profile.fullname, subTasks: [{ id: 's1', name: 'Việc nhỏ', completed: false }] });
  });

  it('sub-tasks: add, toggle, remove, and undo puts it back in place', async () => {
    const { h, eventId, step } = await setup();
    const toggled = await h.ok(xtdtUser, 'progress.setSubTaskDone', { eventId, stepId: step.id, subTaskId: step.subTasks[1]!.id, done: true });
    expect(toggled.value.subTasks[1]!.completed).toBe(true);
    expect(toggled.value.completedAt).toBeNull();
    const removed = await h.ok(xtdtUser, 'progress.removeSubTask', { eventId, stepId: step.id, subTaskId: step.subTasks[1]!.id });
    expect(removed.value.subTasks).toHaveLength(2);
    expect(await h.undo(xtdtUser, removed.inverse)).toMatchObject({ ok: true, value: { subTasks: toggled.value.subTasks } });
  });

  it('links: http(s) only (m2 BUG-19), undo removes the added link', async () => {
    const { h, eventId, step } = await setup();
    const bad = await h.run(xtdtUser, 'progress.addLink', { eventId, stepId: step.id, link: { id: 'l1', name: 'x', url: 'javascript:alert(1)' as SafeUrl } });
    expect(bad).toMatchObject({ ok: false, kind: 'invalid' });
    const added = await h.ok(xtdtUser, 'progress.addLink', { eventId, stepId: step.id, link: { id: 'l1', name: 'Danh sách', url: 'https://drive.google.com/x' as SafeUrl } });
    expect(added.value.links).toEqual([{ id: 'l1', name: 'Danh sách', url: 'https://drive.google.com/x' }]);
    expect(await h.undo(xtdtUser, added.inverse)).toMatchObject({ ok: true, value: { links: [] } });
  });

  it('group note: set, clear, undo', async () => {
    const { h, eventId, group } = await setup();
    const set = await h.ok(xtdtUser, 'progress.setGroupNote', { eventId, groupId: group.id, note: 'Gọi trước 9h' });
    expect(h.audits().at(-1)).toMatchObject({ summary: `Cập nhật ghi chú nhóm "${group.name}" (${draft().name})` });
    await h.ok(xtdtUser, 'progress.setGroupNote', { eventId, groupId: group.id, note: '' });
    expect(h.audits().at(-1)).toMatchObject({ summary: `Xóa ghi chú nhóm "${group.name}"` });
    expect(set.inverse).toMatchObject({ input: { note: '' } });
  });

  it('a blank event gets groups (m2 BUG-14); deleting a group takes its steps and undo restores both', async () => {
    const h = harness();
    const eventId = await h.createEvent(xtdtUser, { applyStandardTemplate: false });
    const applied = await h.ok(xtdtUser, 'progress.applyTemplate', { eventId, type: 'hoi_cho' });
    expect(applied.value).toHaveLength(7);
    const again = await h.ok(xtdtUser, 'progress.applyTemplate', { eventId, type: 'hoi_cho' });
    expect(again.value).toHaveLength(0);
    expect(again.inverse).toBeUndefined();
    expect(h.rows('sce_tcsk_steps')).toHaveLength(33);

    const g = (await h.plan(xtdtUser, eventId))!.groups[0]!;
    const del = await h.ok(xtdtUser, 'progress.deleteGroups', { eventId, groupIds: [g.id] });
    expect(h.rows('sce_tcsk_steps')).toHaveLength(33 - g.steps.length);
    expect((await h.undo(xtdtUser, del.inverse)).ok).toBe(true);
    expect(h.rows('sce_tcsk_steps')).toHaveLength(33);

    const id = newId<'TaskGroup'>();
    const made = await h.ok(xtdtUser, 'progress.createGroups', { eventId, groups: [{ id, phase: 'phase_prepare', name: 'Nhóm 7: Hậu cần bổ sung', leadPerson: '', note: '', sort: 7, steps: [] }] });
    const renamed = await h.ok(xtdtUser, 'progress.updateGroup', { eventId, groupId: id, version: made.value[0]!.version, patch: { name: 'Nhóm 7' } });
    expect(renamed.value.name).toBe('Nhóm 7');
    expect((await h.undo(xtdtUser, made.inverse)).ok).toBe(true);
    expect((await h.plan(xtdtUser, eventId))!.groups.some((x) => x.id === id)).toBe(false);
  });
});

describe('every command is denied to an actor outside the event department, with no write and no audit', () => {
  it.each(Object.keys(commands))('progress.%s', async (verb) => {
    const { h, eventId, plan, group, step } = await setup();
    const sub = step.subTasks[0]!;
    const inputs: { [K in CommandId as K extends `progress.${infer V}` ? V : never]: InputOf<K> } = {
      createEvent: { id: newId(), draft: draft({ department: XTDT }) },
      updateEvent: { id: eventId, version: plan.event.version, patch: { name: 'x' } },
      deleteEvent: { id: eventId, version: plan.event.version },
      restoreEvent: { id: eventId },
      setStepDone: { eventId, stepId: step.id, done: true },
      createStep: { eventId, groupId: group.id, step: { ...(step as Step), subTasks: [], links: [], id: newId(), completedAt: null, completedBy: null } },
      updateStep: { eventId, stepId: step.id, version: step.version, patch: { name: 'x' } },
      deleteStep: { eventId, stepId: step.id, version: step.version },
      addSubTask: { eventId, stepId: step.id, subTask: { id: 'n', name: 'x', completed: false } },
      setSubTaskDone: { eventId, stepId: step.id, subTaskId: sub.id, done: true },
      removeSubTask: { eventId, stepId: step.id, subTaskId: sub.id },
      addLink: { eventId, stepId: step.id, link: { id: 'l', name: 'x', url: 'https://a.vn/' as SafeUrl } },
      removeLink: { eventId, stepId: step.id, linkId: 'l' },
      setGroupNote: { eventId, groupId: group.id, note: 'x' },
      createGroups: { eventId, groups: [{ id: newId(), phase: 'phase_prepare', name: 'x', leadPerson: '', note: '', sort: 9, steps: [] }] },
      updateGroup: { eventId, groupId: group.id, version: group.version, patch: { name: 'x' } },
      deleteGroups: { eventId, groupIds: [group.id] },
      applyTemplate: { eventId, type: 'hoi_cho' },
    };
    const before = { events: h.rows('sce_tcsk_events'), groups: h.rows('sce_tcsk_task_groups'), steps: h.rows('sce_tcsk_steps'), audits: h.audits().length };
    const r = await h.run(ptdnUser, `progress.${verb}` as CommandId, inputs[verb as keyof typeof inputs] as never);
    expect(r.ok).toBe(false);
    expect(['forbidden', 'not_found']).toContain(!r.ok && r.kind);
    expect({ events: h.rows('sce_tcsk_events'), groups: h.rows('sce_tcsk_task_groups'), steps: h.rows('sce_tcsk_steps'), audits: h.audits().length }).toEqual(before);
  });

  it('a pending account is stopped at the gate', async () => {
    const { h, eventId, step } = await setup();
    const pending = testActor('user', XTDT, { status: 'pending' });
    expect(await h.run(pending, 'progress.setStepDone', { eventId, stepId: step.id, done: true })).toMatchObject({ ok: false, kind: 'gate' });
  });

  it('every successful mutation writes exactly one audit row', async () => {
    const { h, eventId, step } = await setup();
    const n = h.audits().length;
    await h.ok(xtdtUser, 'progress.setStepDone', { eventId, stepId: step.id, done: true });
    await h.ok(xtdtUser, 'progress.addSubTask', { eventId, stepId: step.id, subTask: { id: 'z', name: 'z', completed: false } });
    await h.ok(xtdtUser, 'progress.setGroupNote', { eventId, groupId: step.groupId, note: 'n' });
    expect(h.audits()).toHaveLength(n + 3);
  });
});
