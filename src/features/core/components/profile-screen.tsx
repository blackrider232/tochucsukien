'use client';

// /profile: the signed-in user's own name (a command), password and TOTP
// (browser auth flows). Status is read from the server, never assumed (core B4, B37).

import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Form, FormField, SectionCard, StatusBadge, TextInput, useDialogs, useToast, useZodForm } from '@/components/ui';
import type { Profile } from '@/core/auth';
import { authAvailable, AUTH_UNAVAILABLE, changePassword, listTotpFactors, removeTotpFactor, type TotpFactor } from '@/core/auth/flows';
import type { Instant } from '@/core/brand';
import { useCommand } from '@/core/commands';
import { formatVNTime } from '@/core/dates';
import { ROLES } from '@/core/vocab';
import { PASSWORD_MIN, changePasswordSchema, profileNameSchema } from '../domain/schemas';
import { TotpEnroll } from './totp';

export function ProfileScreen({ profile, requiresMfa }: { profile: Profile; requiresMfa: boolean }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <AccountCard profile={profile} />
      <PasswordCard />
      <div className="xl:col-span-2">
        <TotpCard requiresMfa={requiresMfa} />
      </div>
    </div>
  );
}

function AccountCard({ profile }: { profile: Profile }) {
  const run = useCommand();
  const form = useZodForm(profileNameSchema, { defaultValues: { fullname: profile.fullname } });
  const submit = async ({ fullname }: { fullname: string }) => {
    if (fullname === profile.fullname) return;
    if (await run('core.profile.updateName', { fullname }, { success: 'Đã cập nhật tên hiển thị.' })) form.reset({ fullname });
  };
  return (
    <SectionCard title="Thông tin tài khoản" subtitle="Vai trò và phòng ban do quản trị viên gán." icon="user-cog">
      <div className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-2">Email đăng nhập</dt>
            <dd className="break-all font-semibold text-ink">{profile.email}</dd>
          </div>
          <div>
            <dt className="text-ink-2">Vai trò</dt>
            <dd className="mt-0.5"><StatusBadge registry={ROLES} value={profile.role} /></dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-ink-2">Phòng ban công tác</dt>
            <dd className="font-semibold text-ink">{profile.department ?? 'Chưa được gán'}</dd>
          </div>
        </dl>
        <Form form={form} onSubmit={submit} className="space-y-3">
          <FormField label="Họ và tên hiển thị" name="fullname" required>
            <TextInput name="fullname" autoComplete="name" />
          </FormField>
          <Button type="submit" variant="secondary" icon="check" loading={form.formState.isSubmitting}>Lưu tên</Button>
        </Form>
      </div>
    </SectionCard>
  );
}

function PasswordCard() {
  const toast = useToast();
  const form = useZodForm(changePasswordSchema, { defaultValues: { current: '', password: '', confirm: '' } });
  const [error, setError] = useState<string | null>(null);
  const submit = async (v: { current: string; password: string }) => {
    setError(null);
    const r = await changePassword(v.current, v.password);
    if (!r.ok) return setError(r.message);
    form.reset({ current: '', password: '', confirm: '' });
    toast.success('Đã đổi mật khẩu.');
  };
  return (
    <SectionCard title="Đổi mật khẩu" subtitle="Cần mật khẩu hiện tại để đặt mật khẩu mới." icon="lock">
      {authAvailable() ? (
        <Form form={form} onSubmit={submit} className="space-y-3">
          {error && <Alert tone="danger">{error}</Alert>}
          <FormField label="Mật khẩu hiện tại" name="current" required>
            <TextInput name="current" type="password" autoComplete="current-password" />
          </FormField>
          <FormField label="Mật khẩu mới" name="password" required hint={`Tối thiểu ${PASSWORD_MIN} ký tự.`}>
            <TextInput name="password" type="password" autoComplete="new-password" />
          </FormField>
          <FormField label="Nhập lại mật khẩu mới" name="confirm" required>
            <TextInput name="confirm" type="password" autoComplete="new-password" />
          </FormField>
          <Button type="submit" variant="secondary" icon="lock" loading={form.formState.isSubmitting}>Đổi mật khẩu</Button>
        </Form>
      ) : (
        <Alert tone="info">{AUTH_UNAVAILABLE}</Alert>
      )}
    </SectionCard>
  );
}

type Factors = { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'ready'; verified: TotpFactor[] };

function TotpCard({ requiresMfa }: { requiresMfa: boolean }) {
  const toast = useToast();
  const dialogs = useDialogs();
  const available = authAvailable();
  const [loaded, setLoaded] = useState<{ round: number; factors: Factors } | null>(null);
  const [round, setRound] = useState(0);
  const [enrolling, setEnrolling] = useState(false);
  const load = () => setRound((n) => n + 1);
  const factors: Factors = loaded && loaded.round === round ? loaded.factors : { kind: 'loading' };

  useEffect(() => {
    if (!available) return;
    let live = true;
    void listTotpFactors().then((r) => {
      if (live) setLoaded({ round, factors: r.ok ? { kind: 'ready', verified: r.value.verified } : { kind: 'failed', message: r.message } });
    });
    return () => {
      live = false;
    };
  }, [available, round]);

  const remove = async (f: TotpFactor) => {
    const ok = await dialogs.confirm({
      title: 'Tắt xác thực hai lớp?',
      text: 'Lần đăng nhập sau chỉ cần mật khẩu. Bạn có thể bật lại bất cứ lúc nào với một mã QR mới.',
      confirmLabel: 'Tắt xác thực hai lớp',
      tone: 'danger',
    });
    if (!ok) return;
    const r = await removeTotpFactor(f.id);
    if (!r.ok) return toast.error(r.message);
    toast.success('Đã tắt xác thực hai lớp.');
    load();
  };

  const body = () => {
    if (!available) return <Alert tone="info">{AUTH_UNAVAILABLE}</Alert>;
    if (factors.kind === 'loading') return <p className="text-sm text-ink-2" aria-live="polite">Đang tải trạng thái…</p>;
    if (factors.kind === 'failed') return <Alert tone="danger" action={<Button variant="secondary" icon="refresh" onClick={load}>Thử lại</Button>}>{factors.message}</Alert>;
    const [factor] = factors.verified;
    if (factor) {
      return (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <Badge tone="emerald" icon="circle-check">Đã bật</Badge>
            <p className="text-sm text-ink-2">{factor.friendlyName ?? 'Ứng dụng xác thực'} · từ {formatVNTime(factor.createdAt as Instant, { withDate: true })}</p>
          </div>
          {requiresMfa
            ? <p className="text-sm text-ink-2">Vai trò của bạn bắt buộc xác thực hai lớp nên không tắt được.</p>
            : <Button variant="danger" icon="x" onClick={() => void remove(factor)}>Tắt xác thực hai lớp</Button>}
        </div>
      );
    }
    if (enrolling) {
      return (
        <TotpEnroll
          onCancel={() => setEnrolling(false)}
          onEnrolled={() => {
            setEnrolling(false);
            toast.success('Đã kích hoạt xác thực hai lớp bảo vệ tài khoản.');
            load();
          }}
        />
      );
    }
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge tone="slate">Chưa bật</Badge>
        <Button icon="shield" onClick={() => setEnrolling(true)}>Bật xác thực hai lớp</Button>
      </div>
    );
  };

  return (
    <SectionCard title="Xác thực hai lớp (TOTP)" subtitle="Mỗi lần đăng nhập nhập thêm mã 6 số từ Google Authenticator hoặc Microsoft Authenticator." icon="shield">
      {body()}
    </SectionCard>
  );
}
