import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Button, SectionCard } from '@/components/ui';
import { currentGate } from '@/core/auth/server';
import { MfaChallengeForm, screenRedirect } from '@/features/core';

export const metadata: Metadata = { title: 'Xác thực hai lớp' };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next }, gate] = await Promise.all([searchParams, currentGate()]);
  const to = screenRedirect('mfa_challenge', gate, next ?? null);
  if (to) redirect(to);
  return (
    <SectionCard title="Xác thực hai lớp" subtitle="Nhập mã trên ứng dụng xác thực của bạn để tiếp tục." icon="shield">
      <div className="space-y-4">
        <MfaChallengeForm next={next ?? null} />
        <form method="post" action="/auth/signout">
          <Button type="submit" variant="ghost" icon="log-out">Đăng xuất</Button>
        </form>
      </div>
    </SectionCard>
  );
}
