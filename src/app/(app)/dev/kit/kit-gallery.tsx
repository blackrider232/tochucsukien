'use client';

import { Component, useState, type ReactNode } from 'react';
import { z } from 'zod';
import type { SanitizedHtml } from '@/core/brand';
import type { EnumRegistry, Tone } from '@/core/vocab';
import {
  Badge, Button, Checkbox, Combobox, DataTable, DateInput, Dialog, EmptyState, FilterBar, Form, FormField,
  ICON_NAMES, Icon, IconButton, KpiCard, LinkTabs, MoneyInput, Nd30Header, NumberInput, PrintLink, PrintPage, ProgressBar,
  QrCode, RichHtml, SectionCard, Select, SignatureBlock, StatusBadge, Tabs, TextInput, ThemeToggle, TimeInput,
  downloadBlob, downloadWordHtml, downloadXlsx, useDialogs, useToast, useZodForm, xlsxSheet,
  type Accent, type Column,
} from '@/components/ui';

const TONES: Tone[] = ['slate', 'blue', 'indigo', 'purple', 'amber', 'emerald', 'rose', 'red', 'teal', 'cyan', 'sky'];
const ACCENTS: Accent[] = ['blue', 'purple', 'amber', 'emerald', 'teal', 'rose', 'slate', 'cyan', 'indigo'];

const STATUS = {
  pending: { label: 'Chờ phản hồi', short: 'Chờ', tone: 'amber' },
  confirmed: { label: 'Xác nhận tham dự', short: 'Tham dự', tone: 'emerald' },
  declined: { label: 'Từ chối', short: 'Từ chối', tone: 'rose' },
} as const satisfies EnumRegistry<'pending' | 'confirmed' | 'declined'>;

const SETTINGS = {
  agencyName: 'TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP HÀ NỘI',
  agencyShortName: 'SCE',
  parentAgency: 'SỞ TÀI CHÍNH HÀ NỘI',
  dailyReportThresholdDays: 10,
  fieldPresenceHours: 2,
  guestQuotaPercent: 130,
  badgeQuotaPercent: 130,
  googleClientId: null,
  version: 1,
} as never;
const HOLIDAYS = [{ date: '2026-09-02', name: 'Quốc khánh', kind: 'holiday' }] as never;

interface Guest { id: string; name: string; org: string; seats: number; status: keyof typeof STATUS }
const GUESTS: Guest[] = [
  { id: '1', name: 'Nguyễn Văn An', org: 'Sở Kế hoạch và Đầu tư', seats: 2, status: 'confirmed' },
  { id: '2', name: 'Âu Thị Bình', org: 'Tập đoàn Hòa Phát', seats: 5, status: 'pending' },
  { id: '3', name: 'Trần Quốc Cường', org: 'Báo Kinh tế Đô thị', seats: 1, status: 'declined' },
];
const COLUMNS: Column<Guest>[] = [
  { id: 'name', header: 'Họ tên', cell: (g) => g.name, sortValue: (g) => g.name },
  { id: 'org', header: 'Đơn vị', cell: (g) => g.org, hideOnMobile: true },
  { id: 'seats', header: 'Số ghế', cell: (g) => g.seats, sortValue: (g) => g.seats, align: 'right', width: '6rem' },
  { id: 'status', header: 'Trạng thái', cell: (g) => <StatusBadge registry={STATUS} value={g.status} size="sm" /> },
];

class Guard extends Component<{ children: ReactNode; note: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <p role="note" className="text-sm text-ink-muted">{this.props.note}</p> : this.props.children;
  }
}

function Spec({ kit, title, children }: { kit: string; title: string; children: ReactNode }) {
  return (
    <section data-kit={kit} aria-label={title} className="space-y-2">
      <h3 className="text-sm font-bold uppercase tracking-wide text-ink-muted">{title}</h3>
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
  group: z.string(),
  agree: z.literal(true, { error: 'Cần đồng ý' }),
});

function FormSpec() {
  const toast = useToast();
  const form = useZodForm(formSchema, { defaultValues: { name: '', group: 'VIP', day: '2026-09-02', time: '08:30' } });
  return (
    <Form form={form} onSubmit={() => toast.success('Biểu mẫu hợp lệ')} className="grid gap-3 sm:grid-cols-2">
      <FormField label="Họ tên" name="name" required hint="Như trên giấy mời"><TextInput name="name" placeholder="Nguyễn Văn A" /></FormField>
      <FormField label="Ngân sách" name="budget"><MoneyInput name="budget" /></FormField>
      <FormField label="Nhắc trước" name="days" suffix="ngày"><NumberInput name="days" min={1} /></FormField>
      <FormField label="Ngày" name="day"><DateInput name="day" showHolidays /></FormField>
      <FormField label="Giờ" name="time"><TimeInput name="time" /></FormField>
      <FormField label="Nhóm" name="group"><Select name="group" options={[{ value: 'VIP', label: 'Khách VIP' }, { value: 'DN', label: 'Doanh nghiệp' }]} placeholder="Chọn nhóm" /></FormField>
      <div className="sm:col-span-2"><Checkbox name="agree" label="Đồng ý điều khoản" description="Bắt buộc để lưu" /></div>
      <div className="flex gap-2 sm:col-span-2"><Button type="submit">Lưu</Button><Button variant="secondary" onClick={() => form.reset()}>Nhập lại</Button></div>
    </Form>
  );
}

function OverlaySpec() {
  const [open, setOpen] = useState(false);
  const [dirtyOpen, setDirtyOpen] = useState(false);
  const dialogs = useDialogs();
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => setOpen(true)}>Dialog</Button>
      <Button variant="secondary" onClick={() => setDirtyOpen(true)}>Dialog chưa lưu</Button>
      <Button variant="secondary" onClick={async () => toast.info(`confirm → ${await dialogs.confirm({ title: 'Xóa khách mời?', text: 'Thao tác này không hoàn tác được.', tone: 'danger', confirmLabel: 'Xóa' })}`)}>confirm</Button>
      <Button variant="secondary" onClick={async () => toast.info(`prompt → ${await dialogs.prompt({ title: 'Lý do hủy', label: 'Lý do', required: true })}`)}>prompt</Button>
      <Button variant="secondary" onClick={() => dialogs.alert({ title: 'Đã lưu', text: 'Dữ liệu đã được cập nhật.' })}>alert</Button>
      {(['success', 'info', 'warning', 'error'] as const).map((k) => (
        <Button key={k} variant="ghost" onClick={() => toast[k](`Thông báo ${k}`)}>toast.{k}</Button>
      ))}
      <Dialog open={open} onClose={() => setOpen(false)} title="Sửa khách mời" subtitle="Cập nhật thông tin" icon="users" accent="blue" footer={<Button onClick={() => setOpen(false)}>Xong</Button>}>
        <p className="text-sm text-ink-2">Nội dung hộp thoại. Esc hoặc nút đóng để thoát; Tab xoay vòng trong hộp.</p>
      </Dialog>
      <Dialog open={dirtyOpen} onClose={() => setDirtyOpen(false)} dirty title="Có thay đổi chưa lưu" size="sm">
        <p className="text-sm text-ink-2">Thử đóng để thấy câu hỏi xác nhận.</p>
      </Dialog>
    </div>
  );
}

function Specimens() {
  const [tab, setTab] = useState('a');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<ReadonlySet<string>>(new Set());
  const toast = useToast();
  const items = [{ id: 'a', label: 'Tất cả', count: 12 }, { id: 'b', label: 'Đã mời', icon: 'mail' as const }, { id: 'c', label: 'Từ chối' }];
  const shown = GUESTS.filter((g) => g.name.toLowerCase().includes(q.toLowerCase()));

  const exportXlsx = async () => {
    try {
      await downloadXlsx('mau.xlsx', [xlsxSheet({ name: 'Khách mời', columns: [{ header: 'Họ tên', width: 24, value: (g: Guest) => g.name }], rows: GUESTS, freezeHeader: true })]);
    } catch {
      toast.error('Xuất Excel cần phần lõi (core/text) đã hoàn thiện.');
    }
  };

  return (
    <div className="space-y-6">
      <Spec kit="Button" title="Button">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button><Button variant="secondary">Secondary</Button><Button variant="ghost">Ghost</Button><Button variant="danger" icon="trash">Danger</Button>
          <Button loading>Đang lưu</Button><Button disabled>Vô hiệu</Button>
          {ACCENTS.map((a) => <Button key={a} accent={a}>{a}</Button>)}
        </div>
      </Spec>
      <Spec kit="IconButton" title="IconButton">
        <div className="flex flex-wrap items-center gap-1">
          {(['plus', 'pencil', 'copy', 'download'] as const).map((i) => <IconButton key={i} icon={i} label={i} />)}
          <IconButton icon="trash" label="Xóa" tone="red" /><IconButton icon="check" label="Duyệt" tone="emerald" /><IconButton icon="lock" label="Khóa" disabled /><ThemeToggle />
        </div>
      </Spec>
      <Spec kit="Icon" title={`Icon (${ICON_NAMES.length})`}>
        <div className="flex flex-wrap gap-2 text-ink-2">{ICON_NAMES.map((n) => <span key={n} title={n}><Icon name={n} size={20} /></span>)}</div>
      </Spec>
      <Spec kit="Badge" title="Badge và StatusBadge">
        <div className="flex flex-wrap gap-2">
          {TONES.map((t) => <Badge key={t} tone={t}>{t}</Badge>)}
          <Badge tone="rose" icon="alert-triangle" pulse>Quá hạn</Badge>
          {(Object.keys(STATUS) as Array<keyof typeof STATUS>).map((s) => <StatusBadge key={s} registry={STATUS} value={s} />)}
          <StatusBadge registry={STATUS} value="confirmed" size="sm" pulse />
        </div>
      </Spec>
      <Spec kit="ProgressBar" title="ProgressBar">
        <div className="grid gap-3 sm:grid-cols-3"><ProgressBar value={35} max={100} label="Đang làm" /><ProgressBar value={100} max={100} label="Hoàn thành" /><ProgressBar value={4} max={10} tone="amber" label="Cảnh báo" /></div>
      </Spec>
      <Spec kit="KpiCard" title="KpiCard">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Khách mời" value={120} ofTotal={150} icon="users" accent="blue" progress={{ value: 120, max: 150 }} caption="80% chỉ tiêu" />
          <KpiCard label="Đã check-in" value={64} icon="check" accent="emerald" badge={{ text: 'Đang diễn ra', tone: 'emerald', pulse: true }} highlight />
          <KpiCard label="Gian hàng" value={16} icon="store" accent="amber" onClick={() => toast.info('Mở danh sách')} />
          <KpiCard label="Sự cố" value={2} icon="alert-triangle" accent="rose" href="#" caption="Liên kết" />
        </div>
      </Spec>
      <Spec kit="Tabs" title="Tabs và LinkTabs">
        <div className="space-y-3">
          <Tabs items={items} value={tab} onChange={setTab} />
          <Tabs items={items} value={tab} onChange={setTab} variant="underline" />
          <Tabs items={items} value={tab} onChange={setTab} variant="segmented" />
          <LinkTabs items={items.map((i) => ({ ...i, href: `#${i.id}` }))} activeId={tab} />
        </div>
      </Spec>
      <Spec kit="SectionCard" title="SectionCard">
        <SectionCard title="Thông tin chung" subtitle="Phụ đề mô tả" icon="calendar-check" accent="purple" actions={<Button variant="secondary" icon="pencil">Sửa</Button>}>
          <p className="text-sm text-ink-2">Nội dung thẻ.</p>
        </SectionCard>
      </Spec>
      <Spec kit="EmptyState" title="EmptyState">
        <div className="rounded-card border border-line bg-surface"><EmptyState icon="users" title="Chưa có khách mời" text="Thêm khách hoặc nhập từ danh bạ." action={<Button icon="plus">Thêm khách</Button>} /></div>
      </Spec>
      <Spec kit="FilterBar" title="FilterBar">
        <FilterBar search={{ value: q, onChange: setQ, placeholder: 'Tìm khách mời' }} filters={[{ id: 's', label: 'Trạng thái', value: 'all', options: [{ value: 'all', label: 'Tất cả' }, { value: 'pending', label: 'Chờ phản hồi' }], onChange: () => {} }]} trailing={<Button variant="secondary" icon="download">Xuất</Button>} />
      </Spec>
      <Spec kit="DataTable" title="DataTable">
        <div className="space-y-4">
          <DataTable rows={shown} columns={COLUMNS} rowKey={(g) => g.id} numbered stickyHeader maxHeight="16rem" minWidth="36rem"
            empty={{ icon: 'search', title: 'Không có kết quả' }} selection={{ selected: sel, onChange: setSel }}
            rowTone={(g) => (g.status === 'declined' ? 'rose' : null)} toolbar={<Button variant="secondary" icon="mail" disabled={sel.size === 0}>Gửi thư</Button>} />
          <DataTable rows={[]} columns={COLUMNS} rowKey={(g) => g.id} empty={{ icon: 'users', title: 'Bảng trống', text: 'Chưa có dữ liệu.' }} />
        </div>
      </Spec>
      <Spec kit="Form" title="FormField, controls và useZodForm">
        <FormSpec />
      </Spec>
      <Spec kit="Combobox" title="Combobox">
        <FormField label="Danh bạ" name="contact" hint="Gõ “an”, “binh”…">
          <Combobox name="contact" search={async (s) => GUESTS.filter((g) => g.name.toLowerCase().includes(s.toLowerCase()))} itemKey={(g) => g.id} itemLabel={(g) => g.name} renderItem={(g) => <span>{g.name} <span className="text-ink-muted">· {g.org}</span></span>} onPick={(g) => toast.info(`Chọn ${g.name}`)} />
        </FormField>
      </Spec>
      <Spec kit="Dialog" title="Dialog, useDialogs, useToast"><OverlaySpec /></Spec>
      <Spec kit="Print" title="PrintPage, Nd30Header, SignatureBlock, PrintLink">
        <div className="space-y-3">
          <PrintLink href="#" label="In kế hoạch" />
          <div className="overflow-x-auto">
            <PrintPage size="A5" orientation="portrait" margins="nd30">
                <Guard note="Nd30Header cần orgIdentity và formatNd30Date của core.">
                  <Nd30Header issuer="trung_tam" documentNumber="Số: 12/KH-SCE" date={'2026-11-04' as never} />
                </Guard>
                <p className="text-center font-bold">KẾ HOẠCH TỔ CHỨC SỰ KIỆN</p>
                <SignatureBlock left={{ title: 'Người lập' }} right={{ title: 'Giám đốc', name: 'Nguyễn Văn A' }} recipients={['Như trên', 'Lưu: VT']} />
            </PrintPage>
          </div>
        </div>
      </Spec>
      <Spec kit="QrCode" title="QrCode">
        <QrCode payload="SCE-CHK:00000000-0000-4000-8000-000000000001:00000000-0000-4000-8000-000000000002" size={140} caption="K7M2QX" />
      </Spec>
      <Spec kit="RichHtml" title="RichHtml">
        <RichHtml html={'<p>Nội dung <strong>đã làm sạch</strong></p>' as SanitizedHtml} className="text-sm text-ink" />
      </Spec>
      <Spec kit="Files" title="Tải tệp">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon="file-spreadsheet" onClick={exportXlsx}>downloadXlsx</Button>
          <Button variant="secondary" icon="file-text" onClick={() => { try { downloadWordHtml({ fileName: 'mau', title: 'Mẫu', body: '<p>Nội dung</p>' as SanitizedHtml }); } catch { toast.error('Xuất Word cần core/text đã hoàn thiện.'); } }}>downloadWordHtml</Button>
          <Button variant="secondary" icon="download" onClick={() => downloadBlob(new Blob(['xin chào'], { type: 'text/plain' }), 'mau.txt')}>downloadBlob</Button>
        </div>
      </Spec>
    </div>
  );
}

export function KitGallery() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-ink">Thư viện giao diện</h1>
        <p className="text-sm text-ink-muted">Mọi thành phần của bộ giao diện chung, giao diện sáng và tối cạnh nhau. Chỉ có ở môi trường phát triển.</p>
      </header>
      <div className="grid gap-4 2xl:grid-cols-2">
        {(['light', 'dark'] as const).map((theme) => (
          <div key={theme} data-theme={theme} className="min-w-0 rounded-card border border-line bg-app p-4 text-ink">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-muted">Giao diện {theme === 'light' ? 'sáng' : 'tối'}</p>
            <Specimens />
          </div>
        ))}
      </div>
    </div>
  );
}
