'use client';

// "Google Form" (m4c §1.12): status and "Đồng bộ ngay", configuration, column
// mapping, the responses waiting for a person, and every response. Answers
// come from the public and render only as React text (m4a B01, m4c B1).

import { useMemo, useState } from 'react';
import { z } from 'zod';
import {
  Alert, Badge, Button, DataTable, Dialog, FilterBar, Form, FormField, KpiCard, RowMenu, SectionCard, Select, downloadXlsx, useDialogs, useToast, useZodForm, xlsxSheet,
  type Column, type RowMenuItem,
} from '@/components/ui';
import type { GuestId } from '@/core/brand';
import { useCommand } from '@/core/commands';
import { fileDateStamp, formatVNTime } from '@/core/dates';
import { fileNameStem, matchesQuery } from '@/core/text';
import { RSVP, type Tone } from '@/core/vocab';
import { awaitsDecision, needsReview, type FormScreenData, type ResponseView } from '../domain/screen';
import { AnswerLabelsCard, ColumnMapCard, FormConfigCard } from './form-config';

const APPLY: Record<ResponseView['applyStatus'], { label: string; tone: Tone }> = {
  pending: { label: 'Chờ xử lý', tone: 'amber' },
  applied: { label: 'Đã cập nhật khách mời', tone: 'emerald' },
  stale: { label: 'Bỏ qua: cũ hơn thay đổi gần nhất', tone: 'slate' },
  no_answer: { label: 'Không có câu trả lời', tone: 'slate' },
  review: { label: 'Cần xem lại câu trả lời', tone: 'amber' },
  no_time: { label: 'Không đọc được thời gian', tone: 'amber' },
  dismissed: { label: 'Đã bỏ qua', tone: 'slate' },
};
const MATCH: Record<ResponseView['match'], string> = {
  email: 'Email', phone: 'SĐT', name: 'Họ tên và cơ quan', created: 'Khách đăng ký mới (đã nạp)', manual: 'Ghép thủ công', ambiguous: 'Trùng tên hoặc SĐT, cần xác nhận', none: 'Chưa khớp',
};

const rsvpLabel = (r: ResponseView) => (r.rsvp ? RSVP[r.rsvp].short : 'Chưa rõ');
const banquetLabel = (r: ResponseView) => (r.hasBanquet === null ? '' : r.hasBanquet ? 'Có' : 'Không');
const matchLabel = (r: ResponseView) => (r.matchedGuest ? `${r.matchedGuest.name} (${MATCH[r.match]})` : MATCH[r.match]);

function MatchDialog({ data, response, onClose }: { data: FormScreenData; response: ResponseView; onClose: () => void }) {
  const run = useCommand();
  const pool = response.candidates.length > 0 ? response.candidates : data.guests;
  const f = useZodForm(z.object({ guestId: z.string().min(1, 'Chọn khách mời') }), { defaultValues: { guestId: pool[0]?.id ?? '' } });
  const submit = async ({ guestId }: { guestId: string }) => {
    const done = await run('comms.resolveResponse', { eventId: data.event.id, id: response.id, version: response.version, action: { kind: 'match', guestId: guestId as GuestId } }, { success: 'Đã ghép phản hồi với khách mời' });
    if (done) onClose();
  };
  return (
    <Dialog open onClose={onClose} title="Ghép phản hồi với khách mời" subtitle={`${response.name || response.email || response.phone}${response.organization ? ` - ${response.organization}` : ''}`} icon="users">
      <Form form={f} onSubmit={submit} className="space-y-4">
        <FormField label={response.candidates.length > 0 ? 'Khách mời có thể trùng' : 'Khách mời'} name="guestId" required hint="Câu trả lời chỉ được áp dụng nếu mới hơn thay đổi RSVP gần nhất của khách.">
          <Select name="guestId" options={pool.map((g) => ({ value: g.id, label: `${g.name}${g.organization ? ` - ${g.organization}` : ''}` }))} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" icon="check">Ghép và áp dụng</Button>
        </div>
      </Form>
    </Dialog>
  );
}

/**
 * Answers the reader would not apply ("Tham dự ko đc", "Không tham dự buổi chiều"): each with the answer as typed, the
 * guest it matched and a person's decision, applied at the response's own time.
 */
function AnswersToDecide({ data, rows }: { data: FormScreenData; rows: ReadonlyArray<ResponseView> }) {
  const run = useCommand();
  const dialogs = useDialogs();
  const decide = async (r: ResponseView, status: 'confirmed' | 'declined') => {
    const guest = r.matchedGuest?.name ?? r.name;
    if (status === 'declined') {
      const ok = await dialogs.confirm({
        title: `Ghi nhận ${guest} từ chối tham dự?`,
        text: 'Khách mời chuyển sang Từ chối và ghế đã xếp (nếu có) được giải phóng. Chỉ áp dụng nếu câu trả lời mới hơn thay đổi RSVP gần nhất của khách.',
        confirmLabel: 'Ghi nhận từ chối',
        tone: 'danger',
      });
      if (!ok) return;
    }
    await run('comms.resolveResponse', { eventId: data.event.id, id: r.id, version: r.version, action: { kind: 'answer', status } }, { success: status === 'confirmed' ? 'Đã ghi nhận xác nhận tham dự' : 'Đã ghi nhận từ chối tham dự' });
  };
  const dismiss = (r: ResponseView) => void run('comms.resolveResponse', { eventId: data.event.id, id: r.id, version: r.version, action: { kind: 'dismiss' } }, { success: 'Đã bỏ qua phản hồi' });
  return (
    <SectionCard title="Câu trả lời cần xem lại" subtitle="Câu trả lời không trùng khớp một lựa chọn của Form nên chưa cập nhật khách mời. Hãy đọc và quyết định." icon="alert-triangle">
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="min-w-0 space-y-2 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="min-w-0 font-semibold text-ink break-words">{r.matchedGuest?.name ?? r.name}</p>
              <p className="text-xs text-ink-muted">{formatVNTime(r.respondedAt, { withDate: true })}</p>
            </div>
            <p className="text-xs text-ink-2 break-words">Người trả lời: {[r.name, r.organization, r.email].filter(Boolean).join(' · ')}</p>
            <p className="rounded bg-surface-2 px-3 py-2 text-sm text-ink whitespace-pre-wrap break-words"><bdi>{r.rsvpAnswer}</bdi></p>
            {data.canManage && (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon="circle-check" onClick={() => void decide(r, 'confirmed')}>Xác nhận tham dự</Button>
                <Button variant="secondary" icon="circle-x" onClick={() => void decide(r, 'declined')}>Từ chối</Button>
                <Button variant="ghost" icon="x" onClick={() => dismiss(r)}>Bỏ qua</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

export function FormPage({ data }: { data: FormScreenData }) {
  const run = useCommand();
  const toast = useToast();
  const [syncing, setSyncing] = useState(false);
  const [matching, setMatching] = useState<ResponseView | null>(null);
  const [q, setQ] = useState('');
  const review = useMemo(() => data.responses.filter(needsReview), [data.responses]);
  const toDecide = useMemo(() => data.responses.filter(awaitsDecision), [data.responses]);
  const shown = data.responses.filter((r) => matchesQuery(q, r.name, r.email, r.organization, r.phone));
  const form = data.form;

  const syncNow = async () => {
    setSyncing(true);
    const r = await run('comms.syncForm', { eventId: data.event.id });
    setSyncing(false);
    if (!r) return;
    if (r.status === 'error') return toast.error(r.message);
    const done = `Đồng bộ xong: ${r.fresh} phản hồi mới, cập nhật ${r.applied} khách mời, thêm ${r.created} khách mới, ${r.review} chờ xem lại.`;
    if (r.dateOrderUnclear) return toast.warning(`${done} Không xác định được ngày/tháng trong cột thời gian của Sheet (ngày trước hay tháng trước), nên các phản hồi được giữ lại để xem lại.`);
    toast.success(done);
  };

  const resolve = (r: ResponseView, kind: 'create' | 'dismiss' | 'reopen', success: string) =>
    void run('comms.resolveResponse', { eventId: data.event.id, id: r.id, version: r.version, action: { kind } }, { success });

  const menu = (r: ResponseView): RowMenuItem[] =>
    data.canManage
      ? r.applyStatus === 'dismissed'
        ? [{ id: 'reopen', label: 'Mở lại', icon: 'undo', onSelect: () => resolve(r, 'reopen', 'Đã mở lại phản hồi') }]
        : r.applyStatus === 'applied'
          ? []
          : [
              { id: 'match', label: 'Ghép với khách mời…', icon: 'users', onSelect: () => setMatching(r) },
              { id: 'create', label: 'Thêm làm khách mời mới', icon: 'plus', disabled: !r.name, onSelect: () => resolve(r, 'create', 'Đã thêm khách mời mới từ phản hồi') },
              { id: 'dismiss', label: 'Bỏ qua phản hồi này', icon: 'x', onSelect: () => resolve(r, 'dismiss', 'Đã bỏ qua phản hồi') },
            ]
      : [];

  const columns: ReadonlyArray<Column<ResponseView>> = [
    {
      id: 'who',
      header: 'Họ và tên',
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-semibold text-ink">{r.name || '(không có tên)'}</p>
          <p className="text-xs text-ink-muted">{r.organization}</p>
          <p className="text-xs text-ink-2">{[r.email, r.phone].filter(Boolean).join(' · ')}</p>
          <p className="mt-1 md:hidden"><Badge tone={APPLY[r.applyStatus].tone}>{APPLY[r.applyStatus].label}</Badge></p>
        </div>
      ),
      sortValue: (r) => r.name,
    },
    { id: 'at', header: 'Thời gian', cell: (r) => formatVNTime(r.respondedAt, { withDate: true }), sortValue: (r) => r.respondedAt, hideOnMobile: true, width: '9rem' },
    { id: 'rsvp', header: 'Xác nhận RSVP', cell: (r) => <Badge tone={r.rsvp ? RSVP[r.rsvp].tone : 'slate'}>{rsvpLabel(r)}</Badge>, width: '8rem' },
    { id: 'banquet', header: 'Ăn tiệc', cell: banquetLabel, hideOnMobile: true, width: '5rem' },
    {
      id: 'match',
      header: 'Khớp khách mời',
      cell: (r) => (
        <div className="space-y-1">
          <p className="text-sm text-ink-2">{matchLabel(r)}</p>
          <Badge tone={APPLY[r.applyStatus].tone}>{APPLY[r.applyStatus].label}</Badge>
        </div>
      ),
      hideOnMobile: true,
    },
    { id: 'menu', header: '', width: '3.5rem', align: 'right', cell: (r) => (menu(r).length ? <RowMenu label={`Thao tác với phản hồi của ${r.name || r.email || 'khách'}`} items={menu(r)} /> : null) },
  ];

  const exportXlsx = () =>
    downloadXlsx(`Phan_hoi_Google_Form_${fileNameStem(data.event.name)}_${fileDateStamp()}.xlsx`, [
      xlsxSheet({
        name: 'Phản hồi',
        title: { lines: [`Phản hồi Google Form: ${data.event.name}`] },
        rows: data.responses,
        autoFilter: true,
        freezeHeader: true,
        columns: [
          { header: 'Thời gian', width: 20, value: (r) => formatVNTime(r.respondedAt, { withDate: true }) },
          { header: 'Họ và tên', width: 28, value: (r) => r.name },
          { header: 'Cơ quan / Đơn vị', width: 30, value: (r) => r.organization },
          { header: 'Chức vụ', width: 20, value: (r) => r.title },
          { header: 'Email', width: 28, value: (r) => r.email ?? '' },
          { header: 'Số điện thoại', width: 16, value: (r) => r.phone },
          { header: 'Xác nhận RSVP', width: 16, value: rsvpLabel },
          { header: 'Ăn tiệc', width: 10, value: banquetLabel },
          { header: 'Người đi thay', width: 24, value: (r) => r.substitute },
          { header: 'Ghi chú', width: 30, value: (r) => r.notes },
          { header: 'Khớp khách mời', width: 30, value: matchLabel },
          { header: 'Xử lý', width: 28, value: (r) => APPLY[r.applyStatus].label },
        ],
      }),
    ]);

  const status = !form ? { tone: 'slate' as Tone, label: 'Chưa thiết lập liên kết' } : form.sheetCsvUrl ? { tone: 'emerald' as Tone, label: 'Đã kết nối Sheet phản hồi' } : { tone: 'amber' as Tone, label: 'Chỉ có link Form (chưa gắn Sheet)' };
  const attending = data.responses.filter((r) => r.rsvp === 'confirmed' || r.rsvp === 'substituted').length;

  return (
    <div className="space-y-4">
      <SectionCard
        title="Google Form RSVP & đồng bộ phản hồi"
        subtitle="Mời và thu thập xác nhận tham dự qua Google Form; chỉ câu trả lời rõ ràng và mới hơn mới cập nhật khách mời"
        icon="refresh"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {data.canManage && <Button icon="refresh" loading={syncing} disabled={!form?.sheetCsvUrl} onClick={() => void syncNow()}>Đồng bộ ngay</Button>}
          <span className="flex items-center gap-2">Trạng thái: <Badge tone={status.tone}>{status.label}</Badge></span>
          <span className="text-ink-2">{form?.lastSyncAt ? `Lần đồng bộ cuối: ${formatVNTime(form.lastSyncAt, { withDate: true })}` : 'Lần đồng bộ cuối: Chưa đồng bộ'}</span>
          {form?.autoSync && (data.serverSync ? <Badge tone="blue" icon="clock">Tự động mỗi 5 phút</Badge> : <Badge tone="slate" icon="clock">Tự động: chưa hoạt động</Badge>)}
        </div>
        {form?.lastSyncError && (
          <div className="mt-3">
            <Alert tone="danger" title={`Không thể kết nối Google Sheet${form.lastAttemptAt ? ` (${formatVNTime(form.lastAttemptAt, { withDate: true })})` : ''}`}>{form.lastSyncError}</Alert>
          </div>
        )}
      </SectionCard>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Tổng số phản hồi" value={data.responses.length} icon="list-check" accent="indigo" highlight />
        <KpiCard label="Xác nhận tham dự" value={attending} icon="circle-check" accent="emerald" />
        <KpiCard label="Báo vắng / Từ chối" value={data.responses.filter((r) => r.rsvp === 'declined').length} icon="circle-x" accent="rose" />
        <KpiCard label="Đăng ký ăn tiệc" value={data.responses.filter((r) => r.hasBanquet === true).length} icon="star" accent="amber" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <FormConfigCard key={form?.version ?? 0} eventId={data.event.id} form={form} canManage={data.canManage} serverSync={data.serverSync} />
        {form && form.sheetHeaders.length > 0 && <ColumnMapCard key={`map-${form.version}`} eventId={data.event.id} form={form} canManage={data.canManage} />}
      </div>
      {toDecide.length > 0 && <AnswersToDecide data={data} rows={toDecide} />}
      {form && <AnswerLabelsCard key={`labels-${form.version}-${toDecide.length}`} eventId={data.event.id} form={form} waiting={toDecide} canManage={data.canManage} />}
      {review.length > 0 && (
        <SectionCard title="Phản hồi cần xem lại" subtitle="Không khớp được khách mời nào, khớp nhiều khách, hoặc không đọc được thời gian" icon="alert-triangle">
          <DataTable rows={review} columns={columns} rowKey={(r) => r.id} empty={{ icon: 'check', title: 'Không có phản hồi chờ xem lại' }} />
        </SectionCard>
      )}
      <SectionCard
        title={`Danh sách phản hồi từ Form (${data.responses.length})`}
        icon="list-check"
      >
        <div className="space-y-3">
          <FilterBar
            search={{ value: q, onChange: setQ, placeholder: 'Tìm theo tên, email, cơ quan...' }}
            trailing={data.responses.length > 0 ? <Button variant="secondary" icon="file-spreadsheet" onClick={() => void exportXlsx()}>Xuất Excel</Button> : undefined}
          />
          <DataTable
            rows={shown}
            columns={columns}
            rowKey={(r) => r.id}
            empty={{ icon: 'list-check', title: 'Chưa có dữ liệu phản hồi nào', text: form?.sheetCsvUrl ? 'Hãy bấm "Đồng bộ ngay" để đọc Sheet phản hồi.' : 'Hãy dán link Google Sheet phản hồi ở mục cấu hình rồi đồng bộ.' }}
          />
        </div>
      </SectionCard>
      {matching && <MatchDialog data={data} response={matching} onClose={() => setMatching(null)} />}
    </div>
  );
}
