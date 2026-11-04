'use client';

// /admin/backups: manual snapshots, download, and restore (admin + AAL2) with a
// confirm that says what is replaced and what is kept (core B16, B17, B23).

import { Alert, Button, DataTable, RowMenu, SectionCard, StatusBadge, downloadBlob, useDialogs, useToast, type Column, type RowMenuItem } from '@/components/ui';
import { useCommand } from '@/core/commands';
import { formatVNDate, formatVNTime, todayVN } from '@/core/dates';
import type { BackupSummary } from '../contract';
import { BACKUP_KINDS } from '../domain/labels';

const when = (b: BackupSummary) => formatVNTime(b.createdAt, { withDate: true });

export function BackupsScreen({ backups, canRestore }: { backups: ReadonlyArray<BackupSummary>; canRestore: boolean }) {
  const run = useCommand();
  const dialogs = useDialogs();
  const toast = useToast();

  const create = async () => {
    const note = await dialogs.prompt({
      title: 'Tạo bản sao lưu mới',
      label: 'Ghi chú bản sao lưu',
      defaultValue: `Sao lưu thủ công ngày ${formatVNDate(todayVN())}`,
      required: true,
      confirmLabel: 'Tạo bản sao lưu',
    });
    if (note) await run('core.backups.create', { note }, { success: 'Đã tạo bản sao lưu.' });
  };

  const download = async (b: BackupSummary) => {
    const r = await run('core.backups.download', { id: b.id });
    if (!r) return;
    downloadBlob(new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' }), r.fileName);
    toast.success(`Đã tải bản #${b.id} về máy`);
  };

  const restore = async (b: BackupSummary) => {
    const ok = await dialogs.confirm({
      title: `Khôi phục bản #${b.id} (${when(b)})?`,
      text:
        `Toàn bộ sự kiện, tiến độ, khách mời, chỗ ngồi, gian hàng, hiện trường, báo cáo, biểu mẫu, hội trường, tham số và ngày nghỉ sẽ trở về như lúc ${when(b)}. ` +
        'Thay đổi sau thời điểm đó sẽ mất khỏi màn hình. Tài khoản, phân quyền và nhật ký kiểm toán giữ nguyên. ' +
        'Trước khi khôi phục, hệ thống tự tạo một bản sao lưu dữ liệu hiện tại, nên có thể khôi phục ngược lại.',
      confirmLabel: 'Khôi phục',
      tone: 'danger',
    });
    if (ok) await run('core.backups.restore', { id: b.id }, { success: `Đã khôi phục dữ liệu từ bản #${b.id}. Bản dữ liệu trước khi khôi phục nằm đầu danh sách.` });
  };

  const menu = (b: BackupSummary): RowMenuItem[] => [
    { id: 'download', label: 'Tải về (JSON)', icon: 'download', onSelect: () => void download(b) },
    ...(canRestore
      ? [b.format === 2
          ? { id: 'restore', label: 'Khôi phục bản này…', icon: 'undo' as const, tone: 'danger' as const, onSelect: () => void restore(b) }
          : { id: 'restore', label: 'Khôi phục (dùng công cụ chuyển dữ liệu)', icon: 'undo' as const, disabled: true }]
      : []),
  ];

  const columns: Column<BackupSummary>[] = [
    {
      id: 'note', header: 'Bản sao lưu',
      cell: (b) => (
        <div className="min-w-0">
          <p className="font-semibold text-ink">#{b.id} · {b.note}</p>
          <p className="text-xs tabular-nums text-ink-2">{when(b)}</p>
        </div>
      ),
    },
    { id: 'kind', header: 'Loại', hideOnMobile: true, cell: (b) => <StatusBadge registry={BACKUP_KINDS} value={b.kind} /> },
    { id: 'by', header: 'Người tạo', hideOnMobile: true, cell: (b) => b.createdByEmail ?? <span className="text-ink-muted">Hệ thống</span> },
    { id: 'actions', header: 'Thao tác', align: 'right', cell: (b) => <RowMenu label={`Thao tác với bản #${b.id}`} items={menu(b)} /> },
  ];

  return (
    <div className="space-y-4">
      {!canRestore && <Alert tone="info">Bạn tạo và tải được bản sao lưu. Chỉ Quản trị viên đã xác thực hai lớp mới khôi phục được.</Alert>}
      <SectionCard
        title="Sao lưu và phục hồi dữ liệu"
        subtitle="Bản sao lưu chụp toàn bộ dữ liệu nghiệp vụ, tham số và ngày nghỉ. Không gồm tài khoản và nhật ký."
        icon="cloud"
        actions={<Button icon="plus" onClick={() => void create()}>Tạo bản sao lưu</Button>}
      >
        <DataTable
          rows={backups}
          columns={columns}
          rowKey={(b) => String(b.id)}
          empty={{ icon: 'cloud', title: 'Chưa có bản sao lưu nào', text: 'Nên tạo một bản trước mỗi đợt cập nhật dữ liệu sự kiện lớn.' }}
        />
      </SectionCard>
    </div>
  );
}
