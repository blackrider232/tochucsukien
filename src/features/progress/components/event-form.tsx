'use client';

import { useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button, Checkbox, DateInput, Form, FormField, MoneyInput, NumberInput, Select, Textarea, TextInput, TimeInput, useToast, useZodForm } from '@/components/ui';
import { useAppContext, useCalendar } from '@/core/auth';
import { newId, type EventId, type IsoDate, type Vnd } from '@/core/brand';
import { useCommand } from '@/core/commands';
import { addWorkdays, formatVNDate } from '@/core/dates';
import { DEPARTMENTS, EVENT_TYPES, type DepartmentName } from '@/core/vocab';
import type { EventDraft, SceEvent } from '../contract';
import { templateStepCount } from '../domain/instantiate';
import { CHAIR_DEPARTMENTS, eventFields } from '../domain/schemas';

/** m2 §1.7: the actor's own department, else this one. */
const DEFAULT_LEAD_DEPARTMENT: DepartmentName = 'Phòng Xúc tiến đầu tư';

const codeOf = (name: DepartmentName) => DEPARTMENTS.find((d) => d.name === name)!.code;

/** The command's event fields, with checkboxes per department and an optional money field as the form presents them. */
const eventFormSchema = eventFields
  .omit({ supportingDepartments: true, budget: true })
  .extend({
    budget: z.number().int().min(0).optional(),
    supporting: z.record(z.string(), z.boolean().optional()),
    applyStandardTemplate: z.boolean(),
  })
  .transform(({ supporting, budget, ...rest }): EventDraft => ({
    ...rest,
    budget: budget === undefined ? null : (budget as Vnd),
    supportingDepartments: CHAIR_DEPARTMENTS.filter((d) => d !== rest.department && supporting[codeOf(d)]),
  }));

const TYPE_OPTIONS = [
  { value: 'hoi_nghi' as const, label: `${EVENT_TYPES.hoi_nghi.label} (Luồng 1)` },
  { value: 'hoi_cho' as const, label: `${EVENT_TYPES.hoi_cho.label} (Luồng 2 - Phụ lục III)` },
];

export function EventForm({ event, departments, today, onDone, onCancel }: {
  /** Absent: create. */
  event?: SceEvent;
  /** Departments the actor may chair an event for. */
  departments: ReadonlyArray<DepartmentName>;
  today: IsoDate;
  onDone: (id: EventId) => void;
  onCancel: () => void;
}) {
  const { profile } = useAppContext();
  const cal = useCalendar();
  const run = useCommand();
  const toast = useToast();
  const lead = event?.department ?? [profile.department, DEFAULT_LEAD_DEPARTMENT].find((d) => d !== null && departments.includes(d)) ?? departments[0];
  const options = [...new Set([...(event ? [event.department] : []), ...departments])].map((d) => ({ value: d, label: d }));

  const form = useZodForm(eventFormSchema, {
    defaultValues: event
      ? {
          name: event.name, type: event.type, eventDate: event.eventDate, eventTime: event.eventTime, location: event.location,
          department: event.department, leadPerson: event.leadPerson, targetGuests: event.targetGuests, budget: event.budget ?? undefined,
          note: event.note, applyStandardTemplate: false,
          supporting: Object.fromEntries(event.supportingDepartments.map((d) => [codeOf(d), true])),
        }
      : {
          name: '', type: 'hoi_nghi', eventDate: addWorkdays(cal, today, 15), eventTime: '08:30', location: '',
          department: lead, leadPerson: profile.fullname, targetGuests: 150, note: '', applyStandardTemplate: true, supporting: {},
        },
  });
  const chosenLead = useWatch({ control: form.control, name: 'department' });
  const chosenType = useWatch({ control: form.control, name: 'type' });

  const submit = async (draft: EventDraft) => {
    if (!event) {
      const id = newId<'Event'>();
      const created = await run('progress.createEvent', { id, draft }, {
        success: draft.applyStandardTemplate ? 'Đã khởi tạo sự kiện và toàn bộ khung quy trình chuẩn SCE!' : 'Đã tạo sự kiện. Hãy thêm nhóm việc hoặc áp dụng quy trình chuẩn.',
      });
      if (created) onDone(id);
      return;
    }
    // The patch schema drops applyStandardTemplate, which only matters on create.
    const saved = await run('progress.updateEvent', { id: event.id, version: event.version, patch: draft }, { success: `Đã cập nhật sự kiện "${draft.name}"` });
    if (!saved) return;
    if (saved.eventDate !== event.eventDate) toast.info(`Đã cập nhật lại hạn chót của các bước theo ngày tổ chức mới (${formatVNDate(saved.eventDate)}).`);
    onDone(event.id);
  };

  return (
    <Form form={form} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormField label="Tên sự kiện / chương trình" name="name" required>
          <TextInput name="name" placeholder="Ví dụ: Hội nghị Xúc tiến Đầu tư Hà Nội - Hoa Kỳ 2026" />
        </FormField>
      </div>
      <FormField label="Loại hình sự kiện" name="type" required hint={event && chosenType !== event.type ? 'Đổi loại hình không đổi các bước đã có. Dùng "Áp dụng quy trình chuẩn" nếu cần thêm nhóm việc của loại hình mới.' : undefined}>
        <Select name="type" options={TYPE_OPTIONS} />
      </FormField>
      <FormField label="Phòng ban chủ trì" name="department" required>
        <Select name="department" options={options} />
      </FormField>
      <FormField label="Ngày tổ chức" name="eventDate" required hint="Hạn chót của mọi bước được tính lại theo ngày này.">
        <DateInput name="eventDate" showHolidays />
      </FormField>
      <FormField label="Giờ khai mạc" name="eventTime">
        <TimeInput name="eventTime" />
      </FormField>
      <FormField label="Địa điểm tổ chức" name="location">
        <TextInput name="location" placeholder="Ví dụ: Trung tâm Hội nghị Quốc tế, 11 Lê Hồng Phong" />
      </FormField>
      <FormField label="Cán bộ chủ trì / phụ trách" name="leadPerson">
        <TextInput name="leadPerson" placeholder="Ví dụ: Nguyễn Văn A" />
      </FormField>
      <FormField label="Số lượng khách dự kiến (đại biểu)" name="targetGuests" required>
        <NumberInput name="targetGuests" min={1} />
      </FormField>
      <FormField label="Kinh phí dự kiến (VNĐ)" name="budget">
        <MoneyInput name="budget" />
      </FormField>
      <fieldset className="sm:col-span-2">
        <legend className="text-sm font-semibold text-ink">Phòng ban phối hợp</legend>
        <p className="text-xs text-ink-muted">Cán bộ các phòng phối hợp cùng cập nhật tiến độ của sự kiện.</p>
        <div className="grid gap-x-4 sm:grid-cols-2">
          {CHAIR_DEPARTMENTS.filter((d) => d !== chosenLead).map((d) => (
            <Checkbox key={d} name={`supporting.${codeOf(d)}`} label={d} />
          ))}
        </div>
      </fieldset>
      {!event && (
        <div className="sm:col-span-2 rounded-card border border-line bg-surface-2 px-3">
          <Checkbox
            name="applyStandardTemplate"
            label="Áp dụng mẫu quy trình chuẩn"
            description={`Khởi tạo sẵn 7 nhóm công việc và ${templateStepCount(chosenType ?? 'hoi_nghi')} bước chi tiết cho sự kiện.`}
          />
        </div>
      )}
      <div className="sm:col-span-2">
        <FormField label="Ghi chú chung" name="note">
          <Textarea name="note" placeholder="Lưu ý quan trọng từ Lãnh đạo hoặc Ban Giám đốc..." />
        </FormField>
      </div>
      <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
        <Button variant="secondary" onClick={onCancel}>Hủy</Button>
        <Button type="submit" icon="check" loading={form.formState.isSubmitting}>Lưu sự kiện</Button>
      </div>
    </Form>
  );
}
