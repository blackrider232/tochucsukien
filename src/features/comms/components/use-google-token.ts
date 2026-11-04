'use client';

// Google Identity Services token client. The access token lives in a ref of
// this hook and nowhere else: no storage, no URL, no log (m4a B08, m4c B13).
// It is tied to one client id and one sender, expires with expires_in, and
// is revoked on "Đăng xuất Google". The signed-in address is read from
// userinfo, so a send can refuse a From the account does not own (m4a B29).

import { useCallback, useEffect, useRef, useState } from 'react';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SCOPES = 'https://www.googleapis.com/auth/gmail.send openid email';
const USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo';
/** A token this close to expiry is treated as expired, so a send never starts with one about to lapse. */
const EXPIRY_MARGIN_MS = 60_000;

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}
interface Gis {
  accounts: {
    oauth2: {
      initTokenClient(o: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type?: string; message?: string }) => void }): {
        requestAccessToken(o?: { prompt?: string; login_hint?: string }): void;
      };
      revoke(token: string, done?: () => void): void;
    };
  };
}

export type GoogleState =
  | { kind: 'signed_out' }
  | { kind: 'signing_in' }
  | { kind: 'ready'; email: string; expiresAt: number }
  | { kind: 'error'; message: string };

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

export function useGoogleToken(clientId: string | null, senderKey: string) {
  const token = useRef<{ value: string; expiresAt: number } | null>(null);
  const [state, setState] = useState<GoogleState>({ kind: 'signed_out' });

  const drop = useCallback(() => {
    const t = token.current;
    token.current = null;
    if (t) (window as { google?: Gis }).google?.accounts.oauth2.revoke(t.value);
    setState({ kind: 'signed_out' });
  }, []);

  // A token belongs to the client id and the sender it was asked for.
  useEffect(() => drop, [clientId, senderKey, drop]);

  const signIn = useCallback(
    async (hint: string | null) => {
      if (!clientId) return;
      setState({ kind: 'signing_in' });
      let gis: Gis;
      try {
        gis = await loadGis();
      } catch {
        setState({ kind: 'error', message: 'Không tải được dịch vụ đăng nhập Google. Kiểm tra kết nối mạng.' });
        return;
      }
      const client = gis.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        error_callback: (e) => setState({ kind: 'error', message: e.type === 'popup_closed' ? 'Đã đóng cửa sổ đăng nhập Google.' : 'Đăng nhập Google không thành công.' }),
        callback: async (r) => {
          if (!r.access_token) {
            setState({ kind: 'error', message: r.error === 'access_denied' ? 'Bạn chưa cấp quyền gửi thư cho ứng dụng.' : 'Đăng nhập Google không thành công.' });
            return;
          }
          const expiresAt = Date.now() + Number(r.expires_in ?? 3600) * 1000;
          try {
            const res = await fetch(USERINFO, { headers: { Authorization: `Bearer ${r.access_token}` } });
            const info = (await res.json()) as { email?: string; email_verified?: boolean };
            if (!res.ok || !info.email) throw new Error('userinfo');
            token.current = { value: r.access_token, expiresAt };
            setState({ kind: 'ready', email: info.email.toLowerCase(), expiresAt });
          } catch {
            gis.accounts.oauth2.revoke(r.access_token);
            setState({ kind: 'error', message: 'Không đọc được địa chỉ email của tài khoản Google.' });
          }
        },
      });
      client.requestAccessToken(hint ? { login_hint: hint } : {});
    },
    [clientId],
  );

  /** The token, or null when absent or about to expire; then the state falls back to signed out. */
  const current = useCallback((): string | null => {
    const t = token.current;
    if (!t) return null;
    if (t.expiresAt - EXPIRY_MARGIN_MS <= Date.now()) {
      token.current = null;
      setState({ kind: 'error', message: 'Phiên đăng nhập Google đã hết hạn. Vui lòng đăng nhập lại.' });
      return null;
    }
    return t.value;
  }, []);

  return { state, signIn, signOut: drop, current };
}
