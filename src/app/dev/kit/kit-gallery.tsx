'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { CommandToasts } from '@/components/shell/command-toasts';
import { EventHeader } from '@/components/shell/event-header';
import { EventSwitcher } from '@/components/shell/event-switcher';
import { IdleGuard } from '@/components/shell/idle-guard';
import type { ShellModel } from '@/components/shell/nav-model';
import { SidebarContent } from '@/components/shell/sidebar';
import { TopBar } from '@/components/shell/top-bar';
import { AppContextProvider, type AppContextValue } from '@/core/auth';
import type { Email, Instant, IsoDate, SanitizedHtml, UserId, Version } from '@/core/brand';
import { DEFAULT_SETTINGS } from '@/core/settings';
import type { EnumRegistry, Tone } from '@/core/vocab';
import {
  Alert, Badge, Button, Checkbox, Combobox, DataTable, DateInput, Dialog, EmptyState, FilterBar, Form, FormField,
  ICON_NAMES, Icon, IconButton, KpiCard, LinkTabs, MoneyInput, Nd30Header, NumberInput, PrintLink, PrintPage, ProgressBar,
  QrCode, RadioGroup, RichHtml, RowMenu, SectionCard, Select, SignatureBlock, StatusBadge, Switch, Tabs, Textarea, TextInput,
  ThemeToggle, TimeInput, downloadBlob, downloadWordHtml, downloadXlsx, qrPngDataUrl, useBeep, useDialogs, useTheme, useToast,
  useZodForm, xlsxSheet,
  type Column,
} from '@/components/ui';

const TONES: Tone[] = ['slate', 'blue', 'indigo', 'purple', 'amber', 'emerald', 'rose', 'red', 'teal', 'cyan', 'sky'];

const STATUS = {
  pending: { label: 'Chờ phản hồi', short: 'Chờ', tone: 'amber' },
  confirmed: { label: 'Xác nhận tham dự', short: 'Tham dự', tone: 'emerald' },
  declined: { label: 'Từ chối', short: 'Từ chối', tone: 'rose' },
} as const satisfies EnumRegistry<'pending' | 'confirmed' | 'declined'>;

// The client mirror a signed-in page gets from the (app) layout, filled with fixtures so the gallery needs no session.
const DEV_APP: AppContextValue = {
  profile: {
    id: '00000000-0000-4000-8000-000000000001' as UserId,
    email: 'chuyenvien@sce.vn' as Email,
    fullname: 'Nguyễn Văn An',
    role: 'user',
    department: 'Phòng Xúc tiến đầu tư',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z' as Instant,
    updatedAt: '2026-01-01T00:00:00.000Z' as Instant,
  },
  settings: { ...DEFAULT_SETTINGS, version: 1 as Version },
  holidays: [{ date: '2026-09-02' as IsoDate, name: 'Quốc khánh', kind: 'holiday' }],
};

const SHELL: ShellModel = {
  brand: { title: 'Sự kiện SCE', subtitle: 'Trung tâm Xúc tiến đầu tư' },
  user: { name: 'Nguyễn Văn An', roleLabel: 'Chuyên viên', department: 'Phòng Xúc tiến đầu tư' },
  main: [
    { id: 'events', label: 'Tiến độ', icon: 'calendar-check', accent: 'blue', href: { kind: 'static', path: '/dev/kit' }, header: { title: 'Tiến độ', subtitle: '' }, subTabs: [] },
    { id: 'guests', label: 'Khách mời & Chỗ ngồi', icon: 'users', accent: 'amber', href: { kind: 'event', segment: 'guests' }, header: { title: 'Khách mời', subtitle: '' }, subTabs: [] },
    { id: 'live', label: 'Tổ chức sự kiện', icon: 'smartphone', accent: 'teal', href: { kind: 'event', segment: 'live' }, header: { title: 'Tổ chức', subtitle: '' }, subTabs: [] },
  ],
  admin: [{ id: 'admin', label: 'Cài đặt', icon: 'settings', accent: 'slate', href: { kind: 'static', path: '/admin/settings' }, header: { title: 'Cài đặt', subtitle: '' }, subTabs: [] }],
};

interface Guest { id: string; name: string; org: string; seats: number; status: keyof typeof STATUS }
const GUESTS: Guest[] = [
  { id: '1', name: 'Nguyễn Văn An', org: 'Sở Kế hoạch và Đầu tư', seats: 2, status: 'confirmed' },
  { id: '2', name: 'Âu Thị Bình', org: 'Tập đoàn Hòa Phát', seats: 5, status: 'pending' },
  { id: '3', name: 'Trần Quốc Cường', org: 'Báo Kinh tế Đô thị', seats: 1, status: 'declined' },
];

function guestColumns(onAction: (text: string) => void): Column<Guest>[] {
  return [
    { id: 'name', header: 'Họ tên', cell: (g) => g.name, sortValue: (g) => g.name },
    { id: 'org', header: 'Đơn vị', cell: (g) => g.org, hideOnMobile: true },
    { id: 'seats', header: 'Số ghế', cell: (g) => g.seats, sortValue: (g) => g.seats, align: 'right', width: '6rem' },
    { id: 'status', header: 'Trạng thái', cell: (g) => <StatusBadge registry={STATUS} value={g.status} size="sm" /> },
    {
      id: 'actions', header: 'Thao tác', align: 'right', width: '5rem',
      cell: (g) => (
        <RowMenu
          label={`Thao tác với ${g.name}`}
          items={[
            { id: 'edit', label: 'Sửa', icon: 'pencil', onSelect: () => onAction(`Sửa ${g.name}`) },
            { id: 'mail', label: 'Gửi lại thư mời', icon: 'mail', disabled: g.status === 'declined', onSelect: () => onAction('Đã gửi') },
            { id: 'delete', label: 'Xóa', icon: 'trash', tone: 'danger', onSelect: () => onAction(`Xóa ${g.name}`) },
          ]}
        />
      ),
    },
  ];
}

/** `kit` lists every export the specimen shows; scripts/check-ui.ts requires each kit export to appear in one. */
function Spec({ kit, title, children }: { kit: string; title: string; children: ReactNode }) {
  return (
    <section data-kit={kit} aria-label={title} className="space-y-2">
      <h3 className="text-sm font-semibold text-ink-muted">{title}</h3>
      {children}
    </section>
  );
}

const formSchema = z.object({
  name: z.string().min(1, 'Nhập họ tên'),
  budget: z.number({ error: 'Nhập số tiền' }).min(1000, 'Tối thiểu 1.000 đ'),
  days: z.number({ error: 'Nhập số ngày' }).min(1),
  day: z.string().min(1, 'Chọn ngày'),
  time: z.string(),
  group: z.string().min(1, 'Chọn nhóm'),
  note: z.string().min(5, 'Ghi chú ít nhất 5 ký tự'),
  channel: z.enum(['email', 'zalo'], { error: 'Chọn kênh gửi' }),
  agree: z.literal(true, { error: 'Cần đồng ý' }),
});

/** `invalid` validates on mount, so the gallery shows every error state without a click. */
function FormSpec({ invalid }: { invalid?: boolean }) {
  const toast = useToast();
  const form = useZodForm(formSchema, { defaultValues: invalid ? { name: '', group: '', note: '' } : { name: '', group: 'VIP', day: '2026-09-02', time: '08:30', note: '' } });
  useEffect(() => {
    if (invalid) void form.trigger();
  }, [invalid, form]);
  return (
    <Form form={form} onSubmit={() => toast.success('Biểu mẫu hợp lệ')} className="grid gap-3 sm:grid-cols-2">
      <FormField label="Họ tên" name="name" required hint="Như trên giấy mời"><TextInput name="name" placeholder="Nguyễn Văn A" /></FormField>
      <FormField label="Ngân sách" name="budget"><MoneyInput name="budget" /></FormField>
      <FormField label="Nhắc trước" name="days" suffix="ngày"><NumberInput name="days" min={1} /></FormField>
      <FormField label="Ngày" name="day"><DateInput name="day" showHolidays /></FormField>
      <FormField label="Giờ" name="time"><TimeInput name="time" /></FormField>
      <FormField label="Nhóm" name="group" required><Select name="group" options={[{ value: 'VIP', label: 'Khách VIP' }, { value: 'DN', label: 'Doanh nghiệp' }]} placeholder="Chọn nhóm" /></FormField>
      <div className="sm:col-span-2"><FormField label="Ghi chú" name="note" hint="Hiện trên phiếu giao việc"><Textarea name="note" rows={3} placeholder="Chỉ đạo, số điện thoại đầu mối…" /></FormField></div>
      <RadioGroup name="channel" label="Kênh gửi thư mời" required orientation="horizontal" options={[{ value: 'email', label: 'Email' }, { value: 'zalo', label: 'Zalo', description: 'Qua Zalo OA' }]} />
      <Checkbox name="agree" label="Đồng ý điều khoản" description="Bắt buộc để lưu" />
      <div className="flex gap-2 sm:col-span-2"><Button type="submit">Lưu</Button><Button variant="secondary" onClick={() => form.reset()}>Nhập lại</Button></div>
    </Form>
  );
}

function DisabledSpec() {
  const form = useZodForm(z.object({ days: z.number().optional() }), { defaultValues: { days: 3 } });
  return (
    <Form form={form} onSubmit={() => {}} className="grid gap-3 sm:grid-cols-2">
      <FormField label="Số ngày (khóa)" name="days"><NumberInput name="days" disabled /></FormField>
      <Checkbox name="locked" label="Đã chốt danh sách" checked onChange={() => {}} disabled />
      <Switch checked={false} onChange={() => {}} label="Tự gửi nhắc lịch" description="Chỉ quản trị viên bật được" disabled />
      <div className="flex flex-wrap items-center gap-2"><Button disabled>Vô hiệu</Button><IconButton icon="lock" label="Khóa" disabled /></div>
    </Form>
  );
}

function ControlledSpec() {
  const [tasks, setTasks] = useState([{ id: 'a', label: 'In biển tên', done: true }, { id: 'b', label: 'Gửi giấy mời', done: false }]);
  const [on, setOn] = useState(true);
  const beep = useBeep();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        {tasks.map((t) => (
          <Checkbox key={t.id} name={`task-${t.id}`} label={t.label} strike checked={t.done} onChange={(v) => setTasks((l) => l.map((x) => (x.id === t.id ? { ...x, done: v } : x)))} />
        ))}
      </div>
      <div>
        <Switch checked={on} onChange={setOn} label="Hiện khách đã từ chối" description="Áp dụng ngay, không cần Lưu" />
        <Switch checked={beep.enabled} onChange={beep.setEnabled} label="Âm báo check-in (useBeep)" description="Lưu theo thiết bị" />
        <div className="flex gap-2"><Button variant="secondary" onClick={beep.ok}>Bíp đúng</Button><Button variant="secondary" onClick={beep.error}>Bíp lỗi</Button></div>
      </div>
    </div>
  );
}

function OverlaySpec() {
  const [open, setOpen] = useState(false);
  const [dirtyOpen, setDirtyOpen] = useState(false);
  const [idle, setIdle] = useState(false);
  const dialogs = useDialogs();
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => setOpen(true)}>Dialog</Button>
      <Button variant="secondary" onClick={() => setDirtyOpen(true)}>Dialog chưa lưu</Button>
      <Button variant="secondary" onClick={async () => toast.info(`Xác nhận: ${await dialogs.confirm({ title: 'Xóa khách mời?', text: 'Thao tác này không hoàn tác được.', tone: 'danger', confirmLabel: 'Xóa' })}`)}>confirm nguy hiểm</Button>
      <Button variant="secondary" onClick={async () => toast.info(`Xác nhận: ${await dialogs.confirm({ title: 'Duyệt danh sách?', tone: 'success', confirmLabel: 'Duyệt' })}`)}>confirm duyệt</Button>
      <Button variant="secondary" onClick={async () => toast.info(`Nhập: ${await dialogs.prompt({ title: 'Lý do hủy', label: 'Lý do', required: true })}`)}>prompt</Button>
      <Button variant="secondary" onClick={() => dialogs.alert({ title: 'Đã lưu', text: 'Dữ liệu đã được cập nhật.' })}>alert</Button>
      {(['success', 'info', 'warning', 'error'] as const).map((k) => (
        <Button key={k} variant="ghost" onClick={() => toast[k](`Thông báo ${k}`)}>toast.{k}</Button>
      ))}
      <Button variant="ghost" icon="clock" pressed={idle} onClick={() => setIdle((v) => !v)}>Mô phỏng hết phiên (ngồi yên 3 giây)</Button>
      {idle && <IdleGuard warnAfterMs={3000} signOutAfterMs={120_000} onSignOut={() => { setIdle(false); toast.warning('Đã đăng xuất (mô phỏng)'); }} />}
      <Dialog open={open} onClose={() => setOpen(false)} title="Sửa khách mời" subtitle="Cập nhật thông tin" icon="users" footer={<Button onClick={() => setOpen(false)}>Xong</Button>}>
        <p className="text-sm text-ink-2">Nội dung hộp thoại. Esc hoặc nút đóng để thoát; Tab xoay vòng trong hộp.</p>
      </Dialog>
      <Dialog open={dirtyOpen} onClose={() => setDirtyOpen(false)} dirty title="Có thay đổi chưa lưu" size="sm">
        <p className="text-sm text-ink-2">Thử đóng để thấy câu hỏi xác nhận.</p>
      </Dialog>
    </div>
  );
}

function ThemeName() {
  const { theme } = useTheme();
  return <span className="text-sm text-ink-muted">useTheme: {theme === 'dark' ? 'tối' : 'sáng'}</span>;
}

function QrPng() {
  const [src, setSrc] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <Button variant="secondary" icon="qr-code" onClick={async () => setSrc(await qrPngDataUrl('SCE-CHK:demo', 96))}>qrPngDataUrl</Button>
      {/* eslint-disable-next-line @next/next/no-img-element -- a data URL, nothing to optimise */}
      {src && <img src={src} alt="Mã QR dạng ảnh PNG" width={96} height={96} />}
    </div>
  );
}

function Specimens() {
  const [tab, setTab] = useState('a');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const items = [{ id: 'a', label: 'Tất cả', count: 12 }, { id: 'b', label: 'Đã mời', icon: 'mail' as const }, { id: 'c', label: 'Từ chối' }];
  const shown = GUESTS.filter((g) => g.name.toLowerCase().includes(q.toLowerCase()));
  const columns = guestColumns((t) => toast.info(t));

  const exportXlsx = () =>
    downloadXlsx('mau.xlsx', [xlsxSheet({ name: 'Khách mời', columns: [{ header: 'Họ tên', width: 24, value: (g: Guest) => g.name }], rows: GUESTS, freezeHeader: true })]);

  return (
    <div className="space-y-6">
      <Spec kit="Button" title="Button: biến thể, liên kết, đang lưu, bật tắt">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button><Button variant="secondary">Secondary</Button><Button variant="ghost">Ghost</Button><Button variant="danger" icon="trash">Danger</Button>
          <Button href="#button" icon="plus">Liên kết</Button><Button href="#button" newTab variant="secondary" icon="external-link">Tab mới</Button>
          <Button loading>Đang lưu</Button><Button disabled>Vô hiệu</Button>
          <Button variant="secondary" pressed>Chỉ VIP</Button>
          <Button accent="emerald" icon="check">Duyệt</Button><Button accent="amber">Tạm hoãn</Button>
        </div>
      </Spec>
      <Spec kit="IconButton ThemeToggle useTheme" title="IconButton, ThemeToggle, useTheme">
        <div className="flex flex-wrap items-center gap-1">
          {(['plus', 'pencil', 'copy', 'download'] as const).map((i) => <IconButton key={i} icon={i} label={i} />)}
          <IconButton icon="trash" label="Xóa" tone="red" /><IconButton icon="check" label="Duyệt" tone="emerald" /><IconButton icon="bell" label="Báo cáo" tone="blue" /><IconButton icon="lock" label="Khóa" disabled /><ThemeToggle /><ThemeName />
        </div>
      </Spec>
      <Spec kit="Icon ICON_NAMES" title={`Icon (${ICON_NAMES.length})`}>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ink-2 sm:grid-cols-4 xl:grid-cols-6">
          {ICON_NAMES.map((n) => <li key={n} className="flex items-center gap-2"><Icon name={n} size={18} /><span className="truncate">{n}</span></li>)}
        </ul>
      </Spec>
      <Spec kit="Badge StatusBadge" title="Badge và StatusBadge">
        <div className="flex flex-wrap gap-2">
          {TONES.map((t) => <Badge key={t} tone={t}>{t}</Badge>)}
          <Badge tone="red" icon="siren" pulse>Khẩn cấp</Badge>
          <Badge tone="amber" icon="star">VIP</Badge>
          {(Object.keys(STATUS) as Array<keyof typeof STATUS>).map((s) => <StatusBadge key={s} registry={STATUS} value={s} />)}
          <StatusBadge registry={STATUS} value="confirmed" size="sm" />
        </div>
      </Spec>
      <Spec kit="Alert" title="Alert">
        <div className="grid gap-2">
          <Alert tone="info" title="Danh sách đã nhập">142 khách từ tệp Excel.</Alert>
          <Alert tone="success">Đã gửi 120 thư mời.</Alert>
          <Alert tone="warning" title="Còn 3 việc quá hạn">Xem tab Kế hoạch để cập nhật.</Alert>
          <Alert tone="danger" title="Không tải được danh sách" action={<Button variant="secondary" icon="refresh">Thử lại</Button>}>Kiểm tra kết nối mạng.</Alert>
        </div>
      </Spec>
      <Spec kit="ProgressBar" title="ProgressBar">
        <div className="grid gap-3 sm:grid-cols-3"><ProgressBar value={35} max={100} label="Đang làm" /><ProgressBar value={100} max={100} label="Hoàn thành" /><ProgressBar value={4} max={10} tone="amber" label="Cảnh báo" /></div>
      </Spec>
      <Spec kit="KpiCard" title="KpiCard: thường, nổi bật, nút, liên kết">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Khách mời" value={120} ofTotal={150} icon="users" accent="blue" progress={{ value: 120, max: 150 }} caption="80% chỉ tiêu" />
          <KpiCard label="Đã check-in" value={64} icon="check" accent="emerald" badge={{ text: 'Đang diễn ra', tone: 'emerald', pulse: true }} highlight />
          <KpiCard label="Gian hàng" value={16} icon="store" accent="amber" onClick={() => toast.info('Mở danh sách')} />
          <KpiCard label="Sự cố" value={2} icon="siren" accent="rose" href="#kpi" caption="Liên kết" />
        </div>
      </Spec>
      <Spec kit="Tabs LinkTabs" title="Tabs và LinkTabs">
        <div className="space-y-3">
          <Tabs items={items} value={tab} onChange={setTab} />
          <Tabs items={items} value={tab} onChange={setTab} variant="underline" />
          <Tabs items={items} value={tab} onChange={setTab} variant="segmented" />
          <LinkTabs label="Phân mục mẫu" items={items.map((i) => ({ ...i, href: `#${i.id}` }))} activeId={tab} />
        </div>
      </Spec>
      <Spec kit="SectionCard" title="SectionCard">
        <SectionCard title="Thông tin chung" subtitle="Phụ đề mô tả" icon="calendar-check" actions={<Button variant="secondary" icon="pencil">Sửa</Button>}>
          <p className="text-sm text-ink-2">Nội dung thẻ.</p>
        </SectionCard>
      </Spec>
      <Spec kit="EmptyState" title="EmptyState">
        <div className="rounded-card border border-line bg-surface"><EmptyState icon="users" title="Chưa có khách mời" text="Thêm khách hoặc nhập từ danh bạ." action={<Button icon="plus">Thêm khách</Button>} /></div>
      </Spec>
      <Spec kit="FilterBar" title="FilterBar">
        <FilterBar search={{ value: q, onChange: setQ, placeholder: 'Tên, đơn vị…', label: 'Tìm khách mời' }} filters={[{ id: 's', label: 'Trạng thái', value: 'all', options: [{ value: 'all', label: 'Tất cả' }, { value: 'pending', label: 'Chờ phản hồi' }], onChange: () => {} }]} trailing={<Button variant="secondary" icon="download">Xuất</Button>} />
      </Spec>
      <Spec kit="DataTable RowMenu" title="DataTable: chọn dòng, tô màu dòng, menu thao tác, đang tải, trống">
        <div className="space-y-4">
          <DataTable rows={shown} columns={columns} rowKey={(g) => g.id} numbered stickyHeader maxHeight="16rem" minWidth="40rem"
            empty={{ icon: 'search', title: 'Không có kết quả' }} selection={{ selected: sel, onChange: setSel }}
            rowTone={(g) => (g.status === 'declined' ? 'rose' : null)} toolbar={<Button variant="secondary" icon="mail" disabled={sel.size === 0}>Gửi thư</Button>} />
          <div className="space-y-2">
            <Button variant="ghost" icon="refresh" pressed={loading} onClick={() => setLoading((v) => !v)}>Trạng thái đang tải</Button>
            <DataTable rows={loading ? [] : GUESTS} loading={loading} columns={columns} rowKey={(g) => g.id} empty={{ icon: 'users', title: 'Bảng trống' }} />
          </div>
          <DataTable rows={[]} columns={columns} rowKey={(g) => g.id} empty={{ icon: 'users', title: 'Bảng trống', text: 'Chưa có dữ liệu.', action: <Button icon="plus">Thêm khách</Button> }} />
        </div>
      </Spec>
      <Spec kit="Form FormField useZodForm TextInput MoneyInput NumberInput DateInput TimeInput Select Textarea RadioGroup Checkbox" title="Biểu mẫu: FormField và các ô nhập">
        <FormSpec />
      </Spec>
      <Spec kit="Form" title="Biểu mẫu đã bấm Lưu khi còn lỗi">
        <FormSpec invalid />
      </Spec>
      <Spec kit="Checkbox Switch useBeep" title="Checkbox có điều khiển, Switch, useBeep">
        <ControlledSpec />
      </Spec>
      <Spec kit="NumberInput Checkbox Switch" title="Ô bị khóa">
        <DisabledSpec />
      </Spec>
      <Spec kit="Combobox" title="Combobox">
        <FormField label="Danh bạ" name="contact" hint="Gõ “an”, “binh”…">
          <Combobox name="contact" search={async (s) => GUESTS.filter((g) => g.name.toLowerCase().includes(s.toLowerCase()))} itemKey={(g) => g.id} itemLabel={(g) => g.name} renderItem={(g) => <span>{g.name} <span className="text-ink-muted">· {g.org}</span></span>} onPick={(g) => toast.info(`Chọn ${g.name}`)} />
        </FormField>
      </Spec>
      <Spec kit="Dialog useDialogs useToast" title="Dialog, useDialogs, useToast, cảnh báo hết phiên"><OverlaySpec /></Spec>
      <Spec kit="PrintPage Nd30Header SignatureBlock PrintLink" title="PrintPage, Nd30Header, SignatureBlock, PrintLink">
        <div className="space-y-3">
          <PrintLink href="#print" label="In kế hoạch" />
          <div className="overflow-x-auto">
            <PrintPage size="A5" orientation="portrait" margins="nd30">
              <Nd30Header issuer="trung_tam" documentNumber="Số: 12/KH-SCE" date={'2026-11-04' as IsoDate} />
              <p className="text-center font-bold">KẾ HOẠCH TỔ CHỨC SỰ KIỆN</p>
              <SignatureBlock left={{ title: 'Người lập' }} right={{ title: 'Giám đốc', name: 'Nguyễn Văn A' }} recipients={['Như trên', 'Lưu: VT']} />
            </PrintPage>
          </div>
        </div>
      </Spec>
      <Spec kit="QrCode qrPngDataUrl" title="QrCode và qrPngDataUrl">
        <div className="flex flex-wrap items-center gap-4">
          <QrCode payload="SCE-CHK:00000000-0000-4000-8000-000000000001:00000000-0000-4000-8000-000000000002" size={140} caption="K7M2QX" />
          <QrPng />
        </div>
      </Spec>
      <Spec kit="RichHtml" title="RichHtml">
        <RichHtml html={'<p>Nội dung <strong>đã làm sạch</strong></p>' as SanitizedHtml} className="text-sm text-ink" />
      </Spec>
      <Spec kit="downloadXlsx xlsxSheet downloadWordHtml downloadBlob" title="Tải tệp">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon="file-spreadsheet" onClick={exportXlsx}>downloadXlsx</Button>
          <Button variant="secondary" icon="file-text" onClick={() => downloadWordHtml({ fileName: 'mau', title: 'Mẫu', body: '<p>Nội dung</p>' as SanitizedHtml })}>downloadWordHtml</Button>
          <Button variant="secondary" icon="download" onClick={() => downloadBlob(new Blob(['xin chào'], { type: 'text/plain' }), 'mau.txt')}>downloadBlob</Button>
        </div>
      </Spec>
      <Spec kit="shell" title="Khung ứng dụng: thanh trên, thanh bên, đầu trang sự kiện">
        <div className="space-y-3">
          <div className="overflow-hidden rounded-card border border-line">
            <TopBar title="Khách Mời & Sơ Đồ Chỗ Ngồi" subtitle="Hội nghị Xúc tiến đầu tư 2026" headerActions={[]} onOpenMenu={() => toast.info('Mở menu')} badge={<Badge tone="rose">3</Badge>} />
          </div>
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="h-112 w-64 shrink-0 overflow-hidden rounded-card bg-sidebar">
              <SidebarContent model={SHELL} pathname="/dev/kit" badges={{ guests: <Badge tone="amber">12</Badge> }} onClose={() => toast.info('Đóng menu')} />
            </div>
            <div className="min-w-0 flex-1 rounded-card border border-line bg-surface p-4">
              <EventHeader
                title="Hội nghị Xúc tiến đầu tư 2026"
                meta={['Thứ Ba, 15/12/2026, 08:00', 'Khách sạn Melia Hà Nội', 'Phòng Xúc tiến đầu tư']}
                switcher={<EventSwitcher current="Hội nghị Xúc tiến đầu tư 2026" events={[{ id: 'e2', name: 'Hội chợ Thu 2026', dateLabel: '20/10/2026' }]} />}
                actions={[<PrintLink key="print" href="#print" label="In kế hoạch" />]}
              />
            </div>
          </div>
        </div>
      </Spec>
    </div>
  );
}

export function KitGallery() {
  return (
    <AppContextProvider value={DEV_APP}>
      <CommandToasts>
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-screen-2xl space-y-4 p-3 outline-none sm:p-5">
          <header>
            <h1 className="text-xl font-bold text-ink">Thư viện giao diện</h1>
            <p className="text-sm text-ink-muted">Mọi thành phần của bộ giao diện chung, giao diện sáng và tối cạnh nhau. Chỉ có ở môi trường phát triển. Quy tắc dùng: docs/rewrite/ui-rules.md.</p>
          </header>
          <div className="grid gap-4 2xl:grid-cols-2">
            {(['light', 'dark'] as const).map((theme) => (
              <div key={theme} data-theme={theme} className="min-w-0 rounded-card border border-line bg-app p-4 text-ink">
                <p className="mb-3 text-sm font-semibold text-ink-muted">Giao diện {theme === 'light' ? 'sáng' : 'tối'}</p>
                <Specimens />
              </div>
            ))}
          </div>
        </main>
      </CommandToasts>
    </AppContextProvider>
  );
}
