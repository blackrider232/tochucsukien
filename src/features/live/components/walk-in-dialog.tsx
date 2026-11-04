'use client';

// "Tiếp nhận khách phát sinh / người đi thay" (m5 §1.7, §3.2). A new guest
// gets a seat in the zone staff pick (decision 10); a substitute checks in the
// invited guest's own record (BUG-15), never a second guest.

import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import { Button, Checkbox, Combobox, Dialog, Form, FormField, Select, Tabs, TextInput, useDialogs, useToast, useZodForm } from '@/components/ui';
import { newId, type Instant } from '@/core/brand';
import { useCommand } from '@/core/commands';
import { matchesQuery } from '@/core/text';
import { GUEST_GROUPS } from '@/core/vocab';
import { guestIdentityKey, type RosterEntry } from '@/features/guests';
import { findFreeSeat, zoneOccupancy, zoneOfSeat, type EventHall, type HallZone } from '@/features/venue';
import { substituteFields, walkInFields, type WalkInFields } from '../domain/schemas';
import type { LiveScreenData } from '../domain/screen';
import { useDesk } from './desk-actions';

const GROUP_OPTIONS = (['DoanhNghiep', 'SoNganh', 'QuocTe', 'BaoChi', 'VIP'] as const).map((value) => ({ value, label: GUEST_GROUPS[value].label }));
const NO_SEAT = '';

function zonesWithFree(hall: EventHall | null, seats: LiveScreenData['seats']): ReadonlyArray<{ zone: HallZone; free: number }> {
  return hall ? zoneOccupancy(hall, seats, new Set()).map((o) => ({ zone: o.zone, free: o.seats - o.assigned })) : [];
}

/** Decision 10's default: the first zone with a free seat that is not a VIP zone. */
function defaultZone(hall: EventHall | null, seats: LiveScreenData['seats']): string {
  if (!hall) return NO_SEAT;
  const code = findFreeSeat(hall, new Set(seats.map((s) => s.seatCode)), 'DoanhNghiep');
  return (code && zoneOfSeat(hall, code)?.key) || NO_SEAT;
}

export function WalkInDialog({ data, onClose }: { data: LiveScreenData; onClose: () => void }) {
  const [tab, setTab] = useState<'new' | 'substitute'>('new');
  return (
    <Dialog open onClose={onClose} size="lg" icon="users" title="Tiếp nhận khách phát sinh / người đi thay" subtitle="Đăng ký nhanh tại bàn lễ tân ngày diễn ra sự kiện">
      <div className="space-y-4">
        <Tabs variant="segmented" value={tab} onChange={(id) => setTab(id as 'new' | 'substitute')} items={[{ id: 'new', label: 'Khách mới' }, { id: 'substitute', label: 'Người đi thay' }]} />
        {tab === 'new' ? <NewGuestForm data={data} onClose={onClose} /> : <SubstituteForm data={data} onClose={onClose} />}
      </div>
    </Dialog>
  );
}

function NewGuestForm({ data, onClose }: { data: LiveScreenData; onClose: () => void }) {
  const run = useCommand();
  const dialogs = useDialogs();
  const toast = useToast();
  const desk = useDesk();
  // One id per opened dialog: pressing "Check-in ngay" again after a failure converges on the same guest.
  const [guestId] = useState(() => newId<'Guest'>());
  const zones = zonesWithFree(data.hall, data.seats);
  const form = useZodForm(walkInFields, {
    defaultValues: { name: '', group: 'DoanhNghiep', title: '', organization: '', phone: '', hasBanquet: false, giftGiven: false, zoneKey: defaultZone(data.hall, data.seats) },
  });
  const group = useWatch({ control: form.control, name: 'group' });

  const submit = async (v: WalkInFields) => {
    const draft = { name: v.name, organization: v.organization, phone: v.phone, email: null };
    const twin = data.roster.find((g) => g.id !== guestId && guestIdentityKey(g) === guestIdentityKey(draft));
    let allowDuplicate = false;
    if (twin) {
      allowDuplicate = await dialogs.confirm({
        title: 'Có thể trùng đại biểu',
        text: `Đã có ${twin.name}${twin.organization ? ` (${twin.organization})` : ''} trong danh sách khách mời. Bấm "Vẫn tạo khách mới" nếu đây là người khác; hoặc bấm Hủy rồi tìm đại biểu đó để check-in.`,
        confirmLabel: 'Vẫn tạo khách mới',
        tone: 'warning',
      });
      if (!allowDuplicate) return;
    }
    const zone = data.hall?.zones.find((z) => z.key === v.zoneKey) ?? null;
    let confirmVipZone = false;
    if (zone?.vipZone && v.group !== 'VIP') {
      confirmVipZone = await dialogs.confirm({ title: `Xếp vào ${zone.name}?`, text: 'Đây là khu VIP, còn đại biểu không thuộc nhóm VIP.', confirmLabel: 'Vẫn xếp vào khu VIP', tone: 'warning' });
      if (!confirmVipZone) return;
    }
    const r = await run('live.walkIn', {
      eventId: data.event.id,
      guestId,
      guest: { name: v.name, group: v.group, title: v.title, organization: v.organization, phone: v.phone, hasBanquet: v.hasBanquet },
      zoneKey: zone?.key ?? null,
      confirmVipZone,
      giftGiven: v.giftGiven,
      allowDuplicate,
      desk: null,
    });
    if (!r) return;
    if (r.seatProblem) toast.warning(r.seatProblem);
    desk.arrived({ name: v.name, group: v.group, title: v.title, organization: v.organization, seatCode: r.seatCode }, r.checkIn.checkedInAt as Instant);
    onClose();
  };

  const zoneOptions = [
    { value: NO_SEAT, label: data.hall ? 'Không xếp ghế (khu vực chung)' : 'Không xếp ghế (sự kiện chưa có sơ đồ hội trường)' },
    ...zones.map(({ zone, free }) => ({ value: zone.key, label: `${zone.name}${zone.vipZone ? ' (VIP)' : ''}: ${free > 0 ? `còn ${free} ghế` : 'hết ghế'}` })),
  ];

  return (
    <Form form={form} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormField label="Họ và tên đại biểu" name="name" required>
          <TextInput name="name" placeholder="Họ tên người đến dự" autoComplete="off" />
        </FormField>
      </div>
      <FormField label="Nhóm khách mời" name="group" required>
        <Select name="group" options={GROUP_OPTIONS} />
      </FormField>
      <FormField label="Chức danh / vị trí" name="title">
        <TextInput name="title" placeholder="Ví dụ: Phó Giám đốc / Trưởng phòng" />
      </FormField>
      <div className="sm:col-span-2">
        <FormField label="Cơ quan / đơn vị" name="organization" required>
          <TextInput name="organization" placeholder="Tên đơn vị công tác" />
        </FormField>
      </div>
      <FormField label="Số điện thoại liên hệ" name="phone">
        <TextInput name="phone" type="tel" placeholder="0912.xxx.xxx" />
      </FormField>
      <FormField label="Khu vực ghế" name="zoneKey" hint={group === 'VIP' ? undefined : 'Khu VIP chỉ dành cho đại biểu VIP, trừ khi xác nhận.'}>
        <Select name="zoneKey" options={zoneOptions} />
      </FormField>
      <div className="sm:col-span-2">
        <Checkbox name="hasBanquet" label="Đăng ký suất tiệc chiêu đãi" />
        <Checkbox name="giftGiven" label="Đã phát túi quà & tài liệu" />
      </div>
      <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
        <Button variant="secondary" onClick={onClose}>Hủy</Button>
        <Button type="submit" icon="check" loading={form.formState.isSubmitting}>Check-in ngay</Button>
      </div>
    </Form>
  );
}

function SubstituteForm({ data, onClose }: { data: LiveScreenData; onClose: () => void }) {
  const run = useCommand();
  const dialogs = useDialogs();
  const desk = useDesk();
  const form = useZodForm(substituteFields, { defaultValues: { guestId: '', substituteName: '', giftGiven: false } });
  const [picked, setPicked] = useState<RosterEntry | null>(null);
  const invitees = data.roster.filter((g) => !g.checkedInAt && g.rsvpSource !== 'walk_in');

  const submit = async (v: { guestId: string; substituteName: string; giftGiven: boolean }) => {
    const guest = data.roster.find((g) => g.id === v.guestId);
    if (!guest) return;
    let confirmDeclined = false;
    if (guest.rsvpStatus === 'declined') {
      confirmDeclined = await dialogs.confirm({ title: 'Đại biểu đã từ chối. Vẫn check-in?', text: `${guest.name} đã báo vắng. Ghi nhận ${v.substituteName} đi thay và check-in?`, confirmLabel: 'Vẫn check-in', tone: 'warning' });
      if (!confirmDeclined) return;
    }
    const r = await run('live.checkInSubstitute', {
      eventId: data.event.id, guestId: guest.id, version: guest.version, substituteName: v.substituteName, giftGiven: v.giftGiven, confirmDeclined, desk: null,
    });
    if (!r) return;
    desk.arrived({ ...guest, name: `${v.substituteName} (thay ${guest.name})` }, r.checkIn.checkedInAt as Instant);
    onClose();
  };

  return (
    <Form form={form} onSubmit={submit} className="grid gap-4">
      <FormField label="Đi thay cho đại biểu" name="guestId" required hint="Gõ tên hoặc cơ quan của đại biểu nhận giấy mời rồi chọn trong danh sách.">
        <Combobox<RosterEntry>
          name="guestId"
          search={async (q) => invitees.filter((g) => matchesQuery(q, g.name, g.organization, g.title)).slice(0, 20)}
          itemKey={(g) => g.id}
          itemLabel={(g) => (g.organization ? `${g.name} (${g.organization})` : g.name)}
          onPick={setPicked}
        />
      </FormField>
      {picked && (
        <p className="text-sm text-ink-2">
          {picked.title || 'Đại biểu'} • {GUEST_GROUPS[picked.group].short}{picked.seatCode ? ` • ghế ${picked.seatCode} (giữ nguyên)` : ' • chưa xếp ghế'}
          {picked.rsvpStatus === 'declined' ? ' • đã báo vắng' : ''}
        </p>
      )}
      <FormField label="Họ tên và chức vụ người đi thay" name="substituteName" required>
        <TextInput name="substituteName" placeholder="Ví dụ: Vũ Hải Đăng - Phó Giám đốc" autoComplete="off" />
      </FormField>
      <Checkbox name="giftGiven" label="Đã phát túi quà & tài liệu" />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Hủy</Button>
        <Button type="submit" icon="check" loading={form.formState.isSubmitting}>Check-in người đi thay</Button>
      </div>
    </Form>
  );
}

