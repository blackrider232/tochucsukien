'use client';

import { Nd30Header, PrintPage, SignatureBlock } from '@/components/ui';
import { useCalendar, useSettings } from '@/core/auth';
import type { IsoDate } from '@/core/brand';
import { formatCountdown, formatVNDate } from '@/core/dates';
import type { EventPlan } from '../contract';
import { sortSummaries, stepsByDeadline, summarize } from '../domain/dashboard';
import { deadlineOf, offsetLabel } from '../domain/schedule';

const th = 'border border-paper-ink px-1.5 py-1 text-left align-top font-bold';
const td = 'border border-paper-ink px-1.5 py-1 align-top';

/** The A4 "Kế hoạch hậu cần & tiến độ thực hiện" of one event (m2 §4.3), agency lines from settings, today's date. */
export function PrintPlan({ plan, today }: { plan: EventPlan; today: IsoDate }) {
  const cal = useCalendar();
  const { event } = plan;
  return (
    <PrintPage size="A4" orientation="portrait" margins="nd30">
      <Nd30Header issuer="trung_tam" documentNumber="Số: ..... /KH-SCE-TCSK" date={today} />
      <h1 className="mt-2 text-center text-print-lg font-bold uppercase">Kế hoạch hậu cần &amp; tiến độ thực hiện</h1>
      <p className="text-center font-bold">{event.name}</p>
      <p className="mb-3 text-center text-print-sm italic">
        Ngày tổ chức: {formatVNDate(event.eventDate, { weekday: true })} ({event.eventTime}) • Địa điểm: {event.location || 'Tại Hội trường'}
      </p>
      {plan.groups.map((g) => (
        <section key={g.id} className="mb-3 break-inside-avoid-page">
          <h2 className="font-bold">{g.name} (Phụ trách: {g.leadPerson || 'Đội chuyên trách'})</h2>
          {g.note && <p className="text-print-sm italic">Lưu ý: {g.note}</p>}
          <table className="mt-1 w-full border-collapse text-print-xs">
            <thead>
              <tr>
                <th className={`${th} w-8`}>STT</th>
                <th className={th}>Nội dung công việc</th>
                <th className={th}>Yêu cầu tiêu chuẩn SCE</th>
                <th className={`${th} w-28`}>Thời hạn hoàn thành</th>
                <th className={`${th} w-24`}>Người phụ trách</th>
                <th className={`${th} w-20`}>Tình trạng</th>
              </tr>
            </thead>
            <tbody>
              {stepsByDeadline(cal, event.eventDate, g.steps).map((s, i) => (
                <tr key={s.id} className="break-inside-avoid">
                  <td className={`${td} text-center`}>{i + 1}</td>
                  <td className={td}>{s.name}</td>
                  <td className={td}>{s.requirement}</td>
                  <td className={td}>{formatVNDate(deadlineOf(cal, event.eventDate, s))}<br />{offsetLabel(s)}</td>
                  <td className={td}>{s.assignee}</td>
                  <td className={td}>{s.completedAt ? '✓ Hoàn thành' : 'Đang làm'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <SignatureBlock
        left={{ title: 'Người lập kế hoạch', note: '(Ký và ghi rõ họ tên)', name: event.leadPerson || 'Chuyên viên phụ trách' }}
        right={{ title: 'Giám đốc Trung tâm', note: '(Ký duyệt, đóng dấu)' }}
      />
    </PrintPage>
  );
}

/** "In tổng hợp tiến độ sự kiện (A4)": every visible event in one table (m2 BUG-30). */
export function PrintSummary({ plans, today }: { plans: ReadonlyArray<EventPlan>; today: IsoDate }) {
  const cal = useCalendar();
  const settings = useSettings();
  const rows = sortSummaries(plans.map((p) => summarize(cal, p, today, settings)), today);
  return (
    <PrintPage size="A4" orientation="landscape" margins="nd30">
      <Nd30Header issuer="trung_tam" documentNumber="Số: ..... /BC-SCE-TCSK" date={today} />
      <h1 className="mt-2 text-center text-print-lg font-bold uppercase">Báo cáo tổng hợp tiến độ tổ chức sự kiện</h1>
      <p className="mb-3 text-center text-print-sm italic">Tính đến ngày {formatVNDate(today)}</p>
      <table className="w-full border-collapse text-print-xs">
        <thead>
          <tr>
            {['STT', 'Tên sự kiện', 'Ngày tổ chức', 'Địa điểm', 'Phòng chủ trì', 'Tiến độ', 'Việc chậm', 'Thời gian'].map((h) => <th key={h} className={th}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.plan.event.id} className="break-inside-avoid">
              <td className={`${td} text-center`}>{i + 1}</td>
              <td className={td}>{r.plan.event.name}</td>
              <td className={td}>{formatVNDate(r.plan.event.eventDate)}</td>
              <td className={td}>{r.plan.event.location}</td>
              <td className={td}>{r.plan.event.department}</td>
              <td className={td}>{r.progress.done}/{r.progress.total} ({r.progress.percent}%)</td>
              <td className={`${td} text-center`}>{r.progress.overdue}</td>
              <td className={td}>{formatCountdown(r.countdown)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="mt-2 text-center italic">Chưa có sự kiện nào trong hệ thống.</p>}
      <SignatureBlock left={{ title: 'Người lập báo cáo' }} right={{ title: 'Giám đốc Trung tâm', note: '(Ký duyệt, đóng dấu)' }} />
    </PrintPage>
  );
}
