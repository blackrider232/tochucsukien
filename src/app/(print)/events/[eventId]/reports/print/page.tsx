import { notFound } from 'next/navigation';
import { Alert } from '@/components/ui';
import { requestContext } from '@/core/auth/server';
import { parseUuid } from '@/core/brand';
import { PrintDailyReport } from '@/features/reports';
import { printableReport } from '@/features/reports/server';
import { readEvent } from '@/features/progress/server';

// /events/<id>/reports/print?report=<reportId> prints that issued snapshot; without it, today's figures as a preview.
export default async function DailyReportPrintPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ report?: string }> }) {
  const id = parseUuid<'Event'>((await params).eventId);
  const { report: rawReport } = await searchParams;
  const reportId = rawReport === undefined ? null : parseUuid<'DailyReport'>(rawReport);
  if (rawReport !== undefined && reportId === null) notFound();
  const ctx = await requestContext();
  const event = id ? await readEvent(ctx, id) : null;
  if (!event) notFound();
  const printable = await printableReport(ctx, event, reportId);
  if (!printable) notFound();
  if ('missing' in printable) {
    return <Alert tone="warning" title="Chưa in được báo cáo">Chưa đọc được số liệu của phân hệ {printable.missing.join(', ')}.</Alert>;
  }
  return <PrintDailyReport report={printable.report} preview={printable.preview} />;
}
