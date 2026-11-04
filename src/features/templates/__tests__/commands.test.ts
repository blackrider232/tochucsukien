import { describe, expect, it } from 'vitest';
import type { TemplateId, Version } from '@/core/brand';
import type { CommandId } from '@/core/commands';
import { PTDN, testActor, XTDT } from '@/core/testing/actors';
import { builtinDraft } from '../domain/catalog';
import { commands } from '../server/commands';
import { admin, draft, edited, harness } from './harness';

const leader = testActor('leader', null);
const deptLeader = testActor('dept_leader', XTDT);
const user = testActor('user', XTDT);
const otherUser = testActor('user', PTDN);
const pending = testActor('user', XTDT, { status: 'pending' });
const locked = testActor('admin', null, { status: 'locked' });
const KH = 'form_kh_ubnd' as TemplateId;
const NO_ADMIN = [['leader', leader], ['dept_leader', deptLeader], ['user', user], ['user of another department', otherUser], ['pending admin-less user', pending], ['locked admin', locked]] as const;

describe('templates.saveOverride', () => {
  it('stores an override, shows it in place of the built-in, and audits the legacy summary', async () => {
    const h = harness();
    const r = await h.ok(admin, 'templates.saveOverride', { id: KH, version: null, draft: edited(KH) });
    expect(r.value).toMatchObject({ id: KH, origin: 'override', title: 'Tiêu đề đã sửa', code: 'KH-UBND' });
    expect(h.rows()).toHaveLength(1);
    expect(h.audits().at(-1)).toMatchObject({ action: 'CẬP NHẬT BIỂU MẪU CHUẨN', summary: 'Admin cập nhật biểu mẫu chuẩn: "Tiêu đề đã sửa" (KH-UBND)', entity: 'template', entity_id: KH });
    const list = await h.catalog(user);
    expect(list).toHaveLength(23);
    expect(list[0]).toMatchObject({ id: KH, origin: 'override', title: 'Tiêu đề đã sửa' });
    expect(list.filter((t) => t.origin === 'override')).toHaveLength(1);
  });

  it('saves a built-in without a symbol (m3 B11) and never copies the other built-ins into the table', async () => {
    const h = harness();
    await h.ok(admin, 'templates.saveOverride', { id: 'form_dskhach' as TemplateId, version: null, draft: edited('form_dskhach') });
    expect(h.rows().map((r) => r.template_key)).toEqual(['form_dskhach']);
  });

  it('sanitizes the content on save: script, handlers, javascript: links and style tricks never reach the table', async () => {
    const h = harness();
    const evil = '<p onclick="x()">a</p><script>alert(1)</script><a href="javascript:alert(1)">b</a><img src=x onerror=alert(1)><p style="background:url(javascript:alert(1))">c</p><iframe src="//evil"></iframe>';
    const r = await h.ok(admin, 'templates.saveOverride', { id: KH, version: null, draft: edited(KH, { content: evil }) });
    const stored = String(h.rows()[0]!.content_html);
    expect(stored).not.toMatch(/script|onclick|onerror|javascript:|<img|iframe|url\(/i);
    expect(stored).toContain('<p>a</p>');
    expect(r.value.content).toBe(stored);
  });

  it('undoes a first save by resetting, and a second save by putting the previous text back', async () => {
    const h = harness();
    const first = await h.ok(admin, 'templates.saveOverride', { id: KH, version: null, draft: edited(KH) });
    expect(first.inverse).toMatchObject({ command: 'templates.resetOne' });
    const second = await h.ok(admin, 'templates.saveOverride', { id: KH, version: first.value.version as Version, draft: edited(KH, { title: 'Lần hai' }) });
    expect(second.inverse).toMatchObject({ command: 'templates.saveOverride' });
    expect((await h.undo(admin, second.inverse)).ok).toBe(true);
    expect((await h.catalog())[0]!.title).toBe('Tiêu đề đã sửa');
    expect((await h.undo(admin, first.inverse)).ok).toBe(true);
    expect(h.rows()).toHaveLength(0);
    expect((await h.catalog())[0]).toMatchObject({ origin: 'builtin' });
  });

  it('refuses a stale version and a save over an override someone else made (m3 B23)', async () => {
    const h = harness();
    const first = await h.ok(admin, 'templates.saveOverride', { id: KH, version: null, draft: edited(KH) });
    await h.ok(admin, 'templates.saveOverride', { id: KH, version: first.value.version as Version, draft: edited(KH, { title: 'B' }) });
    expect(await h.run(admin, 'templates.saveOverride', { id: KH, version: first.value.version as Version, draft: edited(KH, { title: 'C' }) })).toMatchObject({ ok: false, kind: 'conflict' });
    expect(await h.run(admin, 'templates.saveOverride', { id: KH, version: null, draft: edited(KH, { title: 'D' }) })).toMatchObject({ ok: false, kind: 'conflict' });
    expect(h.rows()[0]!.title).toBe('B');
  });

  it('treats content identical to the built-in as a reset instead of a "modified" template (m3 B10)', async () => {
    const h = harness();
    const first = await h.ok(admin, 'templates.saveOverride', { id: KH, version: null, draft: edited(KH) });
    const back = await h.ok(admin, 'templates.saveOverride', { id: KH, version: first.value.version as Version, draft: builtinDraft(KH)! });
    expect(back.value.origin).toBe('builtin');
    expect(h.rows()).toHaveLength(0);
    expect((await h.undo(admin, back.inverse)).ok).toBe(true);
    expect((await h.catalog())[0]).toMatchObject({ origin: 'override', title: 'Tiêu đề đã sửa' });
  });

  it('rejects an unknown built-in id and an invalid draft with Vietnamese field errors', async () => {
    const h = harness();
    expect(await h.run(admin, 'templates.saveOverride', { id: 'form_khong_co' as TemplateId, version: null, draft: draft() })).toMatchObject({ ok: false, kind: 'not_found' });
    const r = await h.run(admin, 'templates.saveOverride', { id: KH, version: null, draft: { ...draft(), title: ' ', content: '' } });
    expect(r).toMatchObject({ ok: false, kind: 'invalid' });
    expect(!r.ok && r.fieldErrors).toMatchObject({ 'draft.title': 'Nhập tên biểu mẫu chuẩn', 'draft.content': 'Nội dung biểu mẫu không được để trống' });
    expect(h.rows()).toHaveLength(0);
    expect(h.audits()).toHaveLength(0);
  });
});

describe('templates.resetOne', () => {
  it('removes the override so the built-in text shows again, audits, and undoes', async () => {
    const h = harness();
    await h.ok(admin, 'templates.saveOverride', { id: KH, version: null, draft: edited(KH) });
    const r = await h.ok(admin, 'templates.resetOne', { id: KH });
    expect(r.value).toMatchObject({ origin: 'builtin', title: expect.stringContaining('Kế hoạch tổ chức') });
    expect(h.rows()).toHaveLength(0);
    expect(h.audits().at(-1)).toMatchObject({ action: 'KHÔI PHỤC BIỂU MẪU GỐC', summary: expect.stringContaining('khôi phục biểu mẫu về mẫu gốc') });
    expect((await h.undo(admin, r.inverse)).ok).toBe(true);
    expect((await h.catalog())[0]).toMatchObject({ origin: 'override', title: 'Tiêu đề đã sửa' });
  });

  it('is idempotent on a template that is already original, with no inverse', async () => {
    const h = harness();
    const r = await h.ok(admin, 'templates.resetOne', { id: KH });
    expect(r.inverse).toBeUndefined();
    expect(h.audits()).toHaveLength(1);
  });
});

describe('templates.resetAll', () => {
  it('removes every override, keeps admin-created templates, and undoes (m3 Q9)', async () => {
    const h = harness();
    await h.ok(admin, 'templates.saveOverride', { id: KH, version: null, draft: edited(KH) });
    await h.ok(admin, 'templates.saveOverride', { id: 'form_dskhach' as TemplateId, version: null, draft: edited('form_dskhach', { title: 'Hai' }) });
    const id = h.customId();
    await h.ok(admin, 'templates.createCustom', { id, draft: draft() });
    const r = await h.ok(admin, 'templates.resetAll', {});
    expect(r.value).toEqual({ restored: 2, keptCustom: 1 });
    expect((await h.catalog()).map((t) => t.origin).filter((o) => o !== 'builtin')).toEqual(['custom']);
    expect(h.audits().at(-1)).toMatchObject({ action: 'KHÔI PHỤC TOÀN BỘ BIỂU MẪU GỐC', summary: 'Admin khôi phục 2 biểu mẫu về mẫu gốc, giữ nguyên 1 biểu mẫu do Admin tạo' });
    expect((await h.undo(admin, r.inverse)).ok).toBe(true);
    const list = await h.catalog();
    expect(list.filter((t) => t.origin === 'override').map((t) => t.title).sort()).toEqual(['Hai', 'Tiêu đề đã sửa']);
    expect(list.filter((t) => t.origin === 'custom')).toHaveLength(1);
  });

  it('has nothing to undo when nothing was modified', async () => {
    const h = harness();
    const r = await h.ok(admin, 'templates.resetAll', {});
    expect(r).toMatchObject({ value: { restored: 0, keptCustom: 0 } });
    expect(r.inverse).toBeUndefined();
  });
});

describe('templates.createCustom, updateCustom, deleteCustom', () => {
  it('creates, edits and deletes a custom template with audit text and undo at each step', async () => {
    const h = harness();
    const id = h.customId();
    const created = await h.ok(admin, 'templates.createCustom', { id, draft: draft() });
    expect(created.value).toMatchObject({ id, origin: 'custom', code: 'BM-01', title: 'Biểu mẫu thử' });
    expect(h.audits().at(-1)).toMatchObject({ action: 'THÊM BIỂU MẪU CHUẨN', summary: 'Admin thêm biểu mẫu chuẩn mới: "Biểu mẫu thử" (BM-01)' });

    const updated = await h.ok(admin, 'templates.updateCustom', { id, version: created.value.version as Version, draft: draft({ title: 'Đã sửa', code: '' }) });
    expect(updated.value).toMatchObject({ title: 'Đã sửa', code: '' });
    expect(h.audits().at(-1)).toMatchObject({ summary: 'Admin cập nhật biểu mẫu chuẩn: "Đã sửa" (không số hiệu)' });
    expect((await h.undo(admin, updated.inverse)).ok).toBe(true);
    expect((await h.catalog()).at(-1)!.title).toBe('Biểu mẫu thử');

    const current = (await h.catalog()).at(-1)!;
    const deleted = await h.ok(admin, 'templates.deleteCustom', { id, version: current.version as Version });
    expect(h.audits().at(-1)).toMatchObject({ action: 'XÓA BIỂU MẪU CHUẨN', summary: 'Admin xóa biểu mẫu chuẩn: "Biểu mẫu thử" (BM-01)', entity: 'template', entity_id: id });
    expect(await h.catalog()).toHaveLength(23);
    expect((await h.undo(admin, deleted.inverse)).ok).toBe(true);
    expect((await h.catalog()).at(-1)).toMatchObject({ id, title: 'Biểu mẫu thử' });
    expect((await h.undo(admin, created.inverse)).ok).toBe(true);
  });

  it('audits the delete of a template without a symbol as "không số hiệu"', async () => {
    const h = harness();
    const id = h.customId();
    const created = await h.ok(admin, 'templates.createCustom', { id, draft: draft({ code: '', title: 'Phiếu nội bộ' }) });
    await h.ok(admin, 'templates.deleteCustom', { id, version: created.value.version as Version });
    expect(h.audits().at(-1)).toMatchObject({ action: 'XÓA BIỂU MẪU CHUẨN', summary: 'Admin xóa biểu mẫu chuẩn: "Phiếu nội bộ" (không số hiệu)', entity_id: id });
    expect(h.audits()).toHaveLength(2);
  });

  it('converges when the same create is retried and conflicts when the id is reused for another document', async () => {
    const h = harness();
    const id = h.customId();
    await h.ok(admin, 'templates.createCustom', { id, draft: draft() });
    await h.ok(admin, 'templates.createCustom', { id, draft: draft() });
    expect(h.rows()).toHaveLength(1);
    expect(await h.run(admin, 'templates.createCustom', { id, draft: draft({ title: 'Khác' }) })).toMatchObject({ ok: false, kind: 'conflict' });
  });

  it('cannot edit or delete a built-in through the custom commands, nor with a stale version', async () => {
    const h = harness();
    const id = h.customId();
    const created = await h.ok(admin, 'templates.createCustom', { id, draft: draft() });
    expect(await h.run(admin, 'templates.deleteCustom', { id: KH as never, version: 1 as Version })).toMatchObject({ ok: false, kind: 'invalid' });
    expect(await h.run(admin, 'templates.updateCustom', { id, version: 99 as Version, draft: draft({ title: 'Z' }) })).toMatchObject({ ok: false, kind: 'conflict' });
    expect(await h.run(admin, 'templates.deleteCustom', { id, version: 99 as Version })).toMatchObject({ ok: false, kind: 'conflict' });
    expect(await h.run(admin, 'templates.deleteCustom', { id: h.customId(), version: created.value.version as Version })).toMatchObject({ ok: false, kind: 'not_found' });
    expect(h.rows()).toHaveLength(1);
  });

  it('does not let deleteCustom remove an override row', async () => {
    const h = harness();
    await h.ok(admin, 'templates.saveOverride', { id: KH, version: null, draft: edited(KH) });
    const rowId = String(h.rows()[0]!.id);
    expect(await h.run(admin, 'templates.deleteCustom', { id: rowId as never, version: 1 as Version })).toMatchObject({ ok: false, kind: 'not_found' });
    expect(h.rows()).toHaveLength(1);
  });
});

describe('who may write (RBAC: edit, reset and delete are admin only)', () => {
  const GHOST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const DSKHACH = 'form_dskhach' as TemplateId;
  const attempts: ReadonlyArray<readonly [string, CommandId, unknown]> = [
    ['saveOverride', 'templates.saveOverride', { id: DSKHACH, version: null, draft: edited('form_dskhach') }],
    ['resetOne', 'templates.resetOne', { id: KH }],
    ['resetAll', 'templates.resetAll', {}],
    ['restoreOverrides', 'templates.restoreOverrides', { overrides: [{ id: DSKHACH, draft: edited('form_dskhach') }] }],
    ['createCustom', 'templates.createCustom', { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', draft: draft() }],
    ['updateCustom', 'templates.updateCustom', { id: GHOST, version: 1, draft: draft({ title: 'Đổi' }) }],
    ['deleteCustom', 'templates.deleteCustom', { id: GHOST, version: 1 }],
  ];
  /** An override and a custom template exist, so a missing check has something to damage. */
  async function populated() {
    const h = harness();
    await h.ok(admin, 'templates.saveOverride', { id: KH, version: null, draft: edited(KH) });
    await h.ok(admin, 'templates.createCustom', { id: GHOST as never, draft: draft() });
    return h;
  }

  it.each(attempts)('%s: the attempt is valid, so only the permission can refuse it (positive control)', async (_verb, id, input) => {
    const h = await populated();
    const before = JSON.stringify(h.rows());
    expect((await h.run(admin, id, input as never)).ok).toBe(true);
    expect(JSON.stringify(h.rows())).not.toBe(before);
  });

  describe.each(NO_ADMIN)('%s', (_name, actor) => {
    it.each(attempts)('is refused %s, through RLS and by the command itself, with no write and no audit', async (_verb, id, input) => {
      const h = await populated();
      const before = JSON.stringify([h.rows(), h.audits()]);
      const viaRls = await h.run(actor, id, input as never);
      const viaCommand = await h.runWithoutRls(actor, id, input as never);
      expect(viaRls.ok).toBe(false);
      expect(viaCommand.ok).toBe(false);
      expect(JSON.stringify([h.rows(), h.audits()])).toBe(before);
    });
  });

  it('refuses a non-admin with kind forbidden (or the gate) before reading the input', async () => {
    const h = harness();
    expect(await h.runWithoutRls(user, 'templates.resetAll', {})).toMatchObject({ ok: false, kind: 'forbidden' });
    expect(await h.runWithoutRls(leader, 'templates.resetOne', { id: KH })).toMatchObject({ ok: false, kind: 'forbidden' });
  });

  it('lets everyone who is active read the full catalog', async () => {
    const h = harness();
    await h.ok(admin, 'templates.saveOverride', { id: KH, version: null, draft: edited(KH) });
    for (const actor of [admin, leader, deptLeader, user, otherUser]) {
      const list = await h.catalog(actor);
      expect(list).toHaveLength(23);
      expect(list[0]!.origin).toBe('override');
    }
  });

  it('declares every command as a mutation that only templates.admin may run', () => {
    expect(Object.keys(commands).sort()).toEqual(['createCustom', 'deleteCustom', 'resetAll', 'resetOne', 'restoreOverrides', 'saveOverride', 'updateCustom']);
    for (const spec of Object.values(commands)) {
      expect(spec.kind).toBe('mutation');
      expect(spec.authorize).toEqual({ perm: 'templates.admin', global: true });
    }
  });
});
