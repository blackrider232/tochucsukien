'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { Alert, Badge, Button, Checkbox, DataTable, Dialog, FilterBar, Form, FormField, Select, useZodForm, type Column } from '@/components/ui';
import type { ContactId, EventId } from '@/core/brand';
import { useCommand } from '@/core/commands';
import { GUEST_GROUPS } from '@/core/vocab';
import type { MasterContact } from '../contract';
import { planEventImport } from '../domain/to-guest';
import { buildIndex, groupCounts, rankContacts } from '../domain/search';
import { MAX_BATCH } from '../domain/schemas';
import { BanquetCell, ContactCell, GroupBadge, NameCell, OrgCell } from './cells';

const PAGE = 100;

export interface EventChoice {
  id: EventId;
  name: string;
}

/** Step one when the copy starts from the directory screen: which event the contacts go to. */
export function EventPickerDialog({ events, count, onPick, onClose }: { events: ReadonlyArray<EventChoice>; count: number; onPick: (id: EventId) => void; onClose: () => void }) {
  const form = useZodForm(z.object({ eventId: z.string().min(1, 'Chọn sự kiện') }), { defaultValues: { eventId: events.length === 1 ? events[0]!.id : '' } });
  return (
    <Dialog open onClose={onClose} size="md" icon="calendar" title="Chọn sự kiện" subtitle={`Đưa ${count} đối tượng đã chọn vào danh sách khách mời của một sự kiện`}>
      {events.length === 0 ? (
        <Alert tone="warning" title="Chưa có sự kiện nào">Bạn chưa có sự kiện nào để nhập khách mời. Tạo sự kiện ở mục Tiến độ trước.</Alert>
      ) : (
        <Form form={form} onSubmit={(v) => onPick(v.eventId as EventId)} className="space-y-4">
          <FormField label="Sự kiện" name="eventId" required>
            <Select name="eventId" placeholder="Chọn sự kiện" options={events.map((e) => ({ value: e.id, label: e.name }))} />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Hủy</Button>
            <Button type="submit" icon="chevron-right">Tiếp tục</Button>
          </div>
        </Form>
      )}
    </Dialog>
  );
}

interface Result {
  added: number;
  updated: number;
  skipped: number;
  missing: number;
}

/**
 * Batch copy of directory contacts into one event (m4c §1.5). A preview says who is new and who the event already
 * has before anything is written; the selection survives filtering. Guests does the dedupe and the writes.
 */
export function BatchImportDialog({
  eventId, eventName, contacts, initialSelected = [], onClose,
}: {
  eventId: EventId;
  eventName?: string;
  contacts: ReadonlyArray<MasterContact>;
  initialSelected?: ReadonlyArray<string>;
  onClose: () => void;
}) {
  const run = useCommand();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('all');
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(initialSelected));
  const [shown, setShown] = useState(PAGE);
  const [fill, setFill] = useState(false);
  const [existing, setExisting] = useState<ReadonlySet<ContactId> | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let live = true;
    void run('directory.eventMatches', { eventId }, { undoable: false }).then((r) => {
      if (!live) return;
      if (r) setExisting(new Set(r.existingIds));
      else setFailed(true);
    });
    return () => { live = false; };
  }, [eventId, run]);

  const index = useMemo(() => buildIndex(contacts), [contacts]);
  const counts = useMemo(() => groupCounts(contacts), [contacts]);
  const query = useDeferredValue(q);
  const found = useMemo(() => rankContacts(index, query, { group: group === 'all' ? 'all' : (group as MasterContact['group']) }), [index, query, group]);
  const picked = useMemo(() => contacts.filter((c) => selected.has(c.id)), [contacts, selected]);
  const plan = useMemo(() => planEventImport(picked, existing ?? new Set()), [picked, existing]);

  const submit = async () => {
    setBusy(true);
    const r = await run('directory.importToEvent', { eventId, ids: picked.map((c) => c.id), onExisting: fill ? 'fill_blanks' : 'skip' }, { undoable: false });
    setBusy(false);
    if (r) setResult(r);
  };

  const columns: Column<MasterContact>[] = [
    { id: 'name', header: 'Họ và tên & chức danh', cell: (c) => <NameCell c={c} /> },
    { id: 'group', header: 'Nhóm', hideOnMobile: true, cell: (c) => <GroupBadge group={c.group} /> },
    { id: 'org', header: 'Cơ quan / doanh nghiệp', hideOnMobile: true, cell: (c) => <OrgCell c={c} /> },
    { id: 'contact', header: 'Liên hệ', hideOnMobile: true, cell: (c) => <ContactCell c={c} /> },
    { id: 'banquet', header: 'Tiệc', hideOnMobile: true, cell: (c) => <BanquetCell c={c} /> },
    {
      id: 'status', header: 'Trạng thái',
      cell: (c) => (existing === null ? <span className="text-xs text-ink-muted">{failed ? 'Chưa kiểm tra được' : 'Đang kiểm tra…'}</span> : existing.has(c.id) ? <Badge tone="amber">Đã có trong sự kiện</Badge> : <Badge tone="emerald">Chưa thêm</Badge>),
    },
  ];

  const tooMany = selected.size > MAX_BATCH;

  if (result) {
    return (
      <Dialog open onClose={onClose} size="md" icon="circle-check" title="Nhập thành công" subtitle={eventName}
        footer={<><Button variant="secondary" onClick={onClose}>Đóng</Button><Button href={`/events/${eventId}/guests`} icon="users">Xem danh sách khách mời</Button></>}>
        <div className="space-y-2 text-sm text-ink">
          <p>Đã thêm <strong>{result.added}</strong> đại biểu mới vào sự kiện.</p>
          {result.updated > 0 && <p>Đã bổ sung thông tin còn trống cho <strong>{result.updated}</strong> đại biểu đã có.</p>}
          <p>Bỏ qua <strong>{result.skipped}</strong> đối tượng đã có hoặc trùng trong lựa chọn.</p>
          {result.missing > 0 && <p className="text-warning-ink">{result.missing} đối tượng không còn trong CSDL nên không được nhập.</p>}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="3xl"
      icon="users"
      title="Nhập hàng loạt từ CSDL vào sự kiện"
      subtitle={eventName ? `Sự kiện: ${eventName}` : 'Tích chọn các đại biểu hoặc doanh nghiệp để nạp đồng loạt vào sự kiện'}
      footer={
        <>
          <p className="mr-auto text-sm text-ink-2" aria-live="polite">Đã chọn: <strong>{selected.size}</strong> đối tượng</p>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button icon="download" loading={busy} disabled={selected.size === 0 || tooMany || (existing === null && !failed)} onClick={() => void submit()}>Nhập đại biểu đã chọn</Button>
        </>
      }
    >
      <div className="space-y-3">
        {failed && <Alert tone="warning">Chưa kiểm tra được đại biểu nào đã có trong sự kiện. Việc nhập vẫn bỏ qua người trùng, nhưng trạng thái hiển thị chưa chính xác.</Alert>}
        <FilterBar
          search={{ value: q, onChange: (v) => { setQ(v); setShown(PAGE); }, placeholder: 'Lọc theo họ tên, cơ quan, chức vụ...' }}
          filters={[{
            id: 'group', label: 'Nhóm đối tượng', value: group, onChange: (v) => { setGroup(v); setShown(PAGE); },
            options: [{ value: 'all', label: `Tất cả (${counts.all})` }, ...(Object.keys(GUEST_GROUPS) as MasterContact['group'][]).map((g) => ({ value: g, label: `${GUEST_GROUPS[g].short} (${counts[g]})` }))],
          }]}
        />
        <DataTable
          rows={found.items.slice(0, shown)}
          columns={columns}
          rowKey={(c) => c.id}
          selection={{ selected, onChange: setSelected }}
          stickyHeader
          maxHeight="22rem"
          toolbar={
            <>
              {found.total > 0 && <Button variant="ghost" onClick={() => setSelected(new Set([...selected, ...found.items.map((c) => c.id)]))}>Chọn cả {found.total} kết quả</Button>}
              {selected.size > 0 && <Button variant="ghost" onClick={() => setSelected(new Set())}>Bỏ chọn tất cả</Button>}
            </>
          }
          empty={{ icon: 'search', title: 'Không tìm thấy đối tượng nào.', text: 'Thử từ khóa khác hoặc đổi nhóm.' }}
        />
        {found.total > shown && <Button variant="secondary" onClick={() => setShown(shown + PAGE)}>Hiển thị thêm ({found.total - shown} còn lại)</Button>}
        <Checkbox name="fill" checked={fill} onChange={setFill} label="Bổ sung thông tin còn trống cho đại biểu đã có" description="Chỉ điền chức danh, điện thoại, email, ghi chú còn trống. Không ghi đè gì và không đổi RSVP." />
        {tooMany && <Alert tone="danger">Mỗi lần nhập tối đa {MAX_BATCH} đối tượng. Bỏ bớt lựa chọn.</Alert>}
        {selected.size > 0 && existing !== null && (
          <Alert tone="info" title="Kết quả dự kiến">
            Thêm mới {plan.fresh.length} • Đã có trong sự kiện {plan.existing.length} ({fill ? 'bổ sung chỗ trống' : 'bỏ qua'}) • Trùng trong lựa chọn {plan.repeated.length} (bỏ qua). Đại biểu mới ở trạng thái chưa mời, chưa phản hồi.
          </Alert>
        )}
      </div>
    </Dialog>
  );
}
