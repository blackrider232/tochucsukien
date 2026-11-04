import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SectionCard } from '@/components/ui';
import { currentGate } from '@/core/auth/server';
import { LoginForm, screenRedirect, type LoginNotice } from '@/features/core';

export const metadata: Metadata = { title: 'Đăng nhập' };

const NOTICES: ReadonlyArray<Exclude<LoginNotice, null>> = ['registered', 'reset', 'link_failed', 'signed_out'];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; notice?: string }> }) {
  const [{ next, notice }, gate] = await Promise.all([searchParams, currentGate()]);
  const to = screenRedirect('login', gate, next ?? null);
  if (to) redirect(to);
  return (
    <SectionCard title="Đăng nhập" subtitle="Dùng email công vụ đã được phê duyệt." icon="lock">
      <LoginForm next={next ?? null} notice={NOTICES.find((n) => n === notice) ?? null} />
    </SectionCard>
  );
}
