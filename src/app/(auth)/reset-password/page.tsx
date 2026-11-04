import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Alert, SectionCard } from '@/components/ui';
import { currentGate, recoveryProofAge } from '@/core/auth/server';
import { ResetPasswordForm, resetPasswordView } from '@/features/core';

export const metadata: Metadata = { title: 'Đặt lại mật khẩu' };

const SUBTITLES = {
  request: 'Nhập email để nhận liên kết đặt lại mật khẩu.',
  recovery: 'Chọn mật khẩu mới cho tài khoản của bạn.',
  change: 'Cần mật khẩu hiện tại để đặt mật khẩu mới.',
} as const;

// Opened twice: to ask for the email, then from the emailed link, which /auth/callback turns into a recovery session.
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const [{ notice }, gate, recoveryAge] = await Promise.all([searchParams, currentGate(), recoveryProofAge()]);
  const view = resetPasswordView(gate, recoveryAge);
  if (view.kind === 'redirect') redirect(view.to);
  return (
    <SectionCard title="Đặt lại mật khẩu" subtitle={SUBTITLES[view.kind]} icon="lock">
      <div className="space-y-4">
        {notice === 'link_failed' && <Alert tone="warning">Liên kết đặt lại mật khẩu đã hết hạn hoặc đã được dùng. Gửi lại email bên dưới.</Alert>}
        <ResetPasswordForm view={view.kind} />
      </div>
    </SectionCard>
  );
}
