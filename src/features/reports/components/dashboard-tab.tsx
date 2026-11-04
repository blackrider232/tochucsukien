'use client';

// "Bảng điều khiển tổng hợp" (m6 §1.7): five computed numbers (BUG-38/40)
// and one bar per task group of the event, whatever their number, with an
// empty state when the event has none (BUG-38/39).

import { Alert, EmptyState, KpiCard, ProgressBar, SectionCard } from '@/components/ui';
import { formatPercent2 } from '../domain/figures';
import type { ReportsScreenData } from '../domain/screen';

export function DashboardTab({ data }: { data: ReportsScreenData }) {
  const f = data.figures;
  return (
    <div className="space-y-4">
      {f === null ? (
        <Alert tone="warning" title="Số liệu tổng hợp chưa sẵn sàng">Chưa đọc được dữ liệu của phân hệ {data.missing.join(', ')}.</Alert>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard label="Tiến độ tổng thể" value={`${f.progressPercent}%`} icon="list-check" accent="blue" caption={`${f.stepsDone}/${f.stepsTotal} bước hoàn thành`} />
          <KpiCard label="Định mức mời" value={f.guestQuota > 0 ? `${Math.round((f.guestsInvited / f.guestQuota) * 100)}%` : '0%'} icon="users" accent="emerald" caption={`${f.guestsInvited}/${f.guestQuota} thư mời`} />
          <KpiCard label="Tiết kiệm ngân sách" value={f.biddingSavingsPercent !== null && f.biddingSavingsPercent < 0 ? `Vượt ${formatPercent2(-f.biddingSavingsPercent)}` : formatPercent2(f.biddingSavingsPercent)} icon="file-spreadsheet" accent="indigo" caption={`${f.packagesAwarded}/${f.packages} gói đã có giá trúng thầu (nhập tay)`} />
          <KpiCard label="Độ phủ truyền thông" value={`${f.clippings} bài`} icon="newspaper" accent="amber" caption="Báo chí và truyền hình" />
          <KpiCard label="Gian hàng đã chốt" value={f.boothsConfirmed} ofTotal={f.boothsTotal} icon="store" accent="purple" caption={f.boothsTotal === 0 ? 'Sự kiện chưa có gian hàng' : `Đang thẩm định: ${f.boothsReviewing}`} />
        </div>
      )}
      <SectionCard title="Tiến độ theo nhóm công việc" subtitle={`${data.groups.length} nhóm công việc của sự kiện`} icon="layers">
        {data.groups.length === 0 ? (
          <EmptyState icon="list-check" title="Sự kiện chưa có nhóm công việc" text="Áp dụng quy trình chuẩn ở mục Tiến độ để có các nhóm công việc." />
        ) : (
          <ul className="space-y-3">
            {data.groups.map((g) => (
              <li key={g.id} className="space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 break-words text-ink">{g.name}</span>
                  <span className="tabular-nums text-ink-2">{g.done}/{g.total} ({g.percent}%)</span>
                </div>
                <ProgressBar value={g.done} max={Math.max(g.total, 1)} label={`Tiến độ ${g.name}`} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
