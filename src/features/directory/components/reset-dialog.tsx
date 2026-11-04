'use client';

import { z } from 'zod';
import { Alert, Button, Dialog, Form, FormField, TextInput, useZodForm } from '@/components/ui';
import { useCommand } from '@/core/commands';
import { foldVi } from '@/core/text';
import { RESET_PHRASE } from '../domain/schemas';

const schema = z.object({ phrase: z.string().refine((v) => foldVi(v) === foldVi(RESET_PHRASE), `Gõ đúng cụm từ "${RESET_PHRASE}"`) });

/** Clearing the whole directory asks the admin to type a phrase; the command checks it again (m4c B29). */
export function ResetDialog({ count, onClose }: { count: number; onClose: () => void }) {
  const run = useCommand();
  const form = useZodForm(schema, { defaultValues: { phrase: '' } });
  const submit = async (v: z.output<typeof schema>) => {
    const done = await run('directory.resetAll', { phrase: v.phrase }, { success: 'Đã xóa toàn bộ CSDL khách mời' });
    if (done) onClose();
  };
  return (
    <Dialog open onClose={onClose} size="md" icon="alert-triangle" title="Xóa toàn bộ CSDL khách mời?" subtitle={`${count} đối tượng sẽ bị xóa`}>
      <Form form={form} onSubmit={submit} className="space-y-4">
        <Alert tone="danger">
          Toàn bộ danh bạ dùng chung sẽ bị xóa. Khách mời đã nhập vào các sự kiện giữ nguyên. Hệ thống tạo một bản sao lưu ngay trước khi xóa; khôi phục ở Quản trị, mục Sao lưu. Thao tác này không hoàn tác được bằng nút Hoàn tác.
        </Alert>
        <FormField label={`Gõ "${RESET_PHRASE}" để xác nhận`} name="phrase" required>
          <TextInput name="phrase" autoComplete="off" />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" variant="danger" icon="trash" loading={form.formState.isSubmitting}>Xóa toàn bộ</Button>
        </div>
      </Form>
    </Dialog>
  );
}
