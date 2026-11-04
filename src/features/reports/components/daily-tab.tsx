'use client';

// "Báo cáo hàng ngày" (m6 §1.3): the T-10 state from the event date and the
// holiday calendar (BUG-03/04), issuing today's report as a frozen snapshot
// (BUG-12), and the history, each row printed or exported from its own
// snapshot (BUG-13/15).

import { Alert, Button, DataTable, Form, FormField, PrintLink, RowMenu, SectionCard, Textarea, TextInput, downloadWordHtml, useAppContext, useDialogs, useSettings, useZodForm, type Column } from '@/components/ui';
import { newId } from '@/core/brand';
import { useCommand } from '@/core/commands';
import { formatVNDate, formatVNTime } from '@/core/dates';
import { orgIdentity } from '@/core/settings';
import { decodeFigures, milestoneLabel } from '../domain/figures';
import { dailyReportDocument, snapshotMilestone, type IssuedReport } from '../domain/report';
import { issueFields, type IssueDraft } from '../domain/schemas';
import type { ReportsScreenData } from '../domain/screen';
import { dailyReportFileName, dailyReportWordBody } from '../domain/word';
import { stateText } from './reports-screen';

export const printHref = (eventId: string, reportId?: string) => `/events/${eventId}/reports/print${reportId ? `?report=${reportId}` : ''}`;

export function useWordExport() {
  const settings = useSettings();
  return (r: IssuedReport) => {
    const doc = dailyReportDocument(r, orgIdentity(settings));
    downloadWordHtml({ fileName: dailyReportFileName(r.eventName, r.reportDate), title: `${doc.title} ${doc.subject}`, body: dailyReportWordBody(doc, orgIdentity(settings)) });
  };
}

function StateAlert({ data }: { data: ReportsScreenData }) {
  const { state, issuedToday } = data;
  const settings = useSettings();
  if (issuedToday) {
    return <Alert tone="success" title={`Đã phát hành báo cáo ngày ${formatVNDate(issuedToday.reportDate)} lúc ${formatVNTime(issuedToday.issuedAt)}`}>Mỗi ngày phát hành một báo cáo. Số liệu của báo cáo đã phát hành được giữ nguyên.</Alert>;
  }
  switch (state.kind) {
    case 'active':
      return (
        <Alert tone="warning" title={`Báo cáo tiến độ hằng ngày: mốc ${milestoneLabel(state)} (${stateText(state)})`}>
          Tổ thư ký sự kiện tổng hợp tiến độ và phát hành báo cáo hằng ngày trước 16h30 để gửi Lãnh đạo Trung tâm và UBND Thành phố.
        </Alert>
      );
    case 'not_yet':
      return <Alert tone="info" title="Chưa đến mốc báo cáo hằng ngày">{`${stateText(state)} đến ngày khai mạc. Báo cáo hằng ngày bắt đầu từ ${settings.dailyReportThresholdDays} ngày làm việc trước sự kiện.`}</Alert>;
    case 'event_day':
      return <Alert tone="info" title="Hôm nay khai mạc sự kiện">Báo cáo nhanh kết quả tổ chức gửi theo mẫu ở mục Báo cáo UBND TP và Sở Tài chính.</Alert>;
    case 'past':
      return <Alert tone="info" title={`Sự kiện đã diễn ra (${stateText(state)})`}>Báo cáo nhanh và báo cáo tổng kết gửi theo mẫu ở mục Báo cáo UBND TP và Sở Tài chính.</Alert>;
  }
}

function IssueForm({ data }: { data: ReportsScreenData }) {
  const run = useCommand();
  const dialogs = useDialogs();
  const { profile } = useAppContext();
  const form = useZodForm(issueFields, {
    defaultValues: { keyHighlight: '', blockers: '', signatory: profile.role === 'dept_leader' ? profile.fullname : '', documentNumber: '' },
  });
  const submit = async (draft: IssueDraft) => {
    const ok = await dialogs.confirm({
      title: `Phát hành báo cáo ngày ${formatVNDate(data.today)}?`,
      text: 'Số liệu được chốt tại thời điểm phát hành và không sửa được sau đó. Mỗi ngày chỉ phát hành một báo cáo.',
      confirmLabel: 'Phát hành',
    });
    if (!ok) return;
    const done = await run('reports.issueDailyReport', { eventId: data.event.id, id: newId<'DailyReport'>(), draft }, { success: `Đã phát hành báo cáo ngày ${formatVNDate(data.today)}` });
    if (done) form.reset();
  };
  return (
    <Form form={form} onSubmit={submit} className="grid gap-4">
      <FormField label="Tình hình triển khai nổi bật trong ngày" name="keyHighlight" required hint="Số liệu tiến độ, khách mời, gian hàng và gói thầu do hệ thống tự tổng hợp, không cần nhập lại.">
        <Textarea name="keyHighlight" rows={4} placeholder="Ví dụ: Đã thống nhất kịch bản chương trình với Ban Tổ chức." />
      </FormField>
      <FormField label="Khó khăn, vướng mắc và kiến nghị" name="blockers">
        <Textarea name="blockers" rows={3} placeholder="Để trống nếu không có" />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={`Người ký (${data.signatoryTitle.toLowerCase()})`} name="signatory" required>
          <TextInput name="signatory" placeholder="Họ và tên" autoComplete="name" />
        </FormField>
        <FormField label="Số văn bản" name="documentNumber" hint="Ví dụ: 12/BC-SCE. Để trống để in chỗ trống.">
          <TextInput name="documentNumber" />
        </FormField>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <PrintLink href={printHref(data.event.id)} label="Xem bản in trước" />
        <Button type="submit" icon="file-signature" loading={form.formState.isSubmitting}>Phát hành báo cáo</Button>
      </div>
    </Form>
  );
}

export function DailyTab({ data }: { data: ReportsScreenData }) {
  const toWord = useWordExport();
  const { issuedToday, can, figures } = data;

  const columns: Column<IssuedReport>[] = [
    {
      id: 'date', header: 'Ngày phát hành', sortValue: (r) => r.reportDate,
      cell: (r) => (
        <div className="min-w-0 space-y-0.5">
          <p className="font-semibold text-ink">{formatVNDate(r.reportDate)} <span className="text-ink-muted">({snapshotMilestone(r)})</span></p>
          <p className="text-xs text-ink-muted">Lúc {formatVNTime(r.issuedAt)} • Tiến độ {r.progressPercent}%</p>
          <p className="text-sm break-words text-ink-2 md:hidden">{r.keyHighlight}</p>
        </div>
      ),
    },
    { id: 'progress', header: 'Tiến độ chung', align: 'center', hideOnMobile: true, sortValue: (r) => r.progressPercent, cell: (r) => <span className="font-semibold text-link tabular-nums">{r.progressPercent}%</span> },
    {
      id: 'text', header: 'Tình hình nổi bật / kiến nghị', hideOnMobile: true,
      cell: (r) => (
        <div className="min-w-0 space-y-1">
          <p className="text-sm break-words text-ink">{r.keyHighlight}</p>
          {r.blockers && <p className="text-sm break-words text-danger-ink">{r.blockers}</p>}
        </div>
      ),
    },
    {
      id: 'guests', header: 'Thư mời', hideOnMobile: true, align: 'center',
      cell: (r) => {
        const f = decodeFigures(r.figures);
        return <span className="text-sm tabular-nums text-ink-2">{f.guestsInvited}/{f.guestQuota}</span>;
      },
    },
    { id: 'signer', header: 'Người ký', hideOnMobile: true, cell: (r) => <span className="text-sm break-words text-ink-2">{r.signatory}</span> },
    {
      id: 'action', header: 'Thao tác', align: 'right',
      cell: (r) => (
        <RowMenu label={`Thao tác với báo cáo ngày ${formatVNDate(r.reportDate)}`} items={[
          { id: 'print', label: 'Xem bản in A4', icon: 'printer', href: printHref(data.event.id, r.id) },
          { id: 'word', label: 'Tải Word (.doc)', icon: 'download', onSelect: () => toWord(r) },
        ]} />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <StateAlert data={data} />
      <SectionCard title={`Báo cáo ngày ${formatVNDate(data.today)}`} subtitle="Theo thể thức Nghị định số 30/2020/NĐ-CP, gửi Lãnh đạo Trung tâm và UBND Thành phố" icon="file-signature">
        {issuedToday ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto text-sm text-ink-2">Người ký: <span className="font-semibold text-ink">{issuedToday.signatory}</span> • Tiến độ {issuedToday.progressPercent}%</p>
            <PrintLink href={printHref(data.event.id, issuedToday.id)} label="Xem bản in A4" />
            <Button variant="secondary" icon="download" onClick={() => toWord(issuedToday)}>Tải Word (.doc)</Button>
          </div>
        ) : figures === null ? (
          <Alert tone="warning" title="Chưa phát hành được báo cáo">Chưa đọc được số liệu của phân hệ {data.missing.join(', ')}.</Alert>
        ) : can.issue ? (
          <IssueForm data={data} />
        ) : (
          <div className="space-y-3">
            <Alert tone="info" title="Chỉ Trưởng phòng trở lên phát hành báo cáo">Bạn có thể xem bản in trước với số liệu hiện tại.</Alert>
            <PrintLink href={printHref(data.event.id)} label="Xem bản in trước" />
          </div>
        )}
      </SectionCard>
      <SectionCard title="Lịch sử báo cáo hằng ngày đã phát hành" icon="clock">
        <DataTable
          rows={data.reports}
          columns={columns}
          rowKey={(r) => r.id}
          empty={{ icon: 'file-text', title: 'Chưa phát hành báo cáo hằng ngày nào', text: 'Báo cáo phát hành sẽ được lưu tại đây cùng số liệu tại thời điểm phát hành.' }}
        />
      </SectionCard>
    </div>
  );
}
