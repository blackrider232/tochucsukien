'use client';

// /admin/settings: the typed settings form (core B12, B15, B39) and the
// per-year holiday editor (core Q12). Org identity and quotas reach every
// module through ctx.settings / useSettings(); nothing here is copied.

import { useState } from 'react';
import type { z } from 'zod';
import { Alert, Badge, Button, DataTable, DateInput, Dialog, Form, FormField, IconButton, KpiCard, LinkTabs, NumberInput, SectionCard, Select, TextInput, useDialogs, useToast, useZodForm, type Column, type IconName } from '@/components/ui';
import { useAppContext } from '@/core/auth';
import type { IsoDate } from '@/core/brand';
import { useCommand } from '@/core/commands';
import { formatVNDate, type Holiday } from '@/core/dates';
import type { SettingsPatch, SystemSettings } from '@/core/settings';
import { DEPARTMENTS } from '@/core/vocab';
import { SETTINGS_FIELDS, type SettingsField } from '../domain/labels';
import { HOLIDAY_KINDS, HOLIDAY_KIND_LABELS, holidayFields, settingsFormSchema, SETTINGS_LIMITS } from '../domain/schemas';

export interface AdminShortcut {
  href: string;
  label: string;
  icon: IconName;
}

export function SettingsOverview({ settings, accounts, activeAccounts, shortcuts }: { settings: SystemSettings; accounts: number; activeAccounts: number; shortcuts: ReadonlyArray<AdminShortcut> }) {
  const chairing = DEPARTMENTS.filter((d) => d.canChairEvents).length;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Phòng ban chuyên môn" value={`${chairing} phòng`} icon="building" accent="slate" caption="Cố định theo cơ cấu Trung tâm" />
        <KpiCard label="Tài khoản" value={accounts} icon="users" accent="cyan" caption={`${activeAccounts} đang hoạt động`} href="/admin/users" />
        <KpiCard label="Chỉ tiêu khách mời (1a)" value={`≥ ${settings.guestQuotaPercent}%`} icon="users" accent="amber" caption="So với số khách dự kiến" />
        <KpiCard label="Chỉ tiêu thẻ đại biểu (2b)" value={`≥ ${settings.badgeQuotaPercent}%`} icon="qr-code" accent="emerald" caption="So với số khách dự kiến" />
      </div>
      {shortcuts.length > 0 && (
        <SectionCard title="Bảng điều khiển quản trị" icon="settings">
          <div className="flex flex-wrap gap-2">
            {shortcuts.map((s) => (
              <Button key={s.href} variant="secondary" icon={s.icon} href={s.href}>{s.label}</Button>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

type SettingsForm = z.output<typeof settingsFormSchema>;
const FORM_FIELDS = Object.keys(settingsFormSchema.shape) as Array<keyof SettingsForm & SettingsField>;

/** Keyed by settings.version in the page, so a save (or someone else's) refills it. */
export function SettingsForm({ settings }: { settings: SystemSettings }) {
  const run = useCommand();
  const toast = useToast();
  const form = useZodForm(settingsFormSchema, { defaultValues: Object.fromEntries(FORM_FIELDS.map((f) => [f, settings[f]])) as SettingsForm });

  const submit = async (values: SettingsForm) => {
    const patch: SettingsPatch = Object.fromEntries(FORM_FIELDS.filter((f) => values[f] !== settings[f]).map((f) => [f, values[f]]));
    if (Object.keys(patch).length === 0) {
      toast.info('Chưa có thay đổi nào để lưu.');
      return;
    }
    await run('core.settings.update', { version: settings.version, patch }, { success: 'Đã lưu tham số. Mọi sự kiện dùng giá trị mới.' });
  };
  const number = (field: keyof typeof SETTINGS_LIMITS) => {
    const [min, max] = SETTINGS_LIMITS[field];
    return (
      <FormField label={SETTINGS_FIELDS[field].label} name={field} required suffix={SETTINGS_FIELDS[field].unit} hint={`Tính theo ${SETTINGS_FIELDS[field].hint}, từ ${min} đến ${max}.`}>
        <NumberInput name={field} min={min} max={max} step={1} />
      </FormField>
    );
  };

  return (
    <SectionCard title="Tham số định mức và chế độ báo cáo" subtitle="Áp dụng cho mọi sự kiện, mọi bản in và báo cáo." icon="settings">
      <Form form={form} onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <FormField label={SETTINGS_FIELDS.parentAgency.label} name="parentAgency" required hint="Dòng trên cùng của quốc hiệu trên văn bản.">
          <TextInput name="parentAgency" />
        </FormField>
        <FormField label={SETTINGS_FIELDS.agencyShortName.label} name="agencyShortName" required hint="Dùng trong số ký hiệu văn bản và tiêu đề ứng dụng.">
          <TextInput name="agencyShortName" />
        </FormField>
        <div className="md:col-span-2">
          <FormField label={SETTINGS_FIELDS.agencyName.label} name="agencyName" required>
            <TextInput name="agencyName" />
          </FormField>
        </div>
        {number('dailyReportThresholdDays')}
        {number('fieldPresenceHours')}
        {number('guestQuotaPercent')}
        {number('badgeQuotaPercent')}
        <div className="flex justify-end md:col-span-2">
          <Button type="submit" icon="check" loading={form.formState.isSubmitting}>Lưu tham số</Button>
        </div>
      </Form>
    </SectionCard>
  );
}

const KIND_OPTIONS = HOLIDAY_KINDS.map((k) => ({ value: k, label: HOLIDAY_KIND_LABELS[k] }));

export function HolidaysEditor({ year, years, canEdit }: { year: number; years: ReadonlyArray<number>; canEdit: boolean }) {
  const { holidays } = useAppContext();
  const run = useCommand();
  const dialogs = useDialogs();
  const [adding, setAdding] = useState(false);
  const ofYear = holidays.filter((h) => h.date.startsWith(`${year}-`)).sort((a, b) => a.date.localeCompare(b.date));
  const count = (y: number) => holidays.filter((h) => h.date.startsWith(`${y}-`)).length;

  const replace = (next: ReadonlyArray<Holiday>, success: string) => run('core.holidays.saveYear', { year, expected: ofYear, holidays: next }, { success });
  const remove = async (h: Holiday) => {
    const ok = await dialogs.confirm({
      title: `Xóa ${HOLIDAY_KIND_LABELS[h.kind].toLowerCase()} ${formatVNDate(h.date)}?`,
      text: `"${h.name}" không còn được tính khi đếm ngày làm việc. Hạn chót của các bước việc quanh ngày này sẽ được tính lại.`,
      confirmLabel: 'Xóa ngày',
      tone: 'danger',
    });
    if (ok) await replace(ofYear.filter((x) => x.date !== h.date), `Đã xóa ${h.name} (${formatVNDate(h.date)})`);
  };

  const columns: Column<Holiday>[] = [
    { id: 'date', header: 'Ngày', sortValue: (h) => h.date, cell: (h) => <span className="tabular-nums">{formatVNDate(h.date, { weekday: true })}</span> },
    { id: 'name', header: 'Tên', cell: (h) => h.name },
    { id: 'kind', header: 'Loại', hideOnMobile: true, cell: (h) => <Badge tone={h.kind === 'holiday' ? 'rose' : 'blue'}>{HOLIDAY_KIND_LABELS[h.kind]}</Badge> },
    ...(canEdit ? [{ id: 'actions', header: 'Thao tác', align: 'right' as const, cell: (h: Holiday) => <IconButton icon="trash" tone="red" label={`Xóa ${h.name} ${formatVNDate(h.date)}`} onClick={() => void remove(h)} /> }] : []),
  ];

  return (
    <SectionCard
      title="Ngày nghỉ lễ và ngày làm bù"
      subtitle="Thứ Bảy, Chủ Nhật và các ngày nghỉ dưới đây không tính là ngày làm việc."
      icon="calendar"
      actions={canEdit ? <Button variant="secondary" icon="plus" onClick={() => setAdding(true)}>Thêm ngày</Button> : undefined}
    >
      <div className="space-y-3">
        <LinkTabs label="Năm" variant="pill" activeId={String(year)} items={years.map((y) => ({ id: String(y), label: `${y} · ${count(y)} ngày`, href: `/admin/settings?year=${y}` }))} />
        <Alert tone="info">Tết Nguyên đán, Giỗ Tổ Hùng Vương, ngày nghỉ bù và ngày làm bù do Chính phủ công bố hằng năm. Nhập ngay khi có thông báo để hạn chót quanh Tết được tính đúng.</Alert>
        <DataTable rows={ofYear} columns={columns} rowKey={(h) => h.date} empty={{ icon: 'calendar', title: `Chưa có ngày nghỉ nào trong năm ${year}`, text: canEdit ? 'Bấm "Thêm ngày" để nhập lịch nghỉ của năm.' : undefined }} />
      </div>
      {adding && (
        <HolidayDialog
          year={year}
          onClose={() => setAdding(false)}
          onSave={async (h) => {
            if (ofYear.some((x) => x.date === h.date)) return `Ngày ${formatVNDate(h.date)} đã có trong danh sách`;
            const saved = await replace([...ofYear, h], `Đã thêm ${h.name} (${formatVNDate(h.date)})`);
            if (saved !== undefined) setAdding(false);
            return null;
          }}
        />
      )}
    </SectionCard>
  );
}

type HolidayForm = z.output<typeof holidayFields>;
function HolidayDialog({ year, onClose, onSave }: { year: number; onClose: () => void; onSave: (h: Holiday) => Promise<string | null> }) {
  const form = useZodForm(holidayFields, { defaultValues: { date: '' as IsoDate, name: '', kind: 'holiday' } });
  const submit = async (h: HolidayForm) => {
    if (!h.date.startsWith(`${year}-`)) return form.setError('date', { message: `Chọn một ngày trong năm ${year}` });
    const clash = await onSave(h);
    if (clash) form.setError('date', { message: clash });
  };
  return (
    <Dialog open onClose={onClose} dirty={form.formState.isDirty} size="sm" icon="calendar" title={`Thêm ngày nghỉ năm ${year}`}>
      <Form form={form} onSubmit={submit} className="space-y-4">
        <FormField label="Ngày" name="date" required>
          <DateInput name="date" min={`${year}-01-01` as IsoDate} max={`${year}-12-31` as IsoDate} />
        </FormField>
        <FormField label="Tên ngày nghỉ" name="name" required>
          <TextInput name="name" placeholder="Ví dụ: Tết Nguyên đán" />
        </FormField>
        <FormField label="Loại" name="kind" required hint="Ngày làm bù là Thứ Bảy hoặc Chủ Nhật được tính là ngày làm việc.">
          <Select name="kind" options={KIND_OPTIONS} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" icon="check" loading={form.formState.isSubmitting}>Lưu ngày</Button>
        </div>
      </Form>
    </Dialog>
  );
}

export function DepartmentsCard() {
  return (
    <SectionCard title="Danh sách phòng ban chuyên môn" subtitle="Cố định theo cơ cấu Trung tâm; tài khoản được gán phòng tại trang Tài khoản." icon="building">
      <ul className="divide-y divide-line">
        {DEPARTMENTS.map((d) => (
          <li key={d.code} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
            <span className="font-semibold text-ink">{d.name}</span>
            <span className="text-sm text-ink-2">{d.duty}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
