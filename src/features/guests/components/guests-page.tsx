'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button, DataTable, FilterBar, IconButton, KpiCard, RowMenu, SectionCard, StatusBadge, useDialogs, type Column, type RowMenuItem } from '@/components/ui';
import { useSettings } from '@/core/auth';
import { useCommand } from '@/core/commands';
import { foldVi } from '@/core/text';
import { GUEST_GROUPS, INVITE, RSVP, SEND_METHOD, enumOptions, type GuestGroup, type RsvpStatus } from '@/core/vocab';
import type { Guest, RosterEntry } from '../contract';
import { NO_FILTER, filterGuests, guestKpis, printSets, quotaProgress, type GuestFilter } from '../domain/roster';
import type { GuestScreenData, KpiPopup } from '../domain/screen';
import { BanquetCell, ExportButton, GROUP_FILTER, GroupCell, NameCell, OrgCell, RSVP_FILTER, RsvpCell, SeatCell } from './cells';
import { GuestFormDialog } from './guest-form';
import { KpiDialog } from './kpi-dialogs';

const RSVP_ORDER: Readonly<Record<RsvpStatus, number>> = { confirmed: 0, substituted: 1, pending: 2, declined: 3 };
const GROUP_ORDER = Object.fromEntries(Object.keys(GUEST_GROUPS).map((g, i) => [g, i])) as Record<GuestGroup, number>;

/** Row actions: RSVP changes, then delete (one transition function on the server, m4a B18). */
export function useGuestActions(eventId: GuestScreenData['event']['id']) {
  const run = useCommand();
  const dialogs = useDialogs();
  const setRsvp = async (g: RosterEntry, rsvpStatus: RsvpStatus) => {
    let substituteName: string | undefined;
    if (rsvpStatus === 'substituted') {
      const name = await dialogs.prompt({ title: 'Cử người đi thay', label: 'Họ tên và chức vụ người đi thay', defaultValue: g.substituteName, required: true, confirmLabel: 'Lưu' });
      if (name === null) return;
      substituteName = name.trim();
    }
    await run('guests.update', { eventId, id: g.id, version: g.version, patch: { rsvpStatus, ...(substituteName ? { substituteName } : {}) } }, { success: `Đã cập nhật RSVP: ${g.name}` });
  };
  const remove = async (g: RosterEntry) => {
    const ok = await dialogs.confirm({
      title: `Xóa đại biểu ${g.name}?`,
      text: 'Hành động này sẽ xóa khách mời và giải phóng chỗ ngồi liên quan. Có thể hoàn tác ngay sau khi xóa.',
      confirmLabel: 'Đồng ý xóa',
      tone: 'danger',
    });
    if (ok) await run('guests.delete', { eventId, id: g.id, version: g.version }, { success: 'Đã xóa khách mời khỏi danh sách' });
  };
  const menu = (g: RosterEntry): RowMenuItem[] => [
    ...enumOptions(RSVP).map((o) => ({ id: `rsvp-${o.value}`, label: `RSVP: ${o.label}`, icon: 'check' as const, disabled: o.value === g.rsvpStatus && o.value !== 'substituted', onSelect: () => void setRsvp(g, o.value) })),
    { id: 'delete', label: 'Xóa khách mời', icon: 'trash', tone: 'danger', onSelect: () => void remove(g) },
  ];
  return { menu };
}

export function GuestsPage({ data, initialPopup }: { data: GuestScreenData; initialPopup: KpiPopup | null }) {
  const settings = useSettings();
  const router = useRouter();
  const [filter, setFilter] = useState<GuestFilter>(NO_FILTER);
  const [editing, setEditing] = useState<Guest | 'new' | null>(null);
  const [popup, setPopup] = useState<KpiPopup | null>(initialPopup);
  const { event, roster, canWrite } = data;
  const { menu } = useGuestActions(event.id);

  const kpis = guestKpis(roster, event.targetGuests);
  const quota = quotaProgress(kpis.total, event.targetGuests, settings);
  const vip = useMemo(() => new Set(data.vipSeats), [data.vipSeats]);
  const sets = printSets(roster, (code) => vip.has(code));
  const rows = useMemo(() => filterGuests(roster, filter), [roster, filter]);

  const closePopup = () => {
    setPopup(null);
    if (initialPopup) router.replace(`/events/${event.id}/guests`, { scroll: false });
  };

  const columns: Column<RosterEntry>[] = [
    { id: 'name', header: 'Họ và tên đại biểu', cell: (g) => <NameCell g={g} />, sortValue: (g) => foldVi(g.name), width: '15rem' },
    { id: 'org', header: 'Chức danh & cơ quan công tác', cell: (g) => <OrgCell g={g} notes />, sortValue: (g) => foldVi(g.organization), hideOnMobile: true, width: '16rem' },
    { id: 'group', header: 'Nhóm', cell: (g) => <GroupCell g={g} />, sortValue: (g) => GROUP_ORDER[g.group], hideOnMobile: true },
    {
      id: 'invite', header: 'Giấy mời', hideOnMobile: true,
      cell: (g) => (
        <div className="space-y-1 text-xs">
          <p className="text-ink-muted">{SEND_METHOD[g.sendMethod].short}</p>
          <StatusBadge registry={INVITE} value={g.inviteStatus} size="sm" />
        </div>
      ),
    },
    { id: 'rsvp', header: 'Xác nhận (RSVP)', cell: (g) => <RsvpCell g={g} />, sortValue: (g) => RSVP_ORDER[g.rsvpStatus] },
    { id: 'banquet', header: 'Tiệc', cell: (g) => <BanquetCell g={g} />, align: 'center', hideOnMobile: true },
    { id: 'seat', header: 'Ghế ngồi', cell: (g) => <SeatCell g={g} />, sortValue: (g) => g.seatCode ?? '~', align: 'center', hideOnMobile: true },
    ...(canWrite
      ? [{
          id: 'actions', header: 'Thao tác', align: 'right' as const,
          cell: (g: RosterEntry) => (
            <div className="flex justify-end gap-1">
              <IconButton icon="pencil" label={`Sửa ${g.name}`} onClick={() => setEditing(g)} />
              <RowMenu label={`Thao tác với ${g.name}`} items={menu(g)} />
            </div>
          ),
        }]
      : []),
  ];

  const emptyRoster = roster.length === 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Khách mời" value={kpis.total} ofTotal={quota.quota} icon="users" accent="amber" highlight
          badge={quota.reached ? { text: `Đủ số lượng (${quota.percent}%)`, tone: 'emerald' } : { text: `Cần mời thêm ${quota.missing} khách`, tone: 'amber' }}
          caption={`Chỉ tiêu mời ${quota.quota} = ${quota.percentOfTarget}% của ${quota.target} đại biểu dự kiến${quota.surplus > 0 ? ` • Vượt +${quota.surplus}` : ''}`}
          progress={{ value: Math.min(kpis.total, quota.quota), max: Math.max(quota.quota, 1) }}
          onClick={() => setPopup('all')}
        />
        <KpiCard
          label="Xác nhận tham dự (RSVP)" value={kpis.attending} icon="circle-check" accent="emerald"
          caption={`Vắng: ${kpis.declined} • Người thay: ${kpis.substituted} • Chờ phản hồi: ${kpis.pending}`}
          onClick={() => setPopup('confirmed')}
        />
        <KpiCard
          label="Biển tên & thẻ" value={sets.namecards.length} icon="printer" accent="indigo"
          caption={`Biển VIP • ${sets.badges.length} thẻ đại biểu cần in`}
          onClick={() => setPopup('print')}
        />
        <KpiCard
          label="Tiệc & xếp chỗ" value={kpis.banquet} icon="armchair" accent="rose"
          caption={`Suất tiệc đăng ký • Ghế đã xếp: ${kpis.seated} vị trí`}
          onClick={() => setPopup('banquet')}
        />
      </div>

      <SectionCard
        title="Danh sách khách mời & RSVP"
        subtitle={`${kpis.total} đại biểu trong sự kiện`}
        icon="users"
        actions={
          <>
            <Button variant="secondary" icon="printer" href={`/events/${event.id}/guests/namecards`}>Biển tên VIP & thẻ QR</Button>
            <ExportButton data={data} />
            {canWrite && <Button icon="plus" onClick={() => setEditing('new')}>Thêm khách mời</Button>}
          </>
        }
      >
        <div className="space-y-3">
          <FilterBar
            search={{ value: filter.q, onChange: (q) => setFilter({ ...filter, q }), placeholder: 'Tìm kiếm họ tên đại biểu, chức danh, cơ quan, số điện thoại...' }}
            filters={[
              { id: 'group', label: 'Nhóm khách', value: filter.group, options: GROUP_FILTER, onChange: (v) => setFilter({ ...filter, group: v as GuestFilter['group'] }) },
              { id: 'rsvp', label: 'Trạng thái RSVP', value: filter.rsvp, options: RSVP_FILTER, onChange: (v) => setFilter({ ...filter, rsvp: v as GuestFilter['rsvp'] }) },
            ]}
          />
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(g) => g.id}
            numbered
            stickyHeader
            empty={
              emptyRoster
                ? {
                    icon: 'users',
                    title: 'Chưa có khách mời trong danh sách',
                    text: canWrite ? 'Bấm "Thêm khách mời" để bắt đầu lập danh sách đại biểu của sự kiện.' : 'Sự kiện chưa có đại biểu nào.',
                    action: canWrite ? <Button icon="plus" variant="secondary" onClick={() => setEditing('new')}>Thêm khách mới</Button> : undefined,
                  }
                : { icon: 'search', title: 'Không tìm thấy đại biểu nào phù hợp.', text: 'Thử từ khóa khác hoặc bỏ bớt bộ lọc.' }
            }
          />
        </div>
      </SectionCard>

      {editing && <GuestFormDialog eventId={event.id} guest={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {popup && (
        <KpiDialog
          popup={popup}
          data={data}
          sets={sets}
          onClose={closePopup}
          onAdd={canWrite ? () => { setPopup(null); setEditing('new'); } : undefined}
        />
      )}
    </div>
  );
}
