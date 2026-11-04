'use client';

import { useState } from 'react';
import { Alert, Button, Dialog, Form, FormField, Select, Textarea, TextInput, useToast, useZodForm } from '@/components/ui';
import { newId, type TemplateId, type Uuid } from '@/core/brand';
import { useCommand } from '@/core/commands';
import type { DocumentTemplate } from '../contract';
import { builtinDraft, draftOf, type TemplateDraft } from '../domain/catalog';
import { TEMPLATE_KINDS, TEMPLATE_KIND_VALUES, TEMPLATE_LEVELS, TEMPLATE_LEVEL_VALUES } from '../domain/levels';
import { unknownTags, tagToken } from '../domain/merge-tags';
import { NEW_TEMPLATE_DRAFT } from '../domain/new-template';
import { templateDraftSchema } from '../domain/schemas';
import { RichEditor } from './rich-editor';

const LEVEL_OPTIONS = TEMPLATE_LEVEL_VALUES.map((value) => ({ value, label: TEMPLATE_LEVELS[value].label }));
const KIND_OPTIONS = TEMPLATE_KIND_VALUES.map((value) => ({ value, label: TEMPLATE_KINDS[value].optionLabel }));

export type EditorTarget = { kind: 'create' } | { kind: 'edit'; template: DocumentTemplate };

const STATUS = { ready: 'Sẵn sàng chỉnh sửa', editing: 'Đang soạn thảo biểu mẫu chuẩn', creating: 'Tạo biểu mẫu chuẩn mới', dirty: 'Có thay đổi chưa lưu', reloaded: 'Đã tải lại nội dung mẫu gốc ban hành' } as const;

/** Create or edit one template: fields, the document editor, and a confirm before closing over unsaved changes (m3 B21). */
export function TemplateEditor({ target, onClose }: { target: EditorTarget; onClose: () => void }) {
  const run = useCommand();
  const toast = useToast();
  const template = target.kind === 'edit' ? target.template : null;
  const original = template && template.origin !== 'custom' ? builtinDraft(template.id) : null;
  const [newCustomId] = useState(() => newId<'Template'>() as Uuid<'Template'> & TemplateId);
  const initial: TemplateDraft = template ? draftOf(template) : NEW_TEMPLATE_DRAFT;
  const [editor, setEditor] = useState({ token: 0, html: initial.content });
  const [reloaded, setReloaded] = useState(false);
  const form = useZodForm(templateDraftSchema, { defaultValues: initial });
  const content = form.watch('content');
  const unknown = unknownTags(content ?? '');
  const dirty = form.formState.isDirty;
  const contentError = form.formState.errors.content?.message;

  const status = dirty ? STATUS.dirty : reloaded ? STATUS.reloaded : template ? STATUS.editing : STATUS.creating;

  const restoreOriginal = () => {
    if (!original) return;
    form.reset(original, { keepDefaultValues: true });
    form.setValue('level', original.level, { shouldDirty: true });
    form.setValue('kind', original.kind, { shouldDirty: true });
    setEditor((e) => ({ token: e.token + 1, html: original.content }));
    setReloaded(true);
  };

  const submit = async (draft: TemplateDraft) => {
    const success = 'Đã lưu biểu mẫu chuẩn thành công! Nội dung đã được cập nhật vào kho chuẩn hệ thống và áp dụng cho toàn bộ chuyên viên.';
    let saved: unknown;
    if (!template) saved = await run('templates.createCustom', { id: newCustomId, draft }, { success });
    else if (template.origin === 'custom') saved = await run('templates.updateCustom', { id: template.id as Uuid<'Template'> & TemplateId, version: template.version!, draft }, { success });
    else saved = await run('templates.saveOverride', { id: template.id, version: template.version, draft }, { success });
    if (saved !== undefined) onClose();
  };
  const save = () => void form.handleSubmit(submit, () => toast.warning('Vui lòng nhập tên biểu mẫu chuẩn và nội dung.'))();

  return (
    <Dialog
      open
      onClose={onClose}
      dirty={dirty}
      size="full"
      icon="pencil"
      title={template ? `Sửa đổi biểu mẫu chuẩn: ${template.title}` : 'Thêm biểu mẫu chuẩn mới (Admin only)'}
      subtitle="Chỉ Quản trị viên mới có quyền cấu hình nội dung biểu mẫu chuẩn của hệ thống."
      footer={
        <>
          <p className="mr-auto text-sm text-ink-muted" role="status">{status}</p>
          {original && <Button variant="ghost" icon="refresh" onClick={restoreOriginal}>Khôi phục mẫu gốc SCE</Button>}
          <Button variant="secondary" onClick={onClose}>Đóng</Button>
          <Button icon="check" loading={form.formState.isSubmitting} onClick={save}>Lưu cập nhật biểu mẫu chuẩn</Button>
        </>
      }
    >
      <Form form={form} onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Mã hiệu biểu mẫu" name="code" hint="Có thể để trống, ví dụ TT-SCE/DSKM."><TextInput name="code" placeholder="TT-SCE/DSKM" /></FormField>
          <FormField label="Tên biểu mẫu chuẩn" name="title" required><TextInput name="title" /></FormField>
          <FormField label="Nhóm quy trình" name="level"><Select name="level" options={LEVEL_OPTIONS} /></FormField>
          <FormField label="Định dạng biểu mẫu" name="kind"><Select name="kind" options={KIND_OPTIONS} /></FormField>
          <div className="sm:col-span-2">
            <FormField label="Mô tả mục đích và hướng dẫn sử dụng" name="description"><Textarea name="description" rows={2} /></FormField>
          </div>
        </div>
        {unknown.length > 0 && (
          <Alert tone="warning" title="Có thẻ không nhận diện được">
            {unknown.map(tagToken).join(', ')} sẽ giữ nguyên dạng chữ khi dùng biểu mẫu. Chọn thẻ có sẵn ở ô “Chèn thẻ trộn”.
          </Alert>
        )}
        <RichEditor
          key={editor.token}
          initialHtml={editor.html}
          onChange={(html) => form.setValue('content', html, { shouldDirty: true, shouldValidate: form.formState.isSubmitted })}
        />
        {contentError && <p role="alert" className="text-sm font-medium text-danger-ink">{contentError}</p>}
      </Form>
    </Dialog>
  );
}
