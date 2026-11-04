'use client';

// "Nhật ký gửi": one row per recipient per campaign, as Gmail answered. Rows
// imported from the old app say so: its sandbox marked unsent mail as sent.
// "Đang gửi" is a claim with no answer yet: a run in progress, or one that
// stopped with that message in flight, whose outcome only Gmail's Sent folder tells.

import { useState } from 'react';
import { Badge, Button, DataTable, FilterBar, KpiCard, LinkTabs, SectionCard, type Column } from '@/components/ui';
import { formatVNTime } from '@/core/dates';
import { matchesQuery } from '@/core/text';
import type { DeliveryLogData, DeliveryLogRow } from '../domain/screen';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'sent', label: 'Đã gửi' },
  { value: 'error', label: 'Lỗi gửi' },
  { value: 'queued', label: 'Đang gửi' },
];

function StatusCell({ row }: { row: DeliveryLogRow }) {
  if (row.status === 'sent') return <Badge tone={row.imported ? 'slate' : 'emerald'} icon="circle-check">{row.imported ? 'Đã gửi (phần mềm cũ)' : 'Đã gửi'}</Badge>;
  if (row.status === 'queued') return <Badge tone="amber" icon="clock">Đang gửi</Badge>;
  return <Badge tone="rose" icon="circle-x">Lỗi gửi</Badge>;
}

export function DeliveryLog({ data }: { data: DeliveryLogData }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [campaign, setCampaign] = useState('all');
  const rows = data.rows.filter((r) => (status === 'all' || r.status === status) && (campaign === 'all' || r.campaignId === campaign) && matchesQuery(q, r.recipientName, r.email, r.subject, r.error));
  const failedCampaign = campaign !== 'all' && data.rows.some((r) => r.campaignId === campaign && r.status === 'error') ? campaign : null;
  const sent = data.rows.filter((r) => r.status === 'sent').length;
  const failed = data.rows.filter((r) => r.status === 'error').length;

  const columns: ReadonlyArray<Column<DeliveryLogRow>> = [
    {
      id: 'recipient',
      header: 'Người nhận',
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-semibold text-ink">{r.recipientName || r.email}</p>
          <p className="text-xs text-ink-2">{r.email}</p>
        </div>
      ),
      sortValue: (r) => r.recipientName || r.email,
    },
    { id: 'status', header: 'Trạng thái', cell: (r) => <StatusCell row={r} />, width: '12rem' },
    { id: 'at', header: 'Thời gian', cell: (r) => formatVNTime(r.sentAt ?? r.updatedAt, { withDate: true }), sortValue: (r) => r.sentAt ?? r.updatedAt, hideOnMobile: true, width: '10rem' },
    { id: 'subject', header: 'Tiêu đề', cell: (r) => <span className="text-sm text-ink-2">{r.subject}</span>, hideOnMobile: true },
    { id: 'error', header: 'Lỗi', cell: (r) => (r.error ? <span className="text-sm text-danger-ink">{r.error}</span> : null), hideOnMobile: true },
  ];

  return (
    <div className="space-y-4">
      <LinkTabs
        label="Thư mời"
        variant="underline"
        activeId="log"
        items={[
          { id: 'compose', label: 'Soạn và gửi', href: `/events/${data.event.id}/invitations`, icon: 'mail' },
          { id: 'log', label: 'Nhật ký gửi', href: `/events/${data.event.id}/invitations/log`, icon: 'list-check' },
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Lượt gửi đã ghi" value={data.rows.length} icon="mail" accent="blue" />
        <KpiCard label="Gửi thành công" value={sent} icon="circle-check" accent="emerald" highlight />
        <KpiCard label="Lỗi gửi" value={failed} icon="circle-x" accent="rose" />
      </div>
      <SectionCard
        title="Nhật ký gửi thư"
        subtitle="Mỗi dòng là kết quả Gmail trả về cho một người nhận. Dòng Đang gửi chưa có kết quả: nếu không còn ai đang gửi, hãy kiểm tra mục Đã gửi của Gmail"
        icon="list-check"
      >
        <div className="space-y-3">
          <FilterBar
            trailing={
              failedCampaign && data.canSend ? (
                <Button icon="refresh" href={`/events/${data.event.id}/invitations?retry=${failedCampaign}`}>Gửi lại thư lỗi</Button>
              ) : undefined
            }
            search={{ value: q, onChange: setQ, placeholder: 'Tìm theo người nhận, email, tiêu đề, lỗi...' }}
            filters={[
              { id: 'status', label: 'Trạng thái', value: status, options: STATUS_OPTIONS, onChange: setStatus },
              { id: 'campaign', label: 'Đợt gửi', value: campaign, options: [{ value: 'all', label: 'Tất cả đợt gửi' }, ...data.campaigns.map((c) => ({ value: c.id as string, label: c.label || 'Không có tiêu đề' }))], onChange: setCampaign },
            ]}
          />
          {campaign === 'all' && failed > 0 && <p className="text-sm text-ink-muted">Chọn một đợt gửi để gửi lại các thư lỗi của đợt đó.</p>}
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            rowTone={(r) => (r.status === 'error' ? 'rose' : null)}
            empty={{ icon: 'mail', title: 'Chưa có thư nào được gửi', text: 'Kết quả gửi sẽ hiện ở đây sau khi Gmail xác nhận từng thư.' }}
          />
        </div>
      </SectionCard>
    </div>
  );
}
