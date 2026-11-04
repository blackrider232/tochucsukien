import type { Metadata } from 'next';
import { Alert, SectionCard } from '@/components/ui';
import { currentGate } from '@/core/auth/server';
import { ResetPasswordForm } from '@/features/core';

export const metadata: Metadata = { title: 'Đặt lại mật khẩu' };

// Opened twice: to ask for the email, then from the emailed link, which /auth/callback turns into a recovery session.
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ notice?: string; mode?: string }> }) {
  const [{ notice, mode }, gate] = await Promise.all([searchParams, currentGate()]);
  // Only the emailed link (through /auth/callback) sets a new password without the old one; the profile page asks for it.
  const recovering = mode === 'recovery' && gate.kind !== 'login';
  return (
    <SectionCard title="Đặt lại mật khẩu" subtitle={recovering ? 'Chọn mật khẩu mới cho tài khoản của bạn.' : 'Nhập email để nhận liên kết đặt lại mật khẩu.'} icon="lock">
      <div className="space-y-4">
        {notice === 'link_failed' && <Alert tone="warning">Liên kết đặt lại mật khẩu đã hết hạn hoặc đã được dùng. Gửi lại email bên dưới.</Alert>}
        <ResetPasswordForm recovering={recovering} />
      </div>
    </SectionCard>
  );
}
