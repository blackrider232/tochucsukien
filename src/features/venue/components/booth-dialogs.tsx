'use client';

import { useWatch } from 'react-hook-form';
import { Button, DateInput, Dialog, Form, FormField, Select, Textarea, TextInput, useDialogs, useZodForm } from '@/components/ui';
import { useAppContext } from '@/core/auth';
import { newId, type EventId, type IsoDate } from '@/core/brand';
import { useCommand } from '@/core/commands';
import { DEPARTMENTS, enumOptions, type DepartmentName } from '@/core/vocab';
import type { Booth, BoothShift } from '../contract';
import { BOOTH_STATUS, DEFAULT_BOOTH_SIZE, SUBSIDY } from '../domain/booths';
import { boothDraftSchema, shiftDraftSchema, type BoothDraft, type ShiftDraft } from '../domain/schemas';

const STATUS_OPTIONS = enumOptions(BOOTH_STATUS).map((o) => ({ value: o.value, label: o.label }));
const SUBSIDY_OPTIONS = enumOptions(SUBSIDY).map((o) => ({ value: o.value, label: o.label }));
const DEPARTMENT_OPTIONS = DEPARTMENTS.map((d) => ({ value: d.name, label: d.name }));

/** "Thêm gian hàng hội chợ" / "Chỉnh sửa gian hàng {code}" (m4b §1.9). The code is checked against this event's booths as you type (m4b BUG-22). */
export function BoothDialog({ eventId, booth, codes, onClose }: { eventId: EventId; booth: Booth | null; codes: ReadonlyArray<string>; onClose: () => void }) {
  const run = useCommand();
  const dialogs = useDialogs();
  const others = new Set(codes.filter((c) => c !== booth?.code));
  const schema = boothDraftSchema.superRefine((b, ctx) => {
    if (others.has(b.code)) ctx.addIssue({ code: 'custom', path: ['code'], message: `Mã gian ${b.code} đã có trong sự kiện này` });
  });
  const form = useZodForm(schema, {
    defaultValues: booth
      ? { code: booth.code, size: booth.size, company: booth.company, products: booth.products, subsidyPercent: String(booth.subsidyPercent), status: booth.status, contact: booth.contact, staff: booth.staff }
      : { code: '', size: DEFAULT_BOOTH_SIZE, company: '', products: '', subsidyPercent: '50', status: 'confirmed', contact: '', staff: '' },
  });
  const status = useWatch({ control: form.control, name: 'status' });

  const submit = async (draft: BoothDraft) => {
    const done = booth
      ? await run('venue.updateBooth', { eventId, id: booth.id, version: booth.version, draft }, { success: `Đã lưu gian hàng ${draft.code}` })
      : await run('venue.createBooth', { eventId, id: newId<'Booth'>(), draft }, { success: `Đã lưu gian hàng ${draft.code}` });
    if (done) onClose();
  };
  const remove = async () => {
    if (!booth) return;
    const ok = await dialogs.confirm({ title: `Xóa gian hàng ${booth.code}?`, text: booth.company ? `Doanh nghiệp: ${booth.company}` : 'Gian còn trống.', confirmLabel: 'Đồng ý xóa', cancelLabel: 'Hủy', tone: 'danger' });
    if (ok && (await run('venue.deleteBooth', { eventId, id: booth.id, version: booth.version }, { success: 'Đã xóa gian hàng' })) !== undefined) onClose();
  };

  return (
    <Dialog open onClose={onClose} dirty={form.formState.isDirty} size="lg" icon="store"
      title={booth ? `Chỉnh sửa gian hàng ${booth.code}` : 'Thêm gian hàng hội chợ'} subtitle="Cập nhật thông tin gian hàng và chính sách hỗ trợ kinh phí">
      <Form form={form} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <FormField label="Mã gian hàng" name="code" required hint="Chữ cái của dãy và số thứ tự, ví dụ A01."><TextInput name="code" placeholder="Ví dụ: A01, B12..." /></FormField>
        <FormField label="Diện tích / quy cách" name="size"><TextInput name="size" /></FormField>
        <div className="sm:col-span-2">
          <FormField label="Tên doanh nghiệp / HTX tham gia" name="company" required={status !== 'available'} hint={status === 'available' ? 'Gian còn trống không cần tên doanh nghiệp.' : undefined}>
            <TextInput name="company" />
          </FormField>
        </div>
        <div className="sm:col-span-2"><FormField label="Sản phẩm trưng bày chính" name="products"><Textarea name="products" rows={2} /></FormField></div>
        <FormField label="Chính sách hỗ trợ kinh phí" name="subsidyPercent"><Select name="subsidyPercent" options={SUBSIDY_OPTIONS} /></FormField>
        <FormField label="Trạng thái gian hàng" name="status"><Select name="status" options={STATUS_OPTIONS} /></FormField>
        <FormField label="Người đại diện & hotline doanh nghiệp" name="contact"><TextInput name="contact" placeholder="Họ tên - số điện thoại" /></FormField>
        <FormField label="Cán bộ SCE trực hỗ trợ" name="staff"><TextInput name="staff" /></FormField>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          {booth && <Button variant="danger" icon="trash" onClick={() => void remove()}>Xóa gian hàng</Button>}
          <span className="flex-1" />
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" icon="check" loading={form.formState.isSubmitting}>Lưu gian hàng</Button>
        </div>
      </Form>
    </Dialog>
  );
}

/** A persisted duty shift (m4b BUG-19): every field the schedule shows has an input. */
export function ShiftDialog({ eventId, eventDate, shift, onClose }: { eventId: EventId; eventDate: IsoDate; shift: BoothShift | null; onClose: () => void }) {
  const run = useCommand();
  const { profile } = useAppContext();
  const form = useZodForm(shiftDraftSchema, {
    defaultValues: shift
      ? { shiftDate: shift.shiftDate, shiftLabel: shift.shiftLabel, officerName: shift.officerName, department: shift.department, phone: shift.phone, zone: shift.zone }
      : { shiftDate: eventDate, shiftLabel: '', officerName: '', department: (profile.department ?? 'Phòng Phát triển doanh nghiệp') as DepartmentName, phone: '', zone: '' },
  });
  const submit = async (draft: ShiftDraft) => {
    const done = shift
      ? await run('venue.updateShift', { eventId, id: shift.id, version: shift.version, draft }, { success: 'Đã cập nhật ca trực cán bộ SCE' })
      : await run('venue.createShift', { eventId, id: newId<'BoothShift'>(), draft }, { success: 'Đã thêm ca trực cán bộ SCE' });
    if (done) onClose();
  };
  return (
    <Dialog open onClose={onClose} dirty={form.formState.isDirty} size="lg" icon="clock" title={shift ? 'Sửa ca trực' : 'Thêm ca trực'}
      subtitle="Phân công cán bộ trực hỗ trợ doanh nghiệp theo ca (Mục 9)">
      <Form form={form} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <FormField label="Ngày trực" name="shiftDate" required><DateInput name="shiftDate" showHolidays /></FormField>
        <FormField label="Khung giờ ca trực" name="shiftLabel" required><TextInput name="shiftLabel" placeholder="Ví dụ: 07:30 - 12:00" /></FormField>
        <FormField label="Cán bộ phụ trách trực" name="officerName" required><TextInput name="officerName" placeholder="Họ tên cán bộ" /></FormField>
        <FormField label="Phòng ban" name="department" required><Select name="department" options={DEPARTMENT_OPTIONS} /></FormField>
        <FormField label="Hotline trực" name="phone"><TextInput name="phone" type="tel" /></FormField>
        <FormField label="Khu vực / dãy gian hàng phụ trách" name="zone"><TextInput name="zone" placeholder="Ví dụ: Dãy A" /></FormField>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" icon="check" loading={form.formState.isSubmitting}>Lưu ca trực</Button>
        </div>
      </Form>
    </Dialog>
  );
}
