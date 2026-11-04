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
  sent: [], failed: [], skipped: [], unrecorded: [], stoppedBy: null, alreadySent: [], inFlight: [], ownInFlight: [], claimFailed: false,
  ...over,
});
const handlers = () => ({ onPreview: vi.fn(), onTest: vi.fn(), onStop: vi.fn(), onRetryFailed: vi.fn(), onResumeSkipped: vi.fn(), onTakeOver: vi.fn() });
const panel = (r: CampaignReport, h = handlers()) => (
  <SendPanel run={{ kind: 'finished', report: r }} log={[]} recipients={1} canStart blocker={null} testing={false} {...h} />
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

  it('shows no take-over when nothing is held elsewhere', () => {
    renderUi(withAppContext(panel(report({ inFlight: [person('a@x.vn')] }))));
    expect(screen.queryByRole('button', { name: 'Tiếp quản phiên gửi' })).toBeNull();
  });
});
