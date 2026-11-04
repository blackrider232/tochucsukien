import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderUi } from '@/components/ui/__tests__/helpers';
import type { Gate } from '@/core/auth';

const session = vi.hoisted(() => ({ gate: { kind: 'login' } as Gate, recoveredAt: null as number | null }));
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
);
vi.mock('next/navigation', () => ({ redirect, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/core/auth/server', () => ({ currentGate: async () => session.gate, recoveryProofAt: async () => session.recoveredAt }));
const { default: ResetPasswordPage } = await import('@/app/(auth)/reset-password/page');

const nowSeconds = () => Math.floor(Date.now() / 1000);

async function open(gate: Gate, recoveredAt: number | null, params: { mode?: string; notice?: string } = { mode: 'recovery' }) {
  Object.assign(session, { gate, recoveredAt });
  renderUi(await ResetPasswordPage({ searchParams: Promise.resolve(params) }));
}
const asksCurrentPassword = () => screen.queryByLabelText(/Mật khẩu hiện tại/) !== null;
const offersNewPasswordOnly = () => screen.queryByRole('button', { name: 'Đặt mật khẩu mới' }) !== null && !asksCurrentPassword();

describe('/reset-password decides recovery from the session, not the URL (core B25, B37)', () => {
  it('asks a signed-in session without recovery proof for its current password, whatever the URL says', async () => {
    await open({ kind: 'ok' }, null);
    expect(asksCurrentPassword()).toBe(true);
    expect(offersNewPasswordOnly()).toBe(false);
  });

  it('sets a new password without the old one only for a session opened from a recovery link in the last minutes', async () => {
    await open({ kind: 'ok' }, nowSeconds() - 60, {});
    expect(offersNewPasswordOnly()).toBe(true);
  });

  it('asks for the current password once the recovery proof is old', async () => {
    await open({ kind: 'ok' }, nowSeconds() - 60 * 60);
    expect(asksCurrentPassword()).toBe(true);
  });

  it('asks a visitor without a session for the email', async () => {
    await open({ kind: 'login' }, null);
    expect(screen.getByLabelText(/Email đã đăng ký/)).toBeInTheDocument();
    expect(asksCurrentPassword()).toBe(false);
  });

  it.each([
    [{ kind: 'pending' } as Gate, '/pending'],
    [{ kind: 'locked' } as Gate, '/pending?status=locked'],
    [{ kind: 'mfa_challenge' } as Gate, '/mfa?next=%2Freset-password'],
    [{ kind: 'mfa_enroll' } as Gate, '/mfa/enroll?next=%2Freset-password'],
  ])('sends an unfinished session (%o) to its gate, even with recovery proof', async (gate, to) => {
    await expect(open(gate, nowSeconds() - 60)).rejects.toThrow(`NEXT_REDIRECT ${to}`);
  });
});
