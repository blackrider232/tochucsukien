'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CodeScannerProps } from './kit.types';
import { Alert } from './alert';
import { Button } from './button';

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

const messages = (fallback: string): Partial<Record<CameraState, { tone: 'info' | 'warning' | 'danger'; text: string }>> => ({
  unsupported: { tone: 'info', text: `Trình duyệt này chưa hỗ trợ quét mã bằng camera. ${fallback}` },
  insecure: { tone: 'info', text: `Camera chỉ dùng được khi mở ứng dụng qua kết nối an toàn (https). ${fallback}` },
  denied: { tone: 'warning', text: 'Trình duyệt đang chặn camera. Cho phép camera cho trang này trong cài đặt trình duyệt, rồi bấm "Bật camera" lại.' },
  no_camera: { tone: 'warning', text: `Không tìm thấy camera trên thiết bị này. ${fallback}` },
  error: { tone: 'danger', text: `Không mở được camera. Thử lại. ${fallback}` },
});

/**
 * Live camera decode with BarcodeDetector; every permission and support state is said in words, and no viewfinder is
 * ever faked. The same code seen again within 2.5 s is reported once. The camera goes off when the scanner unmounts.
 */
export function CodeScanner({ onCode, fallback = 'Dùng cách nhập mã khác.' }: CodeScannerProps) {
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

  const message = messages(fallback)[state];
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
