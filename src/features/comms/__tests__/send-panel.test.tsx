import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CampaignId, Email } from '@/core/brand';
import { renderUi, withAppContext } from '@/components/ui/__tests__/helpers';
import { SendPanel } from '../components/send-panel';
import type { CampaignReport } from '../domain/campaign';
import { fromManual, type Recipient } from '../domain/compose';

const person = (email: string): Recipient => fromManual({ email: email as Email, name: `Người ${email}`, organization: '' });
const report = (over: Partial<CampaignReport> = {}): CampaignReport => ({
  campaignId: '0b0e0b0e-0000-5000-8000-000000000001' as CampaignId,
  sent: [], failed: [], unknown: [], skipped: [], unrecorded: [], stoppedBy: null, alreadySent: [], inFlight: [], ownInFlight: [], unclear: [], claimFailed: false,
  ...over,
});
const handlers = () => ({ onPreview: vi.fn(), onTest: vi.fn(), onStop: vi.fn(), onRetryFailed: vi.fn(), onResumeSkipped: vi.fn(), onTakeOver: vi.fn() });
const panel = (r: CampaignReport, h = handlers()) => (
  <SendPanel run={{ kind: 'finished', report: r }} log={[]} recipients={1} canStart canTest blocker={null} testing={false} {...h} />
);

describe('SendPanel', () => {
  it('offers to take over the recipients another run of the same officer holds, and warns before', async () => {
    const h = handlers();
    const { user } = renderUi(withAppContext(panel(report({ ownInFlight: [person('a@x.vn')] }), h)));
    expect(screen.getByText('1 người nhận đang được giữ chỗ bởi một phiên gửi khác của bạn.')).toBeInTheDocument();
    expect(screen.getByText(/a@x\.vn/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tiếp quản phiên gửi' }));
    expect(h.onTakeOver).toHaveBeenCalledOnce();
  });

  it('a run with failures and an unsent tail offers both: retry the failed, resume the rest', async () => {
    const h = handlers();
    const { user } = renderUi(withAppContext(panel(report({ failed: [{ recipient: person('loi@x.vn'), failure: { kind: 'invalid', message: 'x' } }], skipped: [{ recipient: person('b@x.vn'), reason: 'auth' }], stoppedBy: 'auth' }), h)));
    await user.click(screen.getByRole('button', { name: 'Gửi lại thư lỗi' }));
    await user.click(screen.getByRole('button', { name: 'Gửi tiếp phần chưa gửi' }));
    expect(h.onRetryFailed).toHaveBeenCalledOnce();
    expect(h.onResumeSkipped).toHaveBeenCalledOnce();
  });

  it('a run that sent nothing because others hold every recipient is a warning that counts them, never a success', () => {
    const held = Array.from({ length: 13 }, (_, i) => person(`p${i}@x.vn`));
    renderUi(withAppContext(panel(report({ inFlight: held, ownInFlight: [person('own@x.vn')], unclear: [person('u@x.vn')] }))));
    const alert = screen.getByText(/^Chưa gửi thư nào/).closest('[data-tone]')!;
    expect(alert).toHaveAttribute('data-tone', 'amber');
    expect(alert).toHaveTextContent('Chưa gửi thư nào: 13 người đang được gửi ở phiên khác, 1 người đang được gửi ở một phiên khác của bạn, 1 người chưa rõ đã nhận thư này hay chưa.');
  });

  it('a run that sent everything it held is a success', () => {
    renderUi(withAppContext(panel(report({ sent: [{ recipient: person('a@x.vn'), messageId: 'm' }] }))));
    expect(screen.getByText(/^Hoàn tất/).closest('[data-tone]')).toHaveAttribute('data-tone', 'emerald');
  });

  it('shows no take-over when nothing is held elsewhere', () => {
    renderUi(withAppContext(panel(report({ inFlight: [person('a@x.vn')] }))));
    expect(screen.queryByRole('button', { name: 'Tiếp quản phiên gửi' })).toBeNull();
  });
});
