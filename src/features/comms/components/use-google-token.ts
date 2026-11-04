'use client';

// The Gmail access token of the compose screen. It lives in a ref of this
// hook and nowhere else: no storage, no URL, no log (m4a B08, m4c B13). It is
// tied to one client id and one sender, expires with expires_in, and is
// revoked on "Đăng xuất Google" and whenever the sender changes. The
// signed-in address is read back from Google, so a send can refuse a From the
// account does not own (m4a B29, m4c B46).

import { useCallback, useEffect, useRef, useState } from 'react';
import { gisIdentity, type GoogleIdentity } from './google-identity';

/** A token this close to expiry is treated as expired, so a send never starts with one about to lapse. */
export const EXPIRY_MARGIN_MS = 60_000;

export type GoogleState =
  | { kind: 'signed_out' }
  | { kind: 'signing_in' }
  | { kind: 'ready'; email: string; expiresAt: number }
  | { kind: 'error'; message: string };

export function useGoogleToken(clientId: string | null, senderKey: string, identity: GoogleIdentity = gisIdentity) {
  const token = useRef<{ value: string; expiresAt: number } | null>(null);
  // Bumped by every sign-in and sign-out, so a popup answered after the sender changed is dropped.
  const attempt = useRef(0);
  const [state, setState] = useState<GoogleState>({ kind: 'signed_out' });

  const drop = useCallback(() => {
    attempt.current += 1;
    const t = token.current;
    token.current = null;
    if (t) identity.revoke(t.value);
    setState({ kind: 'signed_out' });
  }, [identity]);

  // A token belongs to the client id and the sender it was asked for.
  useEffect(() => drop, [clientId, senderKey, drop]);

  const signIn = useCallback(
    async (hint: string | null) => {
      if (!clientId) return;
      const mine = (attempt.current += 1);
      setState({ kind: 'signing_in' });
      const answer = await identity.requestToken(clientId, hint);
      if (!answer.ok) {
        if (mine === attempt.current) setState({ kind: 'error', message: answer.message });
        return;
      }
      const expiresAt = Date.now() + answer.expiresInSec * 1000;
      const email = await identity.emailOf(answer.token);
      if (mine !== attempt.current || !email) {
        identity.revoke(answer.token);
        if (mine === attempt.current) setState({ kind: 'error', message: 'Không đọc được địa chỉ email của tài khoản Google.' });
        return;
      }
      token.current = { value: answer.token, expiresAt };
      setState({ kind: 'ready', email: email.toLowerCase(), expiresAt });
    },
    [clientId, identity],
  );

  /** The token, or null when absent or about to expire; then the state says to sign in again. */
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
