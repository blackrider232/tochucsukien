// The NĐ30 daily report as one document model, built only from an issued
// snapshot (or today's figures for a preview). The A4 print page and the Word
// export both render this model, so neither reads the other's output
// (m6 BUG-07/08/13/15/16/17/19).

import type { DailyReportId, EventId, Instant, IsoDate, UserId, Vnd } from '@/core/brand';
import { calendarDaysBetween, formatVNDate } from '@/core/dates';
import type { OrgIdentity } from '@/core/settings';
import { formatVnd } from '@/core/text';
import type { DailyReport } from '../contract';
import { agencyName } from './agency-name';
import { decodeFigures, formatPercent2, type DashboardFigures } from './figures';

/** An issued report: the contract's snapshot plus the event and signer as they were at issue time. */
export interface IssuedReport extends DailyReport {
  eventName: string;
  eventDate: IsoDate | null;
  signatoryTitle: string;
}

/** Decision 17: the department head signs. 'Phòng Xúc tiến đầu tư' -> 'TRƯỞNG PHÒNG XÚC TIẾN ĐẦU TƯ'. */
export function signerTitle(department: string): string {
  const dept = department.trim();
  if (!dept) return 'TRƯỞNG PHÒNG PHỤ TRÁCH';
  return dept.toLowerCase().startsWith('phòng ') ? `TRƯỞNG ${dept.toUpperCase()}` : `TRƯỞNG PHÒNG ${dept.toUpperCase()}`;
}

/** 'T-3' before, 'T0' on the day, 'T+2' after; from what the snapshot stored. */
export function snapshotMilestone(r: Pick<IssuedReport, 'reportDate' | 'eventDate' | 'workdaysToEvent'>): string {
  const days = r.eventDate ? calendarDaysBetween(r.reportDate, r.eventDate) : r.workdaysToEvent;
  if (days === 0) return 'T0';
  return days < 0 ? `T+${-days}` : `T-${r.workdaysToEvent}`;
}

function milestoneSentence(r: Pick<IssuedReport, 'reportDate' | 'eventDate' | 'workdaysToEvent'>): string {
  const opening = r.eventDate ? ` (${formatVNDate(r.eventDate)})` : '';
  const days = r.eventDate ? calendarDaysBetween(r.reportDate, r.eventDate) : r.workdaysToEvent;
  if (days === 0) return `Mốc T0: ngày khai mạc${opening}`;
  if (days < 0) return `Mốc ${snapshotMilestone(r)}: sự kiện đã diễn ra ${-days} ngày trước${opening}`;
  if (r.workdaysToEvent === 0) return `Mốc T-0: còn ${days} ngày (không còn ngày làm việc) trước ngày khai mạc${opening}`;
  return `Mốc ${snapshotMilestone(r)}: còn ${r.workdaysToEvent} ngày làm việc trước ngày khai mạc${opening}`;
}

export interface Nd30Section {
  heading: string;
  paragraphs: ReadonlyArray<string>;
}
export interface DailyReportDocument {
  documentNumber: string;
  date: IsoDate;
  title: string;
  subject: string;
  milestone: string;
  recipients: ReadonlyArray<string>;
  sections: ReadonlyArray<Nd30Section>;
  signer: { title: string; name: string };
  copies: ReadonlyArray<string>;
}

const money = (v: number) => formatVnd(v as Vnd);

function guestLines(f: DashboardFigures): string[] {
  const attending = `- Đại biểu xác nhận tham dự (gồm người đi thay): ${f.guestsAttending}; báo vắng: ${f.guestsDeclined}.`;
  if (f.guestTarget <= 0) return [`- Số thư mời đã lập: ${f.guestsInvited}; sự kiện chưa đặt số đại biểu dự kiến nên chưa có định mức thư mời.`, attending];
  const share = f.guestQuota > 0 ? Math.round((f.guestsInvited / f.guestQuota) * 100) : 0;
  // A snapshot from before guestQuotaPercent was frozen decodes it as 0: name no percent rather than a wrong one.
  const percent = f.guestQuotaPercent > 0 ? `, tức ${f.guestQuotaPercent}%` : '';
  const quotaRule = `định mức ${f.guestQuota} thư mời${percent} của ${f.guestTarget} đại biểu dự kiến`;
  const outcome = f.quotaReached
    ? `đạt ${share}% định mức, đã đủ định mức`
    : `đạt ${share}% định mức, còn thiếu ${f.guestQuota - f.guestsInvited} thư mời`;
  return [`- Số thư mời đã lập: ${f.guestsInvited} (${quotaRule}); ${outcome}.`, attending];
}

function boothAndBiddingLines(f: DashboardFigures): string[] {
  const booths = f.boothsTotal === 0 ? '- Sự kiện chưa có gian hàng.' : `- Gian hàng đã chốt: ${f.boothsConfirmed}/${f.boothsTotal}; đang thẩm định: ${f.boothsReviewing}.`;
  if (f.packages === 0) return [booths, '- Chưa có gói thầu nào được nhập cho sự kiện.'];
  const head = `- Gói thầu (số liệu nhập tay): ${f.packages} gói, tổng dự toán ${money(f.biddingBudget)}.`;
  if (f.packagesAwarded === 0) return [booths, head, '- Chưa có gói thầu nào có giá trúng thầu.'];
  const rate = f.biddingSavingsPercent;
  const result = rate === null ? '' : rate >= 0 ? `, tiết kiệm ${formatPercent2(rate)}` : `, vượt dự toán ${formatPercent2(-rate)}`;
  return [
    booths,
    head,
    `- ${f.packagesAwarded} gói đã có giá trúng thầu: tổng giá trúng thầu ${money(f.biddingWinning)} trên dự toán ${money(f.biddingAwardedBudget)}${result}.`,
  ];
}

export function dailyReportDocument(r: Pick<IssuedReport, 'reportDate' | 'eventDate' | 'workdaysToEvent' | 'eventName' | 'keyHighlight' | 'blockers' | 'signatory' | 'signatoryTitle' | 'documentNumber' | 'figures'>, org: OrgIdentity): DailyReportDocument {
  const f = decodeFigures(r.figures);
  return {
    documentNumber: r.documentNumber ? `Số: ${r.documentNumber}` : `Số: ..... /BC-${org.agencyShortName}`,
    date: r.reportDate,
    title: 'BÁO CÁO',
    subject: `Tiến độ hằng ngày công tác chuẩn bị tổ chức ${r.eventName}`,
    milestone: `(${milestoneSentence(r)})`,
    recipients: [`Ủy ban nhân dân Thành phố ${org.city};`, `${agencyName(org.parentAgency, org.city)};`, `Ban Giám đốc ${agencyName(org.agencyName, org.city)}.`],
    sections: [
      {
        heading: 'I. Tình hình thực hiện kế hoạch',
        paragraphs: [
          `Tính đến ngày ${formatVNDate(r.reportDate)}, đã hoàn thành ${f.stepsDone}/${f.stepsTotal} bước công việc theo kế hoạch (${f.progressPercent}%); ${f.overdueSteps} bước quá hạn, ${f.dueSoonSteps} bước cận hạn.`,
          ...r.keyHighlight.split(/\n+/).map((p) => p.trim()).filter(Boolean),
        ],
      },
      { heading: 'II. Công tác mời đại biểu và xác nhận tham dự', paragraphs: guestLines(f) },
      { heading: 'III. Gian hàng, gói thầu và kinh phí', paragraphs: boothAndBiddingLines(f) },
      {
        heading: 'IV. Khó khăn, vướng mắc và kiến nghị',
        paragraphs: r.blockers.trim() ? r.blockers.split(/\n+/).map((p) => p.trim()).filter(Boolean) : ['Không có.'],
      },
    ],
    signer: { title: r.signatoryTitle, name: r.signatory },
    copies: ['Như trên;', `Lưu: VT, ${org.agencyShortName}.`],
  };
}

/** A report not yet issued, for the preview: today's figures, the event as it is now, blank text fields. */
export function previewReport(input: { eventId: EventId; eventName: string; eventDate: IsoDate; today: IsoDate; workdaysToEvent: number; department: string; figures: Readonly<Record<string, number>>; now: Instant }): IssuedReport {
  return {
    id: '00000000-0000-4000-8000-000000000000' as DailyReportId, eventId: input.eventId, reportDate: input.today, workdaysToEvent: input.workdaysToEvent,
    progressPercent: input.figures.progressPercent ?? 0, keyHighlight: '', blockers: '', signatory: '', signatoryTitle: signerTitle(input.department), documentNumber: null,
    figures: input.figures, eventName: input.eventName, eventDate: input.eventDate, issuedAt: input.now, issuedBy: '' as UserId,
  };
}
