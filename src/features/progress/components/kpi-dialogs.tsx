'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge, Button, Dialog, EmptyState, ProgressBar, StatusBadge } from '@/components/ui';
import { useCalendar, useSettings } from '@/core/auth';
import { formatCountdown, formatVNDate } from '@/core/dates';
import { departmentByName, EVENT_TYPES } from '@/core/vocab';
import { completedSteps, focusSteps, overdueSteps, type PlanSummary, type StepRef } from '../domain/dashboard';
import { usePlan } from './plan-context';

export type KpiPopup = 'daily' | 'all' | 'completed' | 'overdue';

function dayChip(days: number): { text: string; tone: 'rose' | 'amber' | 'blue' } {
  if (days < 0) return { text: `Trễ ${-days} ngày`, tone: 'rose' };
  if (days === 0) return { text: 'Hạn hôm nay', tone: 'amber' };
  return { text: `Còn ${days} ngày`, tone: 'blue' };
}

function List({ children }: { children: ReactNode }) {
  return <ul className="space-y-2">{children}</ul>;
}

export function KpiDialog({ popup, summaries, onClose, onFocus }: {
  popup: KpiPopup;
  summaries: ReadonlyArray<PlanSummary>;
  onClose: () => void;
  /** Close and scroll the dashboard to this event (and step). */
  onFocus: (eventId: string, stepId?: string) => void;
}) {
  const cal = useCalendar();
  const settings = useSettings();
  const { today, permsOf, toggleStep } = usePlan();
  const n = settings.dailyReportThresholdDays;
  const close = <Button variant="secondary" onClick={onClose}>Đóng</Button>;

  if (popup === 'daily') {
    const urgent = summaries.filter((s) => s.inDailyWindow);
    return (
      <Dialog open onClose={onClose} size="xl" icon="bell" accent="rose" title={`Việc Cần Báo cáo hàng ngày Trình Lãnh Đạo (${urgent.length} sự kiện)`}
        subtitle={`Các sự kiện sắp diễn ra trong vòng ${n} ngày làm việc cần cập nhật tiến độ liên tục`}
        footer={<><p className="mr-auto text-xs text-ink-muted">Áp dụng chế độ báo cáo khẩn cấp mốc {n} ngày làm việc</p>{close}</>}>
        {urgent.length === 0 ? (
          <EmptyState icon="check" title={`Không có sự kiện nào trong mốc báo cáo hàng ngày (≤ ${n} ngày làm việc)`} text="Hệ thống sẽ tự động kích hoạt thông báo khi các sự kiện sắp diễn ra." />
        ) : (
          <List>
            {urgent.map((s) => {
              const { event } = s.plan;
              const focus = focusSteps(cal, s, today);
              return (
                <li key={event.id} className="space-y-2 rounded-card border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={s.countdown.kind === 'today' ? 'emerald' : 'rose'}>{s.countdown.kind === 'today' ? 'Hôm nay diễn ra' : formatCountdown(s.countdown)}</Badge>
                    <span className="text-xs text-ink-muted">{formatVNDate(event.eventDate)} · {event.location || 'Hà Nội'} · {departmentByName(event.department).shortName}</span>
                  </div>
                  <p className="font-semibold text-ink">{event.name}</p>
                  <div className="rounded-control bg-surface-2 p-2.5">
                    <p className="mb-1 flex items-center justify-between text-xs font-semibold text-ink-2">
                      <span>Nhiệm vụ trọng tâm cần cập nhật:</span><span>{focus.total} việc cần chú ý</span>
                    </p>
                    {focus.shown.length === 0 ? (
                      <p className="text-xs text-ink-muted">Các bước hiện tại đều đang được tiến hành đúng kế hoạch.</p>
                    ) : (
                      <ul className="space-y-1">
                        {focus.shown.map((r) => {
                          const chip = dayChip(r.days);
                          return (
                            <li key={r.step.id} className="flex items-start gap-2 text-xs">
                              <span className="min-w-0 flex-1 text-ink">{r.step.name} <span className="text-ink-muted">({r.group.name})</span></span>
                              <Badge tone={chip.tone}>{chip.text}</Badge>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="secondary" onClick={() => onFocus(event.id)}>Xem Chi Tiết Sự Kiện</Button>
                    <Link href={`/events/${event.id}/reports`} className="inline-flex min-h-touch items-center rounded-control bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-hover">
                      Xuất Báo cáo hàng ngày
                    </Link>
                  </div>
                </li>
              );
            })}
          </List>
        )}
      </Dialog>
    );
  }

  if (popup === 'all') {
    return (
      <Dialog open onClose={onClose} size="xl" icon="calendar-check" accent="blue" title={`Danh Sách Tất Cả Sự Kiện (${summaries.length} sự kiện)`}
        subtitle="Tổng hợp toàn bộ các sự kiện đang triển khai và quản lý trên hệ thống" footer={close}>
        {summaries.length === 0 ? (
          <EmptyState icon="calendar-check" title="Chưa có sự kiện nào trong hệ thống" />
        ) : (
          <List>
            {summaries.map((s) => {
              const { event } = s.plan;
              return (
                <li key={event.id}>
                  <button type="button" onClick={() => onFocus(event.id)} className="w-full space-y-1.5 rounded-card border border-line p-3 text-left hover:bg-surface-2">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="min-w-0 flex-1 font-semibold text-ink">{event.name}</span>
                      <StatusBadge registry={EVENT_TYPES} value={event.type} size="sm" />
                      {s.progress.overdue > 0 && <Badge tone="rose">{s.progress.overdue} việc trễ</Badge>}
                    </span>
                    <span className="block text-xs text-ink-muted">{formatVNDate(event.eventDate)} · {event.location || 'Hà Nội'} · {formatCountdown(s.countdown)}</span>
                    <ProgressBar value={s.progress.done} max={s.progress.total} label={`${s.progress.done}/${s.progress.total} việc`} />
                  </button>
                </li>
              );
            })}
          </List>
        )}
      </Dialog>
    );
  }

  const refs: StepRef[] = popup === 'completed' ? completedSteps(cal, summaries, today) : overdueSteps(cal, summaries, today);
  const isOverdue = popup === 'overdue';
  return (
    <Dialog open onClose={onClose} size="xl" icon={isOverdue ? 'alert-triangle' : 'check'} accent={isOverdue ? 'amber' : 'emerald'}
      title={isOverdue ? `Danh Sách Việc chậm tiến độ (${refs.length} việc)` : `Danh Sách Việc Đã Hoàn Thành (${refs.length} việc)`}
      subtitle={isOverdue ? 'Các công việc đã quá hạn chót cần xử lý gấp và đôn đốc thực hiện' : 'Các công việc và bước chi tiết đã được nghiệm thu hoàn thành'}
      footer={<><p className="mr-auto text-xs text-ink-muted">{isOverdue ? 'Ưu tiên xử lý các việc trễ hạn nhiều ngày nhất' : 'Cập nhật theo dữ liệu mới nhất'}</p>{close}</>}>
      {refs.length === 0 ? (
        isOverdue
          ? <EmptyState icon="check" title="Tuyệt vời! Không có công việc nào bị chậm tiến độ" text="Tất cả các nhiệm vụ đều đang đúng hạn hoặc đã hoàn thành." />
          : <EmptyState icon="check" title="Chưa có công việc nào được đánh dấu hoàn thành" />
      ) : (
        <List>
          {refs.map((r) => (
            <li key={r.step.id} className="flex flex-wrap items-start gap-2 rounded-card border border-line p-3">
              <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                {isOverdue && <Badge tone="rose">Quá hạn {-r.days} ngày</Badge>}
                <p className="font-semibold text-ink">{r.step.name}</p>
                <p className="text-xs text-ink-muted">{r.event.name} • {r.group.name}</p>
                <p className="text-xs text-ink-muted">
                  {isOverdue ? `Hạn chót: ${formatVNDate(r.deadline)}` : `Hoàn thành bởi: ${r.step.completedBy ?? 'Không rõ'}`}
                  {isOverdue && r.step.assignee && ` • Cán bộ: ${r.step.assignee}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {isOverdue && permsOf(r.event.id).write && (
                  <Button accent="emerald" icon="check" onClick={() => void toggleStep(r.event.id, r.step, true)}>Đánh Dấu Hoàn Thành</Button>
                )}
                <Button variant="secondary" onClick={() => onFocus(r.event.id, r.step.id)}>{isOverdue ? 'Xem Chi Tiết' : 'Xem vị trí'}</Button>
              </div>
            </li>
          ))}
        </List>
      )}
    </Dialog>
  );
}
