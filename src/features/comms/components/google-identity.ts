'use client';

// The port the Gmail sign-in goes through, and its Google Identity Services
// implementation: the GIS token client (implicit flow, consent popup) and the
// userinfo call that says which address the token belongs to. Tests and the
// dev memory runtime never construct it: tests pass a fake, and the dev page
// uses the fake transport without signing in.

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SCOPES = 'https://www.googleapis.com/auth/gmail.send openid email';
const USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo';

export type TokenAnswer = { ok: true; token: string; expiresInSec: number } | { ok: false; message: string };

export interface GoogleIdentity {
  /** Google's consent popup for `clientId`, the sender address as the hint. */
  requestToken(clientId: string, hint: string | null): Promise<TokenAnswer>;
  /** The address the token belongs to, or null when Google does not say. */
  emailOf(token: string): Promise<string | null>;
  revoke(token: string): void;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
}
interface Gis {
  accounts: {
    oauth2: {
      initTokenClient(o: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type?: string }) => void }): {
        requestAccessToken(o?: { prompt?: string; login_hint?: string }): void;
      };
      revoke(token: string, done?: () => void): void;
    };
  };
}

let loading: Promise<Gis> | null = null;
function loadGis(): Promise<Gis> {
  const g = (window as { google?: Gis }).google;
  if (g?.accounts?.oauth2) return Promise.resolve(g);
  loading ??= new Promise<Gis>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => {
      const loaded = (window as { google?: Gis }).google;
      if (loaded) resolve(loaded);
      else reject(new Error('gis'));
    };
    s.onerror = () => {
      loading = null;
      reject(new Error('gis'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export const gisIdentity: GoogleIdentity = {
  async requestToken(clientId, hint) {
    let gis: Gis;
    try {
      gis = await loadGis();
    } catch {
      return { ok: false, message: 'Không tải được dịch vụ đăng nhập Google. Kiểm tra kết nối mạng.' };
    }
    return new Promise<TokenAnswer>((resolve) => {
      const client = gis.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        error_callback: (e) => resolve({ ok: false, message: e.type === 'popup_closed' ? 'Đã đóng cửa sổ đăng nhập Google.' : 'Đăng nhập Google không thành công.' }),
        callback: (r) =>
          resolve(
            r.access_token
              ? { ok: true, token: r.access_token, expiresInSec: Number(r.expires_in ?? 3600) }
              : { ok: false, message: r.error === 'access_denied' ? 'Bạn chưa cấp quyền gửi thư cho ứng dụng.' : 'Đăng nhập Google không thành công.' },
          ),
      });
      client.requestAccessToken(hint ? { login_hint: hint } : {});
    });
  },
  async emailOf(token) {
    try {
      const res = await fetch(USERINFO, { headers: { Authorization: `Bearer ${token}` } });
      const info = (await res.json()) as { email?: string };
      return res.ok && info.email ? info.email : null;
    } catch {
      return null;
    }
  },
  revoke(token) {
    (window as { google?: Gis }).google?.accounts.oauth2.revoke(token);
  },
};
