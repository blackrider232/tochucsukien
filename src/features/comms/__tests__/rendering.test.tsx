import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CampaignId, Email, EventId, GuestId, HHmm, Instant, IsoDate, MailboxId, RsvpResponseId, Version } from '@/core/brand';
import { DEFAULT_SETTINGS, orgIdentity } from '@/core/settings';
import { renderUi, withAppContext } from '@/components/ui/__tests__/helpers';
import { DeliveryLog } from '../components/delivery-log';
import { FormPage } from '../components/form-page';
import { InvitationsPage } from '../components/invitations-page';
import { MailboxesAdmin } from '../components/mailboxes-admin';
import type { FormScreenData, InvitationScreenData, ResponseView } from '../domain/screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => '/' }));
vi.mock('@/core/commands/dispatch', () => ({ dispatch: vi.fn() }));

const XSS = '<img src=x onerror="window.__pwned=1">';
const event = { id: '0b0e0b0e-0000-4000-8000-000000000001' as EventId, name: 'Hội nghị 2026', eventDate: '2026-12-15' as IsoDate, eventTime: '08:30' as HHmm, location: 'Hà Nội', targetGuests: 100 };
const org = orgIdentity({ ...DEFAULT_SETTINGS, version: 1 as Version });

const invitationData = (over: Partial<InvitationScreenData> = {}): InvitationScreenData => ({
  event,
  guests: [
    { id: 'g1' as GuestId, name: XSS, title: XSS, organization: `<script>window.__pwned=2</script>`, group: 'DoanhNghiep', email: 'a@x.vn' as Email, rsvpStatus: 'pending', seatCode: null, checkinCode: 'X7K2QF', lastDelivery: 'error' },
    { id: 'g2' as GuestId, name: 'Không Email', title: '', organization: 'B', group: 'VIP', email: null, rsvpStatus: 'confirmed', seatCode: null, checkinCode: 'Y7K2QF', lastDelivery: null },
  ],
  mailboxes: [{ id: 'm1' as MailboxId, displayName: 'Ban Tổ chức', email: 'btc@x.vn' as Email, clientId: null, isDefault: true, version: 1 as Version }],
  googleClientId: null,
  formUrl: null,
  officer: { name: 'Cán bộ A', email: 'canbo@x.vn' as Email },
  org,
  canSend: true,
  retry: null,
  devTransport: false,
  ...over,
});

const response = (over: Partial<ResponseView> = {}): ResponseView => ({
  id: 'r1' as RsvpResponseId, version: 1 as Version, respondedAt: '2026-11-04T03:00:00.000Z' as Instant, name: XSS, organization: `<script>window.__pwned=3</script>`, title: '',
  email: null, phone: `"><svg onload=window.__pwned=4>`, rsvp: 'confirmed', hasBanquet: true, substitute: '', notes: XSS, match: 'none', matchedGuest: null, candidates: [], applyStatus: 'pending', ...over,
});

const noInjection = (root: HTMLElement) => {
  expect(root.querySelector('img[src="x"], script, svg[onload]')).toBeNull();
  expect((window as { __pwned?: number }).__pwned).toBeUndefined();
};

describe('comms screens render untrusted text as text', () => {
  it('the recipient list shows guest names and organisations as typed, and nothing is preselected', () => {
    const { container } = renderUi(withAppContext(<InvitationsPage data={invitationData()} />));
    expect(screen.getAllByText(XSS).length).toBeGreaterThan(0);
    noInjection(container);
    expect(screen.getByText('Chưa có email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bắt đầu gửi \(0\)/ })).toBeDisabled();
  });

  it('says plainly that sending is not set up without a Client ID: no sandbox fallback', () => {
    renderUi(withAppContext(<InvitationsPage data={invitationData()} />));
    expect(screen.getByText(/Chưa cấu hình Google OAuth Client ID/)).toBeInTheDocument();
    expect(screen.queryByText(/Sandbox|giả lập|Thử nghiệm/i)).toBeNull();
  });

  it('offers the dev transport only when the dev runtime says so, and labels it', () => {
    renderUi(withAppContext(<InvitationsPage data={invitationData({ devTransport: true })} />));
    expect(screen.getByText('Môi trường phát triển')).toBeInTheDocument();
  });

  it('the Google Form screen shows public answers as text and offers review actions', async () => {
    const data: FormScreenData = {
      event,
      form: { formUrl: null, sheetCsvUrl: null, autoSync: false, autoAddNewGuests: false, columnMap: null, detectedMap: {}, sheetHeaders: [XSS], lastSyncAt: null, lastAttemptAt: null, lastSyncError: XSS, version: 1 as Version },
      responses: [response(), response({ id: 'r2' as RsvpResponseId, applyStatus: 'applied', match: 'email', matchedGuest: { id: 'g1' as GuestId, name: XSS } })],
      guests: [{ id: 'g1' as GuestId, name: XSS, organization: 'A', email: null, phone: '' }],
      canManage: true,
    };
    const { container, user } = renderUi(withAppContext(<FormPage data={data} />));
    noInjection(container);
    expect(screen.getByText('Phản hồi cần xem lại')).toBeInTheDocument();
    const review = screen.getByText('Phản hồi cần xem lại').closest('section')!;
    await user.click(within(review).getAllByRole('button', { name: /Thao tác với phản hồi/ })[0]!);
    expect(screen.getByRole('menuitem', { name: 'Ghép với khách mời…' })).toBeInTheDocument();
    noInjection(container);
  });

  it('the delivery log shows names and Gmail errors as text and marks imported rows', () => {
    const { container } = renderUi(
      withAppContext(
        <DeliveryLog
          data={{
            event,
            canSend: true,
            rows: [
              { id: 'd1', campaignId: 'c1' as CampaignId, guestId: null, recipientName: XSS, email: 'a@x.vn' as Email, subject: XSS, senderEmail: 'b@x.vn', status: 'error', sentAt: null, updatedAt: '2026-11-04T03:00:00.000Z' as Instant, error: XSS, imported: false },
              { id: 'd2', campaignId: 'c0' as CampaignId, guestId: null, recipientName: 'Cũ', email: 'c@x.vn' as Email, subject: '', senderEmail: '', status: 'sent', sentAt: null, updatedAt: '2026-11-01T03:00:00.000Z' as Instant, error: null, imported: true },
            ],
          }}
        />,
      ),
    );
    noInjection(container);
    expect(screen.getByText('Đã gửi (phần mềm cũ)')).toBeInTheDocument();
  });

  it('the mailboxes section shows the default and the shared Client ID fallback', () => {
    renderUi(
      withAppContext(
        <MailboxesAdmin
          data={{
            googleClientId: '1-abc.apps.googleusercontent.com',
            mailboxes: [
              { id: 'm1' as MailboxId, displayName: XSS, email: 'a@x.vn' as Email, clientId: null, isDefault: true, version: 1 as Version },
              { id: 'm2' as MailboxId, displayName: 'Phòng B', email: 'b@x.vn' as Email, clientId: '2-def.apps.googleusercontent.com', isDefault: false, version: 1 as Version },
            ],
          }}
        />,
      ),
    );
    expect(screen.getByText(XSS)).toBeInTheDocument();
    expect(screen.getAllByText('Mặc định').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Đặt mặc định' })).toBeInTheDocument();
    expect(screen.getByText('Dùng Client ID chung')).toBeInTheDocument();
  });
});
