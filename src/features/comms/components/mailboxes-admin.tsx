'use client';

// "Cấu hình hòm thư Google & Client ID gửi thư" (m4c §1.11), a section of
// /admin/settings. Admin only: the slot, the commands and RLS all check
// comms.mailboxes.admin (m4a B07, m4c B9).

import { useState } from 'react';
import { Badge, Button, Checkbox, DataTable, Dialog, Form, FormField, RowMenu, SectionCard, TextInput, useDialogs, useZodForm, type Column } from '@/components/ui';
import { newId } from '@/core/brand';
import { useCommand } from '@/core/commands';
import type { SenderMailbox } from '../contract';
import { mailboxDraftSchema, type MailboxDraft } from '../domain/schemas';
import type { MailboxesScreenData } from '../domain/screen';

function MailboxDialog({ mailbox, first, onClose }: { mailbox: SenderMailbox | null; first: boolean; onClose: () => void }) {
  const run = useCommand();
  const form = useZodForm(mailboxDraftSchema, {
    defaultValues: { displayName: mailbox?.displayName ?? '', email: mailbox?.email ?? '', clientId: mailbox?.clientId ?? '', isDefault: mailbox?.isDefault ?? first },
  });
  const submit = async (draft: MailboxDraft) => {
    const done = await run(
      'comms.saveMailbox',
      { id: mailbox?.id ?? newId<'Mailbox'>(), version: mailbox?.version ?? null, draft },
      { success: mailbox ? 'Đã cập nhật hòm thư Google' : 'Đã thêm hòm thư Google mới' },
    );
    if (done) onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      icon="mail"
      size="lg"
      title={mailbox ? 'Chỉnh sửa hòm thư Google & Client ID' : 'Thêm hòm thư Google & Client ID mới'}
      dirty={form.formState.isDirty}
    >
      <Form form={form} onSubmit={submit} className="space-y-4">
        <FormField label="Tên gợi nhớ / Tên hòm thư (tên hiển thị người gửi)" name="displayName" required hint="Tên này hiển thị trong danh sách chọn của chuyên viên và ở mục người gửi của thư.">
          <TextInput name="displayName" autoComplete="off" />
        </FormField>
        <FormField label="Địa chỉ email Google" name="email" required hint="Chuyên viên phải đăng nhập Google đúng địa chỉ này mới gửi được.">
          <TextInput name="email" type="email" autoComplete="off" />
        </FormField>
        <FormField label="Google OAuth 2.0 Client ID (riêng cho email này)" name="clientId" hint="Để trống thì dùng Client ID chung trong Cài đặt. Không có Client ID nào thì không gửi được thư.">
          <TextInput name="clientId" placeholder="Ví dụ: 123456789-abcdef.apps.googleusercontent.com" autoComplete="off" />
        </FormField>
        <Checkbox name="isDefault" label="Đặt làm hòm thư mặc định" description={mailbox?.isDefault ? 'Muốn đổi mặc định, hãy đặt một hòm thư khác làm mặc định.' : undefined} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" icon="check" loading={form.formState.isSubmitting}>Lưu cấu hình hòm thư</Button>
        </div>
      </Form>
    </Dialog>
  );
}

export function MailboxesAdmin({ data }: { data: MailboxesScreenData }) {
  const run = useCommand();
  const dialogs = useDialogs();
  const [editing, setEditing] = useState<SenderMailbox | 'new' | null>(null);

  const makeDefault = (m: SenderMailbox) =>
    void run('comms.saveMailbox', { id: m.id, version: m.version, draft: { displayName: m.displayName, email: m.email, clientId: m.clientId, isDefault: true } }, { success: `Đã đặt ${m.displayName} làm hòm thư mặc định` });
  const remove = async (m: SenderMailbox) => {
    const ok = await dialogs.confirm({
      title: 'Xóa hòm thư này?',
      text: `${m.displayName} <${m.email}>${m.isDefault ? '. Hòm thư tiếp theo trong danh sách sẽ trở thành mặc định.' : ''}`,
      confirmLabel: 'Xóa hòm thư',
      tone: 'danger',
    });
    if (ok) await run('comms.deleteMailbox', { id: m.id, version: m.version }, { success: 'Đã xóa hòm thư' });
  };

  const columns: ReadonlyArray<Column<SenderMailbox>> = [
    {
      id: 'name',
      header: 'Tên hòm thư',
      cell: (m) => (
        <div className="min-w-0">
          <p className="font-semibold text-ink">{m.displayName}</p>
          <p className="text-xs text-ink-2">{m.email}</p>
        </div>
      ),
    },
    {
      id: 'client',
      header: 'Google OAuth 2.0 Client ID',
      cell: (m) => (m.clientId ? <span className="break-all text-xs text-ink-2">{m.clientId}</span> : <span className="text-xs text-ink-muted">{data.googleClientId ? 'Dùng Client ID chung' : 'Chưa cài Client ID'}</span>),
      hideOnMobile: true,
    },
    {
      id: 'default',
      header: 'Mặc định',
      width: '10rem',
      cell: (m) => (m.isDefault ? <Badge tone="amber" icon="star">Mặc định</Badge> : <Button variant="ghost" onClick={() => makeDefault(m)}>Đặt mặc định</Button>),
    },
    {
      id: 'menu',
      header: '',
      width: '3.5rem',
      align: 'right',
      cell: (m) => (
        <RowMenu
          label={`Thao tác với ${m.displayName}`}
          items={[
            { id: 'edit', label: 'Sửa', icon: 'pencil', onSelect: () => setEditing(m) },
            { id: 'delete', label: 'Xóa', icon: 'trash', tone: 'danger', onSelect: () => void remove(m) },
          ]}
        />
      ),
    },
  ];

  return (
    <SectionCard
      title="Cấu hình hòm thư Google & Client ID gửi thư"
      subtitle={`Admin cài đặt sẵn tên gợi nhớ, địa chỉ email, Google Client ID riêng và chọn email mặc định để chuyên viên chỉ việc chọn gửi thư. ${data.mailboxes.length} hòm thư đã được cấu hình.`}
      icon="mail"
      actions={<Button variant="secondary" icon="plus" onClick={() => setEditing('new')}>Thêm hòm thư Google</Button>}
    >
      <DataTable
        rows={data.mailboxes}
        columns={columns}
        rowKey={(m) => m.id}
        numbered
        empty={{ icon: 'mail', title: 'Chưa có hòm thư Google nào', text: 'Bấm "Thêm hòm thư Google" để thiết lập.' }}
      />
      {editing && <MailboxDialog mailbox={editing === 'new' ? null : editing} first={data.mailboxes.length === 0} onClose={() => setEditing(null)} />}
    </SectionCard>
  );
}
