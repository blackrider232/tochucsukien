'use client';

// "Quét mã QR check-in": a real camera scanner where the browser has
// BarcodeDetector, and always a typed field that a USB or Bluetooth scanner
// (keyboard wedge: code then Enter) fills. Never a fake viewfinder (m5 BUG-10).
// The dialog stays open between scans so a queue moves quickly.

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Alert, Button, CodeScanner, Dialog, Form, FormField, TextInput, useZodForm } from '@/components/ui';
import { useDesk, type CheckInDone, type ScanDone } from './desk-actions';

const codeForm = z.object({ code: z.string().trim().min(1, 'Nhập hoặc quét mã') });

type Line = { tone: 'success' | 'warning' | 'danger' | 'info'; text: string };

const CHECK_IN: Record<CheckInDone, (name: string) => Line> = {
  checked_in: (name) => ({ tone: 'success', text: `Đã check-in: ${name}` }),
  already: (name) => ({ tone: 'warning', text: `${name} đã check-in từ trước` }),
  skipped_by_staff: (name) => ({ tone: 'info', text: `Không check-in: ${name} (đại biểu đã báo vắng)` }),
  failed: (name) => ({ tone: 'danger', text: `Chưa check-in được: ${name}. Xem thông báo lỗi rồi thử lại.` }),
};

function describe({ outcome, checkIn }: ScanDone): Line {
  switch (outcome.kind) {
    case 'ok':
      return CHECK_IN[checkIn ?? 'failed'](outcome.guest.name);
    case 'already':
      return CHECK_IN.already(outcome.guest.name);
    case 'ambiguous':
      return { tone: 'info', text: `${outcome.candidates.length} đại biểu khớp mã; chọn đúng người` };
    case 'other_event':
      return { tone: 'danger', text: `Mã thuộc sự kiện khác${outcome.eventName ? ` (${outcome.eventName})` : ''}` };
    case 'not_found':
      return { tone: 'danger', text: 'Không tìm thấy đại biểu khớp mã' };
  }
}

export function ScanDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const desk = useDesk();
  const form = useZodForm(codeForm, { defaultValues: { code: '' } });
  const [last, setLast] = useState<Line | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  const busy = useRef(false);

  // This component outlives the dialog, so what the last opening said would greet the next guest at the desk.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setLast(null);
  }

  const handle = useCallback(async (raw: string) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const done = await desk.scan(raw);
      setLast(done ? describe(done) : null);
    } finally {
      busy.current = false;
    }
  }, [desk]);

  const submit = async ({ code }: { code: string }) => {
    form.reset({ code: '' });
    await handle(code);
    form.setFocus('code');
  };

  useEffect(() => {
    if (open) setTimeout(() => form.setFocus('code'), 50);
  }, [open, form]);

  return (
    <Dialog open={open} onClose={onClose} size="lg" icon="qr-code" title="Quét mã QR check-in" subtitle="Bàn lễ tân đón tiếp đại biểu">
      <div className="space-y-4">
        <CodeScanner onCode={(raw) => void handle(raw)} fallback="Dùng máy quét USB/Bluetooth hoặc nhập mã bên dưới." />
        <Form form={form} onSubmit={submit} className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 basis-56">
            <FormField label="Hoặc nhập / quét mã bằng máy quét" name="code" hint="Máy quét USB hoặc Bluetooth gõ mã rồi Enter vào ô này. Nhận mã QR, mã 6 ký tự in trên thẻ hoặc số điện thoại.">
              <TextInput name="code" placeholder="Ví dụ: SCE-CHK:... hoặc K7Q2ZX" autoComplete="off" />
            </FormField>
          </div>
          <Button type="submit" icon="check" loading={form.formState.isSubmitting}>Check-in</Button>
        </Form>
        <div role="status" aria-live="polite">
          {last && <Alert tone={last.tone}>{last.text}</Alert>}
        </div>
      </div>
    </Dialog>
  );
}
