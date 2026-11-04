// Legacy import of eventMediaClippings, eventBiddingPackages and dailyReports
// (m6 §2). The seeder's media_0x, bid_0x and rpt_* rows are skipped (BUG-01).
// Values outside the closed lists become valid ones and are reported, a blank
// contractor is stored as none (BUG-36), unsafe links are dropped (BUG-25), and
// a code repeated in an event, whatever its case, gets a suffix (BUG-33).

import type { EventId, HHmm, IsoDate } from '@/core/brand';
import { combineVN, parseIsoDate } from '@/core/dates';
import { isDemoLegacyEvent, isDemoLegacyId, type ImportContext, type ImportIssue, type LegacyBlob, type LegacyImporter } from '@/core/legacy';
import { foldVi, parseSafeUrl, parseVnd } from '@/core/text';
import { isDepartmentName } from '@/core/vocab';
import { legacyImporter as progressImporter } from '@/features/progress/server';
import { signerTitle } from '../domain/report';
import { BIDDING_STATUSES, MEDIA_TYPES } from '../domain/schemas';

type Obj = Record<string, unknown>;
type Row = Readonly<Record<string, unknown>>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

interface ImportedEvent {
  legacyId: string;
  id: EventId;
  name: string;
  date: IsoDate;
  department: string;
}

function importedEvents(blob: LegacyBlob, ctx: ImportContext): ReadonlyMap<string, ImportedEvent> {
  const rows = progressImporter.plan(blob, ctx).batches.find((b) => b.table === 'sce_tcsk_events')?.rows ?? [];
  return new Map(rows.map((r) => [String(r.legacy_id), { legacyId: String(r.legacy_id), id: r.id as EventId, name: str(r.name), date: parseIsoDate(r.event_date) as IsoDate, department: str(r.department) }]));
}

class Issues {
  readonly list: ImportIssue[] = [];
  add(severity: ImportIssue['severity'], blobKey: string, legacyId: string | null, message: string) {
    this.list.push({ severity, blobKey, legacyId, message });
  }
}

function* perEvent(blob: LegacyBlob, key: string, ctx: ImportContext, events: ReadonlyMap<string, ImportedEvent>, issues: Issues): Generator<[ImportedEvent, Obj[]]> {
  const byEvent = blob[key];
  if (!isObj(byEvent)) return;
  for (const [legacyEventId, list] of Object.entries(byEvent)) {
    if (!Array.isArray(list)) {
      issues.add('dropped_invalid', key, legacyEventId, `Dữ liệu ${key} của sự kiện ${legacyEventId} không phải một mảng.`);
      continue;
    }
    const event = events.get(legacyEventId);
    if (!event) {
      if (list.length === 0) continue;
      const source = [blob.events, blob.programs].flatMap((l) => (Array.isArray(l) ? l : [])).find((e) => isObj(e) && str(e.id) === legacyEventId);
      if (isDemoLegacyEvent(source as Obj | undefined)) issues.add('skipped_demo', key, legacyEventId, `${list.length} dòng ${key} của sự kiện mẫu ${legacyEventId} không được nhập.`);
      else issues.add('orphan', key, legacyEventId, `${list.length} dòng ${key} thuộc sự kiện ${legacyEventId} không được nhập (sự kiện không tồn tại).`);
      continue;
    }
    const rows: Obj[] = [];
    list.forEach((r, i) => {
      if (!isObj(r)) return issues.add('dropped_invalid', key, null, `Dòng ${i + 1} ${key} của sự kiện ${legacyEventId} không hợp lệ.`);
      if (!ctx.includeDemo && isDemoLegacyId(r.id)) return issues.add('skipped_demo', key, str(r.id), `Dòng mẫu ${str(r.id)} do ứng dụng cũ tự tạo, không được nhập (m6 BUG-01).`);
      rows.push(r);
    });
    yield [event, rows];
  }
}

const legacyKey = (r: Obj, i: number) => str(r.id) || `index-${i + 1}`;

function planClippings(blob: LegacyBlob, ctx: ImportContext, events: ReadonlyMap<string, ImportedEvent>, issues: Issues): Row[] {
  const KEY = 'eventMediaClippings';
  const out: Row[] = [];
  for (const [event, list] of perEvent(blob, KEY, ctx, events, issues)) {
    list.forEach((r, i) => {
      const key = legacyKey(r, i);
      const outlet = str(r.outlet);
      const title = str(r.title);
      if (!outlet || !title) return issues.add('dropped_invalid', KEY, key, 'Tin bài thiếu cơ quan báo chí hoặc tiêu đề; không nhập.');
      let published = parseIsoDate(str(r.date));
      if (!published) {
        published = event.date;
        issues.add('coerced', KEY, key, `Ngày đăng "${str(r.date)}" không đọc được; lấy ngày sự kiện ${event.date}.`);
      }
      const rawType = str(r.type);
      const mediaType = (MEDIA_TYPES as ReadonlyArray<string>).includes(rawType) ? rawType : 'Báo điện tử';
      if (mediaType !== rawType) issues.add('coerced', KEY, key, `Loại hình "${rawType}" không có trong danh mục; nhập là "Báo điện tử".`);
      const rawUrl = str(r.url);
      const url = rawUrl ? parseSafeUrl(rawUrl) : null;
      if (rawUrl && !url) issues.add('coerced', KEY, key, `Đường dẫn "${rawUrl.slice(0, 80)}" không phải http(s); bỏ đường dẫn (m6 BUG-25).`);
      out.push({ id: ctx.ids.idFor('MediaClipping', key, event.legacyId), event_id: event.id, legacy_id: key, outlet, title, published_on: published, media_type: mediaType, url, author: str(r.author) });
    });
  }
  return out;
}

function money(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isSafeInteger(raw) && raw >= 0 ? raw : null;
  const parsed = parseVnd(str(raw));
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function planPackages(blob: LegacyBlob, ctx: ImportContext, events: ReadonlyMap<string, ImportedEvent>, issues: Issues): Row[] {
  const KEY = 'eventBiddingPackages';
  const out: Row[] = [];
  for (const [event, list] of perEvent(blob, KEY, ctx, events, issues)) {
    const taken = new Set<string>();
    list.forEach((r, i) => {
      const key = legacyKey(r, i);
      const name = str(r.name);
      let code = str(r.code).toUpperCase();
      if (!code || !name) return issues.add('dropped_invalid', KEY, key, 'Gói thầu thiếu mã hoặc tên; không nhập.');
      if (taken.has(foldVi(code))) {
        let n = 2;
        while (taken.has(foldVi(`${code}-${n}`))) n += 1;
        issues.add('coerced', KEY, key, `Mã gói thầu ${code} bị trùng trong sự kiện; nhập là ${code}-${n}.`);
        code = `${code}-${n}`;
      }
      taken.add(foldVi(code));
      let budget = money(r.budget);
      if (budget === null) {
        issues.add('coerced', KEY, key, `Dự toán "${str(r.budget)}" không đọc được; nhập là 0 đồng, cần nhập lại.`);
        budget = 0;
      }
      let winning = money(r.winningPrice);
      if (winning === 0 || (winning === null && str(r.winningPrice))) {
        issues.add('coerced', KEY, key, `Giá trúng thầu "${str(r.winningPrice)}" được coi là chưa có.`);
        winning = null;
      }
      const rawDept = str(r.dept);
      const department = isDepartmentName(rawDept) ? rawDept : 'Phòng Hành chính - Tổ chức';
      if (department !== rawDept) issues.add('coerced', KEY, key, `Phòng "${rawDept}" không có trong danh mục; nhập là Phòng Hành chính - Tổ chức.`);
      const rawStatus = str(r.status);
      const status = (BIDDING_STATUSES as ReadonlyArray<string>).includes(rawStatus) ? rawStatus : 'Đang thực hiện hợp đồng';
      if (status !== rawStatus) issues.add('coerced', KEY, key, `Tiến độ "${rawStatus}" không có trong danh mục; nhập là "Đang thực hiện hợp đồng".`);
      const rawContractor = str(r.contractor);
      const contractor = rawContractor && rawContractor !== 'Đang thương thảo' && rawContractor !== 'Chưa chọn' ? rawContractor : null;
      out.push({
        id: ctx.ids.idFor('BiddingPackage', key, event.legacyId), event_id: event.id, legacy_id: key, code, name, department, budget_vnd: budget, winning_price_vnd: winning, contractor, status,
      });
    });
  }
  return out;
}

/** Only the seeder ever wrote these; a hand-made one keeps its words, its legacy has no figures to freeze. */
function planReports(blob: LegacyBlob, ctx: ImportContext, events: ReadonlyMap<string, ImportedEvent>, issues: Issues): Row[] {
  const KEY = 'dailyReports';
  const out: Row[] = [];
  for (const [event, list] of perEvent(blob, KEY, ctx, events, issues)) {
    const days = new Set<string>();
    list.forEach((r, i) => {
      const key = legacyKey(r, i);
      const date = parseIsoDate(str(r.date));
      if (!date) return issues.add('dropped_invalid', KEY, key, `Ngày báo cáo "${str(r.date)}" không đọc được; không nhập.`);
      if (days.has(date)) return issues.add('dropped_invalid', KEY, key, `Đã có báo cáo ngày ${date} của sự kiện; mỗi ngày một báo cáo, không nhập bản trùng.`);
      days.add(date);
      const m = /^T-(\d+)$/.exec(str(r.countdownLabel));
      const percent = Math.max(0, Math.min(100, Math.round(Number(r.progressPercent) || 0)));
      issues.add('coerced', KEY, key, `Báo cáo ngày ${date} nhập không có số liệu chi tiết (ứng dụng cũ không lưu); giờ phát hành ghi 16:30 ngày đó.`);
      out.push({
        id: ctx.ids.idFor('DailyReport', key, event.legacyId), event_id: event.id, legacy_id: key, report_date: date, workdays_to_event: m ? Number(m[1]) : 0,
        progress_percent: percent, key_highlight: str(r.keyHighlight), blockers: str(r.urgentNotice), signatory: str(r.signatory),
        signatory_title: signerTitle(event.department), document_number: null, figures: { progressPercent: percent }, event_name: event.name, event_date: event.date,
        issued_at: combineVN(date, '16:30' as HHmm), issued_by: null,
      });
    });
  }
  return out;
}

export const legacyImporter: LegacyImporter = {
  feature: 'reports',
  dependsOn: ['progress'],
  plan(blob, ctx) {
    const issues = new Issues();
    const events = importedEvents(blob, ctx);
    const batches = [
      { table: 'sce_tcsk_media_clippings' as const, rows: planClippings(blob, ctx, events, issues) },
      { table: 'sce_tcsk_bidding_packages' as const, rows: planPackages(blob, ctx, events, issues) },
      { table: 'sce_tcsk_daily_reports' as const, rows: planReports(blob, ctx, events, issues) },
    ];
    return { batches: batches.filter((b) => b.rows.length > 0), issues: issues.list };
  },
};
