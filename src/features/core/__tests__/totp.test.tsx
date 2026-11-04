import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderUi, withAppContext } from '@/components/ui/__tests__/helpers';

const flows = vi.hoisted(() => ({
  authAvailable: () => true,
  AUTH_UNAVAILABLE: 'x',
  startTotpEnrollment: vi.fn(async () => ({ ok: true as const, value: { factorId: 'f1', uri: 'otpauth://totp/S%E1%BB%B1%20ki%E1%BB%87n%20SCE:a@sce.vn?secret=JBSWY3DPEHPK3PXP', secret: 'JBSWY3DPEHPK3PXP' } })),
  verifyTotp: vi.fn(async (_id: string, code: string) => (code === '123456' ? { ok: true as const, value: null } : { ok: false as const, message: 'Mã xác thực không đúng hoặc đã hết hạn.' })),
  challengeTotp: vi.fn(),
}));
vi.mock('@/core/auth/flows', () => flows);
const { TotpEnroll } = await import('../components/totp');

describe('TotpEnroll (core B4)', () => {
  it('shows the QR and the secret, refuses a wrong code, and finishes on the right one', async () => {
    const onEnrolled = vi.fn();
    const { user } = renderUi(withAppContext(<TotpEnroll onEnrolled={onEnrolled} />));
    expect(await screen.findByRole('img', { name: 'Mã QR TOTP' })).toBeInTheDocument();
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    expect(flows.startTotpEnrollment).toHaveBeenCalledTimes(1);

    const code = screen.getByLabelText(/Mã 6 số/);
    await user.type(code, '12');
    await user.click(screen.getByRole('button', { name: 'Kích hoạt' }));
    expect(await screen.findByText('Mã xác thực gồm 6 chữ số')).toBeInTheDocument();
    expect(flows.verifyTotp).not.toHaveBeenCalled();

    await user.clear(code);
    await user.type(code, '000 000');
    await user.click(screen.getByRole('button', { name: 'Kích hoạt' }));
    expect(await screen.findByText('Mã xác thực không đúng hoặc đã hết hạn.')).toBeInTheDocument();
    expect(flows.verifyTotp).toHaveBeenLastCalledWith('f1', '000000');

    await user.type(screen.getByLabelText(/Mã 6 số/), '123456');
    await user.click(screen.getByRole('button', { name: 'Kích hoạt' }));
    await vi.waitFor(() => expect(onEnrolled).toHaveBeenCalledTimes(1));
  });
});
