// Every write of the reports feature. Clippings, packages and press releases
// are edited with reports.write and each change returns the inverse its undo
// runs (re-checked like any command, since its payload comes back from the
// client). Issuing the daily report is reports.issue and has no undo: an
// issued report is an immutable snapshot (issue.ts).

import { z } from 'zod';
import type { BiddingPackageId, ClippingId, DailyReportId, EventId, PressReleaseId, Version } from '@/core/brand';
import { defineCommands, CommandError, type CommandContext, type CommandsOf, type Sig } from '@/core/commands';
import { formatVNDate } from '@/core/dates';
import { formatVnd, foldVi } from '@/core/text';
import type { BiddingPackage, MediaClipping, PressRelease } from '../contract';
import type { IssuedReport } from '../domain/report';
import {
  clippingFields, clippingIdSchema, eventIdSchema, packageFields, packageIdSchema, pressReleaseFields, pressReleaseIdSchema, versionSchema,
  type ClippingDraft, type IssueDraft, type PackageDraft, type PressReleaseDraft,
} from '../domain/schemas';
import { asSchema, audit, inverse, writeReports, type Spec } from './command-kit';
import { issueDailyReport } from './issue';
import { toClipping, toPackage, toPressRelease } from './reads';
import { clippingsTable, packagesTable, pressReleasesTable, type ClippingRow, type PackageRow, type PressReleaseRow } from './tables';

declare module '@/core/commands' {
  interface CommandMap {
    'reports.createClipping': Sig<{ eventId: EventId; id: ClippingId; draft: ClippingDraft }, MediaClipping>;
    'reports.updateClipping': Sig<{ eventId: EventId; id: ClippingId; version: Version; draft: ClippingDraft }, MediaClipping>;
    'reports.deleteClipping': Sig<{ eventId: EventId; id: ClippingId; version: Version }, null>;
    'reports.createPackage': Sig<{ eventId: EventId; id: BiddingPackageId; draft: PackageDraft }, BiddingPackage>;
    'reports.updatePackage': Sig<{ eventId: EventId; id: BiddingPackageId; version: Version; draft: PackageDraft }, BiddingPackage>;
    'reports.deletePackage': Sig<{ eventId: EventId; id: BiddingPackageId; version: Version }, null>;
    'reports.createPressRelease': Sig<{ eventId: EventId; id: PressReleaseId; draft: PressReleaseDraft }, PressRelease>;
    'reports.updatePressRelease': Sig<{ eventId: EventId; id: PressReleaseId; version: Version; draft: PressReleaseDraft }, PressRelease>;
    'reports.deletePressRelease': Sig<{ eventId: EventId; id: PressReleaseId; version: Version }, null>;
    /** Idempotent per (event, VN date): a second issue the same day returns the first report unchanged. */
    'reports.issueDailyReport': Sig<{ eventId: EventId; id: DailyReportId; draft: IssueDraft }, { already: boolean; report: IssuedReport }>;
  }
}

async function rowOf<R extends { eventId: EventId }>(load: Promise<R | null>, eventId: EventId, missing: string): Promise<R> {
  const row = await load;
  if (!row || row.eventId !== eventId) throw new CommandError('not_found', missing);
  return row;
}

// ---- media clippings (m6 §1.5, BUG-25/27/28/31) ----

const clippingDraftOf = ({ outlet, title, publishedOn, mediaType, url, author }: ClippingRow): ClippingDraft => ({ outlet, title, publishedOn, mediaType, url, author });
const clippingLabel = (d: ClippingDraft) => `"${d.title}" (${d.outlet}, ${formatVNDate(d.publishedOn)})`;
const NO_CLIPPING = 'Không tìm thấy tin bài trong sự kiện này.';
const clippingInput = z.object({ eventId: eventIdSchema, id: clippingIdSchema, draft: clippingFields });

const createClipping: Spec<'reports.createClipping'> = {
  kind: 'mutation',
  input: asSchema(clippingInput),
  authorize: writeReports,
  async run(ctx, { eventId, id, draft }) {
    const row = await ctx.db.table(clippingsTable).insert({ id, eventId, legacyId: null, ...draft });
    return {
      value: toClipping(row),
      audit: audit('THÊM TIN BÀI', `Thêm tin bài ${clippingLabel(draft)}`, eventId, 'media_clipping', id),
      inverse: inverse('reports.deleteClipping', { eventId, id, version: row.version }, `Thêm tin bài ${draft.title}`),
    };
  },
};

const updateClipping: Spec<'reports.updateClipping'> = {
  kind: 'mutation',
  input: asSchema(clippingInput.extend({ version: versionSchema })),
  authorize: writeReports,
  async run(ctx, { eventId, id, version, draft }) {
    const before = await rowOf(ctx.db.table(clippingsTable).get(id), eventId, NO_CLIPPING);
    const after = await ctx.db.table(clippingsTable).update(id, draft, { expectedVersion: version });
    return {
      value: toClipping(after),
      audit: audit('SỬA TIN BÀI', `Sửa tin bài ${clippingLabel(clippingDraftOf(before))} → ${clippingLabel(draft)}`, eventId, 'media_clipping', id),
      inverse: inverse('reports.updateClipping', { eventId, id, version: after.version, draft: clippingDraftOf(before) }, `Sửa tin bài ${before.title}`),
    };
  },
};

const deleteClipping: Spec<'reports.deleteClipping'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, id: clippingIdSchema, version: versionSchema })),
  authorize: writeReports,
  async run(ctx, { eventId, id, version }) {
    const row = await rowOf(ctx.db.table(clippingsTable).get(id), eventId, NO_CLIPPING);
    await ctx.db.table(clippingsTable).remove(id, { expectedVersion: version });
    return {
      value: null,
      audit: audit('XÓA TIN BÀI', `Xóa tin bài ${clippingLabel(clippingDraftOf(row))}`, eventId, 'media_clipping', id),
      inverse: inverse('reports.createClipping', { eventId, id, draft: clippingDraftOf(row) }, `Xóa tin bài ${row.title}`),
    };
  },
};

// ---- bidding packages, entered by hand (decision 15, m6 §3.4, BUG-32..37) ----

const packageDraftOf = ({ code, name, department, budget, winningPrice, contractor, status }: PackageRow): PackageDraft => ({ code, name, department, budget, winningPrice, contractor, status });
const packageLabel = (d: PackageDraft) =>
  `${d.code} "${d.name}" (dự toán ${formatVnd(d.budget)}, trúng thầu ${d.winningPrice === null ? 'chưa có' : formatVnd(d.winningPrice)}, ${d.status})`;
const NO_PACKAGE = 'Không tìm thấy gói thầu trong sự kiện này.';
const packageInput = z.object({ eventId: eventIdSchema, id: packageIdSchema, draft: packageFields });

/** One code per event, whatever its case or tone marks (BUG-33); the database index enforces the case rule too. */
async function assertCodeFree(ctx: CommandContext, eventId: EventId, id: BiddingPackageId, code: string): Promise<void> {
  const key = foldVi(code.trim());
  const taken = (await ctx.db.table(packagesTable).list({ eventId })).find((p) => p.id !== id && foldVi(p.code.trim()) === key);
  if (taken) throw new CommandError('invalid', `Mã gói thầu ${taken.code} đã có trong sự kiện.`, { code: `Mã ${taken.code} đã được dùng cho gói "${taken.name}"` });
}

const createPackage: Spec<'reports.createPackage'> = {
  kind: 'mutation',
  input: asSchema(packageInput),
  authorize: writeReports,
  async run(ctx, { eventId, id, draft }) {
    await assertCodeFree(ctx, eventId, id, draft.code);
    const row = await ctx.db.table(packagesTable).insert({ id, eventId, legacyId: null, ...draft });
    return {
      value: toPackage(row),
      audit: audit('THÊM GÓI THẦU', `Thêm gói thầu (nhập tay) ${packageLabel(draft)}`, eventId, 'bidding_package', id),
      inverse: inverse('reports.deletePackage', { eventId, id, version: row.version }, `Thêm gói thầu ${draft.code}`),
    };
  },
};

const updatePackage: Spec<'reports.updatePackage'> = {
  kind: 'mutation',
  input: asSchema(packageInput.extend({ version: versionSchema })),
  authorize: writeReports,
  async run(ctx, { eventId, id, version, draft }) {
    const before = await rowOf(ctx.db.table(packagesTable).get(id), eventId, NO_PACKAGE);
    await assertCodeFree(ctx, eventId, id, draft.code);
    const after = await ctx.db.table(packagesTable).update(id, draft, { expectedVersion: version });
    return {
      value: toPackage(after),
      audit: audit('SỬA GÓI THẦU', `Sửa gói thầu ${packageLabel(packageDraftOf(before))} → ${packageLabel(draft)}`, eventId, 'bidding_package', id),
      inverse: inverse('reports.updatePackage', { eventId, id, version: after.version, draft: packageDraftOf(before) }, `Sửa gói thầu ${before.code}`),
    };
  },
};

const deletePackage: Spec<'reports.deletePackage'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, id: packageIdSchema, version: versionSchema })),
  authorize: writeReports,
  async run(ctx, { eventId, id, version }) {
    const row = await rowOf(ctx.db.table(packagesTable).get(id), eventId, NO_PACKAGE);
    await ctx.db.table(packagesTable).remove(id, { expectedVersion: version });
    return {
      value: null,
      audit: audit('XÓA GÓI THẦU', `Xóa gói thầu ${packageLabel(packageDraftOf(row))}`, eventId, 'bidding_package', id),
      inverse: inverse('reports.createPackage', { eventId, id, draft: packageDraftOf(row) }, `Xóa gói thầu ${row.code}`),
    };
  },
};

// ---- press releases, now saved per event (BUG-23/24) ----

const pressDraftOf = ({ title, timing, contact, content }: PressReleaseRow): PressReleaseDraft => ({ title, timing, contact, content });
const NO_PRESS = 'Không tìm thấy thông cáo báo chí trong sự kiện này.';
const pressInput = z.object({ eventId: eventIdSchema, id: pressReleaseIdSchema, draft: pressReleaseFields });

const createPressRelease: Spec<'reports.createPressRelease'> = {
  kind: 'mutation',
  input: asSchema(pressInput),
  authorize: writeReports,
  async run(ctx, { eventId, id, draft }) {
    const row = await ctx.db.table(pressReleasesTable).insert({ id, eventId, ...draft });
    return {
      value: toPressRelease(row),
      audit: audit('LƯU THÔNG CÁO BÁO CHÍ', `Lưu thông cáo báo chí "${draft.title}"`, eventId, 'press_release', id),
      inverse: inverse('reports.deletePressRelease', { eventId, id, version: row.version }, `Lưu thông cáo ${draft.title}`),
    };
  },
};

const updatePressRelease: Spec<'reports.updatePressRelease'> = {
  kind: 'mutation',
  input: asSchema(pressInput.extend({ version: versionSchema })),
  authorize: writeReports,
  async run(ctx, { eventId, id, version, draft }) {
    const before = await rowOf(ctx.db.table(pressReleasesTable).get(id), eventId, NO_PRESS);
    const after = await ctx.db.table(pressReleasesTable).update(id, draft, { expectedVersion: version });
    return {
      value: toPressRelease(after),
      audit: audit('SỬA THÔNG CÁO BÁO CHÍ', `Sửa thông cáo báo chí "${before.title}"${before.title === draft.title ? '' : ` → "${draft.title}"`}`, eventId, 'press_release', id),
      inverse: inverse('reports.updatePressRelease', { eventId, id, version: after.version, draft: pressDraftOf(before) }, `Sửa thông cáo ${before.title}`),
    };
  },
};

const deletePressRelease: Spec<'reports.deletePressRelease'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, id: pressReleaseIdSchema, version: versionSchema })),
  authorize: writeReports,
  async run(ctx, { eventId, id, version }) {
    const row = await rowOf(ctx.db.table(pressReleasesTable).get(id), eventId, NO_PRESS);
    await ctx.db.table(pressReleasesTable).remove(id, { expectedVersion: version });
    return {
      value: null,
      audit: audit('XÓA THÔNG CÁO BÁO CHÍ', `Xóa thông cáo báo chí "${row.title}"`, eventId, 'press_release', id),
      inverse: inverse('reports.createPressRelease', { eventId, id, draft: pressDraftOf(row) }, `Xóa thông cáo ${row.title}`),
    };
  },
};

export const commands: CommandsOf<'reports'> = defineCommands('reports', {
  createClipping, updateClipping, deleteClipping,
  createPackage, updatePackage, deletePackage,
  createPressRelease, updatePressRelease, deletePressRelease,
  issueDailyReport,
});
