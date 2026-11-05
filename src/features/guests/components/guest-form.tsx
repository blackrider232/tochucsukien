'use client';

import { useWatch } from 'react-hook-form';
import { Button, Checkbox, Dialog, Form, FormField, Select, Textarea, TextInput, useZodForm } from '@/components/ui';
import { newId, type EventId } from '@/core/brand';
import { useCommand } from '@/core/commands';
import { GUEST_GROUPS, INVITE, RSVP, SEND_METHOD, enumOptions } from '@/core/vocab';
import { ContactLookup, guestFieldsFromContact } from '@/features/directory';
import type { Guest, GuestDraft } from '../contract';
import { GUEST_DRAFT_KEYS, NEW_GUEST_DEFAULTS, draftOf, guestFields } from '../domain/schemas';

const options = <K extends string>(registry: Parameters<typeof enumOptions<K>>[0]) => enumOptions(registry).map((o) => ({ value: o.value, label: o.label }));
const GROUP_OPTIONS = options(GUEST_GROUPS);
const SEND_OPTIONS = options(SEND_METHOD);
const INVITE_OPTIONS = options(INVITE);
const RSVP_OPTIONS = options(RSVP);

/** The form edits text, so the email is a string ('' when absent); the command schema turns it back into Email | null. */
const toForm = (d: GuestDraft) => ({ ...d, email: d.email ?? '' });

/** Add or edit one guest (m4a §1.6.1). The form parses with the command's own field rules. */
export function GuestFormDialog({ eventId, guest, lookup = false, onClose }: { eventId: EventId; guest: Guest | null; lookup?: boolean; onClose: () => void }) {
  const run = useCommand();
  const form = useZodForm(guestFields, { defaultValues: toForm(guest ? draftOf(guest) : NEW_GUEST_DEFAULTS) });
  const rsvp = useWatch({ control: form.control, name: 'rsvpStatus' });

  // Copying a contact into a new guest links it (masterContactId, set by the lookup field itself). Editing never overwrites what staff typed.
  const fillFrom = (c: Parameters<typeof guestFieldsFromContact>[0]) => {
    for (const [key, value] of Object.entries(guestFieldsFromContact(c))) form.setValue(key as keyof GuestDraft, (value ?? '') as never, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
  };

  const submit = async (values: GuestDraft) => {
    const done = guest
      ? await run(
          'guests.update',
          {
            eventId,
            id: guest.id,
            version: guest.version,
            // Only what the person changed, so the audit and the undo name exactly that.
            patch: Object.fromEntries(GUEST_DRAFT_KEYS.filter((k) => k in form.formState.dirtyFields).map((k) => [k, values[k]])),
          },
          { success: 'Đã lưu đại biểu vào danh sách' },
        )
      : await run('guests.create', { eventId, id: newId<'Guest'>(), draft: values }, { success: 'Đã lưu đại biểu vào danh sách' });
    if (done) onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      icon="users"
      title={guest ? 'Cập nhật hồ sơ đại biểu' : 'Thêm khách mời mới'}
      subtitle="Cập nhật hồ sơ đại biểu tham dự sự kiện"
      dirty={form.formState.isDirty}
    >
      <Form form={form} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {lookup && !guest && (
          <div className="sm:col-span-2">
            <ContactLookup name="masterContactId" onPick={fillFrom} />
          </div>
        )}
        <div className="sm:col-span-2">
          <FormField label="Họ và tên đại biểu" name="name" required>
            <TextInput name="name" placeholder="Ví dụ: Nguyễn Văn An" autoComplete="off" />
          </FormField>
        </div>
        <FormField label="Nhóm khách mời" name="group" required>
          <Select name="group" options={GROUP_OPTIONS} />
        </FormField>
        <FormField label="Chức danh / chức vụ" name="title">
          <TextInput name="title" placeholder="Ví dụ: Phó Chủ tịch / Tổng Giám đốc" />
        </FormField>
        <div className="sm:col-span-2">
          <FormField label="Cơ quan / đơn vị công tác" name="organization" required>
            <TextInput name="organization" placeholder="Ví dụ: UBND TP Hà Nội / Công ty ABC" />
          </FormField>
        </div>
        <FormField label="Số điện thoại" name="phone">
          <TextInput name="phone" type="tel" placeholder="0912.xxx.xxx" />
        </FormField>
        <FormField label="Email" name="email">
          <TextInput name="email" type="email" placeholder="daibieu@domain.vn" />
        </FormField>
        <FormField label="Hình thức gửi thư" name="sendMethod">
          <Select name="sendMethod" options={SEND_OPTIONS} />
        </FormField>
        <FormField label="Trạng thái giấy mời" name="inviteStatus">
          <Select name="inviteStatus" options={INVITE_OPTIONS} />
        </FormField>
        <FormField label="Xác nhận (RSVP)" name="rsvpStatus" hint={rsvp === 'declined' ? 'Báo vắng sẽ giải phóng ghế đã xếp của đại biểu.' : undefined}>
          <Select name="rsvpStatus" options={RSVP_OPTIONS} />
        </FormField>
        {rsvp === 'substituted' ? (
          <FormField label="Họ tên người đi thay" name="substituteName">
            <TextInput name="substituteName" placeholder="Ghi rõ họ tên & chức vụ người thay" />
          </FormField>
        ) : (
          <div className="hidden sm:block" />
        )}
        <div className="sm:col-span-2">
          <Checkbox name="hasBanquet" label="Đăng ký dự tiệc chiêu đãi" />
        </div>
        <div className="sm:col-span-2">
          <FormField label="Ghi chú đón tiếp" name="notes">
            <Textarea name="notes" placeholder="Lưu ý đón tại phòng VIP, xếp cạnh đại diện..." />
          </FormField>
        </div>
        <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" icon="check" loading={form.formState.isSubmitting}>Lưu khách mời</Button>
        </div>
      </Form>
    </Dialog>
  );
}
