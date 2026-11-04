'use client';

// "Gửi thư mời" (m4c §1.10). The sender, the recipients, the composer and the
// send loop. Gmail is called from the browser with an in-memory token, as the
// Google account signed in on this card. runCampaign claims the addresses
// (comms.startCampaign), sends to the claimed ones, records each outcome as
// Gmail answered it and releases what a stopped run did not use. There is no
// sandbox (decision 16): "Gửi thử cho tôi" really sends one message to the
// officer signed in to the app; the dev memory runtime swaps in the fake
// transport and labels it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { Alert, Badge, Button, Form, FormField, LinkTabs, SectionCard, Select, qrPngDataUrl, useDialogs, useToast, useZodForm } from '@/components/ui';
import { newId } from '@/core/brand';
import { encodeCheckinPayload } from '@/core/checkin-code';
import { useCommand } from '@/core/commands';
import { formatVNTime } from '@/core/dates';
import { resolveGoogleClientId } from '../domain/client-id';
import {
  composeSchema, dataUrlBytes, fromAddress, invitationMessage, mergeDataFor, PERSONAL, selectedRecipients, senderChoice, type Compose, type ManualRecipient, type MessageContext, type Recipient,
} from '../domain/compose';
import { runCampaign } from '../domain/campaign';
import { abortableSleep, TransportError } from '../domain/dispatcher';
import { emailTemplate, type EmailTemplateKey } from '../domain/email-templates';
import { checkTags } from '../domain/merge';
import type { MailMessage } from '../domain/mime';
import type { InvitationScreenData } from '../domain/screen';
import { fakeTransport, gmailTransport } from '../domain/transport';
import { ComposerFields } from './composer-fields';
import { PreviewDialog } from './preview-dialog';
import { RecipientsPanel } from './recipients-panel';
import { SendPanel, type LogLine, type RunState } from './send-panel';
import { useGoogleToken } from './use-google-token';

const FILTER_OF: Record<string, string> = { all: 'all', pending: 'pending', attending: 'attending' };

export function InvitationsPage({ data }: { data: InvitationScreenData }) {
  const run = useCommand();
  const toast = useToast();
  const dialogs = useDialogs();
  const first = emailTemplate('invitation');
  // A retry reopens the failed campaign's own message, so it stays the same campaign.
  const message = data.retry?.message ?? { subject: first.subject, body: first.html, attachQr: first.attachQr };
  const defaultMailbox = data.mailboxes.find((m) => m.isDefault) ?? data.mailboxes[0];
  const form = useZodForm(composeSchema, {
    defaultValues: { senderId: defaultMailbox?.id ?? PERSONAL, templateKey: 'invitation', subject: message.subject, body: message.body, contactPhone: '', attachQr: message.attachQr },
  });
  const values = useWatch({ control: form.control }) as Compose;

  const [guestIds, setGuestIds] = useState<ReadonlySet<string>>(() => new Set(data.retry?.guestIds ?? []));
  const [manual, setManual] = useState<ReadonlyArray<ManualRecipient>>(() => data.retry?.manual.map((m) => ({ ...m, organization: '' })) ?? []);
  const [manualIds, setManualIds] = useState<ReadonlySet<string>>(() => new Set(data.retry?.manual.map((m) => m.email) ?? []));
  const [rsvpFilter, setRsvpFilter] = useState('all');
  const [runState, setRunState] = useState<RunState>({ kind: 'idle' });
  const [log, setLog] = useState<LogLine[]>([]);
  const [preview, setPreview] = useState<MailMessage | null>(null);
  const [testing, setTesting] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const choice = senderChoice(values.senderId, data.mailboxes, (m) => resolveGoogleClientId(m, { googleClientId: data.googleClientId }));
  const { current: currentToken, ...google } = useGoogleToken(data.devTransport ? null : (choice?.clientId ?? null), values.senderId);
  const signedIn = data.devTransport ? (choice?.kind === 'mailbox' ? choice.mailbox.email : data.officer.email) : google.state.kind === 'ready' ? google.state.email : null;
  const from = choice ? fromAddress(choice, signedIn, data.officer.name) : ({ ok: false, message: 'Chọn hòm thư gửi.' } as const);
  const transport = useMemo(() => (data.devTransport ? fakeTransport() : gmailTransport(currentToken)), [data.devTransport, currentToken]);
  const recipients = useMemo(() => selectedRecipients(data.guests, guestIds, manual, manualIds), [data.guests, guestIds, manual, manualIds]);
  const running = runState.kind === 'running';

  const blocker = !choice
    ? 'Chưa có hòm thư gửi. Quản trị viên thêm hòm thư ở Cài đặt, hoặc chọn tài khoản Google cá nhân.'
    : !data.devTransport && !choice.clientId
      ? 'Chưa cấu hình Google OAuth Client ID cho hòm thư này. Quản trị viên cài đặt ở mục Hòm thư Google trong Cài đặt.'
      : from.ok ? null : from.message;

  const ctx: MessageContext | null = from.ok ? { event: data.event, from: from.from, officerName: data.officer.name, formUrl: data.formUrl, org: data.org } : null;
  const sample: Recipient = recipients[0] ?? { email: data.officer.email, name: data.officer.name, title: '', organization: data.org.agencyName, group: null, guestId: null, seatCode: null, checkinCode: null };
  const previewCtx: MessageContext = ctx ?? { event: data.event, from: { name: choice?.kind === 'mailbox' ? choice.mailbox.displayName : data.officer.name, email: choice?.kind === 'mailbox' ? choice.mailbox.email : data.officer.email }, officerName: data.officer.name, formUrl: data.formUrl, org: data.org };
  const check = checkTags({ subject: values.subject ?? '', html: values.body ?? '' }, mergeDataFor(sample, values, previewCtx));

  // A new template replaces subject and body; ask first when they were edited.
  const lastTemplate = useRef<EmailTemplateKey>('invitation');
  useEffect(() => {
    const next = values.templateKey;
    if (!next || next === lastTemplate.current) return;
    const apply = () => {
      const t = emailTemplate(next);
      lastTemplate.current = next;
      form.setValue('subject', t.subject);
      form.setValue('body', t.html);
      form.setValue('attachQr', t.attachQr);
      setRsvpFilter(FILTER_OF[t.suggestedFilter] ?? 'all');
      form.resetField('subject', { defaultValue: t.subject });
      form.resetField('body', { defaultValue: t.html });
    };
    const edited = form.getFieldState('subject').isDirty || form.getFieldState('body').isDirty;
    if (!edited) return apply();
    void dialogs.confirm({ title: 'Thay mẫu thư?', text: 'Tiêu đề và nội dung đang soạn sẽ bị thay bằng mẫu mới.', confirmLabel: 'Thay mẫu', tone: 'warning' }).then((ok) => {
      if (ok) apply();
      else form.setValue('templateKey', lastTemplate.current);
    });
  }, [values.templateKey, form, dialogs]);

  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  const addLog = useCallback((tone: LogLine['tone'], text: string) => {
    setLog((l) => [...l, { id: l.length + 1, at: new Date().toLocaleTimeString('vi-VN', { hour12: false }), tone, text }]);
  }, []);

  const messageFor = useCallback(
    async (r: Recipient, compose: Compose, c: MessageContext, opts: { test?: boolean } = {}) => {
      const qr = compose.attachQr && r.guestId ? dataUrlBytes(await qrPngDataUrl(encodeCheckinPayload(data.event.id, r.guestId), 300)) : null;
      return invitationMessage(r, compose, c, qr, opts.test ? { test: true, to: { name: data.officer.name, email: data.officer.email } } : {});
    },
    [data.event.id, data.officer],
  );

  const send = async (list: ReadonlyArray<Recipient>, takeOver = false) => {
    if (!ctx || list.length === 0) return;
    const compose = form.getValues();
    const controller = new AbortController();
    abort.current = controller;
    setRunState({ kind: 'running', total: list.length, done: 0, current: null, stopping: false });
    addLog('info', `${takeOver ? 'Tiếp quản và gửi' : 'Bắt đầu gửi'} ${list.length} thư từ ${ctx.from.email}`);
    const subjectOf = (r: Recipient) => invitationMessage(r, compose, ctx, null).subject;
    const report = await runCampaign({
      recipients: list,
      run: { token: newId<'CampaignRun'>(), takeOver },
      signal: controller.signal,
      sleep: abortableSleep,
      api: {
        claim: async (chunk, r) =>
          (await run('comms.startCampaign', {
            eventId: data.event.id,
            senderEmail: ctx.from.email,
            subject: compose.subject,
            body: compose.body,
            attachQr: compose.attachQr,
            runToken: r.token,
            takeOver: r.takeOver,
            recipients: chunk.map((x) => ({ guestId: x.guestId, email: x.email, recipientName: x.name })),
          })) ?? null,
        async record(campaignId, runToken, o) {
          const result = o.kind === 'sent'
            ? { guestId: o.recipient.guestId, email: o.recipient.email, recipientName: o.recipient.name, status: 'sent' as const, providerMessageId: o.messageId, error: null }
            : { guestId: o.recipient.guestId, email: o.recipient.email, recipientName: o.recipient.name, status: o.kind === 'unknown' ? ('unknown' as const) : ('error' as const), providerMessageId: null, error: o.failure.message.slice(0, 500) };
          const saved = await run('comms.recordDeliveries', { eventId: data.event.id, campaignId, runToken, senderEmail: ctx.from.email, subject: subjectOf(o.recipient), results: [result] });
          if (!saved) return false;
          addLog(
            o.kind === 'sent' ? 'success' : 'error',
            o.kind === 'sent' ? `Đã gửi: ${o.recipient.name || o.recipient.email} <${o.recipient.email}>` : o.kind === 'unknown' ? `Không rõ đã gửi: ${o.recipient.email}: ${o.failure.message}` : `Lỗi: ${o.recipient.email}: ${o.failure.message}`,
          );
          if (saved.notInvited > 0) addLog('error', `Chưa cập nhật được trạng thái giấy mời của ${o.recipient.name || o.recipient.email}; hãy cập nhật ở danh sách khách mời.`);
          return true;
        },
        async release(campaignId, runToken, emails) {
          await run('comms.releaseDeliveries', { eventId: data.event.id, campaignId, runToken, emails });
        },
        renew: async (campaignId, runToken) => (await run('comms.renewClaims', { eventId: data.event.id, campaignId, runToken }))?.held ?? null,
      },
      async send(r) {
        let message: MailMessage;
        try {
          message = await messageFor(r, compose, ctx);
        } catch (e) {
          throw new TransportError({ kind: 'invalid', message: e instanceof Error ? e.message : 'Không tạo được thư' });
        }
        return transport.send(message);
      },
      onProgress: (done, total, current) => setRunState((s) => (s.kind === 'running' ? { ...s, done, total, current } : s)),
    });
    if (report.alreadySent.length > 0) addLog('info', `Bỏ qua ${report.alreadySent.length} người đã nhận thư này: ${report.alreadySent.map((r) => r.email).join(', ')}`);
    if (report.inFlight.length > 0) addLog('info', `Bỏ qua ${report.inFlight.length} người đang được gửi ở phiên khác: ${report.inFlight.map((r) => r.email).join(', ')}`);
    if (report.ownInFlight.length > 0) addLog('info', `Bỏ qua ${report.ownInFlight.length} người đang được gửi ở một phiên khác của bạn: ${report.ownInFlight.map((r) => r.email).join(', ')}`);
    abort.current = null;
    // Whoever has the message leaves the selection; the server refuses them again anyway (comms.startCampaign).
    const delivered = new Set<string>([...report.sent, ...report.unrecorded, ...report.alreadySent.map((recipient) => ({ recipient }))].map((s) => s.recipient.email));
    setGuestIds((ids) => new Set([...ids].filter((id) => !list.some((r) => r.guestId === id && delivered.has(r.email)))));
    setManualIds((ids) => new Set([...ids].filter((email) => !delivered.has(email))));
    setRunState({ kind: 'finished', report });
    addLog('info', `Hoàn tất: ${report.sent.length} thành công, ${report.failed.length} lỗi, ${report.skipped.length} chưa gửi.`);
  };

  const start = async () => {
    if (!ctx) return;
    const ok = await dialogs.confirm({
      title: 'Xác nhận phát hành thư hàng loạt?',
      text: `Bạn đang chuẩn bị gửi email tới ${recipients.length} người nhận từ ${ctx.from.email}. Mỗi thư được giãn cách 1,2 giây.`,
      confirmLabel: 'Bắt đầu gửi',
      cancelLabel: 'Kiểm tra lại',
      tone: 'primary',
    });
    if (ok) await send(recipients);
  };

  const takeOver = async (list: ReadonlyArray<Recipient>) => {
    const ok = await dialogs.confirm({
      title: 'Tiếp quản phiên gửi khác?',
      text: `${list.length} người nhận đang được giữ chỗ bởi một phiên gửi khác của bạn (một tab khác, hoặc trang này trước khi tải lại). Chỉ tiếp quản khi chắc chắn phiên đó đã đóng hoặc đã dừng. Nếu phiên đó vẫn đang gửi, hoặc đã gửi một thư mà chưa kịp ghi nhật ký, người nhận có thể nhận thư này hai lần.`,
      confirmLabel: 'Tiếp quản và gửi',
      cancelLabel: 'Để phiên kia gửi',
      tone: 'warning',
    });
    if (ok) await send(list, true);
  };

  const sendTest = async () => {
    if (!data.canSend) return;
    const valid = await form.trigger();
    if (!valid || !ctx) return;
    setTesting(true);
    try {
      const message = await messageFor(sample, form.getValues(), ctx, { test: true });
      await transport.send(message);
      toast.success(`Đã gửi thư thử tới ${data.officer.email}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gửi thư thử không thành công');
    } finally {
      setTesting(false);
    }
  };

  const openPreview = async () => {
    if (!(await form.trigger())) return;
    setPreview(await messageFor(sample, form.getValues(), previewCtx));
  };

  const report = runState.kind === 'finished' ? runState.report : null;
  const mailboxOptions = [
    ...data.mailboxes.map((m) => ({ value: m.id as string, label: `${m.displayName} <${m.email}>${m.isDefault ? ' (mặc định)' : ''}` })),
    { value: PERSONAL, label: 'Tài khoản Google cá nhân của tôi' },
  ];

  return (
    <div className="space-y-4">
      <LinkTabs
        label="Thư mời"
        variant="underline"
        activeId="compose"
        items={[
          { id: 'compose', label: 'Soạn và gửi', href: `/events/${data.event.id}/invitations`, icon: 'mail' },
          { id: 'log', label: 'Nhật ký gửi', href: `/events/${data.event.id}/invitations/log`, icon: 'list-check' },
        ]}
      />
      {!data.canSend && <Alert tone="info">{'Bạn chỉ có quyền xem. Gửi thư cần quyền "Gửi thư mời" của sự kiện này.'}</Alert>}
      {data.retry && (
        <Alert tone="info">
          {`Đã chọn lại ${data.retry.guestIds.length + data.retry.manual.length} người nhận bị lỗi ở lần gửi trước. `}
          {data.retry.message
            ? 'Tiêu đề và nội dung là của đợt gửi đó; sửa chúng sẽ thành một đợt gửi mới. Nhập lại số điện thoại liên hệ nếu thư có dùng.'
            : 'Đợt gửi này không lưu mẫu thư (dữ liệu phần mềm cũ), nên thư được soạn lại từ mẫu mặc định.'}
        </Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-5">
          <RecipientsPanel
            guests={data.guests}
            guestIds={guestIds}
            onGuestIds={setGuestIds}
            manual={manual}
            manualIds={manualIds}
            onManual={(list, ids) => {
              setManual(list);
              setManualIds(ids);
            }}
            rsvpFilter={rsvpFilter}
            onRsvpFilter={setRsvpFilter}
            officer={data.officer}
            agencyName={data.org.agencyName}
            total={recipients.length}
            disabled={running}
          />
        </div>
        <Form form={form} onSubmit={start} className="min-w-0 space-y-4 lg:col-span-7">
          <SectionCard title="Hòm thư gửi" subtitle="Thư đi qua Gmail của tài khoản Google bạn đăng nhập ở đây (không phải tài khoản phần mềm), nên tài khoản đó phải đúng là hòm thư đã chọn" icon="mail">
            <div className="space-y-3">
              <FormField label="Gửi từ hòm thư" name="senderId" required>
                <Select name="senderId" options={mailboxOptions} />
              </FormField>
              {data.devTransport ? (
                <Alert tone="warning" title="Môi trường phát triển">
                  Thư được tạo đầy đủ (MIME, kích thước, mã QR) nhưng không rời khỏi máy. Địa chỉ bắt đầu bằng &quot;loi&quot; sẽ bị từ chối để thử nhật ký lỗi.
                </Alert>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {google.state.kind === 'ready' ? (
                    <>
                      <Badge tone="emerald" icon="circle-check">{`Đã kết nối: ${google.state.email}`}</Badge>
                      <span className="text-xs text-ink-muted">{`Hết hạn lúc ${formatVNTime(new Date(google.state.expiresAt).toISOString() as never)}`}</span>
                      <Button variant="ghost" icon="log-out" disabled={running} onClick={google.signOut}>Đăng xuất Google</Button>
                    </>
                  ) : (
                    <>
                      <Badge tone="slate">Chưa kết nối hòm thư Google</Badge>
                      <Button variant="secondary" icon="lock" loading={google.state.kind === 'signing_in'} disabled={!choice?.clientId || running} onClick={() => void google.signIn(choice?.kind === 'mailbox' ? choice.mailbox.email : null)}>
                        Đăng nhập với Google
                      </Button>
                    </>
                  )}
                  {google.state.kind === 'error' && <p className="w-full text-sm text-danger-ink">{google.state.message}</p>}
                </div>
              )}
            </div>
          </SectionCard>
          <ComposerFields check={check} disabled={running} />
          <SendPanel
            run={runState}
            log={log}
            recipients={recipients.length}
            canStart={data.canSend && !blocker && recipients.length > 0 && !running}
            canTest={data.canSend && !blocker}
            blocker={data.canSend ? blocker : null}
            testing={testing}
            onPreview={() => void openPreview()}
            onTest={() => void sendTest()}
            onStop={() => {
              abort.current?.abort();
              setRunState((s) => (s.kind === 'running' ? { ...s, stopping: true } : s));
            }}
            onRetryFailed={() => report && void send(report.failed.map((f) => f.recipient))}
            onResumeSkipped={() => report && void send(report.skipped.map((s) => s.recipient))}
            onTakeOver={() => report && void takeOver(report.ownInFlight)}
          />
        </Form>
      </div>
      {preview && <PreviewDialog message={preview} onClose={() => setPreview(null)} testing={testing} onTest={data.canSend && !blocker ? () => void sendTest() : null} />}
    </div>
  );
}
