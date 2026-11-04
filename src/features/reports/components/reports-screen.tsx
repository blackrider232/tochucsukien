'use client';

// "Báo cáo & Tổng kết" (m6 §1.1): the four headline numbers every sub-tab
// shares, then the sub-tab. The event header, switcher and sub-tab bar belong
// to the event layout (ui-rules 15). Every number is computed (BUG-09/11/22/37).

import { Alert, KpiCard, useSettings } from '@/components/ui';
import { formatCountdown, formatVNTime } from '@/core/dates';
import { formatVnd } from '@/core/text';
import type { Tone } from '@/core/vocab';
import { formatPercent2, milestoneLabel, type DailyReportState } from '../domain/figures';
import type { ReportsScreenData } from '../domain/screen';
import { BiddingTab } from './bidding-tab';
import { DailyTab } from './daily-tab';
import { DashboardTab } from './dashboard-tab';
import { MediaTab } from './media-tab';
import { OfficialTab } from './official-tab';

export type ReportsTab = 'daily' | 'official' | 'media' | 'bidding' | 'dashboard';

export const STATE_BADGE: { readonly [K in DailyReportState['kind']]: { text: string; tone: Tone } } = {
  not_yet: { text: 'Chưa đến mốc báo cáo', tone: 'slate' },
  active: { text: 'Trong mốc báo cáo hằng ngày', tone: 'rose' },
  event_day: { text: 'Hôm nay khai mạc', tone: 'emerald' },
  past: { text: 'Sự kiện đã diễn ra', tone: 'slate' },
};

/** 'Còn 8 ngày làm việc', 'Hôm nay', 'Đã diễn ra 2 ngày trước': the shared countdown wording. */
export function stateText(s: DailyReportState): string {
  if (s.kind === 'event_day') return formatCountdown({ kind: 'today' });
  if (s.kind === 'past') return formatCountdown({ kind: 'past', calendarDays: s.calendarDays });
  return formatCountdown({ kind: 'future', calendarDays: s.calendarDays, workdays: s.workdays });
}

export function ReportsScreen({ data, tab }: { data: ReportsScreenData; tab: ReportsTab }) {
  const { state, figures: f, issuedToday } = data;
  const settings = useSettings();
  return (
    <div className="space-y-4">
      {f === null ? (
        <Alert tone="warning" title="Số liệu tổng hợp chưa sẵn sàng">
          Chưa đọc được dữ liệu của phân hệ {data.missing.join(', ')}. Các số liệu tổng hợp sẽ hiển thị khi phân hệ hoạt động.
        </Alert>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Báo cáo hàng ngày" value={milestoneLabel(state)} icon="clock" accent="rose" highlight
            badge={STATE_BADGE[state.kind]}
            caption={issuedToday ? `Đã phát hành hôm nay lúc ${formatVNTime(issuedToday.issuedAt)}` : state.kind === 'active' ? `${stateText(state)}. Chưa phát hành báo cáo hôm nay` : stateText(state)}
          />
          <KpiCard
            label="Tiến độ hoàn thành" value={`${f.progressPercent}%`} icon="list-check" accent="blue"
            progress={{ value: f.stepsDone, max: Math.max(f.stepsTotal, 1) }}
            caption={`Xong: ${f.stepsDone}/${f.stepsTotal} • Quá hạn: ${f.overdueSteps} • Chưa xong: ${f.stepsTotal - f.stepsDone}`}
          />
          <KpiCard
            label="Thư mời so với định mức" value={f.guestsInvited} ofTotal={f.guestQuota} icon="users" accent="emerald"
            badge={f.quotaReached ? { text: 'Đạt định mức', tone: 'emerald' } : { text: `Còn thiếu ${f.guestQuota - f.guestsInvited}`, tone: 'amber' }}
            caption={`Định mức ${settings.guestQuotaPercent}% của ${f.guestTarget} đại biểu • Tham dự: ${f.guestsAttending}`}
          />
          <KpiCard
            label="Gói thầu (nhập tay)" value={f.packages} icon="file-spreadsheet" accent="indigo"
            badge={f.biddingSavingsPercent === null ? undefined : { text: f.biddingSavingsPercent >= 0 ? `Tiết kiệm ${formatPercent2(f.biddingSavingsPercent)}` : `Vượt ${formatPercent2(-f.biddingSavingsPercent)}`, tone: f.biddingSavingsPercent >= 0 ? 'emerald' : 'rose' }}
            caption={f.packagesAwarded > 0
              ? `${f.packagesAwarded}/${f.packages} gói có giá trúng: ${formatVnd(f.biddingWinning, { compact: true })} trên dự toán ${formatVnd(f.biddingAwardedBudget, { compact: true })}`
              : `Tổng dự toán ${formatVnd(f.biddingBudget, { compact: true })} • Chưa có giá trúng thầu`}
          />
        </div>
      )}

      {tab === 'daily' && <DailyTab data={data} />}
      {tab === 'official' && <OfficialTab data={data} />}
      {tab === 'media' && <MediaTab data={data} />}
      {tab === 'bidding' && <BiddingTab data={data} />}
      {tab === 'dashboard' && <DashboardTab data={data} />}
    </div>
  );
}
