import { describe, expect, it } from 'vitest';
import { newId, type IsoDate } from '@/core/brand';
import type { ClippingDraft, PressReleaseDraft } from '../domain/schemas';
import { admin, harness, staff } from './harness';

const CLIP = { outlet: 'Báo Hà Nội Mới', title: 'Hà Nội thu hút đầu tư', publishedOn: '2026-12-01', mediaType: 'Báo điện tử', url: 'https://hanoimoi.vn/bai-1', author: 'Thu Hằng' };
const clip = (over: Partial<typeof CLIP> = {}) => ({ ...CLIP, ...over }) as unknown as ClippingDraft;
const PRESS: PressReleaseDraft = { title: 'Thông cáo báo chí: Hội nghị 2026', timing: 'before', contact: 'Phòng Xúc tiến đầu tư', content: 'Nội dung thông cáo.' };

describe('media clippings (BUG-25/27/28/31)', () => {
  it('a chuyên viên of the event department adds, edits and deletes, each audited, each undoable', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const id = newId<'MediaClipping'>();
    const created = await h.ok(staff, 'reports.createClipping', { eventId, id, draft: clip() });
    expect(created.value).toMatchObject({ outlet: 'Báo Hà Nội Mới', url: 'https://hanoimoi.vn/bai-1', author: 'Thu Hằng', publishedOn: '2026-12-01' });
    expect(h.audits().at(-1)).toMatchObject({ action: 'THÊM TIN BÀI', summary: 'Thêm tin bài "Hà Nội thu hút đầu tư" (Báo Hà Nội Mới, 01/12/2026)', entity: 'media_clipping', entity_id: id });

    const edited = await h.ok(staff, 'reports.updateClipping', { eventId, id, version: created.value.version, draft: clip({ title: 'Tiêu đề mới', url: '' }) });
    expect(edited.value).toMatchObject({ title: 'Tiêu đề mới', url: null });
    await h.undo(staff, edited.inverse);
    expect((await h.clippings(eventId))[0]).toMatchObject({ title: 'Hà Nội thu hút đầu tư', url: 'https://hanoimoi.vn/bai-1' });

    const [current] = await h.clippings(eventId);
    const removed = await h.ok(staff, 'reports.deleteClipping', { eventId, id, version: current!.version });
    expect(await h.clippings(eventId)).toEqual([]);
    expect(h.audits().at(-1)).toMatchObject({ action: 'XÓA TIN BÀI' });
    await h.undo(staff, removed.inverse);
    expect((await h.clippings(eventId)).map((c) => c.title)).toEqual(['Hà Nội thu hút đầu tư']);
  });

  it.each(['javascript:alert(document.cookie)', 'data:text/html,<script>alert(1)</script>', 'hanoimoi.vn/no-scheme'])('refuses the link %s, writing nothing', async (url) => {
    const h = harness();
    const eventId = await h.createEvent();
    const r = await h.run(staff, 'reports.createClipping', { eventId, id: newId<'MediaClipping'>(), draft: clip({ url }) });
    expect(r).toMatchObject({ ok: false, kind: 'invalid' });
    expect(h.rows('sce_tcsk_media_clippings')).toEqual([]);
  });

  it('asks for the outlet and the title, and refuses an unknown type', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const r = await h.run(staff, 'reports.createClipping', { eventId, id: newId<'MediaClipping'>(), draft: clip({ outlet: '  ', title: '' }) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors).toMatchObject({ 'draft.outlet': 'Nhập tên cơ quan báo chí hoặc kênh truyền hình', 'draft.title': 'Nhập tiêu đề bài viết hoặc phóng sự' });
    expect((await h.run(staff, 'reports.createClipping', { eventId, id: newId<'MediaClipping'>(), draft: clip({ mediaType: 'Tạp chí' }) })).ok).toBe(false);
  });

  it('a stale version is a conflict, and the clipping of another event is not found', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const other = await h.createEvent();
    const id = newId<'MediaClipping'>();
    const created = await h.ok(staff, 'reports.createClipping', { eventId, id, draft: clip() });
    await h.ok(staff, 'reports.updateClipping', { eventId, id, version: created.value.version, draft: clip({ title: 'Lần 1' }) });
    expect(await h.run(staff, 'reports.updateClipping', { eventId, id, version: created.value.version, draft: clip({ title: 'Lần 2' }) })).toMatchObject({ ok: false, kind: 'conflict' });
    expect(await h.run(admin, 'reports.deleteClipping', { eventId: other, id, version: created.value.version })).toMatchObject({ ok: false, kind: 'not_found' });
  });
});

describe('bidding packages, entered by hand (decision 15, BUG-33/34/35/36)', () => {
  it('stores the code upper-case and a blank contractor as none, and audits the money', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const r = await h.ok(staff, 'reports.createPackage', { eventId, id: newId<'BiddingPackage'>(), draft: { ...h.packageDraft('tb-2026-001', 220_000_000, 215_000_000), contractor: '' as never } });
    expect(r.value).toMatchObject({ code: 'TB-2026-001', contractor: null, budget: 220_000_000, winningPrice: 215_000_000 });
    expect(h.audits().at(-1)?.summary).toBe('Thêm gói thầu (nhập tay) TB-2026-001 "Gói tb-2026-001" (dự toán 220.000.000 đ, trúng thầu 215.000.000 đ, Đang thực hiện hợp đồng)');
  });

  it('refuses a code already used in the event, whatever its case, with a field error', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    await h.addPackage(eventId, 'TB-2026-001', 100, 90);
    const r = await h.run(staff, 'reports.createPackage', { eventId, id: newId<'BiddingPackage'>(), draft: h.packageDraft('tb-2026-001', 50, null) });
    expect(r).toMatchObject({ ok: false, kind: 'invalid', fieldErrors: { code: 'Mã TB-2026-001 đã được dùng cho gói "Gói TB-2026-001"' } });
    expect(await h.packages(eventId)).toHaveLength(1);
    const elsewhere = await h.createEvent();
    expect((await h.run(staff, 'reports.createPackage', { eventId: elsewhere, id: newId<'BiddingPackage'>(), draft: h.packageDraft('TB-2026-001', 50, null) })).ok).toBe(true);
  });

  it('an edit cannot take another package\'s code, whatever its case or tone marks', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    await h.addPackage(eventId, 'GÓI-01', 100, null);
    const other = await h.addPackage(eventId, 'GÓI-02', 100, null);
    const r = await h.run(staff, 'reports.updatePackage', { eventId, id: other.value.id, version: other.value.version, draft: h.packageDraft('goi-01', 100, null) });
    expect(r).toMatchObject({ ok: false, kind: 'invalid', fieldErrors: { code: 'Mã GÓI-01 đã được dùng cho gói "Gói GÓI-01"' } });
    expect((await h.packages(eventId)).map((p) => p.code)).toEqual(['GÓI-01', 'GÓI-02']);
  });

  it('a package may keep its own code when edited', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const created = await h.addPackage(eventId, 'TB-2026-001', 100, null);
    const r = await h.run(staff, 'reports.updatePackage', { eventId, id: created.value.id, version: created.value.version, draft: h.packageDraft('TB-2026-001', 100, 120) });
    expect(r).toMatchObject({ ok: true, value: { winningPrice: 120 } });
  });

  it.each([
    ['a zero budget', 0, null],
    ['a negative winning price', 100, -5],
    ['fractional dong', 100.5, null],
  ])('refuses %s', async (_label, budget, winningPrice) => {
    const h = harness();
    const eventId = await h.createEvent();
    const r = await h.run(staff, 'reports.createPackage', { eventId, id: newId<'BiddingPackage'>(), draft: h.packageDraft('TB-1', budget, winningPrice) });
    expect(r).toMatchObject({ ok: false, kind: 'invalid' });
    expect(h.rows('sce_tcsk_bidding_packages')).toEqual([]);
  });

  it('accepts a winning price above the budget (an overrun is reported, not hidden)', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    expect((await h.addPackage(eventId, 'TB-1', 100_000_000, 112_500_000)).value.winningPrice).toBe(112_500_000);
  });

  it('delete then undo brings the package back with its code', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const created = await h.addPackage(eventId, 'TB-2026-002', 160_000_000, 152_500_000);
    const removed = await h.ok(staff, 'reports.deletePackage', { eventId, id: created.value.id, version: created.value.version });
    expect(h.audits().at(-1)?.action).toBe('XÓA GÓI THẦU');
    await h.undo(staff, removed.inverse);
    expect((await h.packages(eventId)).map((p) => [p.code, p.budget, p.winningPrice])).toEqual([['TB-2026-002', 160_000_000, 152_500_000]]);
  });

  it('the undo of a delete refuses when the code was reused meanwhile', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const created = await h.addPackage(eventId, 'TB-9', 100, null);
    const removed = await h.ok(staff, 'reports.deletePackage', { eventId, id: created.value.id, version: created.value.version });
    await h.addPackage(eventId, 'tb-9', 200, null);
    expect(await h.undo(staff, removed.inverse)).toMatchObject({ ok: false, kind: 'invalid' });
  });
});

describe('press releases are saved, not discarded (BUG-23)', () => {
  it('saves, edits with undo, and deletes with undo', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const id = newId<'PressRelease'>();
    const created = await h.ok(staff, 'reports.createPressRelease', { eventId, id, draft: PRESS });
    expect(await h.pressReleases(eventId)).toMatchObject([{ title: PRESS.title, timing: 'before', contact: PRESS.contact }]);
    const edited = await h.ok(staff, 'reports.updatePressRelease', { eventId, id, version: created.value.version, draft: { ...PRESS, timing: 'after', title: 'Kết quả hội nghị' } });
    expect(h.audits().at(-1)?.summary).toBe(`Sửa thông cáo báo chí "${PRESS.title}" → "Kết quả hội nghị"`);
    await h.undo(staff, edited.inverse);
    const [back] = await h.pressReleases(eventId);
    expect(back).toMatchObject({ title: PRESS.title, timing: 'before' });
    const removed = await h.ok(staff, 'reports.deletePressRelease', { eventId, id, version: back!.version });
    await h.undo(staff, removed.inverse);
    expect(await h.pressReleases(eventId)).toHaveLength(1);
  });

  it('requires a title and content', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const r = await h.run(staff, 'reports.createPressRelease', { eventId, id: newId<'PressRelease'>(), draft: { ...PRESS, title: '', content: ' ' } });
    expect(r).toMatchObject({ ok: false, kind: 'invalid' });
  });
});

describe('dates stay VN dates', () => {
  it('a clipping published "today" keeps the date it was given', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const r = await h.ok(staff, 'reports.createClipping', { eventId, id: newId<'MediaClipping'>(), draft: clip({ publishedOn: '2026-12-08' as IsoDate }) });
    expect(r.value.publishedOn).toBe('2026-12-08');
  });
});

describe('undo replays stored nulls', () => {
  it('a clipping without a link and a package without a contractor come back after delete', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const c = await h.ok(staff, 'reports.createClipping', { eventId, id: newId<'MediaClipping'>(), draft: clip({ url: '' }) });
    const p = await h.addPackage(eventId, 'TB-1', 100, null);
    await h.undo(staff, (await h.ok(staff, 'reports.deleteClipping', { eventId, id: c.value.id, version: c.value.version })).inverse);
    await h.undo(staff, (await h.ok(staff, 'reports.deletePackage', { eventId, id: p.value.id, version: p.value.version })).inverse);
    expect((await h.clippings(eventId))[0]?.url).toBeNull();
    expect((await h.packages(eventId))[0]?.contractor).toBeNull();
  });
});
