import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Alert, Button, SectionCard } from '@/components/ui';
import { currentGate } from '@/core/auth/server';
import { RequiredEnroll, screenRedirect } from '@/features/core';

export const metadata: Metadata = { title: 'Thiết lập xác thực hai lớp' };

export default async function MfaEnrollPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next }, gate] = await Promise.all([searchParams, currentGate()]);
  const to = screenRedirect('mfa_enroll', gate, next ?? null);
  if (to) redirect(to);
  return (
    <SectionCard title="Thiết lập xác thực hai lớp" subtitle="Bắt buộc với Quản trị viên và Ban Giám đốc trước khi vào hệ thống." icon="shield">
      <div className="space-y-4">
        <Alert tone="info">Cài Google Authenticator hoặc Microsoft Authenticator trên điện thoại, rồi làm theo hai bước dưới đây.</Alert>
        <RequiredEnroll next={next ?? null} />
        <form method="post" action="/auth/signout">
          <Button type="submit" variant="ghost" icon="log-out">Đăng xuất</Button>
        </form>
      </div>
    </SectionCard>
  );
}
