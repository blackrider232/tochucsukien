'use client';

// Form link, responses sheet and automation switches, and the column mapping.

import { Button, Checkbox, Form, FormField, IconButton, SectionCard, Select, TextInput, useToast, useZodForm } from '@/components/ui';
import type { EventId } from '@/core/brand';
import { useCommand } from '@/core/commands';
import { z } from 'zod';
import { FORM_FIELDS, FORM_FIELD_LABELS, type ColumnMap, type FormField as Field } from '../domain/columns';
import { formConfigSchema } from '../domain/schemas';
import type { FormView } from '../domain/screen';

export function FormConfigCard({ eventId, form, canManage, serverSync }: { eventId: EventId; form: FormView | null; canManage: boolean; serverSync: boolean }) {
  const run = useCommand();
  const toast = useToast();
  const f = useZodForm(formConfigSchema, {
    defaultValues: { formUrl: form?.formUrl ?? '', sheetUrl: form?.sheetCsvUrl ?? '', autoSync: form?.autoSync ?? false, autoAddNewGuests: form?.autoAddNewGuests ?? false },
  });
  const save = async (config: z.output<typeof formConfigSchema>) => {
    await run('comms.saveForm', { eventId, version: form?.version ?? null, config }, { success: 'Đã lưu cấu hình Google Form' });
  };
  const copy = async () => {
    if (!form?.formUrl) return toast.warning('Vui lòng dán link Google Form và lưu trước khi sao chép.');
    try {
      await navigator.clipboard.writeText(form.formUrl);
      toast.success('Đã sao chép liên kết!');
    } catch {
      toast.error('Trình duyệt không cho sao chép. Hãy chọn và sao chép link thủ công.');
    }
  };
  return (
    <SectionCard
      title="Cấu hình liên kết Form & tự động"
      subtitle="Đường link Form gửi tới khách mời và Sheet lưu phản hồi"
      icon="settings"
      actions={
        form?.formUrl ? (
          <div className="flex gap-1">
            <IconButton icon="copy" label="Sao chép link Google Form" onClick={() => void copy()} />
            <IconButton icon="external-link" label="Mở thử Google Form" href={form.formUrl} />
          </div>
        ) : undefined
      }
    >
      <Form form={f} onSubmit={save} className="space-y-4">
        <FormField label="1. Đường liên kết Google Form (dành cho khách mời điền xác nhận)" name="formUrl" hint="Được chèn vào thư qua biến {link_google_form}.">
          <TextInput name="formUrl" type="url" placeholder="Ví dụ: https://forms.gle/abcXYZ123 hoặc https://docs.google.com/forms/d/e/.../viewform" />
        </FormField>
        <FormField
          label="2. Đường liên kết Google Sheet lưu phản hồi (Responses Sheet)"
          name="sheetUrl"
          hint='Trong Form: Câu trả lời > Liên kết với Trang tính. Trong Sheet: Chia sẻ > "Bất kỳ ai có đường liên kết đều có thể xem". Giữ đúng thẻ (tab) phản hồi.'
        >
          <TextInput name="sheetUrl" type="url" placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0" />
        </FormField>
        <div className="space-y-1">
          {serverSync ? (
            <Checkbox name="autoSync" label="Tự động kiểm tra mỗi 5 phút" description="Máy chủ đồng bộ theo lịch, kể cả khi không ai mở phần mềm." />
          ) : (
            <Checkbox
              name="autoSync"
              disabled
              label="Tự động kiểm tra mỗi 5 phút (chưa hoạt động)"
              description='Máy chủ chưa có tài khoản hệ thống để đồng bộ theo lịch, nên hiện không có gì tự đồng bộ. Bấm "Đồng bộ ngay" để cập nhật phản hồi. Lựa chọn đã lưu được giữ cho khi tính năng hoạt động.'
            />
          )}
          <Checkbox name="autoAddNewGuests" label="Tự nạp khách mới từ Form" description="Người đăng ký chưa có trong danh sách được thêm làm khách mời (ghi chú: Tự đăng ký qua Google Form). Tắt: phản hồi chờ xem lại." />
        </div>
        {canManage && <Button type="submit" variant="secondary" icon="check" loading={f.formState.isSubmitting}>Lưu cấu hình</Button>}
      </Form>
    </SectionCard>
  );
}

const NONE = 'none';

export function ColumnMapCard({ eventId, form, canManage }: { eventId: EventId; form: FormView; canManage: boolean }) {
  const run = useCommand();
  const effective: ColumnMap = form.columnMap ?? form.detectedMap;
  const schema = z.object(Object.fromEntries(FORM_FIELDS.map((k) => [k, z.string()])) as Record<Field, z.ZodString>);
  const f = useZodForm(schema, { defaultValues: Object.fromEntries(FORM_FIELDS.map((k) => [k, effective[k] === undefined ? NONE : String(effective[k])])) as Record<Field, string> });
  const options = [{ value: NONE, label: '(Không có cột này)' }, ...form.sheetHeaders.map((h, i) => ({ value: String(i), label: `${i + 1}. ${h || '(trống)'}` }))];
  const save = async (values: Record<Field, string>) => {
    const columnMap = Object.fromEntries(FORM_FIELDS.flatMap((k) => (values[k] === NONE ? [] : [[k, Number(values[k])]]))) as ColumnMap;
    await run('comms.saveColumnMap', { eventId, version: form.version, columnMap }, { success: 'Đã lưu ghép cột' });
  };
  return (
    <SectionCard title="Ghép cột Google Sheet" subtitle={form.columnMap ? 'Đang dùng cách ghép đã lưu' : 'Đang tự nhận diện theo tiêu đề cột; có thể sửa và lưu'} icon="layers">
      <Form form={f} onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {FORM_FIELDS.map((k) => (
            <FormField key={k} label={FORM_FIELD_LABELS[k]} name={k}>
              <Select name={k} options={options} />
            </FormField>
          ))}
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary" icon="check">Lưu ghép cột</Button>
            {form.columnMap && (
              <Button variant="ghost" icon="refresh" onClick={() => void run('comms.saveColumnMap', { eventId, version: form.version, columnMap: null }, { success: 'Đã chuyển về tự nhận diện cột' })}>
                Tự nhận diện lại
              </Button>
            )}
          </div>
        )}
      </Form>
    </SectionCard>
  );
}
