'use client';

// The sign-in screens. Each form validates with the shared zod schema, calls a
// browser auth flow, and on success loads the next page in full so the proxy
// sees the new session cookie and routes it through the gate.

import { useEffect, useState } from 'react';
import { Alert, Button, Form, FormField, Select, TextInput, useZodForm } from '@/components/ui';
import { authAvailable, AUTH_UNAVAILABLE, onPasswordRecovery, requestPasswordReset, setNewPassword, signInWithGoogle, signInWithPassword, signUp } from '@/core/auth/flows';
import { LANDING, safeNext } from '../domain/auth-routes';
import { PASSWORD_MIN, SELF_REGISTER_DEPARTMENTS, loginSchema, newPasswordSchema, registerSchema, resetRequestSchema, type RegisterInput } from '../domain/schemas';
import { useHydrated } from './use-hydrated';

const go = (path: string) => window.location.assign(path);

export type LoginNotice = 'registered' | 'reset' | 'link_failed' | 'signed_out' | null;
const NOTICES: { readonly [K in Exclude<LoginNotice, null>]: { tone: 'success' | 'warning' | 'info'; text: string } } = {
  registered: { tone: 'success', text: 'Đăng ký thành công. Tài khoản cần quản trị viên phê duyệt trước khi dùng.' },
  reset: { tone: 'success', text: 'Đã đặt mật khẩu mới. Đăng nhập bằng mật khẩu mới.' },
  link_failed: { tone: 'warning', text: 'Liên kết đã hết hạn hoặc đã được dùng. Yêu cầu gửi lại thư.' },
  signed_out: { tone: 'info', text: 'Đã đăng xuất an toàn.' },
};

function Unavailable() {
  return authAvailable() ? null : <Alert tone="info">{AUTH_UNAVAILABLE}</Alert>;
}

export function LoginForm({ next, notice }: { next: string | null; notice: LoginNotice }) {
  const form = useZodForm(loginSchema, { defaultValues: { email: '', password: '' } });
  const hydrated = useHydrated();
  const [error, setError] = useState<string | null>(null);
  const target = safeNext(next) ?? LANDING;

  const submit = async (v: { email: string; password: string }) => {
    setError(null);
    const r = await signInWithPassword(v.email, v.password);
    if (r.ok) go(target);
    else setError(r.message);
  };
  const google = async () => {
    setError(null);
    const r = await signInWithGoogle(target);
    if (!r.ok) setError(r.message);
  };

  return (
    <div className="space-y-4">
      <Unavailable />
      {notice && <Alert tone={NOTICES[notice].tone}>{NOTICES[notice].text}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      <Form form={form} onSubmit={submit} className="space-y-4">
        <FormField label="Email đăng nhập" name="email" required>
          <TextInput name="email" type="email" autoComplete="username" placeholder="Nhập email của bạn" />
        </FormField>
        <FormField label="Mật khẩu" name="password" required>
          <TextInput name="password" type="password" autoComplete="current-password" />
        </FormField>
        <Button type="submit" disabled={!hydrated} loading={form.formState.isSubmitting}>Đăng nhập</Button>
      </Form>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        <Button variant="secondary" icon="globe" onClick={() => void google()}>Đăng nhập với Google</Button>
        <Button variant="ghost" href="/reset-password">Quên mật khẩu?</Button>
      </div>
      <p className="text-sm text-ink-2">
        Chưa có tài khoản? <Button variant="ghost" href="/register">Đăng ký tài khoản</Button>
      </p>
    </div>
  );
}

const DEPARTMENT_OPTIONS = SELF_REGISTER_DEPARTMENTS.map((d) => ({ value: d, label: d }));

export function RegisterForm({ onSignUp = signUp }: { onSignUp?: typeof signUp }) {
  const form = useZodForm(registerSchema, { defaultValues: { fullname: '', department: 'Phòng Xúc tiến đầu tư', email: '', password: '' } });
  const hydrated = useHydrated();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (v: RegisterInput) => {
    setError(null);
    const r = await onSignUp({ email: v.email, password: v.password, fullname: v.fullname, department: v.department });
    if (!r.ok) setError(r.message);
    else if (r.value === 'signed_in') go('/pending');
    else setSentTo(v.email);
  };

  if (sentTo) {
    return (
      <Alert tone="success" title="Đã gửi thư xác nhận" action={<Button variant="secondary" href="/login?notice=registered">Về trang đăng nhập</Button>}>
        Mở thư gửi tới {sentTo} và bấm liên kết xác nhận. Sau đó tài khoản chờ quản trị viên phê duyệt trước khi dùng được.
      </Alert>
    );
  }
  return (
    <div className="space-y-4">
      <Unavailable />
      {error && <Alert tone="danger">{error}</Alert>}
      <Form form={form} onSubmit={submit} className="space-y-4">
        <FormField label="Họ và tên" name="fullname" required>
          <TextInput name="fullname" autoComplete="name" placeholder="Ví dụ: Nguyễn Văn A" />
        </FormField>
        <FormField label="Phòng chuyên môn" name="department" required hint="Ban Giám đốc do quản trị viên gán.">
          <Select name="department" options={DEPARTMENT_OPTIONS} />
        </FormField>
        <FormField label="Email đăng nhập" name="email" required>
          <TextInput name="email" type="email" autoComplete="email" placeholder="email@sce.hanoi.gov.vn" />
        </FormField>
        <FormField label="Mật khẩu" name="password" required hint={`Tối thiểu ${PASSWORD_MIN} ký tự.`}>
          <TextInput name="password" type="password" autoComplete="new-password" />
        </FormField>
        <Button type="submit" icon="check" disabled={!hydrated} loading={form.formState.isSubmitting}>Đăng ký</Button>
      </Form>
      <p className="text-sm text-ink-2">
        Đã có tài khoản? <Button variant="ghost" href="/login">Quay lại đăng nhập</Button>
      </p>
    </div>
  );
}

export function ResetPasswordForm({ hasSession }: { hasSession: boolean }) {
  const [recovering, setRecovering] = useState(hasSession);
  useEffect(() => onPasswordRecovery(() => setRecovering(true)), []);
  return recovering ? <NewPasswordForm /> : <ResetRequestForm />;
}

function ResetRequestForm() {
  const form = useZodForm(resetRequestSchema, { defaultValues: { email: '' } });
  const hydrated = useHydrated();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const submit = async (v: { email: string }) => {
    setError(null);
    const r = await requestPasswordReset(v.email);
    if (r.ok) setSentTo(v.email);
    else setError(r.message);
  };
  if (sentTo) {
    return (
      <Alert tone="success" title="Đã gửi email" action={<Button variant="secondary" href="/login">Về trang đăng nhập</Button>}>
        Nếu {sentTo} đã có tài khoản, hộp thư sẽ nhận một liên kết đặt lại mật khẩu trong vài phút. Liên kết chỉ dùng được một lần.
      </Alert>
    );
  }
  return (
    <div className="space-y-4">
      <Unavailable />
      {error && <Alert tone="danger">{error}</Alert>}
      <Form form={form} onSubmit={submit} className="space-y-4">
        <FormField label="Email đã đăng ký" name="email" required hint="Hệ thống gửi liên kết đặt lại mật khẩu tới email này.">
          <TextInput name="email" type="email" autoComplete="email" />
        </FormField>
        <Button type="submit" icon="mail" disabled={!hydrated} loading={form.formState.isSubmitting}>Gửi email đặt lại</Button>
      </Form>
      <Button variant="ghost" href="/login">Quay lại đăng nhập</Button>
    </div>
  );
}

function NewPasswordForm() {
  const form = useZodForm(newPasswordSchema, { defaultValues: { password: '', confirm: '' } });
  const hydrated = useHydrated();
  const [error, setError] = useState<string | null>(null);
  const submit = async (v: { password: string }) => {
    setError(null);
    const r = await setNewPassword(v.password);
    if (r.ok) go(LANDING);
    else setError(r.message);
  };
  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <Form form={form} onSubmit={submit} className="space-y-4">
        <FormField label="Mật khẩu mới" name="password" required hint={`Tối thiểu ${PASSWORD_MIN} ký tự.`}>
          <TextInput name="password" type="password" autoComplete="new-password" />
        </FormField>
        <FormField label="Nhập lại mật khẩu mới" name="confirm" required>
          <TextInput name="confirm" type="password" autoComplete="new-password" />
        </FormField>
        <Button type="submit" icon="lock" disabled={!hydrated} loading={form.formState.isSubmitting}>Đặt mật khẩu mới</Button>
      </Form>
    </div>
  );
}
