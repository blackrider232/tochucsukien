'use client';

// "Quét mã QR check-in": a real camera scanner where the browser has
// BarcodeDetector, and always a typed field that a USB or Bluetooth scanner
// (keyboard wedge: code then Enter) fills. Never a fake viewfinder (m5 BUG-10).
// The dialog stays open between scans so a queue moves quickly.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { z } from 'zod';
import { Alert, Button, Dialog, Form, FormField, TextInput, useZodForm } from '@/components/ui';
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
        <CameraScanner onCode={(raw) => void handle(raw)} />
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

type Detector = { detect(source: HTMLVideoElement): Promise<ReadonlyArray<{ rawValue: string }>> };
type DetectorCtor = (new (o?: { formats: string[] }) => Detector) & { getSupportedFormats?: () => Promise<string[]> };
type CameraState = 'idle' | 'starting' | 'scanning' | 'denied' | 'no_camera' | 'unsupported' | 'insecure' | 'error';

const WANTED = ['qr_code', 'code_128', 'code_39', 'ean_13'];
const REPEAT_MS = 2500;

function detectorCtor(): DetectorCtor | null {
  return typeof window === 'undefined' ? null : ((window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector ?? null);
}

/** What rules the camera out before anyone asks for it, so the dialog says so on opening. */
function cameraBlocked(): 'insecure' | 'unsupported' | null {
  if (!window.isSecureContext) return 'insecure';
  if (!detectorCtor() || !navigator.mediaDevices?.getUserMedia) return 'unsupported';
  return null;
}
const noSubscription = () => () => undefined;

const MESSAGES: Partial<Record<CameraState, { tone: 'info' | 'warning' | 'danger'; text: string }>> = {
  unsupported: { tone: 'info', text: 'Trình duyệt này chưa hỗ trợ quét mã bằng camera. Dùng máy quét USB/Bluetooth hoặc nhập mã bên dưới.' },
  insecure: { tone: 'info', text: 'Camera chỉ dùng được khi mở ứng dụng qua kết nối an toàn (https). Dùng máy quét hoặc nhập mã bên dưới.' },
  denied: { tone: 'warning', text: 'Trình duyệt đang chặn camera. Cho phép camera cho trang này trong cài đặt trình duyệt, rồi bấm "Bật camera" lại.' },
  no_camera: { tone: 'warning', text: 'Không tìm thấy camera trên thiết bị này. Dùng máy quét hoặc nhập mã bên dưới.' },
  error: { tone: 'danger', text: 'Không mở được camera. Thử lại, hoặc dùng máy quét hay nhập mã bên dưới.' },
};

/** Live camera decode with BarcodeDetector; every permission and support state is said in words. */
function CameraScanner({ onCode }: { onCode: (raw: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const seen = useRef<{ code: string; at: number } | null>(null);
  const [tried, setState] = useState<CameraState>('idle');
  const blocked = useSyncExternalStore(noSubscription, cameraBlocked, () => null);
  const state = blocked ?? tried;

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  // The dialog unmounts its content when it closes; the camera goes off with it.
  useEffect(() => stop, [stop]);

  const start = async () => {
    const Ctor = detectorCtor()!;
    setState('starting');
    try {
      const supported = Ctor.getSupportedFormats ? await Ctor.getSupportedFormats() : WANTED;
      const formats = WANTED.filter((f) => supported.includes(f));
      if (formats.length === 0) return setState('unsupported');
      const detector = new Ctor({ formats });
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      stream.current = media;
      const el = video.current!;
      el.srcObject = media;
      await el.play();
      setState('scanning');
      timer.current = setInterval(async () => {
        if (el.readyState < 2) return;
        try {
          const [hit] = await detector.detect(el);
          if (!hit?.rawValue) return;
          const now = Date.now();
          if (seen.current && seen.current.code === hit.rawValue && now - seen.current.at < REPEAT_MS) return;
          seen.current = { code: hit.rawValue, at: now };
          onCode(hit.rawValue);
        } catch {
          // A frame the detector cannot read; the next tick tries again.
        }
      }, 300);
    } catch (e) {
      stop();
      const name = e instanceof DOMException ? e.name : '';
      setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'no_camera' : 'error');
    }
  };

  const message = MESSAGES[state];
  const live = state === 'scanning' || state === 'starting';
  return (
    <div className="space-y-2">
      <video ref={video} muted playsInline aria-label="Hình ảnh camera đang quét mã" hidden={!live} className="aspect-video w-full rounded-control bg-surface-3 object-cover" />
      {live ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-2">{state === 'starting' ? 'Đang mở camera. Nếu trình duyệt hỏi, chọn Cho phép dùng camera.' : 'Đưa mã QR trên thẻ đại biểu vào khung hình.'}</p>
          <Button variant="secondary" icon="x" onClick={() => { stop(); setState('idle'); }}>Tắt camera</Button>
        </div>
      ) : (
        !blocked && <Button variant="secondary" icon="qr-code" onClick={() => void start()}>Bật camera</Button>
      )}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
    </div>
  );
}
