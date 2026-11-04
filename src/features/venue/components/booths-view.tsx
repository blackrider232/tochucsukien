'use client';

import { useState } from 'react';
import {
  Badge, Button, DataTable, downloadXlsx, EmptyState, FilterBar, IconButton, KpiCard, PrintLink, RowMenu, SectionCard, StatusBadge, useDialogs, useToast, xlsxSheet,
} from '@/components/ui';
import { useCommand } from '@/core/commands';
import { fileDateStamp, formatVNDate } from '@/core/dates';
import { fileNameStem } from '@/core/text';
import { enumOptions } from '@/core/vocab';
import type { Booth, BoothShift } from '../contract';
import {
  BOOTH_STATUS, boothKpis, boothsByRow, confirmedCompanies, filterBooths, NO_BOOTH_FILTER, officersOnDuty, selfFunded, SHIFT_STATE, shiftsInOrder, shiftState,
  SUBSIDY, subsidyKey, type BoothFilter,
} from '../domain/booths';
import { BoothDialog, ShiftDialog } from './booth-dialogs';
import type { BoothsScreenData, EventRef } from './screen-types';

export type BoothTab = 'floorplan' | 'list' | 'schedule';

/** "Gian hàng Hội chợ" (m4b §1.8): the KPI row, then the view of the sub-tab the URL names (m4b BUG-38). */
export function BoothsView({ data, tab }: { data: BoothsScreenData; tab: BoothTab }) {
  const [editing, setEditing] = useState<Booth | 'new' | null>(null);
  const k = boothKpis(data.booths);
  const fill = k.total > 0 ? Math.round((k.confirmed / k.total) * 100) : 0;
  const codes = data.booths.map((b) => b.code);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Tỷ lệ lấp đầy gian hàng" value={k.confirmed} ofTotal={k.total} icon="store" accent="emerald" highlight
          badge={{ text: `${fill}%`, tone: 'emerald' }} progress={k.total > 0 ? { value: k.confirmed, max: k.total } : undefined}
          caption={`Còn trống: ${k.available} gian • Đang thẩm định: ${k.reviewing}`} />
        <KpiCard label="Doanh nghiệp / HTX tham gia" value={confirmedCompanies(data.booths)} icon="briefcase" accent="emerald" caption="Đơn vị đã chốt vị trí" />
        <KpiCard label="Chính sách hỗ trợ kinh phí" value={k.fullSubsidy + k.halfSubsidy} icon="file-text" accent="emerald"
          caption={`Hỗ trợ 100%: ${k.fullSubsidy} • Hỗ trợ 50%: ${k.halfSubsidy} • Tự túc: ${selfFunded(data.booths)}`} />
        <KpiCard label="Cán bộ SCE trực hỗ trợ (Mục 9)" value={officersOnDuty(data.shifts)} icon="users" accent="emerald" caption={`Cán bộ theo ${data.shifts.length} ca trực`} />
      </div>
      {tab === 'floorplan' && <Floorplan data={data} onOpen={setEditing} />}
      {tab === 'list' && <BoothList data={data} onOpen={setEditing} />}
      {tab === 'schedule' && <DutySchedule data={data} />}
      {editing && <BoothDialog eventId={data.event.id} booth={editing === 'new' ? null : editing} codes={codes} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Excel through the kit, Vietnamese labels, text cells (m4b BUG-25). */
async function exportBooths(event: EventRef, booths: ReadonlyArray<Booth>) {
  await downloadXlsx(`DS_GianHang_${fileNameStem(event.name, 40)}_${fileDateStamp()}.xlsx`, [
    xlsxSheet<Booth>({
      name: 'Gian hàng',
      title: { lines: ['Danh sách gian hàng hội chợ', event.name] },
      rows: booths,
      autoFilter: true,
      freezeHeader: true,
      columns: [
        { header: 'Mã gian', width: 10, value: (b) => b.code },
        { header: 'Doanh nghiệp / HTX tham gia', width: 40, value: (b) => b.company },
        { header: 'Sản phẩm trưng bày chính', width: 40, value: (b) => b.products },
        { header: 'Quy cách / Diện tích', width: 24, value: (b) => b.size },
        { header: 'Mức hỗ trợ kinh phí (%)', width: 16, value: (b) => b.subsidyPercent },
        { header: 'Trạng thái gian hàng', width: 22, value: (b) => BOOTH_STATUS[b.status].label },
        { header: 'Người đại diện & Hotline', width: 30, value: (b) => b.contact },
        { header: 'Cán bộ SCE trực hỗ trợ', width: 28, value: (b) => b.staff },
      ],
    }),
  ]);
}

function useExport(event: EventRef) {
  const toast = useToast();
  return async (booths: ReadonlyArray<Booth>) => {
    if (booths.length === 0) return toast.warning('Chưa có gian hàng nào để xuất file.');
    await exportBooths(event, booths);
    toast.success('Đã xuất file Excel danh sách gian hàng');
  };
}

function Floorplan({ data, onOpen }: { data: BoothsScreenData; onOpen: (b: Booth | 'new') => void }) {
  const exportAll = useExport(data.event);
  return (
    <SectionCard title="Mặt bằng phân bổ gian hàng tiêu chuẩn (Dãy A, B, C...)" icon="map"
      subtitle={data.canWrite ? 'Bấm vào ô gian hàng để xem chi tiết doanh nghiệp, mức hỗ trợ kinh phí hoặc chỉnh sửa thông tin.' : 'Mỗi ô là một gian 3m x 3m, xếp theo dãy và số thứ tự.'}
      actions={
        <>
          <IconButton icon="file-spreadsheet" label="Xuất danh sách gian hàng ra Excel" onClick={() => void exportAll(data.booths)} />
          <PrintLink href={`/events/${data.event.id}/booths/print`} label="In sơ đồ mặt bằng" />
          {data.canWrite && <Button icon="plus" onClick={() => onOpen('new')}>Thêm gian hàng</Button>}
        </>
      }>
      {data.booths.length === 0 ? (
        <EmptyState icon="store" title="Chưa có dữ liệu gian hàng." text={data.canWrite ? 'Bấm "Thêm gian hàng" để bắt đầu.' : undefined} />
      ) : (
        <div className="space-y-4">
          <ul aria-label="Chú giải trạng thái" className="flex flex-wrap gap-2">
            {enumOptions(BOOTH_STATUS).map((o) => <li key={o.value}><StatusBadge registry={BOOTH_STATUS} value={o.value} /></li>)}
          </ul>
          {boothsByRow(data.booths).map(({ row, booths }) => (
            <section key={row} aria-labelledby={`row-${row}`} className="space-y-2">
              <h3 id={`row-${row}`} className="text-sm font-bold text-ink">Dãy {row}</h3>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
                {booths.map((b) => {
                  const body = (
                    <>
                      <span className="flex w-full items-center justify-between gap-1">
                        <span className="font-mono text-sm font-bold text-ink">{b.code}</span>
                        <Badge tone={SUBSIDY[subsidyKey(b.subsidyPercent)].tone}>{b.subsidyPercent}%</Badge>
                      </span>
                      <span className="line-clamp-2 w-full text-xs text-ink-2">{b.company || <span className="italic text-ink-muted">Chưa có doanh nghiệp</span>}</span>
                      <StatusBadge registry={BOOTH_STATUS} value={b.status} size="sm" />
                    </>
                  );
                  const tile = 'flex min-h-24 w-full flex-col items-start gap-1 rounded-control border p-2 text-left';
                  const look = b.status === 'available' ? 'border-dashed border-control-border bg-surface-2' : 'border-control-border bg-surface';
                  return (
                    <li key={b.id}>
                      {data.canWrite ? (
                        <button type="button" className={`${tile} ${look} hover:bg-surface-3`} aria-label={`Gian ${b.code}: ${b.company || 'chưa có doanh nghiệp'}, ${BOOTH_STATUS[b.status].label}. Bấm để chỉnh sửa`} onClick={() => onOpen(b)}>{body}</button>
                      ) : (
                        <div className={`${tile} ${look}`}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

const SUBSIDY_FILTERS = [{ value: 'all', label: 'Tất cả chính sách' }, ...enumOptions(SUBSIDY).map((o) => ({ value: o.value, label: o.short }))];
const STATUS_FILTERS = [{ value: 'all', label: 'Tất cả trạng thái' }, ...enumOptions(BOOTH_STATUS).map((o) => ({ value: o.value, label: o.label }))];

function BoothList({ data, onOpen }: { data: BoothsScreenData; onOpen: (b: Booth | 'new') => void }) {
  const run = useCommand();
  const dialogs = useDialogs();
  const exportRows = useExport(data.event);
  const [filter, setFilter] = useState<BoothFilter>(NO_BOOTH_FILTER);
  const rows = filterBooths(data.booths, filter);
  const remove = async (b: Booth) => {
    const ok = await dialogs.confirm({ title: `Xóa gian hàng ${b.code}?`, text: b.company ? `Doanh nghiệp: ${b.company}` : 'Gian còn trống.', confirmLabel: 'Đồng ý xóa', cancelLabel: 'Hủy', tone: 'danger' });
    if (ok) await run('venue.deleteBooth', { eventId: data.event.id, id: b.id, version: b.version }, { success: 'Đã xóa gian hàng' });
  };

  return (
    <SectionCard title="Danh sách doanh nghiệp & gian hàng chi tiết" icon="briefcase" subtitle={`${data.booths.length} gian hàng`}
      actions={
        <>
          <Button variant="secondary" icon="file-spreadsheet" onClick={() => void exportRows(rows)}>Xuất Excel</Button>
          {data.canWrite && <Button icon="plus" onClick={() => onOpen('new')}>Thêm gian hàng</Button>}
        </>
      }>
      <DataTable<Booth>
        rows={rows}
        rowKey={(b) => b.id}
        minWidth="56rem"
        toolbar={
          <FilterBar
            search={{ value: filter.q, onChange: (q) => setFilter({ ...filter, q }), placeholder: 'Tìm kiếm theo mã gian, tên doanh nghiệp, sản phẩm...' }}
            filters={[
              { id: 'subsidy', label: 'Chính sách hỗ trợ', value: filter.subsidy, options: SUBSIDY_FILTERS, onChange: (v) => setFilter({ ...filter, subsidy: v as BoothFilter['subsidy'] }) },
              { id: 'status', label: 'Trạng thái', value: filter.status, options: STATUS_FILTERS, onChange: (v) => setFilter({ ...filter, status: v as BoothFilter['status'] }) },
            ]}
          />
        }
        empty={{ icon: 'store', title: data.booths.length === 0 ? 'Chưa có gian hàng nào.' : 'Chưa có gian hàng nào phù hợp với điều kiện tìm kiếm.' }}
        columns={[
          {
            id: 'booth', header: 'Gian / doanh nghiệp', sortValue: (b) => b.code, cell: (b) => (
              <span className="block space-y-1">
                <span className="block"><span className="font-mono font-bold text-ink">{b.code}</span> <span className="font-semibold text-ink">{b.company || <span className="italic font-normal text-ink-muted">Chưa có doanh nghiệp</span>}</span></span>
                <StatusBadge registry={BOOTH_STATUS} value={b.status} size="sm" />
              </span>
            ),
          },
          { id: 'products', header: 'Sản phẩm trưng bày', hideOnMobile: true, cell: (b) => b.products || <span className="text-ink-muted">Chưa có</span> },
          { id: 'size', header: 'Diện tích', hideOnMobile: true, cell: (b) => b.size },
          { id: 'subsidy', header: 'Hỗ trợ kinh phí', cell: (b) => <StatusBadge registry={SUBSIDY} value={subsidyKey(b.subsidyPercent)} size="sm" /> },
          { id: 'contact', header: 'Người đại diện & hotline', hideOnMobile: true, cell: (b) => b.contact || <span className="text-ink-muted">Chưa có</span> },
          { id: 'staff', header: 'Cán bộ SCE trực', hideOnMobile: true, cell: (b) => b.staff || <span className="text-ink-muted">Chưa phân công</span> },
          ...(data.canWrite ? [{
            id: 'actions', header: 'Thao tác', align: 'right' as const, cell: (b: Booth) => (
              <RowMenu label={`Thao tác với gian ${b.code}`} items={[
                { id: 'edit', label: 'Sửa gian hàng', icon: 'pencil', onSelect: () => onOpen(b) },
                { id: 'delete', label: 'Xóa gian hàng', icon: 'trash', tone: 'danger', onSelect: () => void remove(b) },
              ]} />
            ),
          }] : []),
        ]}
      />
    </SectionCard>
  );
}

function DutySchedule({ data }: { data: BoothsScreenData }) {
  const run = useCommand();
  const dialogs = useDialogs();
  const [editing, setEditing] = useState<BoothShift | 'new' | null>(null);
  const remove = async (s: BoothShift) => {
    const ok = await dialogs.confirm({ title: `Xóa ca trực của ${s.officerName}?`, text: `${s.shiftLabel} ngày ${formatVNDate(s.shiftDate)}.`, confirmLabel: 'Đồng ý xóa', cancelLabel: 'Hủy', tone: 'danger' });
    if (ok) await run('venue.deleteShift', { eventId: data.event.id, id: s.id, version: s.version }, { success: 'Đã xóa ca trực' });
  };
  return (
    <SectionCard title="Phân công cán bộ trực hỗ trợ doanh nghiệp theo ca (Mục 9)" icon="clock"
      subtitle="Theo đúng quy định Phụ lục III: phân công cán bộ trực, giải quyết các vướng mắc về điện, nước, an ninh, kết nối giao thương trong suốt kỳ Hội chợ."
      actions={data.canWrite && <Button icon="plus" onClick={() => setEditing('new')}>Thêm ca trực</Button>}>
      <DataTable<BoothShift>
        rows={shiftsInOrder(data.shifts)}
        rowKey={(s) => s.id}
        empty={{ icon: 'clock', title: 'Chưa có ca trực nào.', text: data.canWrite ? 'Bấm "Thêm ca trực" để phân công cán bộ.' : undefined }}
        columns={[
          { id: 'when', header: 'Ngày trực / khung giờ', cell: (s) => <span><span className="font-semibold text-ink">{formatVNDate(s.shiftDate, { weekday: true })}</span><span className="block text-xs text-ink-muted">{s.shiftLabel}</span></span> },
          { id: 'officer', header: 'Cán bộ phụ trách trực', cell: (s) => s.officerName },
          { id: 'department', header: 'Phòng ban', hideOnMobile: true, cell: (s) => s.department },
          { id: 'phone', header: 'Hotline trực', hideOnMobile: true, cell: (s) => s.phone || <span className="text-ink-muted">Chưa có</span> },
          { id: 'zone', header: 'Khu vực / dãy gian hàng', hideOnMobile: true, cell: (s) => s.zone || <span className="text-ink-muted">Chưa phân</span> },
          { id: 'state', header: 'Trạng thái ca', cell: (s) => <StatusBadge registry={SHIFT_STATE} value={shiftState(s, data.today)} size="sm" /> },
          ...(data.canWrite ? [{
            id: 'actions', header: 'Thao tác', align: 'right' as const, cell: (s: BoothShift) => (
              <RowMenu label={`Thao tác với ca trực của ${s.officerName}`} items={[
                { id: 'edit', label: 'Sửa ca trực', icon: 'pencil', onSelect: () => setEditing(s) },
                { id: 'delete', label: 'Xóa ca trực', icon: 'trash', tone: 'danger', onSelect: () => void remove(s) },
              ]} />
            ),
          }] : []),
        ]}
      />
      {editing && <ShiftDialog eventId={data.event.id} eventDate={data.event.eventDate} shift={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </SectionCard>
  );
}
