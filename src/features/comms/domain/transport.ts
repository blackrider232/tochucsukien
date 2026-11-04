// The Gmail transport port and its HTTP implementation. The access token is
// passed in per call from memory (GIS token client); it is never written to
// storage, a log or a URL (m4a B08, m4c B13). Gmail errors are mapped to the
// dispatcher's kinds: 401 stops for re-auth, 429/5xx retry, quota stops.

import { buildMimeMessage, MimeError, toBase64Url, type MailMessage } from './mime';
import { TransportError, type SendFailure } from './dispatcher';

export interface GmailTransport {
  /** 'gmail' really sends; 'dev-fake' exists only under SCE_DEV_MEMORY and in tests. */
  readonly kind: 'gmail' | 'dev-fake';
  send(message: MailMessage): Promise<{ messageId: string }>;
}

export const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

function retryAfterMs(h: string | null): number | undefined {
  if (!h) return undefined;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.min(120_000, Math.max(0, secs * 1000));
  const at = Date.parse(h);
  return Number.isFinite(at) ? Math.min(120_000, Math.max(0, at - Date.now())) : undefined;
}

export async function failureFromResponse(res: Response): Promise<SendFailure> {
  let reason = '';
  let message = `Gmail trả lỗi HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: { message?: string; errors?: ReadonlyArray<{ reason?: string }>; status?: string } };
    reason = body.error?.errors?.[0]?.reason ?? body.error?.status ?? '';
    if (body.error?.message) message = `Gmail: ${body.error.message}`.slice(0, 300);
  } catch {
    // Not JSON: keep the status line.
  }
  const retryAfter = retryAfterMs(res.headers.get('retry-after'));
  if (res.status === 401) return { kind: 'auth', message: 'Phiên đăng nhập Google đã hết hạn. Vui lòng đăng nhập lại.' };
  if (/dailyLimitExceeded|quotaExceeded/i.test(reason)) return { kind: 'quota', message: 'Hòm thư đã hết hạn mức gửi trong ngày của Gmail.' };
  if (res.status === 429 || /rateLimitExceeded|userRateLimitExceeded|RESOURCE_EXHAUSTED/i.test(reason)) return { kind: 'rate', message, retryAfterMs: retryAfter };
  if (res.status === 403 && /insufficient|PERMISSION_DENIED|forbidden/i.test(reason)) return { kind: 'auth', message: 'Tài khoản Google chưa cấp quyền gửi thư (gmail.send).' };
  if (res.status === 413) return { kind: 'too_large', message: 'Thư quá lớn so với giới hạn của Gmail.' };
  if (res.status >= 500) return { kind: 'server', message, retryAfterMs: retryAfter };
  return { kind: 'invalid', message };
}

/** The message, or a TransportError the dispatcher does not retry: a refused header or an oversize message never reaches Gmail. */
function buildRaw(message: MailMessage): string {
  try {
    return buildMimeMessage(message);
  } catch (e) {
    if (e instanceof MimeError) throw new TransportError({ kind: e.kind === 'too_large' ? 'too_large' : 'invalid', message: e.message });
    throw e;
  }
}

export function gmailTransport(token: () => string | null, fetchImpl: typeof fetch = fetch): GmailTransport {
  return {
    kind: 'gmail',
    async send(message) {
      const raw = toBase64Url(buildRaw(message));
      const access = token();
      if (!access) throw new TransportError({ kind: 'auth', message: 'Chưa đăng nhập Google hoặc phiên đã hết hạn.' });
      let res: Response;
      try {
        res = await fetchImpl(GMAIL_SEND_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw }),
        });
      } catch {
        throw new TransportError({ kind: 'network', message: 'Không kết nối được Gmail.' });
      }
      if (!res.ok) throw new TransportError(await failureFromResponse(res));
      const body = (await res.json().catch(() => ({}))) as { id?: unknown };
      // Gmail accepted the request: the message has probably gone, so it must not be sent again on its own.
      if (typeof body.id !== 'string' || !body.id) throw new TransportError({ kind: 'network', message: 'Gmail nhận yêu cầu nhưng không trả mã thư.' });
      return { messageId: body.id };
    },
  };
}

export const DEV_FAKE_ID_PREFIX = 'dev-fake-';

/**
 * Builds the real MIME message (so size and header checks run) and sends nothing. A recipient whose address starts
 * with "loi" or "fail" fails as Gmail would refuse it, so the delivery log and "Gửi lại thư lỗi" can be exercised.
 */
export function fakeTransport(opts: { onSend?: (raw: string, message: MailMessage) => void } = {}): GmailTransport {
  let n = 0;
  return {
    kind: 'dev-fake',
    async send(message) {
      const raw = buildRaw(message);
      opts.onSend?.(raw, message);
      if (message.to.some((a) => /^(loi|fail)/.test(a.email))) {
        throw new TransportError({ kind: 'invalid', message: 'Gmail: Invalid To header (môi trường phát triển)' });
      }
      n += 1;
      return { messageId: `${DEV_FAKE_ID_PREFIX}${Date.now().toString(36)}-${n}` };
    },
  };
}
