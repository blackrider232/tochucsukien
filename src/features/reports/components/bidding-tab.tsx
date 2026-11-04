'use client';

// "Gói thầu và ngân sách" (m6 §1.6): packages typed by hand and labelled so
// (decision 15, BUG-32), add, edit and delete behind a confirm, a signed saving
// per row and in total with one formatter (BUG-35/37), and an .xlsx export.

import { useState } from 'react';
import { Alert, Button, DataTable, Dialog, Form, FormField, MoneyInput, RowMenu, SectionCard, Select, StatusBadge, TextInput, downloadXlsx, useDialogs, useZodForm, xlsxSheet, type Column } from '@/components/ui';
import { newId, type EventId } from '@/core/brand';
import { useCommand } from '@/core/commands';
import { fileDateStamp } from '@/core/dates';
import { fileNameStem, formatVnd } from '@/core/text';
import type { BiddingPackage } from '../contract';
import { biddingTotals, biddingTotalsSentence, formatPercent2, savingsLabel, savingsPercent } from '../domain/figures';
import { BIDDING_DEPARTMENTS, BIDDING_STATUS, BIDDING_STATUSES, nextPackageCode, packageFields, type PackageDraft } from '../domain/schemas';
import type { ReportsScreenData } from '../domain/screen';

function Saving({ p }: { p: BiddingPackage }) {
  if (p.winningPrice === null) return <span className="text-sm italic text-ink-muted">Chưa có giá trúng</span>;
  const rate = savingsPercent(p.budget, p.winningPrice);
  if (rate === null) return <span className="text-sm text-ink-muted">Chưa có</span>;
  return rate >= 0
    ? <span className="text-sm font-semibold tabular-nums text-success-ink">{formatPercent2(rate)}</span>
    : <span className="text-sm font-semibold tabular-nums text-danger-ink">Vượt {formatPercent2(-rate)}</span>;
}

function exportedSaving(p: BiddingPackage): string {
  if (p.winningPrice === null) return 'Chưa có giá trúng';
  const rate = savingsPercent(p.budget, p.winningPrice);
  return rate === null ? 'Chưa có' : savingsLabel(rate);
}

export function BiddingTab({ data }: { data: ReportsScreenData }) {
  const { event, can, packages } = data;
  const run = useCommand();
  const dialogs = useDialogs();
  const [editing, setEditing] = useState<BiddingPackage | 'new' | null>(null);
  const totals = biddingTotals(packages);

  const remove = async (p: BiddingPackage) => {
    const ok = await dialogs.confirm({ title: `Xóa gói thầu ${p.code}?`, text: 'Có thể hoàn tác ngay sau khi xóa.', confirmLabel: 'Xóa gói thầu', tone: 'danger' });
    if (ok) await run('reports.deletePackage', { eventId: event.id, id: p.id, version: p.version }, { success: `Đã xóa gói thầu ${p.code}` });
  };

  const exportXlsx = () =>
    downloadXlsx(`GoiThau_${fileNameStem(event.name, 40)}_${fileDateStamp(data.now)}`, [
      xlsxSheet<BiddingPackage>({
        name: 'Gói thầu',
        title: { lines: [`Danh sách gói thầu (số liệu nhập tay): ${event.name}`] },
        columns: [
          { header: 'Mã gói thầu', width: 16, value: (p) => p.code },
          { header: 'Tên gói thầu', width: 48, value: (p) => p.name },
          { header: 'Phòng phụ trách', width: 30, value: (p) => p.department },
          { header: 'Dự toán (đồng)', width: 18, value: (p) => p.budget },
          { header: 'Giá trúng thầu (đồng)', width: 20, value: (p) => p.winningPrice },
          { header: 'Tiết kiệm / vượt dự toán', width: 22, value: (p) => exportedSaving(p) },
          { header: 'Nhà thầu', width: 36, value: (p) => p.contractor ?? 'Chưa chọn' },
          { header: 'Tiến độ hợp đồng', width: 26, value: (p) => p.status },
        ],
        rows: packages,
        footer: { lines: [biddingTotalsSentence(totals)] },
        autoFilter: true,
        freezeHeader: true,
      }),
    ]);

  const columns: Column<BiddingPackage>[] = [
    {
      id: 'code', header: 'Gói thầu', sortValue: (p) => p.code,
      cell: (p) => (
        <div className="min-w-0 space-y-0.5">
          <p className="font-mono text-sm font-semibold text-link">{p.code}</p>
          <p className="text-sm break-words text-ink">{p.name}</p>
          <p className="text-xs text-ink-muted md:hidden">Dự toán {formatVnd(p.budget)} • Trúng {p.winningPrice === null ? 'chưa có' : formatVnd(p.winningPrice)}</p>
        </div>
      ),
    },
    { id: 'dept', header: 'Phòng phụ trách', hideOnMobile: true, cell: (p) => <span className="text-sm text-ink-2">{p.department}</span> },
    { id: 'budget', header: 'Dự toán', align: 'right', hideOnMobile: true, sortValue: (p) => p.budget, cell: (p) => <span className="text-sm tabular-nums text-ink">{formatVnd(p.budget)}</span> },
    { id: 'winning', header: 'Giá trúng thầu', align: 'right', hideOnMobile: true, sortValue: (p) => p.winningPrice ?? -1, cell: (p) => <span className="text-sm tabular-nums text-ink">{p.winningPrice === null ? '' : formatVnd(p.winningPrice)}</span> },
    { id: 'saving', header: 'Tiết kiệm', align: 'center', cell: (p) => <Saving p={p} /> },
    { id: 'contractor', header: 'Nhà thầu', hideOnMobile: true, cell: (p) => (p.contractor ? <span className="text-sm break-words text-ink-2">{p.contractor}</span> : <span className="text-sm italic text-ink-muted">Chưa chọn</span>) },
    { id: 'status', header: 'Tiến độ hợp đồng', hideOnMobile: true, cell: (p) => <StatusBadge registry={BIDDING_STATUS} value={p.status} size="sm" /> },
    ...(can.write
      ? [{
          id: 'action', header: 'Thao tác', align: 'right' as const,
          cell: (p: BiddingPackage) => (
            <RowMenu label={`Thao tác với gói thầu ${p.code}`} items={[
              { id: 'edit', label: 'Sửa gói thầu', icon: 'pencil', onSelect: () => setEditing(p) },
              { id: 'delete', label: 'Xóa gói thầu', icon: 'trash', tone: 'danger', onSelect: () => void remove(p) },
            ]} />
          ),
        }]
      : []),
  ];

  return (
    <SectionCard
      title="Gói thầu và ngân sách sự kiện"
      subtitle="Nhập tay: chưa liên thông với hệ thống Quản lý Đấu thầu"
      icon="file-spreadsheet"
      actions={
        <div className="flex flex-wrap gap-2">
          {packages.length > 0 && <Button variant="secondary" icon="download" onClick={() => void exportXlsx()}>Xuất Excel</Button>}
          {can.write && <Button icon="plus" onClick={() => setEditing('new')}>Thêm gói thầu</Button>}
        </div>
      }
    >
      <div className="space-y-4">
        <DataTable
          rows={packages}
          columns={columns}
          rowKey={(p) => p.id}
          empty={{ icon: 'file-spreadsheet', title: 'Chưa có gói thầu nào', text: can.write ? 'Bấm "Thêm gói thầu" để nhập gói thầu phục vụ sự kiện.' : undefined }}
        />
        {packages.length > 0 && (
          <Alert tone={totals.savingsPercent !== null && totals.savingsPercent < 0 ? 'warning' : 'info'} title="Tổng hợp">
            {biddingTotalsSentence(totals)}
          </Alert>
        )}
      </div>
      {editing && <PackageDialog eventId={event.id} year={Number(data.today.slice(0, 4))} codes={packages.map((p) => p.code)} pkg={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </SectionCard>
  );
}

const DEPT_OPTIONS = BIDDING_DEPARTMENTS.map((d) => ({ value: d, label: d }));
const STATUS_OPTIONS = BIDDING_STATUSES.map((s) => ({ value: s, label: s }));

function PackageDialog({ eventId, year, codes, pkg, onClose }: { eventId: EventId; year: number; codes: ReadonlyArray<string>; pkg: BiddingPackage | null; onClose: () => void }) {
  const run = useCommand();
  const form = useZodForm(packageFields, {
    defaultValues: pkg
      ? { code: pkg.code, name: pkg.name, department: pkg.department, budget: pkg.budget, winningPrice: pkg.winningPrice ?? undefined, contractor: pkg.contractor ?? '', status: pkg.status }
      : { code: nextPackageCode(codes, year), name: '', department: BIDDING_DEPARTMENTS[0], contractor: '', status: 'Đang thẩm định hồ sơ' },
  });
  const submit = async (draft: PackageDraft) => {
    const done = pkg
      ? await run('reports.updatePackage', { eventId, id: pkg.id, version: pkg.version, draft }, { success: `Đã cập nhật gói thầu ${draft.code}` })
      : await run('reports.createPackage', { eventId, id: newId<'BiddingPackage'>(), draft }, { success: `Đã thêm gói thầu ${draft.code}` });
    if (done) onClose();
  };
  return (
    <Dialog open onClose={onClose} icon="file-spreadsheet" size="lg" title={pkg ? `Sửa gói thầu ${pkg.code}` : 'Thêm gói thầu (nhập tay)'} subtitle="Số liệu nhập tay, không đồng bộ từ hệ thống Quản lý Đấu thầu" dirty={form.formState.isDirty}>
      <Form form={form} onSubmit={submit} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Mã gói thầu" name="code" required hint="Không trùng trong sự kiện">
            <TextInput name="code" autoComplete="off" />
          </FormField>
          <FormField label="Phòng phụ trách" name="department" required>
            <Select name="department" options={DEPT_OPTIONS} />
          </FormField>
        </div>
        <FormField label="Tên gói thầu" name="name" required>
          <TextInput name="name" />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Dự toán phê duyệt" name="budget" required suffix="đồng">
            <MoneyInput name="budget" />
          </FormField>
          <FormField label="Giá trúng thầu" name="winningPrice" suffix="đồng" hint="Để trống khi chưa có. Cao hơn dự toán sẽ báo là vượt dự toán.">
            <MoneyInput name="winningPrice" />
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nhà thầu thực hiện" name="contractor">
            <TextInput name="contractor" placeholder="Để trống khi chưa chọn" />
          </FormField>
          <FormField label="Tiến độ hợp đồng" name="status" required>
            <Select name="status" options={STATUS_OPTIONS} />
          </FormField>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" icon="check" loading={form.formState.isSubmitting}>Lưu gói thầu</Button>
        </div>
      </Form>
    </Dialog>
  );
}
