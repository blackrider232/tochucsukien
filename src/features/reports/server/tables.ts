// The four tables reports owns (0002_domain_tables.sql, plus the snapshot
// columns of 202611041300_reports_issue_snapshot.sql). Issued daily reports are
// immutable: no update or delete policy exists for them.

import { z } from 'zod';
import type { BiddingPackageId, ClippingId, DailyReportId, EventId, Instant, IsoDate, PressReleaseId, SafeUrl, UserId, Vnd, Version } from '@/core/brand';
import { parseInstant, parseIsoDate } from '@/core/dates';
import { defineTable, type BaseRow } from '@/core/db';
import { parseSafeUrl } from '@/core/text';
import type { DepartmentName } from '@/core/vocab';
import type { BiddingPackage, BiddingStatus, DailyReport, MediaClipping, MediaType, PressRelease } from '../contract';
import { BIDDING_STATUSES, MEDIA_TYPES, PRESS_TIMINGS } from '../domain/schemas';

const instant = z.string().transform((v) => (parseInstant(v) ?? v) as Instant);
const date = z.string().transform((v) => (parseIsoDate(v.slice(0, 10)) ?? v) as IsoDate);
const managed = {
  version: z.number().transform((v) => v as Version),
  createdAt: instant,
  createdBy: z.string().nullable().transform((v) => v as UserId | null),
  updatedAt: instant,
  updatedBy: z.string().nullable().transform((v) => v as UserId | null),
};
const eventId = z.string().transform((v) => v as EventId);
// bigint columns can arrive as strings from PostgREST.
const money = z.union([z.number(), z.string()]).transform((v) => Number(v) as Vnd);

export type ClippingRow = MediaClipping & BaseRow & { legacyId: string | null };
export const clippingsTable = defineTable<ClippingRow>({
  name: 'sce_tcsk_media_clippings',
  owner: 'reports',
  eventScoped: true,
  orderBy: [{ column: 'publishedOn', ascending: false }, { column: 'createdAt', ascending: false }],
  row: z.object({
    ...managed,
    id: z.string().transform((v) => v as ClippingId),
    eventId,
    legacyId: z.string().nullable(),
    outlet: z.string(),
    title: z.string(),
    publishedOn: date,
    mediaType: z.enum(MEDIA_TYPES).transform((v) => v as MediaType),
    url: z.string().nullable().transform((v) => (v === null ? null : (parseSafeUrl(v) as SafeUrl | null))),
    author: z.string(),
  }),
});

export type PackageRow = BiddingPackage & BaseRow & { legacyId: string | null };
export const packagesTable = defineTable<PackageRow>({
  name: 'sce_tcsk_bidding_packages',
  owner: 'reports',
  eventScoped: true,
  orderBy: [{ column: 'code', ascending: true }],
  columns: { budget: 'budget_vnd', winningPrice: 'winning_price_vnd' },
  row: z.object({
    ...managed,
    id: z.string().transform((v) => v as BiddingPackageId),
    eventId,
    legacyId: z.string().nullable(),
    code: z.string(),
    name: z.string(),
    department: z.string().transform((v) => v as DepartmentName),
    budget: money,
    winningPrice: money.nullable(),
    contractor: z.string().nullable(),
    status: z.enum(BIDDING_STATUSES).transform((v) => v as BiddingStatus),
  }),
});

export type PressReleaseRow = PressRelease & BaseRow;
export const pressReleasesTable = defineTable<PressReleaseRow>({
  name: 'sce_tcsk_press_releases',
  owner: 'reports',
  eventScoped: true,
  orderBy: [{ column: 'createdAt', ascending: false }],
  row: z.object({
    ...managed,
    id: z.string().transform((v) => v as PressReleaseId),
    eventId,
    title: z.string(),
    timing: z.enum(PRESS_TIMINGS),
    contact: z.string(),
    content: z.string(),
  }),
});

/** The contract's snapshot plus what the issue froze about the event and the signer. */
export type DailyReportRow = DailyReport & BaseRow & { legacyId: string | null; eventName: string; eventDate: IsoDate | null; signatoryTitle: string };
export const dailyReportsTable = defineTable<DailyReportRow>({
  name: 'sce_tcsk_daily_reports',
  owner: 'reports',
  eventScoped: true,
  orderBy: [{ column: 'reportDate', ascending: false }],
  row: z.object({
    ...managed,
    id: z.string().transform((v) => v as DailyReportId),
    eventId,
    legacyId: z.string().nullable(),
    reportDate: date,
    workdaysToEvent: z.number().int(),
    progressPercent: z.number(),
    keyHighlight: z.string(),
    blockers: z.string(),
    signatory: z.string(),
    signatoryTitle: z.string(),
    documentNumber: z.string().nullable(),
    figures: z.record(z.string(), z.unknown()).transform((v) =>
      Object.fromEntries(Object.entries(v).filter((e): e is [string, number] => typeof e[1] === 'number')),
    ),
    eventName: z.string(),
    eventDate: date.nullable(),
    issuedAt: instant,
    issuedBy: z.string().nullable().transform((v) => v as UserId),
  }),
});
