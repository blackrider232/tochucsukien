'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Combobox, DataTable, Dialog, FilterBar, FormField, type Column } from '@/components/ui';
import { useCommand } from '@/core/commands';
import { GUEST_GROUPS, type GuestGroup } from '@/core/vocab';
import type { MasterContact } from '../contract';
import { GROUP_ICON } from '../domain/groups';
import { ContactCell, GroupBadge, NameCell, OrgCell } from './cells';

const SUGGEST_LIMIT = 8;
const PICKER_LIMIT = 50;
const GROUP_FILTER = [{ value: 'all', label: 'Tất cả nhóm' }, ...(Object.keys(GUEST_GROUPS) as GuestGroup[]).map((g) => ({ value: g, label: GUEST_GROUPS[g].short }))];

/**
 * A ranked search of the directory for the client. It remembers what it asked, so backspacing re-reads nothing, and a
 * failed search throws so the caller can say so. The query is a command: it passes the same permission as any other.
 */
export function useContactSearch(limit: number) {
  const run = useCommand();
  const cache = useRef(new Map<string, ReadonlyArray<MasterContact>>());
  return useCallback(
    async (q: string, group?: GuestGroup): Promise<ReadonlyArray<MasterContact>> => {
      const key = `${group ?? ''}|${limit}|${q}`;
      const hit = cache.current.get(key);
      if (hit) return hit;
      const found = await run('directory.search', { q, ...(group ? { group } : {}), limit }, { undoable: false });
      if (!found) throw new Error('search failed');
      if (cache.current.size > 100) cache.current.clear();
      cache.current.set(key, found);
      return found;
    },
    [run, limit],
  );
}

/** What the combobox matches the typed text against: every field the search looks at. */
const labelOf = (c: MasterContact) => [c.name, c.title, c.organization, c.phone, c.email].filter(Boolean).join(' · ');

/**
 * Live auto-suggest over the directory (m4c §1.3): ranked, tone-insensitive, keyboard-driven (ARIA combobox from the
 * kit). Every suggestion is React text, so a name like `<img onerror=…>` shows as typed (B1-B4, B61). Put it in a form
 * field named `name`; the picked contact's id becomes that field's value. Fill the rest of the form in `onPick` with
 * guestFieldsFromContact.
 */
export function ContactSuggest({ name, onPick }: { name: string; onPick: (c: MasterContact) => void }) {
  const search = useContactSearch(SUGGEST_LIMIT);
  return (
    <Combobox<MasterContact>
      name={name}
      search={(q) => (q.trim() === '' ? Promise.resolve([]) : search(q))}
      itemKey={(c) => c.id}
      itemLabel={labelOf}
      renderItem={(c) => (
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <Badge tone={GUEST_GROUPS[c.group].tone} icon={GROUP_ICON[c.group]}>{GUEST_GROUPS[c.group].short}</Badge>
          <span className="min-w-0 flex-1">
            <span className="block break-words font-semibold">{c.name}</span>
            <span className="block break-words text-xs text-ink-muted">{[c.title, c.organization].filter(Boolean).join(' - ')}</span>
          </span>
          {c.phone && <span className="hidden shrink-0 font-mono text-xs text-ink-muted sm:inline">{c.phone}</span>}
        </span>
      )}
      onPick={onPick}
    />
  );
}

/** The full lookup (m4c §1.4): search, a group filter and a "Chọn" button per row. */
export function ContactPickerDialog({ onPick, onClose }: { onPick: (c: MasterContact) => void; onClose: () => void }) {
  const search = useContactSearch(PICKER_LIMIT);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('all');
  const [rows, setRows] = useState<ReadonlyArray<MasterContact> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      search(q, group === 'all' ? undefined : (group as GuestGroup)).then(
        (r) => { if (live) { setRows(r); setFailed(false); } },
        () => { if (live) { setRows([]); setFailed(true); } },
      );
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [q, group, search]);

  const pick = (c: MasterContact) => { onPick(c); onClose(); };
  const columns: Column<MasterContact>[] = [
    { id: 'name', header: 'Họ và tên & chức danh', cell: (c) => <NameCell c={c} /> },
    { id: 'group', header: 'Nhóm', hideOnMobile: true, cell: (c) => <GroupBadge group={c.group} /> },
    { id: 'org', header: 'Cơ quan / doanh nghiệp', hideOnMobile: true, cell: (c) => <OrgCell c={c} /> },
    { id: 'contact', header: 'Liên hệ', hideOnMobile: true, cell: (c) => <ContactCell c={c} /> },
    { id: 'pick', header: 'Chọn', align: 'right', cell: (c) => <Button variant="secondary" onClick={() => pick(c)}>Chọn</Button> },
  ];
  return (
    <Dialog open onClose={onClose} size="3xl" icon="contact" title="Tra cứu và chọn từ CSDL" subtitle="Chọn một đối tượng để tự động điền nhanh thông tin"
      footer={<><p className="mr-auto text-sm text-ink-2" aria-live="polite">{rows ? `Hiển thị ${rows.length} đối tượng${rows.length === PICKER_LIMIT ? ' đầu tiên, gõ thêm để thu hẹp' : ''}` : 'Đang tìm…'}</p><Button variant="secondary" onClick={onClose}>Đóng</Button></>}>
      <div className="space-y-3">
        <FilterBar
          search={{ value: q, onChange: setQ, placeholder: 'Gõ tên đại biểu, chức danh, cơ quan, số điện thoại...' }}
          filters={[{ id: 'group', label: 'Nhóm đối tượng', value: group, options: GROUP_FILTER, onChange: setGroup }]}
        />
        <DataTable rows={rows ?? []} columns={columns} rowKey={(c) => c.id} loading={rows === null} stickyHeader maxHeight="22rem"
          empty={failed ? { icon: 'alert-triangle', title: 'Không tra cứu được CSDL.', text: 'Kiểm tra kết nối rồi thử lại.' } : { icon: 'search', title: 'Không tìm thấy đối tượng nào.' }} />
      </div>
    </Dialog>
  );
}

/** The suggest field with its "Tra cứu CSDL" button (m4c §1.3), ready to drop into the guest form. */
export function ContactLookup({ name, label = 'Tra cứu CSDL khách mời', onPick }: { name: string; label?: string; onPick: (c: MasterContact) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <FormField label={label} name={name} hint="Gõ tên, cơ quan hoặc số điện thoại để đối chiếu và điền sẵn thông tin.">
        <ContactSuggest name={name} onPick={onPick} />
      </FormField>
      <Button variant="ghost" icon="search" onClick={() => setOpen(true)}>Tra cứu CSDL</Button>
      {open && <ContactPickerDialog onPick={onPick} onClose={() => setOpen(false)} />}
    </div>
  );
}
