import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoogleIdentity, TokenAnswer } from '../components/google-identity';
import { EXPIRY_MARGIN_MS, useGoogleToken } from '../components/use-google-token';

/** A Google that answers the popup when the test says so. */
function fakeGoogle(email: string | null = 'btc@x.vn') {
  const pending: Array<(a: TokenAnswer) => void> = [];
  const identity: GoogleIdentity & { revoked: string[]; answer(a: TokenAnswer): Promise<void> } = {
    revoked: [],
    requestToken: vi.fn(() => new Promise<TokenAnswer>((resolve) => pending.push(resolve))),
    emailOf: vi.fn(async () => email),
    revoke(token) {
      identity.revoked.push(token);
    },
    async answer(a) {
      await act(async () => {
        pending.shift()!(a);
      });
    },
  };
  return identity;
}

const render = (google: GoogleIdentity, sender = 'm1') =>
  renderHook(({ sender: s }) => useGoogleToken('1-abc.apps.googleusercontent.com', s, google), { initialProps: { sender } });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useGoogleToken', () => {
  it('keeps the token in memory only and reports the account Google names', async () => {
    const stored = vi.spyOn(Storage.prototype, 'setItem');
    const google = fakeGoogle('BTC@X.vn');
    const { result } = render(google);
    act(() => void result.current.signIn('btc@x.vn'));
    expect(google.requestToken).toHaveBeenCalledWith('1-abc.apps.googleusercontent.com', 'btc@x.vn');
    await google.answer({ ok: true, token: 'tok-secret', expiresInSec: 3600 });
    expect(result.current.state).toMatchObject({ kind: 'ready', email: 'btc@x.vn' });
    expect(result.current.current()).toBe('tok-secret');
    expect(stored).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain('tok-secret');
  });

  it('treats a token within the margin of its expiry as gone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const google = fakeGoogle();
    const { result } = render(google);
    act(() => void result.current.signIn(null));
    await google.answer({ ok: true, token: 'tok', expiresInSec: 600 });
    vi.setSystemTime(Date.now() + 600_000 - EXPIRY_MARGIN_MS - 1000);
    expect(result.current.current()).toBe('tok');
    vi.setSystemTime(Date.now() + 2000);
    act(() => void expect(result.current.current()).toBeNull());
    expect(result.current.state).toMatchObject({ kind: 'error', message: expect.stringContaining('hết hạn') });
  });

  it('revokes on sign-out and when the sender changes', async () => {
    const google = fakeGoogle();
    const { result, rerender } = render(google);
    act(() => void result.current.signIn(null));
    await google.answer({ ok: true, token: 'tok-1', expiresInSec: 3600 });
    act(() => result.current.signOut());
    expect(google.revoked).toEqual(['tok-1']);
    expect(result.current.current()).toBeNull();

    act(() => void result.current.signIn(null));
    await google.answer({ ok: true, token: 'tok-2', expiresInSec: 3600 });
    rerender({ sender: 'm2' });
    expect(google.revoked).toEqual(['tok-1', 'tok-2']);
    expect(result.current.state).toEqual({ kind: 'signed_out' });
  });

  it('drops a token whose popup was answered after the sender changed', async () => {
    const google = fakeGoogle();
    const { result, rerender } = render(google);
    act(() => void result.current.signIn(null));
    rerender({ sender: 'm2' });
    await google.answer({ ok: true, token: 'late', expiresInSec: 3600 });
    expect(google.revoked).toEqual(['late']);
    expect(result.current.current()).toBeNull();
    expect(result.current.state).toEqual({ kind: 'signed_out' });
  });

  it('revokes a token whose account Google will not name', async () => {
    const google = fakeGoogle(null);
    const { result } = render(google);
    act(() => void result.current.signIn(null));
    await google.answer({ ok: true, token: 'tok', expiresInSec: 3600 });
    expect(google.revoked).toEqual(['tok']);
    expect(result.current.state).toMatchObject({ kind: 'error' });
    expect(result.current.current()).toBeNull();
  });
});
