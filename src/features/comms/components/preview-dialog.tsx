'use client';

import { Button, Dialog, RichHtml } from '@/components/ui';
import type { SanitizedHtml } from '@/core/brand';
import type { MailMessage } from '../domain/mime';

/** The message exactly as it would leave: the sanitized, merged body through the kit's RichHtml (m4a B03). */
export function PreviewDialog({ message, onClose, onTest, testing }: { message: MailMessage; onClose: () => void; onTest: () => void; testing: boolean }) {
  const to = message.to[0];
  const rows: Array<[string, string]> = [
    ['Người gửi', `${message.from.name} <${message.from.email}>`],
    ['Người nhận', to ? `${to.name} <${to.email}>` : ''],
    ['Tiêu đề', message.subject],
    ['Đính kèm', message.attachments?.length ? message.attachments.map((a) => a.filename).join(', ') : 'Không có file đính kèm'],
  ];
  return (
    <Dialog
      open
      onClose={onClose}
      size="3xl"
      icon="eye"
      title="Xem trước thư gửi đi thực tế"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Đóng xem trước</Button>
          <Button icon="mail" loading={testing} onClick={onTest}>Gửi thử nội dung này đến tôi</Button>
        </>
      }
    >
      <dl className="space-y-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-wrap gap-x-2">
            <dt className="font-semibold text-ink-2">{k}:</dt>
            <dd className="min-w-0 break-words text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 rounded-md border border-line bg-paper p-4 text-paper-ink">
        <RichHtml html={message.html as SanitizedHtml} className="space-y-2 text-sm" />
      </div>
    </Dialog>
  );
}
