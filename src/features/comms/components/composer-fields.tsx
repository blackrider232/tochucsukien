'use client';

// Sender, template, subject, merge tags and body. Rendered inside the compose Form.

import { useFormContext } from 'react-hook-form';
import { Alert, Badge, Button, Checkbox, FormField, SectionCard, Select, Textarea, TextInput } from '@/components/ui';
import { EMAIL_TEMPLATES } from '../domain/email-templates';
import { MERGE_FIELDS, type MergeCheck } from '../domain/merge';
import type { Compose } from '../domain/compose';

export function ComposerFields({ check, disabled }: { check: MergeCheck; disabled: boolean }) {
  const form = useFormContext<Compose>();
  const insert = (tag: string) => {
    const body = form.getValues('body') ?? '';
    form.setValue('body', `${body}{${tag}}`, { shouldDirty: true });
  };
  return (
    <SectionCard title="Nội dung thư" subtitle="Hỗ trợ định dạng HTML cho thư điện tử công vụ" icon="file-text">
      <div className="space-y-4">
        <FormField label="Mẫu thư định sẵn" name="templateKey" hint="Đổi mẫu sẽ thay tiêu đề và nội dung đang soạn">
          <Select name="templateKey" options={EMAIL_TEMPLATES.map((t) => ({ value: t.key, label: t.label }))} />
        </FormField>
        <FormField label="Tiêu đề thư" name="subject" required>
          <TextInput name="subject" autoComplete="off" />
        </FormField>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-ink">Chèn biến cá nhân hóa (bấm để chèn vào cuối nội dung)</p>
          <div className="flex flex-wrap gap-1.5">
            {MERGE_FIELDS.map((f) => (
              <Button key={f.tag} variant="ghost" disabled={disabled} onClick={() => insert(f.tag)}>
                {`{${f.tag}}`}
              </Button>
            ))}
          </div>
        </div>
        <FormField label="Nội dung thư" name="body" required hint="Mã HTML được làm sạch trước khi gửi: không chạy script, không nhúng nội dung ngoài.">
          <Textarea name="body" rows={12} />
        </FormField>
        <FormField label="Số điện thoại liên hệ" name="contactPhone" hint="Điền vào biến {sdt_lien_he}">
          <TextInput name="contactPhone" type="tel" placeholder="Ví dụ: 0912.345.678" />
        </FormField>
        <Checkbox name="attachQr" label="Đính kèm Thẻ Check-in có mã QR riêng của từng đại biểu" description="Chỉ đại biểu trong danh sách khách mời có mã check-in; người nhận tự nhập không có thẻ." />
        {check.unknown.length > 0 && (
          <Alert tone="warning" title="Có biến không được hỗ trợ">
            {`Các biến sau sẽ được gửi nguyên văn: ${check.unknown.map((t) => `{${t}}`).join(', ')}`}
          </Alert>
        )}
        {check.missing.length > 0 && (
          <Alert tone="info" title="Một số biến chưa có dữ liệu">
            <span className="flex flex-wrap gap-1.5">
              {check.missing.map((t) => (
                <Badge key={t} tone="amber">{MERGE_FIELDS.find((f) => f.tag === t)?.label ?? t}</Badge>
              ))}
            </span>
          </Alert>
        )}
      </div>
    </SectionCard>
  );
}
