'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { Button, DataTable, EmptyState, FilterBar, IconButton, RowMenu, SectionCard, downloadBlob, useDialogs, type Column } from '@/components/ui';
import { useCommand } from '@/core/commands';
import { fileDateStamp } from '@/core/dates';
import { foldVi } from '@/core/text';
import { GUEST_GROUPS, type GuestGroup } from '@/core/vocab';
import type { MasterContact } from '../contract';
import { serializeCsv } from '../domain/csv';
import { CONTACT_CSV_COLUMNS } from '../domain/csv-import';
import { MAX_BULK_DELETE } from '../domain/schemas';
import { buildIndex, groupCounts, rankContacts } from '../domain/search';
import { BanquetCell, ContactCell, GroupBadge, NameCell, OrgCell } from './cells';
import { ContactFormDialog } from './contact-form';
import { CsvImportDialog } from './csv-import-dialog';
import { BatchImportDialog, EventPickerDialog, type EventChoice } from './event-import';
import { ResetDialog } from './reset-dialog';

const PAGE = 100;

export interface DirectoryScreenProps {
  contacts: ReadonlyArray<MasterContact>;
  /** directory.admin: add, edit, delete, CSV import, sample data and reset. Everyone else reads, searches, exports and copies into an event. */
  canAdmin: boolean;
  /** Events the actor may add guests to, for the copy. */
  events: ReadonlyArray<EventChoice>;
}

/** The admin screen (m4c §1.1): filter bar, ranked list, add/edit, CSV in and out, bulk actions, copy into an event. */
export function DirectoryScreen({ contacts, canAdmin, events }: DirectoryScreenProps) {
  const run = useCommand();
  const dialogs = useDialogs();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('all');
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<MasterContact | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [pickingEvent, setPickingEvent] = useState(false);
  const [batchEvent, setBatchEvent] = useState<EventChoice | null>(null);

  // Folded once per list, not per keystroke (m4c B50); the query is deferred so typing never waits for the ranking.
  const index = useMemo(() => buildIndex(contacts), [contacts]);
  const counts = useMemo(() => groupCounts(contacts), [contacts]);
  const query = useDeferredValue(q);
  const found = useMemo(() => rankContacts(index, query, { group: group === 'all' ? 'all' : (group as GuestGroup) }), [index, query, group]);
  const rows = found.items.slice(0, shown);
  const live = useMemo(() => new Set(contacts.map((c) => c.id as string)), [contacts]);
  const picked = useMemo(() => contacts.filter((c) => selected.has(c.id)), [contacts, selected]);
  // A row deleted elsewhere drops out of the selection instead of being sent again.
  const selection = useMemo(() => new Set([...selected].filter((id) => live.has(id))), [selected, live]);

  const remove = async (c: MasterContact) => {
    const ok = await dialogs.confirm({
      title: 'Xóa đối tượng khỏi CSDL?',
      text: `Bạn có chắc muốn xóa "${c.name}" (${c.organization}) khỏi CSDL không? Thao tác này không ảnh hưởng đến các sự kiện đã tạo trước đó. Có thể hoàn tác ngay sau khi xóa.`,
      confirmLabel: 'Đồng ý xóa',
      tone: 'danger',
    });
    if (ok) await run('directory.delete', { id: c.id, version: c.version }, { success: 'Đã xóa đối tượng khỏi CSDL' });
  };
  const removeSelected = async () => {
    if (picked.length > MAX_BULK_DELETE) return void dialogs.alert({ title: 'Chọn ít hơn', text: `Mỗi lần xóa tối đa ${MAX_BULK_DELETE} đối tượng.` });
    const ok = await dialogs.confirm({
      title: `Xóa ${picked.length} đối tượng đã chọn?`,
      text: 'Các đối tượng sẽ bị xóa khỏi CSDL dùng chung. Khách mời đã nhập vào sự kiện giữ nguyên. Có thể hoàn tác ngay sau khi xóa.',
      confirmLabel: `Xóa ${picked.length} đối tượng`,
      tone: 'danger',
    });
    if (!ok) return;
    const done = await run('directory.deleteMany', { items: picked.map((c) => ({ id: c.id, version: c.version })) }, { success: `Đã xóa ${picked.length} đối tượng khỏi CSDL` });
    if (done) setSelected(new Set());
  };
  const exportCsv = () => downloadBlob(serializeCsv(contacts, CONTACT_CSV_COLUMNS), `CSDL_KhachMoi_DoanhNghiep_SCE_${fileDateStamp()}.csv`);
  const loadSample = async () => {
    const ok = await dialogs.confirm({
      title: 'Nạp dữ liệu mẫu (giả)?',
      text: 'Thêm 8 đối tượng giả (tên có chữ "giả" hoặc "mẫu") để xem thử giao diện. Không có người thật. Đối tượng đã có được giữ nguyên. Có thể hoàn tác ngay.',
      confirmLabel: 'Nạp dữ liệu mẫu',
      tone: 'primary',
    });
    if (ok) await run('directory.loadSample', {}, { success: 'Đã nạp dữ liệu mẫu (giả) vào CSDL' });
  };

  const columns: Column<MasterContact>[] = [
    { id: 'name', header: 'Họ và tên & chức danh', cell: (c) => <NameCell c={c} />, sortValue: (c) => foldVi(c.name), width: '16rem' },
    { id: 'group', header: 'Nhóm', cell: (c) => <GroupBadge group={c.group} />, sortValue: (c) => Object.keys(GUEST_GROUPS).indexOf(c.group), hideOnMobile: true },
    { id: 'org', header: 'Cơ quan / doanh nghiệp & địa chỉ', cell: (c) => <OrgCell c={c} />, sortValue: (c) => foldVi(c.organization), width: '16rem' },
    { id: 'contact', header: 'Liên hệ', cell: (c) => <ContactCell c={c} />, hideOnMobile: true, width: '13rem' },
    { id: 'banquet', header: 'Nghi thức / tiệc VIP', cell: (c) => <BanquetCell c={c} />, hideOnMobile: true },
    ...(canAdmin
      ? [{
          id: 'actions', header: 'Thao tác', align: 'right' as const,
          cell: (c: MasterContact) => (
            <div className="flex justify-end gap-1">
              <IconButton icon="pencil" label={`Sửa ${c.name}`} onClick={() => setEditing(c)} />
              <RowMenu label={`Thao tác với ${c.name}`} items={[{ id: 'delete', label: 'Xóa khỏi CSDL', icon: 'trash', tone: 'danger', onSelect: () => void remove(c) }]} />
            </div>
          ),
        }]
      : []),
  ];

  const actions = (
    <>
      {canAdmin && <Button icon="plus" onClick={() => setEditing('new')}>Thêm đối tượng mới</Button>}
      {canAdmin && <Button variant="secondary" icon="upload" onClick={() => setImporting(true)}>Nhập từ CSV</Button>}
      <Button variant="secondary" icon="file-spreadsheet" disabled={contacts.length === 0} onClick={exportCsv}>Xuất CSV</Button>
      {canAdmin && (
        <RowMenu
          label="Thao tác khác với CSDL"
          items={[
            { id: 'sample', label: 'Nạp dữ liệu mẫu (giả)', icon: 'refresh', onSelect: () => void loadSample() },
            { id: 'reset', label: 'Xóa toàn bộ CSDL', icon: 'trash', tone: 'danger', disabled: contacts.length === 0, onSelect: () => setResetting(true) },
          ]}
        />
      )}
    </>
  );

  return (
    <div className="space-y-4">
      <SectionCard
        title="CSDL khách mời & doanh nghiệp"
        subtitle={`${contacts.length} đối tượng thuộc 5 nhóm chuẩn hóa, dùng chung cho mọi sự kiện`}
        icon="contact"
        actions={actions}
      >
        {contacts.length === 0 ? (
          <EmptyState
            icon="contact"
            title="CSDL khách mời đang trống"
            text={canAdmin ? 'Thêm từng đối tượng, nhập từ tệp CSV, hoặc nạp một ít dữ liệu mẫu (giả) để xem thử.' : 'Quản trị viên chưa nhập đối tượng nào.'}
            action={canAdmin ? <Button icon="plus" onClick={() => setEditing('new')}>Thêm đối tượng mới</Button> : undefined}
          />
        ) : (
          <div className="space-y-3">
            <FilterBar
              search={{ value: q, onChange: (v) => { setQ(v); setShown(PAGE); }, placeholder: 'Tìm kiếm nhanh theo họ tên, chức danh, cơ quan, điện thoại, email...' }}
              filters={[{
                id: 'group', label: 'Nhóm đối tượng', value: group, onChange: (v) => { setGroup(v); setShown(PAGE); },
                options: [{ value: 'all', label: `Tất cả (${counts.all})` }, ...(Object.keys(GUEST_GROUPS) as GuestGroup[]).map((g) => ({ value: g, label: `${GUEST_GROUPS[g].short} (${counts[g]})` }))],
              }]}
            />
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(c) => c.id}
              numbered
              stickyHeader
              minWidth="56rem"
              selection={{ selected: selection, onChange: setSelected }}
              toolbar={
                <>
                  {found.total > 0 && selection.size < found.total && <Button variant="ghost" onClick={() => setSelected(new Set([...selection, ...found.items.map((c) => c.id)]))}>Chọn cả {found.total} kết quả</Button>}
                  {selection.size > 0 && (
                    <>
                      <Button variant="secondary" icon="download" onClick={() => setPickingEvent(true)}>Nhập {selection.size} vào sự kiện</Button>
                      {canAdmin && <Button variant="danger" icon="trash" onClick={() => void removeSelected()}>Xóa {selection.size} đã chọn</Button>}
                      <Button variant="ghost" onClick={() => setSelected(new Set())}>Bỏ chọn</Button>
                    </>
                  )}
                </>
              }
              empty={{ icon: 'search', title: 'Không tìm thấy đối tượng nào phù hợp trong CSDL.', text: 'Thử từ khóa khác hoặc chọn nhóm khác.' }}
            />
            <p className="text-sm text-ink-muted" aria-live="polite">Hiển thị {rows.length} / {found.total} đối tượng</p>
            {found.total > shown && <Button variant="secondary" onClick={() => setShown(shown + PAGE)}>Hiển thị thêm</Button>}
          </div>
        )}
      </SectionCard>

      {editing && <ContactFormDialog key={editing === 'new' ? 'new' : `${editing.id}@${editing.version}`} contact={editing === 'new' ? null : editing} contacts={contacts} onClose={() => setEditing(null)} />}
      {importing && <CsvImportDialog contacts={contacts} onClose={() => setImporting(false)} />}
      {resetting && <ResetDialog count={contacts.length} onClose={() => setResetting(false)} />}
      {pickingEvent && !batchEvent && (
        <EventPickerDialog events={events} count={selection.size} onClose={() => setPickingEvent(false)} onPick={(id) => setBatchEvent(events.find((e) => e.id === id) ?? null)} />
      )}
      {batchEvent && (
        <BatchImportDialog
          eventId={batchEvent.id}
          eventName={batchEvent.name}
          contacts={contacts}
          initialSelected={[...selection]}
          onClose={() => { setBatchEvent(null); setPickingEvent(false); setSelected(new Set()); }}
        />
      )}
    </div>
  );
}
