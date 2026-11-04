'use client';

import { useFieldArray, useWatch } from 'react-hook-form';
import { Button, Checkbox, Dialog, Form, FormField, IconButton, NumberInput, Select, Textarea, TextInput, useDialogs, useZodForm } from '@/components/ui';
import { newId } from '@/core/brand';
import { useCommand } from '@/core/commands';
import type { HallTemplate, HallZone } from '../contract';
import { formatCount, nextZone, ZONE_COLOR_VALUES, ZONE_COLORS, ZONE_GROUP_VALUES, ZONE_GROUPS } from '../domain/halls';
import { hallTemplateDraftSchema, type HallTemplateDraft } from '../domain/schemas';

const COLOR_OPTIONS = ZONE_COLOR_VALUES.map((value) => ({ value, label: ZONE_COLORS[value].label }));
const GROUP_OPTIONS = ZONE_GROUP_VALUES.map((value) => ({ value, label: ZONE_GROUPS[value].short }));

/** The three zones a new template starts with (legacy openEditHallTemplateModal(null)). */
const NEW_TEMPLATE_ZONES: ReadonlyArray<HallZone> = [
  { key: 'A', name: 'Khu A: Đại biểu VIP', prefix: 'A-', seatCount: 12, color: 'red', assignedGroup: 'VIP', vipZone: true },
  { key: 'B', name: 'Khu B: Lãnh đạo Sở ngành & Quận/Huyện', prefix: 'B-', seatCount: 24, color: 'blue', assignedGroup: 'SoNganh', vipZone: false },
  { key: 'C', name: 'Khu C: Doanh nghiệp, Hiệp hội & Báo chí', prefix: 'C-', seatCount: 30, color: 'slate', assignedGroup: 'DoanhNghiep', vipZone: false },
];

export function HallTemplateDialog({ template, onClose }: { template: HallTemplate | null; onClose: () => void }) {
  const run = useCommand();
  const dialogs = useDialogs();
  const form = useZodForm(hallTemplateDraftSchema, {
    defaultValues: template
      ? { name: template.name, location: template.location, description: template.description, zones: [...template.zones] }
      : { name: '', location: '', description: '', zones: [...NEW_TEMPLATE_ZONES] },
  });
  const zones = useFieldArray({ control: form.control, name: 'zones' });
  const watched = useWatch({ control: form.control, name: 'zones' }) ?? [];
  const capacity = watched.reduce((sum, z) => sum + (Number(z?.seatCount) || 0), 0);

  const removeZone = async (i: number) => {
    if (zones.fields.length <= 1) return dialogs.alert({ title: 'Lưu ý', text: 'Hội trường phải có ít nhất 1 phân khu.' });
    zones.remove(i);
  };
  const submit = async (draft: HallTemplateDraft) => {
    const done = template
      ? await run('venue.updateHallTemplate', { id: template.id, version: template.version, draft }, { success: `Đã lưu hội trường mẫu: ${draft.name}` })
      : await run('venue.createHallTemplate', { id: newId<'HallTemplate'>(), draft }, { success: `Đã lưu hội trường mẫu: ${draft.name}` });
    if (done) onClose();
  };

  return (
    <Dialog open onClose={onClose} dirty={form.formState.isDirty} size="3xl" icon="building"
      title={template ? `Chỉnh sửa hội trường mẫu: ${template.name}` : 'Thêm hội trường mẫu mới'}
      subtitle="Thiết lập phân khu, tiền tố mã ghế và số ghế. Sự kiện đã chọn mẫu này giữ nguyên sơ đồ đã sao chép.">
      <Form form={form} onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormField label="Tên hội trường mẫu" name="name" required>
              <TextInput name="name" placeholder="Ví dụ: Trung tâm Hội nghị Quốc gia (Phòng Đa năng)" />
            </FormField>
          </div>
          <FormField label="Địa chỉ / vị trí địa lý" name="location"><TextInput name="location" /></FormField>
          <FormField label="Mô tả & quy chuẩn hội trường" name="description"><Textarea name="description" rows={2} /></FormField>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex-1 text-sm font-bold text-ink">Thiết kế phân khu & số ghế</h3>
          <span className="text-sm text-ink-muted" aria-live="polite">Tổng {formatCount(capacity)} ghế, {zones.fields.length} khu</span>
          <Button variant="secondary" icon="plus" onClick={() => zones.append(nextZone(form.getValues('zones') ?? []))}>Thêm khu vực</Button>
        </div>
        <ol className="space-y-3">
          {zones.fields.map((field, i) => (
            <li key={field.id}>
              <fieldset className="rounded-control border border-line p-3">
                <legend className="px-1 text-sm font-semibold text-ink-2">Khu {i + 1}</legend>
                <div className="grid gap-3 sm:grid-cols-12">
                  <div className="sm:col-span-5">
                    <FormField label="Tên khu" name={`zones.${i}.name`} required><TextInput name={`zones.${i}.name`} placeholder="Tên khu (vd: Khu A: VIP)" /></FormField>
                  </div>
                  <div className="sm:col-span-2">
                    <FormField label="Tiền tố mã ghế" name={`zones.${i}.prefix`} required><TextInput name={`zones.${i}.prefix`} placeholder="Mã (vd: A-)" /></FormField>
                  </div>
                  <div className="sm:col-span-2">
                    <FormField label="Số ghế" name={`zones.${i}.seatCount`} required><NumberInput name={`zones.${i}.seatCount`} min={1} max={500} /></FormField>
                  </div>
                  <div className="sm:col-span-3">
                    <FormField label="Màu" name={`zones.${i}.color`}><Select name={`zones.${i}.color`} options={COLOR_OPTIONS} /></FormField>
                  </div>
                  <div className="sm:col-span-5">
                    <FormField label="Nhóm đại biểu ưu tiên" name={`zones.${i}.assignedGroup`}><Select name={`zones.${i}.assignedGroup`} options={GROUP_OPTIONS} /></FormField>
                  </div>
                  <div className="sm:col-span-6">
                    <Checkbox name={`zones.${i}.vipZone`} label="Khu VIP" description="Đại biểu ngồi khu này được in biển tên chữ A để bàn." />
                  </div>
                  <div className="flex items-end justify-end sm:col-span-1">
                    <IconButton icon="trash" tone="red" label={`Xóa khu ${i + 1}`} onClick={() => void removeZone(i)} />
                  </div>
                </div>
              </fieldset>
            </li>
          ))}
        </ol>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" icon="check" loading={form.formState.isSubmitting}>Lưu hội trường</Button>
        </div>
      </Form>
    </Dialog>
  );
}
