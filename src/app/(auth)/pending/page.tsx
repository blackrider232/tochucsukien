import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentGate } from '@/core/auth/server';
import { PendingScreen, screenRedirect } from '@/features/core';

export const metadata: Metadata = { title: 'Tài khoản chưa sẵn sàng' };

export default async function PendingPage() {
  const gate = await currentGate();
  const to = screenRedirect('pending', gate, null);
  if (to) redirect(to);
  return <PendingScreen status={gate.kind === 'locked' ? 'locked' : 'pending'} />;
}
