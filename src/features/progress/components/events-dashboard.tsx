'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button, EmptyState, FilterBar, KpiCard, PrintLink, SectionCard, Tabs, downloadBlob, downloadXlsx, useToast, xlsxSheet } from '@/components/ui';
import { useCalendar, useSettings } from '@/core/auth';
import { DEPARTMENTS, EVENT_TYPES, enumOptions, type DepartmentName, type EventType } from '@/core/vocab';
import { dashboardKpis, filterSummaries, NO_FILTER, sortSummaries, summarize, type PlanFilter, type StatusFilter, type VisiblePlan } from '../domain/dashboard';
import { eventsCsv, EXPORT_COLUMNS, exportFileStem } from '../domain/export';
import { EventCard, type Expansion } from './event-card';
import { KpiDialog, type KpiPopup } from './kpi-dialogs';
import { PlanProvider, usePlan, type PlanScreenData } from './plan-context';

type ViewMode = 'collapse_all' | 'expand_groups' | 'expand_all';
const VIEW_MODES = [
  { id: 'collapse_all', label: 'Thu gọn tất cả' },
  { id: 'expand_groups', label: 'Mở rộng Nhóm việc' },
  { id: 'expand_all', label: 'Mở rộng tất cả' },
];

const STATUS_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'daily_report', label: 'Cần báo cáo hàng ngày' },
  { value: 'dday_today', label: 'Hôm nay diễn ra' },
  { value: 'has_overdue', label: 'Có việc chậm tiến độ' },
  { value: 'preparing', label: 'Đang chuẩn bị' },
  { value: 'completed', label: 'Đã hoàn thành' },
];
const TYPE_OPTIONS = [{ value: 'all', label: 'Tất cả loại hình' }, ...enumOptions(EVENT_TYPES).map((o) => ({ value: o.value, label: o.label }))];
const DEPT_OPTIONS = [{ value: 'all', label: 'Tất cả phòng ban' }, ...DEPARTMENTS.filter((d) => d.canChairEvents).map((d) => ({ value: d.name, label: d.shortName }))];

/** Ids a view mode opens: events, or events and their groups. */
function openedBy(mode: ViewMode, visible: ReadonlyArray<VisiblePlan>): Set<string> {
  if (mode === 'collapse_all') return new Set();
  return new Set(visible.flatMap((v) => [v.summary.plan.event.id, ...(mode === 'expand_all' ? v.groups.map((g) => g.id) : [])]));
}

export function EventsDashboard({ data, initialPopup }: { data: PlanScreenData; initialPopup: KpiPopup | null }) {
  return (
    <PlanProvider data={data}>
      <Dashboard initialPopup={initialPopup} />
    </PlanProvider>
  );
}

function Dashboard({ initialPopup }: { initialPopup: KpiPopup | null }) {
  const { data, today } = usePlan();
  const cal = useCalendar();
  const settings = useSettings();
  const router = useRouter();
  const toast = useToast();
  const summaries = useMemo(() => sortSummaries(data.plans.map((p) => summarize(cal, p, today, settings)), today), [data.plans, cal, today, settings]);
  const [filter, setFilter] = useState<PlanFilter>(NO_FILTER);
  const [mode, setMode] = useState<ViewMode>('collapse_all');
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const [popup, setPopup] = useState<KpiPopup | null>(initialPopup);
  const visible = useMemo(() => filterSummaries(summaries, filter), [summaries, filter]);
  const kpis = dashboardKpis(summaries);

  const expansion: Expansion = {
    isOpen: (id) => opened.has(id),
    toggle: (id) => setOpened((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    }),
  };
  const changeFilter = (patch: Partial<PlanFilter>) => {
    const next = { ...filter, ...patch };
    setFilter(next);
    // A search opens what it matched; the headers still toggle afterwards (m2 BUG-32).
    if (patch.q !== undefined && patch.q.trim()) setOpened(openedBy('expand_all', filterSummaries(summaries, next)));
  };
  const changeMode = (m: string) => {
    setMode(m as ViewMode);
    setOpened(openedBy(m as ViewMode, visible));
  };
  const closePopup = () => {
    setPopup(null);
    if (initialPopup) router.replace('/events', { scroll: false });
  };
  const focus = (eventId: string, stepId?: string) => {
    setPopup(null);
    const target = summaries.find((s) => s.plan.event.id === eventId);
    if (!visible.some((v) => v.summary.plan.event.id === eventId)) setFilter(NO_FILTER);
    const groupId = stepId ? target?.plan.groups.find((g) => g.steps.some((s) => s.id === stepId))?.id : undefined;
    setOpened((s) => new Set([...s, eventId, ...(groupId ? [groupId] : [])]));
    requestAnimationFrame(() => {
      const el = document.getElementById(stepId ? `step-${stepId}` : `event-${eventId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: stepId ? 'center' : 'start' });
      el?.focus({ preventScroll: true });
    });
  };
  const exportXlsx = async () => {
    if (visible.length === 0) return toast.info('Chưa có dữ liệu sự kiện để xuất Excel.');
    const rows = visible.map((v) => v.summary);
    await downloadXlsx(exportFileStem(), [xlsxSheet({ name: 'Tiến độ sự kiện', title: { lines: ['BÁO CÁO TIẾN ĐỘ TỔ CHỨC SỰ KIỆN', settings.agencyName] }, columns: EXPORT_COLUMNS, rows, freezeHeader: true, autoFilter: true })]);
  };
  const exportCsv = () => {
    if (visible.length === 0) return toast.info('Chưa có dữ liệu sự kiện để xuất.');
    downloadBlob(eventsCsv(visible.map((v) => v.summary)), `${exportFileStem()}.csv`);
  };
  const filtered = filter.q.trim() !== '' || filter.type !== 'all' || filter.department !== 'all' || filter.status !== 'all';
  const canCreate = data.createDepartments.length > 0;

  return (
    <div className="space-y-4">
      <SectionCard
        title="Bảng Điều Khiển Sự Kiện"
        icon="calendar-check"
        accent="blue"
        actions={
          <>
            {canCreate && <Button icon="plus" href="/events/new">Tạo Sự Kiện</Button>}
            <PrintLink href="/events/summary" label="In tổng hợp" />
            <Button variant="secondary" icon="file-spreadsheet" onClick={() => void exportXlsx()}>Xuất Excel</Button>
            <Button variant="secondary" icon="download" onClick={exportCsv}>CSV</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Tổng Sự Kiện" value={kpis.totalEvents} icon="calendar-check" accent="blue" caption="Xem tất cả sự kiện" onClick={() => setPopup('all')} />
          <KpiCard label="Báo Cáo Hàng Ngày" value={kpis.dailyReport} icon="bell" accent="rose" highlight={kpis.dailyReport > 0}
            caption={`Trong mốc ${settings.dailyReportThresholdDays} ngày làm việc`} onClick={() => setPopup('daily')} />
          <KpiCard label="Việc Hoàn Thành" value={kpis.completedSteps} ofTotal={kpis.totalSteps} icon="check" accent="emerald"
            progress={{ value: kpis.completedSteps, max: kpis.totalSteps }} onClick={() => setPopup('completed')} />
          <KpiCard label="Việc Chậm Tiến Độ" value={kpis.overdueSteps} icon="alert-triangle" accent="amber" highlight={kpis.overdueSteps > 0}
            caption="Cần xử lý gấp" onClick={() => setPopup('overdue')} />
        </div>
      </SectionCard>

      <FilterBar
        search={{ value: filter.q, onChange: (q) => changeFilter({ q }), placeholder: 'Tìm kiếm tên sự kiện, nhóm việc, bước chi tiết, cán bộ, ghi chú...' }}
        filters={[
          { id: 'type', label: 'Loại hình', value: filter.type, options: TYPE_OPTIONS, onChange: (v) => changeFilter({ type: v as 'all' | EventType }) },
          { id: 'dept', label: 'Phòng chủ trì', value: filter.department, options: DEPT_OPTIONS, onChange: (v) => changeFilter({ department: v as 'all' | DepartmentName }) },
          { id: 'status', label: 'Trạng thái', value: filter.status, options: STATUS_OPTIONS, onChange: (v) => changeFilter({ status: v as StatusFilter }) },
        ]}
        trailing={filtered ? <Button variant="ghost" icon="x" onClick={() => setFilter(NO_FILTER)}>Xóa bộ lọc</Button> : undefined}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted" aria-live="polite">{visible.length}/{summaries.length} sự kiện</p>
        <Tabs items={VIEW_MODES} value={mode} onChange={changeMode} variant="segmented" />
      </div>

      {visible.length === 0 ? (
        <div className="rounded-card border border-line bg-surface">
          <EmptyState
            icon="calendar-check"
            title={summaries.length === 0 ? 'Chưa có sự kiện nào' : 'Không tìm thấy sự kiện nào'}
            text={summaries.length === 0 ? 'Bấm Tạo Sự Kiện Mới để bắt đầu lập kế hoạch.' : 'Vui lòng điều chỉnh lại từ khóa tìm kiếm hoặc bộ lọc.'}
            action={summaries.length === 0 && canCreate ? <Button icon="plus" href="/events/new">Tạo Sự Kiện Mới</Button>
              : filtered ? <Button variant="secondary" onClick={() => setFilter(NO_FILTER)}>Xóa bộ lọc</Button> : undefined}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((v) => <EventCard key={v.summary.plan.event.id} summary={v.summary} groups={v.groups} expansion={expansion} />)}
        </div>
      )}

      {popup && <KpiDialog popup={popup} summaries={summaries} onClose={closePopup} onFocus={focus} />}
    </div>
  );
}
