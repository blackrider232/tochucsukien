'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Button, DataTable, Dialog, FilterBar, PrintLink, Tabs, type Column, type EmptyStateProps } from '@/components/ui';
import { useSettings } from '@/core/auth';
import { isAttending } from '@/core/vocab';
import type { RosterEntry } from '../contract';
import { printHref } from '../domain/print';
import { NO_FILTER, filterGuests, isBanquetGuest, titleOrDefault, type GuestFilter } from '../domain/roster';
import type { GuestScreenData, KpiPopup } from '../domain/screen';
import { BanquetCell, ExportButton, GROUP_FILTER, GroupCell, NameCell, OrgCell, RSVP_FILTER, RsvpCell, SeatCell } from './cells';


type Sets = { namecards: ReadonlyArray<RosterEntry>; badges: ReadonlyArray<RosterEntry> };

/** One searchable list primitive for the four pop-ups (m4a §7.1 item 6). */
function GuestList({ rows, columns, empty, search, filters = false, children }: {
  rows: ReadonlyArray<RosterEntry>;
  columns: ReadonlyArray<Column<RosterEntry>>;
  empty: EmptyStateProps;
  search: string;
  filters?: boolean;
  children?: (shown: number) => ReactNode;
}) {
  const [filter, setFilter] = useState<GuestFilter>(NO_FILTER);
  const shown = useMemo(() => filterGuests(rows, filter), [rows, filter]);
  return (
    <div className="space-y-3">
      <FilterBar
        search={{ value: filter.q, onChange: (q) => setFilter({ ...filter, q }), placeholder: search }}
        filters={filters ? [
          { id: 'group', label: 'Nhóm khách', value: filter.group, options: GROUP_FILTER, onChange: (v) => setFilter({ ...filter, group: v as GuestFilter['group'] }) },
          { id: 'rsvp', label: 'RSVP', value: filter.rsvp, options: RSVP_FILTER, onChange: (v) => setFilter({ ...filter, rsvp: v as GuestFilter['rsvp'] }) },
        ] : undefined}
      />
      <DataTable rows={shown} columns={columns} rowKey={(g) => g.id} numbered stickyHeader maxHeight="60vh" empty={empty} />
      {children?.(shown.length)}
    </div>
  );
}

const footnote = (text: string) => <p className="text-xs text-ink-muted">{text}</p>;

export function KpiDialog({ popup, data, sets, onClose, onAdd }: { popup: KpiPopup; data: GuestScreenData; sets: Sets; onClose: () => void; onAdd?: () => void }) {
  const settings = useSettings();
  const { event, roster } = data;
  const close = <Button variant="secondary" onClick={onClose}>Đóng</Button>;
  const nameCol: Column<RosterEntry> = { id: 'name', header: 'Họ và tên đại biểu', cell: (g) => <NameCell g={g} /> };
  const orgCol: Column<RosterEntry> = { id: 'org', header: 'Chức vụ & đơn vị', cell: (g) => <OrgCell g={g} />, hideOnMobile: true };

  if (popup === 'all') {
    return (
      <Dialog open onClose={onClose} size="3xl" icon="users" title={`Danh sách khách mời & đại biểu (${roster.length} đại biểu)`} subtitle={`Sự kiện: ${event.name}`}
        footer={<><ExportButton data={data} variant="ghost" />{onAdd && <Button variant="secondary" icon="plus" onClick={onAdd}>Thêm khách</Button>}{close}</>}>
        <GuestList rows={roster} filters search="Tìm theo tên đại biểu, chức danh, đơn vị, điện thoại..." empty={{ icon: 'search', title: 'Không tìm thấy đại biểu nào phù hợp.' }}
          columns={[
            nameCol,
            { ...orgCol, header: 'Chức danh & cơ quan' },
            { id: 'group', header: 'Nhóm', cell: (g) => <GroupCell g={g} />, hideOnMobile: true },
            { id: 'rsvp', header: 'RSVP', cell: (g) => <RsvpCell g={g} /> },
            { id: 'banquet', header: 'Tiệc', cell: (g) => <BanquetCell g={g} />, hideOnMobile: true },
            { id: 'seat', header: 'Ghế ngồi', cell: (g) => <SeatCell g={g} linked={data.canSeeSeating} />, hideOnMobile: true },
          ]}>
          {(shown) => footnote(`Hiển thị ${shown}/${roster.length} đại biểu`)}
        </GuestList>
      </Dialog>
    );
  }

  if (popup === 'confirmed') {
    const attending = roster.filter((g) => isAttending(g.rsvpStatus));
    return (
      <Dialog open onClose={onClose} size="3xl" icon="circle-check" title={`Khách mời đã xác nhận tham dự (RSVP) (${attending.length} đại biểu)`}
        subtitle="Danh sách chốt đại biểu chính thức & người được ủy quyền đi thay" footer={<>{footnote(`Tổng cộng ${attending.length} đại biểu chốt tham gia`)}{close}</>}>
        <GuestList rows={attending} search="Tìm kiếm đại biểu đã xác nhận..." empty={{ icon: 'circle-check', title: 'Chưa có đại biểu nào xác nhận tham dự.' }}
          columns={[
            { id: 'name', header: 'Họ và tên đại biểu', cell: (g) => <div className="space-y-1"><NameCell g={g} contact={false} /><GroupCell g={g} /></div> },
            orgCol,
            { id: 'substitute', header: 'Người đi thay (nếu có)', cell: (g) => (g.rsvpStatus === 'substituted' && g.substituteName ? g.substituteName : '-'), hideOnMobile: true },
            { id: 'seat', header: 'Ghế ngồi', cell: (g) => <SeatCell g={g} linked={data.canSeeSeating} /> },
            { id: 'banquet', header: 'Tiệc', cell: (g) => <BanquetCell g={g} />, hideOnMobile: true },
            { id: 'phone', header: 'Điện thoại', cell: (g) => g.phone || '-', hideOnMobile: true },
          ]} />
      </Dialog>
    );
  }

  if (popup === 'banquet') {
    const banquet = roster.filter(isBanquetGuest);
    return (
      <Dialog open onClose={onClose} size="3xl" icon="armchair" title={`Danh sách đại biểu đăng ký ăn tiệc chiêu đãi (${banquet.length} suất)`}
        subtitle="Phục vụ hậu cần tiệc chiêu đãi, bố trí bàn tiệc và suất ăn chuyên biệt" footer={<>{footnote(`Tổng cộng ${banquet.length} suất tiệc chiêu đãi đã đăng ký`)}{close}</>}>
        <GuestList rows={banquet} search="Tìm kiếm đại biểu ăn tiệc..." empty={{ icon: 'armchair', title: 'Không có đại biểu nào đăng ký ăn tiệc.' }}
          columns={[
            { id: 'name', header: 'Họ và tên đại biểu', cell: (g) => <NameCell g={g} contact={false} /> },
            orgCol,
            { id: 'group', header: 'Nhóm', cell: (g) => <GroupCell g={g} />, hideOnMobile: true },
            { id: 'seat', header: 'Ghế hội trường', cell: (g) => <SeatCell g={g} empty="Hội trường" linked={data.canSeeSeating} />, hideOnMobile: true },
            { id: 'table', header: 'Bàn tiệc / phục vụ', cell: (g) => (g.group === 'VIP' ? 'Bàn VIP chủ tọa' : 'Bàn tiệc khách mời') },
            { id: 'notes', header: 'Yêu cầu đặc biệt', cell: (g) => g.notes || `Tiêu chuẩn ${settings.agencyShortName}`, hideOnMobile: true },
          ]} />
      </Dialog>
    );
  }

  return <PrintSetsDialog eventId={event.id} seatLinks={data.canSeeSeating} sets={sets} onClose={onClose} close={close} />;
}

function PrintSetsDialog({ eventId, seatLinks, sets, onClose, close }: { eventId: string; seatLinks: boolean; sets: Sets; onClose: () => void; close: ReactNode }) {
  const [tab, setTab] = useState<'namecards' | 'badges'>('namecards');
  return (
    <Dialog open onClose={onClose} size="3xl" icon="printer" title="Chi tiết biển tên VIP & thẻ đại biểu cần in"
      subtitle="Xem trước danh sách các biển tên chữ A và thẻ đeo có mã QR check-in" footer={close}>
      <div className="space-y-3">
        <Tabs variant="segmented" value={tab} onChange={(v) => setTab(v as typeof tab)}
          items={[{ id: 'namecards', label: 'Biển tên VIP chữ A', count: sets.namecards.length }, { id: 'badges', label: 'Thẻ đại biểu QR', count: sets.badges.length }]} />
        {tab === 'namecards' ? (
          <GuestList rows={sets.namecards} search="Tìm theo tên, chức vụ, đơn vị..." empty={{ icon: 'star', title: 'Không có biển tên VIP nào.' }}
            columns={[
              { id: 'name', header: 'Đại biểu VIP', cell: (g) => <span className="font-semibold text-ink">{g.name}</span> },
              { id: 'org', header: 'Chức vụ & đơn vị', cell: (g) => <OrgCell g={g} />, hideOnMobile: true },
              { id: 'seat', header: 'Vị trí ghế', cell: (g) => <SeatCell g={g} empty="Hàng VIP" linked={seatLinks} />, hideOnMobile: true },
              { id: 'print', header: 'In riêng', align: 'right', cell: (g) => <PrintLink href={printHref(eventId, 'namecards', { guest: g.id })} label="In biển" /> },
            ]}>
            {() => (
              <div className="flex flex-wrap items-center justify-between gap-2">
                {footnote('Danh sách đại biểu VIP cần in Biển tên chữ A để bàn (10cm x 28cm).')}
                <PrintLink href={printHref(eventId, 'namecards')} label="In toàn bộ biển tên VIP" />
              </div>
            )}
          </GuestList>
        ) : (
          <GuestList rows={sets.badges} search="Tìm theo tên, đơn vị, mã check-in..." empty={{ icon: 'qr-code', title: 'Không có thẻ đại biểu nào để in.' }}
            columns={[
              { id: 'name', header: 'Họ và tên đại biểu', cell: (g) => <span className="font-semibold text-ink">{g.name}</span> },
              { id: 'org', header: 'Đơn vị công tác', cell: (g) => `${titleOrDefault(g)} - ${g.organization}`, hideOnMobile: true },
              { id: 'group', header: 'Nhóm', cell: (g) => <GroupCell g={g} />, hideOnMobile: true },
              { id: 'code', header: 'Mã check-in', cell: (g) => <span className="font-mono font-semibold tracking-widest">{g.checkinCode}</span> },
              { id: 'print', header: 'In riêng', align: 'right', cell: (g) => <PrintLink href={printHref(eventId, 'badges', { guest: g.id })} label="In thẻ" /> },
            ]}>
            {() => (
              <div className="flex flex-wrap items-center justify-between gap-2">
                {footnote('Danh sách đại biểu cần in Thẻ đeo có mã QR Check-in (khổ 9cm x 13cm).')}
                <PrintLink href={printHref(eventId, 'badges')} label="In hàng loạt thẻ đại biểu" />
              </div>
            )}
          </GuestList>
        )}
      </div>
    </Dialog>
  );
}
