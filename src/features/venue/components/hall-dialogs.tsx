'use client';

import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Alert, Button, Checkbox, Dialog, Form, FormField, NumberInput, RadioGroup, Select, TextInput, useDialogs, useZodForm } from '@/components/ui';
import { useCommand } from '@/core/commands';
import { isAttending } from '@/core/vocab';
import type { EventHall, HallTemplate, HallZone, SeatAssignment } from '../contract';
import { AUTO_ASSIGN_MODES, type AutoAssignMode, type AutoAssignSummary } from '../domain/auto-assign';
import { formatCount, hallCapacity, orphanSeats, remapSeats, ZONE_GROUP_VALUES, ZONE_GROUPS } from '../domain/halls';
import { SEAT_POLICIES, zonesSchema, type SeatPolicy } from '../domain/schemas';
import type { EventRef, SeatGuestView } from './screen-types';
import { ZoneBadge } from './zone-badge';

const footer = (onClose: () => void, submit: string, busy: boolean, disabled = false) => (
  <div className="flex justify-end gap-2">
    <Button variant="secondary" onClick={onClose}>Hủy</Button>
    <Button type="submit" icon="check" loading={busy} disabled={disabled}>{submit}</Button>
  </div>
);

const hallChoice = z.object({ templateId: z.string({ error: 'Chọn hội trường' }).min(1, 'Chọn hội trường'), seats: z.enum(SEAT_POLICIES) });

/**
 * Choose or change the event's hall (m4b §1.7). With seats already assigned, the two choices the legacy confirm
 * promised and never offered are real, and each shows how many guests keep or lose their seat (m4b BUG-05).
 */
export function ChangeHallDialog({ event, hall, templates, seats, onClose }: {
  event: EventRef; hall: EventHall | null; templates: ReadonlyArray<HallTemplate>; seats: ReadonlyArray<SeatAssignment>; onClose: () => void;
}) {
  const run = useCommand();
  const options = templates.map((t) => ({ value: t.id as string, label: `${t.name} (${formatCount(hallCapacity(t.zones))} chỗ)` }));
  const form = useZodForm(hallChoice, { defaultValues: { templateId: hall?.templateId ?? '', seats: 'remap' } });
  const [templateId, policy] = useWatch({ control: form.control, name: ['templateId', 'seats'] });
  const chosen = templates.find((t) => t.id === templateId);
  const kept = chosen ? (hall ? remapSeats(hall.zones, chosen.zones, seats).kept.length : seats.length - orphanSeats(chosen, seats).length) : 0;

  const submit = async ({ templateId: id, seats: how }: { templateId: string; seats: SeatPolicy }) => {
    const t = templates.find((x) => x.id === id)!;
    const done = await run('venue.setEventHall', { eventId: event.id, version: hall?.version ?? null, templateId: t.id, seats: how }, { success: `Đã chuyển sang ${t.name}` });
    if (done) onClose();
  };

  return (
    <Dialog open onClose={onClose} size="lg" icon="building" title={hall ? 'Đổi hội trường cho sự kiện' : 'Chọn hội trường cho sự kiện'}
      subtitle="Sự kiện sao chép phân khu của hội trường mẫu; cấu hình riêng của sự kiện không làm thay đổi mẫu.">
      <Form form={form} onSubmit={submit} className="space-y-4">
        <FormField label="Hội trường" name="templateId" required>
          <Select name="templateId" options={options} placeholder="Chọn hội trường mẫu" />
        </FormField>
        {chosen && (
          <div className="space-y-2 rounded-control border border-line bg-surface-2 p-3 text-sm">
            <p className="text-ink-2">Sức chứa: <strong className="text-ink">{formatCount(hallCapacity(chosen.zones))} ghế</strong> với {chosen.zones.length} phân khu.</p>
            <ul className="flex flex-wrap gap-2">{chosen.zones.map((z) => <li key={z.key}><ZoneBadge zone={z} /></li>)}</ul>
          </div>
        )}
        {seats.length > 0 && (
          <RadioGroup<SeatPolicy> name="seats" label={`${seats.length} đại biểu đã được xếp chỗ`} options={[
            { value: 'remap', label: 'Giữ nguyên vị trí cũ', description: chosen ? `Giữ cùng khu và số ghế khi hội trường mới còn ghế đó: ${kept} giữ chỗ, ${seats.length - kept} phải xếp lại.` : 'Giữ cùng khu và số ghế khi hội trường mới còn ghế đó.' },
            { value: 'release', label: 'Hủy xếp chỗ để phân chia lại từ đầu', description: `Cả ${seats.length} đại biểu trở về chưa xếp chỗ.` },
          ]} />
        )}
        {chosen && seats.length > 0 && (policy === 'release' || kept < seats.length) && (
          <Alert tone="warning">{policy === 'release' ? seats.length : seats.length - kept} đại biểu sẽ trở về chưa xếp chỗ. Có thể hoàn tác ngay sau khi chuyển.</Alert>
        )}
        {footer(onClose, hall ? 'Đồng ý chuyển hội trường' : 'Chọn hội trường', form.formState.isSubmitting)}
      </Form>
    </Dialog>
  );
}

const GROUP_OPTIONS = ZONE_GROUP_VALUES.map((value) => ({ value, label: ZONE_GROUPS[value].long }));
const sameShape = (a: ReadonlyArray<HallZone>, b: ReadonlyArray<HallZone>) =>
  a.length === b.length && a.every((z, i) => z.key === b[i]!.key && z.prefix === b[i]!.prefix && z.color === b[i]!.color);

/** "Cấu hình phân khu hội trường" (m4b §1.6): name, target group, seat count and VIP flag of each zone of this event. */
export function ZonesDialog({ event, hall, template, seats, onClose }: {
  event: EventRef; hall: EventHall; template: HallTemplate | null; seats: ReadonlyArray<SeatAssignment>; onClose: () => void;
}) {
  const run = useCommand();
  const dialogs = useDialogs();
  const form = useZodForm(z.object({ zones: zonesSchema }), { defaultValues: { zones: [...hall.zones] } });
  const restorable = template !== null && sameShape(template.zones, hall.zones);

  const submit = async ({ zones }: { zones: ReadonlyArray<HallZone> }) => {
    const orphans = orphanSeats({ zones }, seats);
    if (orphans.length > 0) {
      const ok = await dialogs.confirm({
        title: 'Giảm số ghế đã xếp?',
        text: `${orphans.length} đại biểu đang ngồi ghế sẽ không còn (${orphans.map((s) => s.seatCode).join(', ')}) và trở về chưa xếp chỗ.`,
        confirmLabel: 'Đồng ý giảm ghế',
        cancelLabel: 'Hủy',
        tone: 'danger',
      });
      if (!ok) return;
    }
    const done = await run('venue.updateEventZones', { eventId: event.id, version: hall.version, zones, releaseOrphans: orphans.length > 0 }, { success: 'Đã lưu cấu hình phân khu cho sự kiện!' });
    if (done) onClose();
  };

  return (
    <Dialog open onClose={onClose} dirty={form.formState.isDirty} size="xl" icon="layers" title="Cấu hình phân khu hội trường"
      subtitle="Cán bộ xử lý chính chỉ định nhóm đại biểu và số ghế tương ứng từng khu">
      <Form form={form} onSubmit={submit} className="space-y-3">
        <ol className="space-y-3">
          {hall.zones.map((z, i) => (
            <li key={z.key}>
              <fieldset className="rounded-control border border-line p-3">
                <legend className="px-1 text-sm font-semibold text-ink-2">Khu {i + 1} · Tiền tố: <span className="font-mono">{z.prefix}</span></legend>
                <div className="grid gap-3 sm:grid-cols-12">
                  <div className="sm:col-span-5"><FormField label="Tên khu" name={`zones.${i}.name`} required><TextInput name={`zones.${i}.name`} /></FormField></div>
                  <div className="sm:col-span-4"><FormField label="Chỉ định nhóm đại biểu ưu tiên" name={`zones.${i}.assignedGroup`}><Select name={`zones.${i}.assignedGroup`} options={GROUP_OPTIONS} /></FormField></div>
                  <div className="sm:col-span-3"><FormField label="Số lượng ghế quy hoạch" name={`zones.${i}.seatCount`} suffix="ghế"><NumberInput name={`zones.${i}.seatCount`} min={1} max={500} /></FormField></div>
                  <div className="sm:col-span-12"><Checkbox name={`zones.${i}.vipZone`} label="Khu VIP" description="Đại biểu ngồi khu này được in biển tên chữ A để bàn." /></div>
                </div>
              </fieldset>
            </li>
          ))}
        </ol>
        <p className="text-xs text-ink-muted">Thêm, bớt khu hoặc đổi tiền tố, màu thực hiện ở Quản trị Hội trường rồi đổi hội trường cho sự kiện.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" icon="refresh" disabled={!restorable} onClick={() => template && form.reset({ zones: [...template.zones] }, { keepDefaultValues: true })}>Khôi phục về mẫu gốc</Button>
          <span className="flex-1" />
          <Button variant="secondary" onClick={onClose}>Đóng</Button>
          <Button type="submit" icon="check" loading={form.formState.isSubmitting}>Lưu phân khu</Button>
        </div>
        {!restorable && <p className="text-xs text-ink-muted">{template ? 'Mẫu gốc đã đổi cấu trúc khu nên không khôi phục được tại đây.' : 'Hội trường mẫu gốc không còn trong danh mục.'}</p>}
      </Form>
    </Dialog>
  );
}

/** "Tự động xếp chỗ": keeps seated guests unless asked otherwise (m4b BUG-03) and reports the final count per zone (BUG-10). */
export function AutoAssignDialog({ event, hall, guests, seats, onClose }: {
  event: EventRef; hall: EventHall; guests: ReadonlyArray<SeatGuestView>; seats: ReadonlyArray<SeatAssignment>; onClose: () => void;
}) {
  const run = useCommand();
  const form = useZodForm(z.object({ mode: z.enum(AUTO_ASSIGN_MODES) }), { defaultValues: { mode: 'fill-empty' } });
  const [result, setResult] = useState<AutoAssignSummary | null>(null);
  const attending = guests.filter((g) => isAttending(g.rsvpStatus));
  const seated = new Set(seats.map((s) => s.guestId));
  const waiting = attending.filter((g) => !seated.has(g.id)).length;

  const submit = async ({ mode }: { mode: AutoAssignMode }) => {
    const done = await run('venue.autoAssign', { eventId: event.id, mode }, { success: 'Đã tự động xếp chỗ' });
    if (done) setResult(done);
  };

  if (result) {
    return (
      <Dialog open onClose={onClose} size="lg" icon="check" title="Xếp chỗ thành công" footer={<Button onClick={onClose}>Đóng</Button>}>
        <div className="space-y-3 text-sm">
          <p className="text-ink"><strong>{result.placed}/{result.attending}</strong> đại biểu xác nhận đã có ghế.</p>
          <ul className="space-y-1">
            {result.perZone.map((z) => <li key={z.key} className="flex justify-between gap-2 text-ink-2"><span>{z.name}</span><span className="tabular-nums">{z.assigned}/{z.seats} ghế</span></li>)}
          </ul>
          {result.unplaced > 0
            ? <Alert tone="warning">Còn {result.unplaced} đại biểu chưa xếp được do hết ghế phù hợp trong hội trường. Khu VIP chỉ nhận đại biểu VIP.</Alert>
            : <Alert tone="success">Tất cả đại biểu xác nhận đều đã được xếp ghế theo khu vực.</Alert>}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} size="lg" icon="users" title="Tự động xếp chỗ theo khu vực" subtitle="Xếp ngẫu nhiên đại biểu đã xác nhận tham dự vào khu của nhóm mình">
      {attending.length === 0 ? (
        <div className="space-y-4">
          <Alert tone="info" title="Chưa có đại biểu xác nhận">Không có đại biểu nào đã xác nhận tham dự (RSVP) để tự động xếp chỗ. Vui lòng cập nhật trạng thái RSVP trước!</Alert>
          <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Đóng</Button></div>
        </div>
      ) : (
        <Form form={form} onSubmit={submit} className="space-y-4">
          <ul className="space-y-1 text-sm">
            {hall.zones.map((z) => (
              <li key={z.key} className="flex flex-wrap items-center gap-2"><ZoneBadge zone={z} /><span className="text-ink-2">{z.seatCount} ghế: {ZONE_GROUPS[z.assignedGroup].short}</span></li>
            ))}
          </ul>
          <p className="text-sm text-ink-2">{attending.length} đại biểu xác nhận, {waiting} người chưa có ghế. Khu nhóm được xếp trước khu chung; khu VIP chỉ nhận đại biểu VIP.</p>
          <RadioGroup<AutoAssignMode> name="mode" label="Cách xếp" options={[
            { value: 'fill-empty', label: 'Chỉ xếp người chưa có ghế', description: 'Giữ nguyên mọi chỗ đã xếp, kể cả VIP xếp tay và khách phát sinh.' },
            { value: 'reassign-all', label: 'Xếp lại toàn bộ', description: `Xóa cả ${seats.length} chỗ đã xếp, kể cả VIP xếp tay và khách phát sinh, rồi xếp lại từ đầu.` },
          ]} />
          {footer(onClose, 'Tiến hành xếp chỗ', form.formState.isSubmitting)}
        </Form>
      )}
    </Dialog>
  );
}
