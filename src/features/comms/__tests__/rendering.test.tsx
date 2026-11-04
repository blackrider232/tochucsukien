import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CampaignId, Email, EventId, GuestId, HHmm, Instant, IsoDate, MailboxId, RsvpResponseId, Version } from '@/core/brand';
import { DEFAULT_SETTINGS, orgIdentity } from '@/core/settings';
import { renderUi, withAppContext } from '@/components/ui/__tests__/helpers';
import { DeliveryLog } from '../components/delivery-log';
import { FormPage } from '../components/form-page';
import { InvitationsPage } from '../components/invitations-page';
import { MailboxesAdmin } from '../components/mailboxes-admin';
import { PreviewDialog } from '../components/preview-dialog';
import type { FormScreenData, InvitationScreenData, ResponseView } from '../domain/screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => '/' }));
const dispatched = vi.hoisted(() => vi.fn(async (..._: unknown[]) => ({ ok: true, value: null })));
vi.mock('@/core/commands/dispatch', () => ({ dispatch: dispatched }));

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
  email: null, phone: `"><svg onload=window.__pwned=4>`, rsvpAnswer: XSS, rsvp: 'confirmed', hasBanquet: true, substitute: '', notes: XSS, match: 'none', matchedGuest: null, candidates: [], applyStatus: 'pending', ...over,
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

  it('a retry from the log opens with the failed campaign’s own subject and body', () => {
    const message = { subject: 'Thư mời riêng {ho_ten}', body: '<p>Nội dung đã sửa</p>', attachQr: true };
    renderUi(withAppContext(<InvitationsPage data={invitationData({ retry: { campaignId: '0b0e0b0e-0000-5000-8000-000000000001' as CampaignId, guestIds: ['g1' as GuestId], manual: [], message } })} />));
    expect(screen.getByDisplayValue('Thư mời riêng {ho_ten}')).toBeInTheDocument();
    expect(screen.getByText(/Đã chọn lại 1 người nhận bị lỗi/)).toBeInTheDocument();
  });

  it('a read-only officer cannot send the test mail either', () => {
    renderUi(withAppContext(<InvitationsPage data={invitationData({ canSend: false, devTransport: true })} />));
    expect(screen.getByRole('button', { name: 'Gửi thử cho tôi' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Bắt đầu gửi/ })).toBeDisabled();
  });

  it('the preview offers no test mail to an officer who may not send', () => {
    const message = { from: { name: 'A', email: 'a@x.vn' as Email }, to: [{ name: 'B', email: 'b@x.vn' as Email }], subject: 'S', html: '<p>x</p>' };
    renderUi(withAppContext(<PreviewDialog message={message as never} onClose={() => undefined} onTest={null} testing={false} />));
    expect(screen.queryByRole('button', { name: 'Gửi thử nội dung này đến tôi' })).toBeNull();
  });

  it('an officer who may send can send the test mail', () => {
    renderUi(withAppContext(<InvitationsPage data={invitationData({ devTransport: true })} />));
    expect(screen.getByRole('button', { name: 'Gửi thử cho tôi' })).toBeEnabled();
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
      serverSync: false,
    };
    const { container, user } = renderUi(withAppContext(<FormPage data={data} />));
    noInjection(container);
    expect(screen.getByText('Phản hồi cần xem lại')).toBeInTheDocument();
    const review = screen.getByText('Phản hồi cần xem lại').closest('section')!;
    await user.click(within(review).getAllByRole('button', { name: /Thao tác với phản hồi/ })[0]!);
    expect(screen.getByRole('menuitem', { name: 'Ghép với khách mời…' })).toBeInTheDocument();
    noInjection(container);
  });

  it('the review list shows the answer as typed, the matched guest and three decisions, each sent as a command', async () => {
    dispatched.mockClear();
    const waiting = response({ id: 'r3' as RsvpResponseId, version: 4 as Version, applyStatus: 'review', rsvp: null, match: 'email', matchedGuest: { id: 'g1' as GuestId, name: 'Trần Văn Bình' }, rsvpAnswer: `Tham dự ko đc ${XSS}` });
    const data: FormScreenData = { event, form: null, responses: [waiting], guests: [], canManage: true, serverSync: false };
    const { container, user } = renderUi(withAppContext(<FormPage data={data} />));
    const list = screen.getByText('Câu trả lời cần xem lại').closest('section')!;
    expect(within(list).getByText(`Tham dự ko đc ${XSS}`)).toBeInTheDocument();
    expect(within(list).getByText(/Trần Văn Bình/)).toBeInTheDocument();
    noInjection(container);
    const sent = (action: unknown) => vi.waitFor(() => expect(dispatched).toHaveBeenLastCalledWith('comms.resolveResponse', { eventId: event.id, id: 'r3', version: 4, action }));
    await user.click(within(list).getByRole('button', { name: 'Xác nhận tham dự' }));
    await sent({ kind: 'answer', status: 'confirmed' });
    // A decline frees the guest's seat, so it asks first.
    dispatched.mockClear();
    await user.click(within(list).getByRole('button', { name: 'Từ chối' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('ghế đã xếp (nếu có) được giải phóng');
    expect(dispatched).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Ghi nhận từ chối' }));
    await sent({ kind: 'answer', status: 'declined' });
    await user.click(within(list).getByRole('button', { name: 'Bỏ qua' }));
    await sent({ kind: 'dismiss' });
    // At 360 px the buttons wrap below the answer and a long answer breaks inside its box.
    const actions = within(list).getByRole('button', { name: 'Từ chối' }).parentElement!;
    expect(actions.className).toContain('flex-wrap');
    expect(within(list).getByText(`Tham dự ko đc ${XSS}`).className).toContain('break-words');
    expect(list.querySelector('table')).toBeNull();
  });

  it('a read-only officer sees the answers waiting for review, with no decision buttons', () => {
    const waiting = response({ applyStatus: 'review', rsvp: null, match: 'email', matchedGuest: { id: 'g1' as GuestId, name: 'Trần Văn Bình' }, rsvpAnswer: 'Bận đột xuất' });
    renderUi(withAppContext(<FormPage data={{ event, form: null, responses: [waiting], guests: [], canManage: false, serverSync: false }} />));
    const list = screen.getByText('Câu trả lời cần xem lại').closest('section')!;
    expect(within(list).getByText('Bận đột xuất')).toBeInTheDocument();
    expect(within(list).queryByRole('button')).toBeNull();
  });

  it.each([
    [false, true, 'Tự động kiểm tra mỗi 5 phút (chưa hoạt động)', 'Tự động: chưa hoạt động'],
    [true, false, 'Tự động kiểm tra mỗi 5 phút', 'Tự động mỗi 5 phút'],
  ])('the auto sync switch promises a server sync only when one runs (configured: %s)', (serverSync, disabled, label, badge) => {
    const data: FormScreenData = {
      event,
      form: { formUrl: null, sheetCsvUrl: 'https://docs.google.com/spreadsheets/d/x/export?format=csv' as never, autoSync: true, autoAddNewGuests: false, columnMap: null, detectedMap: {}, sheetHeaders: [], lastSyncAt: null, lastAttemptAt: null, lastSyncError: null, version: 1 as Version },
      responses: [],
      guests: [],
      canManage: true,
      serverSync,
    };
    renderUi(withAppContext(<FormPage data={data} />));
    const box = screen.getByRole('checkbox', { name: new RegExp(`^${label.replace(/[()]/g, '\\$&')}`) });
    expect(box).toHaveProperty('disabled', disabled);
    expect(screen.getByText(badge)).toBeInTheDocument();
    expect(screen.queryByText(/kể cả khi không ai mở phần mềm/) !== null).toBe(serverSync);
  });

  it('saving the form while auto sync is not working keeps the saved choice', async () => {
    dispatched.mockClear();
    const data: FormScreenData = {
      event,
      form: { formUrl: null, sheetCsvUrl: null, autoSync: true, autoAddNewGuests: false, columnMap: null, detectedMap: {}, sheetHeaders: [], lastSyncAt: null, lastAttemptAt: null, lastSyncError: null, version: 3 as Version },
      responses: [], guests: [], canManage: true, serverSync: false,
    };
    const { user } = renderUi(withAppContext(<FormPage data={data} />));
    await user.click(screen.getByRole('button', { name: 'Lưu cấu hình' }));
    await vi.waitFor(() => expect(dispatched).toHaveBeenCalledWith('comms.saveForm', expect.objectContaining({ config: expect.objectContaining({ autoSync: true }) })));
  });

  it('the delivery log names each campaign by its subject template, not by one recipient’s merged subject', () => {
    renderUi(
      withAppContext(
        <DeliveryLog
          data={{
            event,
            canSend: true,
            campaigns: [{ id: 'c1' as CampaignId, label: 'Giấy mời {ho_ten}' }],
            rows: [{ id: 'd1', campaignId: 'c1' as CampaignId, guestId: null, recipientName: 'Nguyễn Văn An', email: 'a@x.vn' as Email, subject: 'Giấy mời Nguyễn Văn An', senderEmail: 'b@x.vn', status: 'sent', sentAt: null, updatedAt: '2026-11-04T03:00:00.000Z' as Instant, error: null, imported: false }],
          }}
        />,
      ),
    );
    expect(screen.getByRole('option', { name: 'Giấy mời {ho_ten}' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Giấy mời Nguyễn Văn An' })).toBeNull();
  });

  it.each([true, false])('the delivery log asks for a check of a send whose answer was lost (may send: %s)', async (canSend) => {
    dispatched.mockClear();
    const row = { id: 'd1', campaignId: 'c1' as CampaignId, guestId: null, recipientName: 'An', email: 'a@x.vn' as Email, subject: 'Giấy mời An', senderEmail: 'b@x.vn', status: 'unknown' as const, sentAt: null, updatedAt: '2026-11-04T03:00:00.000Z' as Instant, error: 'Không kết nối được Gmail.', imported: false };
    const { user } = renderUi(withAppContext(<DeliveryLog data={{ event, canSend, campaigns: [{ id: 'c1' as CampaignId, label: 'Giấy mời {ho_ten}' }], rows: [row] }} />));
    expect(screen.getAllByText('Không rõ đã gửi').length).toBeGreaterThan(0);
    expect(screen.getByText('1 thư không rõ đã gửi hay chưa')).toBeInTheDocument();
    expect(screen.getByText('Chưa rõ kết quả').parentElement).toHaveTextContent('Chưa rõ kết quả1');
    const button = screen.queryByRole('button', { name: 'Xác nhận chưa gửi' });
    if (!canSend) return expect(button).toBeNull();
    await user.click(button!);
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Xác nhận chưa gửi' }));
    await vi.waitFor(() => expect(dispatched).toHaveBeenCalledWith('comms.markNotSent', { eventId: event.id, campaignId: 'c1', emails: ['a@x.vn'] }));
  });

  it('the delivery log shows names and Gmail errors as text and marks imported rows', () => {
    const { container } = renderUi(
      withAppContext(
        <DeliveryLog
          data={{
            event,
            canSend: true,
            campaigns: [{ id: 'c1' as CampaignId, label: XSS }, { id: 'c0' as CampaignId, label: 'Thư gửi từ phần mềm cũ' }],
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
