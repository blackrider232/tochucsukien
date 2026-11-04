import type { Metadata } from 'next';
import { Alert, SectionCard } from '@/components/ui';
import { currentGate } from '@/core/auth/server';
import { ResetPasswordForm } from '@/features/core';

export const metadata: Metadata = { title: 'Đặt lại mật khẩu' };

// Opened twice: to ask for the email, then from the emailed link, which /auth/callback turns into a recovery session.
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const [{ notice }, gate] = await Promise.all([searchParams, currentGate()]);
  const hasSession = gate.kind !== 'login';
  return (
    <SectionCard title="Đặt lại mật khẩu" subtitle={hasSession ? 'Chọn mật khẩu mới cho tài khoản của bạn.' : 'Nhập email để nhận liên kết đặt lại mật khẩu.'} icon="lock">
      <div className="space-y-4">
        {notice === 'link_failed' && <Alert tone="warning">Liên kết đặt lại mật khẩu đã hết hạn hoặc đã được dùng. Gửi lại email bên dưới.</Alert>}
        <ResetPasswordForm hasSession={hasSession} />
      </div>
    </SectionCard>
  );
}
