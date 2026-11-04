'use client';

// TOTP enrolment (QR, manual secret, first code) and the sign-in code step.

import { useEffect, useState } from 'react';
import { Alert, Button, Form, FormField, IconButton, QrCode, TextInput, useToast, useZodForm } from '@/components/ui';
import { authAvailable, AUTH_UNAVAILABLE, challengeTotp, startTotpEnrollment, verifyTotp, type TotpEnrollment } from '@/core/auth/flows';
import { formatVNDate, todayVN } from '@/core/dates';
import { LANDING, safeNext } from '../domain/auth-routes';
import { totpCodeSchema } from '../domain/schemas';

function CodeForm({ submitLabel, onCode }: { submitLabel: string; onCode: (code: string) => Promise<string | null> }) {
  const form = useZodForm(totpCodeSchema, { defaultValues: { code: '' } });
  const [error, setError] = useState<string | null>(null);
  const submit = async ({ code }: { code: string }) => {
    setError(null);
    const failure = await onCode(code);
    if (failure) {
      setError(failure);
      form.reset({ code: '' });
    }
  };
  return (
    <Form form={form} onSubmit={submit} className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}
      <FormField label="Mã 6 số trên ứng dụng xác thực" name="code" required hint="Mã đổi sau mỗi 30 giây.">
        <TextInput name="code" autoComplete="one-time-code" placeholder="000000" />
      </FormField>
      <Button type="submit" icon="shield" loading={form.formState.isSubmitting}>{submitLabel}</Button>
    </Form>
  );
}

/** The sign-in step for an account with a verified factor (AAL1 to AAL2). */
export function MfaChallengeForm({ next }: { next: string | null }) {
  if (!authAvailable()) return <Alert tone="info">{AUTH_UNAVAILABLE}</Alert>;
  return (
    <CodeForm
      submitLabel="Xác thực"
      onCode={async (code) => {
        const r = await challengeTotp(code);
        if (!r.ok) return r.message;
        window.location.assign(safeNext(next) ?? LANDING);
        return null;
      }}
    />
  );
}

type Started = { attempt: number; result: { ok: true; value: TotpEnrollment } | { ok: false; message: string } };

/**
 * Starts one enrolment on mount and on each retry (clearing earlier unverified ones),
 * shows the QR and the secret, and verifies the first code. `onEnrolled` runs once
 * the factor is verified.
 */
export function TotpEnroll({ onEnrolled, onCancel }: { onEnrolled: () => void; onCancel?: () => void }) {
  const toast = useToast();
  const available = authAvailable();
  const [attempt, setAttempt] = useState(0);
  const [started, setStarted] = useState<Started | null>(null);

  useEffect(() => {
    if (!available) return;
    let live = true;
    void startTotpEnrollment(`Sự kiện SCE ${formatVNDate(todayVN())} ${Date.now().toString(36).slice(-4)}`).then((result) => {
      if (live) setStarted({ attempt, result });
    });
    return () => {
      live = false;
    };
  }, [attempt, available]);

  if (!available) return <Alert tone="info">{AUTH_UNAVAILABLE}</Alert>;
  if (!started || started.attempt !== attempt) return <p className="text-sm text-ink-2" aria-live="polite">Đang tạo mã thiết lập…</p>;
  if (!started.result.ok) {
    return (
      <Alert tone="danger" action={<Button variant="secondary" icon="refresh" onClick={() => setAttempt((n) => n + 1)}>Thử lại</Button>}>
        {started.result.message}
      </Alert>
    );
  }
  const enrollment = started.result.value;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      toast.success('Đã sao chép mã khóa bí mật');
    } catch {
      toast.warning('Không sao chép được. Hãy chọn và sao chép mã bằng tay.');
    }
  };
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink">1. Quét mã QR bằng Google Authenticator hoặc Microsoft Authenticator</p>
        <QrCode payload={enrollment.uri} size={176} caption="TOTP" />
        <p className="text-sm text-ink-2">Không quét được? Nhập mã khóa bí mật vào ứng dụng:</p>
        <div className="flex items-center gap-1">
          <code className="min-w-0 break-all rounded-control bg-surface-2 px-2 py-1 font-mono text-sm text-ink">{enrollment.secret}</code>
          <IconButton icon="copy" label="Sao chép mã khóa bí mật" onClick={() => void copy()} />
        </div>
      </div>
      <div className="space-y-3">
        <p className="text-sm font-semibold text-ink">2. Nhập mã 6 số hiển thị trên điện thoại để kích hoạt</p>
        <CodeForm
          submitLabel="Kích hoạt"
          onCode={async (code) => {
            const r = await verifyTotp(enrollment.factorId, code);
            if (!r.ok) return r.message;
            onEnrolled();
            return null;
          }}
        />
        {onCancel && <Button variant="ghost" onClick={onCancel}>Để sau</Button>}
      </div>
    </div>
  );
}

/** /mfa/enroll: the required first enrolment of an admin or leader. */
export function RequiredEnroll({ next }: { next: string | null }) {
  return <TotpEnroll onEnrolled={() => window.location.assign(safeNext(next) ?? LANDING)} />;
}
