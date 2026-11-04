'use client';

import { useEffect } from 'react';
import { useWatch } from 'react-hook-form';
import { Button, Checkbox, Dialog, Form, FormField, Select, Textarea, TextInput, useDialogs, useZodForm } from '@/components/ui';
import { newId, type ContactId } from '@/core/brand';
import { useCommand } from '@/core/commands';
import { guestIdentityKey } from '@/features/guests';
import type { MasterContact } from '../contract';
import { GROUP_OPTIONS } from '../domain/groups';
import { CONTACT_DRAFT_KEYS, NEW_CONTACT_DEFAULTS, contactFields, defaultBanquet, draftOf, type ContactDraft } from '../domain/schemas';

/** The form edits text, so the email is a string ('' when absent); the command schema turns it back into Email | null. */
const toForm = (d: ContactDraft) => ({ ...d, email: d.email ?? '' });

/** Add or edit one contact (m4c §1.2). The form parses with the command's own field rules. */
export function ContactFormDialog({ contact, contacts, onClose }: { contact: MasterContact | null; contacts: ReadonlyArray<MasterContact>; onClose: () => void }) {
  const run = useCommand();
  const dialogs = useDialogs();
  const form = useZodForm(contactFields, { defaultValues: toForm(contact ? draftOf(contact) : NEW_CONTACT_DEFAULTS) });
  const group = useWatch({ control: form.control, name: 'group' });

  // A new contact's banquet box follows its group until the person ticks it themselves (m4c B67).
  const touchedBanquet = 'hasBanquet' in form.formState.dirtyFields;
  useEffect(() => {
    if (!contact && !touchedBanquet) form.setValue('hasBanquet', defaultBanquet(group));
  }, [group, contact, touchedBanquet, form]);

  const submit = async (values: ContactDraft) => {
    // The directory already lists everyone, so a likely duplicate is asked about here (m4c B28); the server checks it too.
    const key = guestIdentityKey(values);
    const twin = contacts.find((c) => c.id !== contact?.id && guestIdentityKey(c) === key);
    let allowDuplicate = false;
    if (twin) {
      allowDuplicate = await dialogs.confirm({
        title: 'Có thể đã có trong CSDL',
        text: `Đã có "${twin.name}" (${twin.organization}) trùng email, số điện thoại hoặc họ tên và cơ quan. Vẫn lưu đối tượng này?`,
        confirmLabel: 'Vẫn lưu',
        cancelLabel: 'Quay lại',
        tone: 'warning',
      });
      if (!allowDuplicate) return;
    }
    const done = contact
      ? await run(
          'directory.update',
          {
            id: contact.id,
            version: contact.version,
            // Only what the person changed, so the audit and the undo name exactly that.
            patch: Object.fromEntries(CONTACT_DRAFT_KEYS.filter((k) => k in form.formState.dirtyFields).map((k) => [k, values[k]])),
            allowDuplicate,
          },
          { success: 'Đã lưu đối tượng vào CSDL' },
        )
      : await run('directory.create', { id: newId<'MasterContact'>() as ContactId, draft: values, allowDuplicate }, { success: 'Đã lưu đối tượng vào CSDL' });
    if (done) onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      icon="contact"
      title={contact ? 'Cập nhật hồ sơ CSDL' : 'Thêm đối tượng vào CSDL'}
      subtitle="Hồ sơ dùng chung, tự động gợi ý cho toàn hệ thống"
      dirty={form.formState.isDirty}
    >
      <Form form={form} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <FormField label="Họ và tên đại biểu / đầu mối" name="name" required>
          <TextInput name="name" placeholder="Ví dụ: Trần Sỹ Thanh" autoComplete="off" />
        </FormField>
        <FormField label="Nhóm đối tượng" name="group" required>
          <Select name="group" options={GROUP_OPTIONS} />
        </FormField>
        <FormField label="Chức vụ / chức danh" name="title">
          <TextInput name="title" />
        </FormField>
        <FormField label="Cơ quan / doanh nghiệp" name="organization" required>
          <TextInput name="organization" />
        </FormField>
        <FormField label="Số điện thoại liên hệ" name="phone">
          <TextInput name="phone" type="tel" placeholder="09xx.xxx.xxx hoặc 024.xxxx.xxxx" />
        </FormField>
        <FormField label="Email" name="email">
          <TextInput name="email" type="email" placeholder="daibieu@domain.vn" />
        </FormField>
        <FormField label="Địa chỉ trụ sở / cơ quan" name="address">
          <TextInput name="address" placeholder="Địa chỉ chuyển phát giấy mời" />
        </FormField>
        <FormField label="Mã số thuế / ngành nghề" name="taxCode">
          <TextInput name="taxCode" />
        </FormField>
        <div className="sm:col-span-2">
          <Checkbox name="hasBanquet" label="Mặc định tham dự tiệc chiêu đãi và xếp chỗ VIP" description="Tự động chọn có tiệc chiêu đãi khi đưa vào sự kiện" />
        </div>
        <div className="sm:col-span-2">
          <FormField label="Ghi chú nghi thức và lễ tân đón tiếp" name="notes">
            <Textarea name="notes" rows={2} />
          </FormField>
        </div>
        <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" icon="check" loading={form.formState.isSubmitting}>Lưu đối tượng</Button>
        </div>
      </Form>
    </Dialog>
  );
}
