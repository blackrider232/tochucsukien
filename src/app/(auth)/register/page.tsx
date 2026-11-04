import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SectionCard } from '@/components/ui';
import { currentGate } from '@/core/auth/server';
import { RegisterForm, screenRedirect } from '@/features/core';

export const metadata: Metadata = { title: 'Đăng ký tài khoản' };

export default async function RegisterPage() {
  const to = screenRedirect('register', await currentGate(), null);
  if (to) redirect(to);
  return (
    <SectionCard title="Đăng ký tài khoản" subtitle="Tài khoản mới là Chuyên viên và cần quản trị viên phê duyệt." icon="user-cog">
      <RegisterForm />
    </SectionCard>
  );
}
