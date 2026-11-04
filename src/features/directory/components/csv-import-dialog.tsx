'use client';

import { useMemo, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Alert, Badge, Button, DataTable, Dialog, Form, FormField, KpiCard, Select, Textarea, downloadBlob, useToast, useZodForm, type Column } from '@/components/ui';
import { useCommand } from '@/core/commands';
import type { Tone } from '@/core/vocab';
import { guestIdentityKey } from '@/features/guests';
import type { MasterContact } from '../contract';
import { chunkBySize, sendInChunks } from '../domain/chunks';
import { CONTACT_CSV_COLUMNS, ROW_STATUS_LABEL, previewContactImport, type ImportRow, type RowStatus } from '../domain/csv-import';
import { serializeCsv } from '../domain/csv';
import { GROUP_OPTIONS } from '../domain/groups';
import { GROUP_VALUES } from '../domain/schemas';

const schema = z.object({ csv: z.string(), defaultGroup: z.enum(GROUP_VALUES) });

const STATUS_TONE: Record<RowStatus, Tone> = { new: 'emerald', duplicate_existing: 'amber', duplicate_in_file: 'amber', invalid: 'rose' };
/** A sample the admin can fill in, in the same columns the export writes. */
const TEMPLATE_ROWS: ReadonlyArray<Partial<MasterContact>> = [
  { name: 'Trần Văn Mẫu', group: 'DoanhNghiep', title: 'Giám đốc', organization: 'Công ty Mẫu', phone: '0912.345.678', email: 'mau@example.com' as MasterContact['email'], address: '', taxCode: '', notes: '', hasBanquet: false },
];
const SHOWN_ROWS = 200;

/** Paste CSV, read the preview row by row, then commit what is valid (m4c Q10). Nothing is written before "Nhập". */
export function CsvImportDialog({ contacts, onClose }: { contacts: ReadonlyArray<MasterContact>; onClose: () => void }) {
  const run = useCommand();
  const toast = useToast();
  const form = useZodForm(schema, { defaultValues: { csv: '', defaultGroup: 'DoanhNghiep' } });
  const [csv, defaultGroup] = useWatch({ control: form.control, name: ['csv', 'defaultGroup'] });
  const existingKeys = useMemo(() => new Set(contacts.map(guestIdentityKey)), [contacts]);
  const preview = useMemo(() => (csv.trim() === '' ? null : previewContactImport(csv, { defaultGroup, existingKeys })), [csv, defaultGroup, existingKeys]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // Each chunk is its own command with its own undo. After a refused chunk the list refreshes, so the preview then
  // offers only the rows still missing and "Nhập" picks up where it stopped.
  const commit = async () => {
    if (!preview || preview.counts.created === 0) return;
    const items = preview.rows.flatMap((r) => (r.status === 'new' && r.draft ? [{ id: r.id, draft: r.draft }] : []));
    const total = items.length;
    setProgress({ done: 0, total });
    const done = await sendInChunks(
      chunkBySize(items),
      async (chunk, last) => (await run('directory.importCsv', { items: chunk }, last ? { success: `Đã nhập ${total} đối tượng vào CSDL` } : {})) !== undefined,
      (n) => setProgress({ done: n, total }),
    );
    setProgress(null);
    if (done === total) onClose();
    else if (done > 0) toast.warning(`Đã nhập ${done} / ${total} đối tượng. Phần còn lại chưa được nhập.`);
  };
  const downloadTemplate = () => downloadBlob(serializeCsv(TEMPLATE_ROWS as MasterContact[], CONTACT_CSV_COLUMNS), 'Mau_Nhap_CSDL_KhachMoi.csv');

  const columns: Column<ImportRow>[] = [
    { id: 'line', header: 'Dòng', width: '4.5rem', cell: (r) => r.line },
    {
      id: 'who', header: 'Họ tên và cơ quan',
      cell: (r) => (r.draft ? <div className="min-w-0"><p className="break-words font-semibold text-ink">{r.draft.name}</p><p className="break-words text-xs text-ink-muted">{r.draft.organization}</p></div> : <span className="text-ink-muted">-</span>),
    },
    {
      id: 'result', header: 'Kết quả', width: '16rem',
      cell: (r) => (
        <div className="space-y-1">
          <Badge tone={STATUS_TONE[r.status]}>{ROW_STATUS_LABEL[r.status]}</Badge>
          {r.errors.map((e) => <p key={e} className="break-words text-xs text-danger-ink">{e}</p>)}
        </div>
      ),
    },
  ];

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      icon="upload"
      title="Nhập đối tượng từ CSV"
      subtitle="Dán nội dung tệp CSV, kiểm tra từng dòng rồi mới nhập"
      dirty={csv.trim() !== ''}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button icon="upload" disabled={!preview || preview.counts.created === 0} loading={progress !== null} onClick={() => void commit()}>
            {progress && progress.total > progress.done && progress.done > 0
              ? `Đang nhập ${progress.done} / ${progress.total}`
              : preview && preview.counts.created > 0 ? `Nhập ${preview.counts.created} đối tượng` : 'Nhập đối tượng'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Form form={form} onSubmit={() => undefined} className="space-y-4">
          <Alert tone="info" action={<Button variant="secondary" icon="download" onClick={downloadTemplate}>Tải tệp mẫu</Button>}>
            Dòng đầu là tiêu đề cột, cần có {'"Họ Và Tên" và "Cơ Quan / Doanh Nghiệp"'}. Các cột khác (Nhóm Đối Tượng, Chức Danh, Số Điện Thoại, Email, Địa Chỉ, Mã Số Thuế, Tiệc VIP, Ghi Chú) có thể bỏ. Tệp xuất từ CSDL nhập lại được. Mở tệp bằng Excel hoặc Notepad, chọn tất cả, sao chép rồi dán vào ô dưới.
          </Alert>
          <FormField label="Nội dung CSV" name="csv">
            <Textarea name="csv" rows={6} placeholder={'Họ Và Tên,Cơ Quan / Doanh Nghiệp,Nhóm Đối Tượng\nTrần Văn Mẫu,Công ty Mẫu,Doanh nghiệp'} />
          </FormField>
          <div className="max-w-sm">
            <FormField label="Nhóm khi dòng để trống nhóm" name="defaultGroup" hint="Áp dụng cho dòng không ghi nhóm hoặc tệp không có cột nhóm.">
              <Select name="defaultGroup" options={GROUP_OPTIONS} />
            </FormField>
          </div>
        </Form>

        {preview?.error && <Alert tone="danger" title="Chưa đọc được tệp">{preview.error}</Alert>}
        {preview && !preview.error && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard label="Sẽ thêm mới" value={preview.counts.created} icon="plus" accent="emerald" caption={`trên ${preview.counts.total} dòng`} />
              <KpiCard label="Đã có trong CSDL" value={preview.counts.duplicateExisting} icon="copy" accent="amber" caption="Bỏ qua, không ghi đè" />
              <KpiCard label="Trùng trong tệp" value={preview.counts.duplicateInFile} icon="copy" accent="amber" caption="Chỉ nhập dòng đầu tiên" />
              <KpiCard label="Dòng lỗi" value={preview.counts.invalid} icon="alert-triangle" accent="rose" caption="Không nhập, sửa rồi dán lại" />
            </div>
            {preview.unknownColumns.length > 0 && (
              <Alert tone="warning">Bỏ qua các cột chưa nhận ra: {preview.unknownColumns.join(', ')}.</Alert>
            )}
            <DataTable
              rows={preview.rows.slice(0, SHOWN_ROWS)}
              columns={columns}
              rowKey={(r) => String(r.line)}
              rowTone={(r) => (r.status === 'invalid' ? 'rose' : null)}
              maxHeight="20rem"
              stickyHeader
              empty={{ icon: 'search', title: 'Chưa có dòng nào' }}
            />
            {preview.rows.length > SHOWN_ROWS && <p className="text-xs text-ink-muted">Hiển thị {SHOWN_ROWS} dòng đầu trong {preview.rows.length} dòng. Phần còn lại được xử lý như nhau khi nhập.</p>}
          </div>
        )}
      </div>
    </Dialog>
  );
}
