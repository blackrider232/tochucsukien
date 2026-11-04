// Browser-side Supabase Auth flows for the sign-in screens and the profile page.
// They cannot be commands: dispatch needs a finished session, and sign-in,
// sign-up, recovery and the MFA step run before one exists. @supabase/ssr keeps
// the session in cookies, so the next request's proxy and requestContext() see
// it. Every result is a Vietnamese message chosen here, never the server's text
// (core B29). Role and status are never sent: the auth.users trigger creates a
// pending 'user' profile whatever the metadata says (core B1/B2).

import { createBrowserClient } from '@supabase/ssr';
import { createClient, type AuthError, type SupabaseClient } from '@supabase/supabase-js';
import { devMemoryEnabled } from '@/core/dev/mode';
import type { DepartmentName } from '@/core/vocab';
import { supabaseEnv } from './env';

export type FlowResult<T = null> = { ok: true; value: T } | { ok: false; message: string };

export interface TotpFactor {
  id: string;
  friendlyName: string | null;
  createdAt: string;
}
export interface TotpEnrollment {
  factorId: string;
  /** otpauth:// URI the QR encodes. */
  uri: string;
  /** Base32 secret for typing into the app by hand. */
  secret: string;
}

export const AUTH_UNAVAILABLE = 'Chưa kết nối máy chủ xác thực (Supabase). Trong chế độ dev, đổi vai trò tại /dev/role.';
const NETWORK = 'Không kết nối được máy chủ. Vui lòng thử lại.';
const GENERIC = 'Không thực hiện được. Vui lòng thử lại.';

const MESSAGES: Readonly<Record<string, string>> = {
  invalid_credentials: 'Sai email hoặc mật khẩu.',
  email_not_confirmed: 'Email chưa được xác nhận. Mở thư xác nhận trong hộp thư của bạn rồi đăng nhập lại.',
  user_banned: 'Tài khoản đã bị khóa.',
  user_already_exists: 'Email này đã có tài khoản. Đăng nhập hoặc đặt lại mật khẩu.',
  email_exists: 'Email này đã có tài khoản. Đăng nhập hoặc đặt lại mật khẩu.',
  signup_disabled: 'Hệ thống đang tạm ngừng đăng ký. Liên hệ quản trị viên để được cấp tài khoản.',
  weak_password: 'Mật khẩu chưa đủ mạnh. Dùng ít nhất 8 ký tự, có chữ và số.',
  same_password: 'Mật khẩu mới phải khác mật khẩu hiện tại.',
  over_request_rate_limit: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
  over_email_send_rate_limit: 'Đã gửi quá nhiều thư. Vui lòng thử lại sau ít phút.',
  email_address_invalid: 'Email không hợp lệ.',
  session_not_found: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  session_expired: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  reauthentication_needed: 'Mật khẩu hiện tại không đúng.',
  reauthentication_not_valid: 'Mật khẩu hiện tại không đúng.',
  insufficient_aal: 'Cần nhập mã xác thực hai lớp trước khi thực hiện thao tác này.',
  mfa_verification_failed: 'Mã xác thực không đúng hoặc đã hết hạn.',
  mfa_verification_rejected: 'Mã xác thực không đúng hoặc đã hết hạn.',
  mfa_challenge_expired: 'Mã xác thực đã hết hạn. Nhập mã mới trên ứng dụng.',
  mfa_factor_not_found: 'Thiết lập xác thực đã hết hạn. Bắt đầu lại.',
  too_many_enrolled_mfa_factors: 'Tài khoản đã có quá nhiều thiết bị xác thực. Gỡ bớt trước khi thêm.',
  mfa_totp_enroll_not_enabled: 'Máy chủ chưa bật xác thực TOTP. Liên hệ quản trị viên.',
  otp_expired: 'Liên kết đã hết hạn. Yêu cầu gửi lại.',
};

function failed(error: AuthError | null, overrides: Readonly<Record<string, string>> = {}): { ok: false; message: string } {
  const code = error?.code ?? '';
  if (overrides[code]) return { ok: false, message: overrides[code] };
  if (MESSAGES[code]) return { ok: false, message: MESSAGES[code] };
  if (error?.name === 'AuthRetryableFetchError' || error?.status === 0) return { ok: false, message: NETWORK };
  return { ok: false, message: GENERIC };
}

let client: SupabaseClient | null = null;
function auth(): SupabaseClient['auth'] | null {
  if (devMemoryEnabled()) return null;
  const env = supabaseEnv();
  if (!env) return null;
  client ??= createBrowserClient(env.url, env.publishableKey);
  return client.auth;
}

/** False in the dev memory runtime and without Supabase configured: the screens say so instead of failing. */
export function authAvailable(): boolean {
  return !devMemoryEnabled() && supabaseEnv() !== null;
}

async function attempt<T>(fn: (a: SupabaseClient['auth']) => Promise<FlowResult<T>>): Promise<FlowResult<T>> {
  const a = auth();
  if (!a) return { ok: false, message: AUTH_UNAVAILABLE };
  try {
    return await fn(a);
  } catch {
    return { ok: false, message: NETWORK };
  }
}

const callbackUrl = (next: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

export function signInWithPassword(email: string, password: string): Promise<FlowResult> {
  return attempt(async (a) => {
    const { error } = await a.signInWithPassword({ email, password });
    return error ? failed(error) : { ok: true, value: null };
  });
}

/** Leaves for Google; /auth/callback exchanges the code. A first Google sign-in gets a pending profile like any sign-up. */
export function signInWithGoogle(next: string): Promise<FlowResult> {
  return attempt(async (a) => {
    const { error } = await a.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackUrl(next) } });
    return error ? failed(error) : { ok: true, value: null };
  });
}

/**
 * Metadata carries only the display name and a self-registerable department, which
 * the trigger re-checks against sce_tcsk_departments. 'signed_in' when the project
 * does not ask for email confirmation; the account is pending either way.
 */
export function signUp(input: { email: string; password: string; fullname: string; department: DepartmentName }): Promise<FlowResult<'confirm_email' | 'signed_in'>> {
  return attempt(async (a) => {
    const { data, error } = await a.signUp({
      email: input.email,
      password: input.password,
      options: { data: { fullname: input.fullname, department: input.department }, emailRedirectTo: callbackUrl('/pending') },
    });
    if (error) return failed(error);
    return { ok: true, value: data.session ? 'signed_in' : 'confirm_email' };
  });
}

/** Always reports success for a well-formed email, so the form does not reveal which emails have accounts. */
export function requestPasswordReset(email: string): Promise<FlowResult> {
  return attempt(async (a) => {
    const { error } = await a.resetPasswordForEmail(email, { redirectTo: callbackUrl('/reset-password') });
    if (error && (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit' || error.status === 0)) return failed(error);
    return { ok: true, value: null };
  });
}

/** The recovery session (from the emailed link) sets a new password without the old one; /reset-password offers it only to such a session. */
export function setNewPassword(password: string): Promise<FlowResult> {
  return attempt(async (a) => {
    const { error } = await a.updateUser({ password });
    return error ? failed(error) : { ok: true, value: null };
  });
}

const WRONG_CURRENT_PASSWORD = 'Mật khẩu hiện tại không đúng.';
const GOOGLE_ONLY = 'Tài khoản này đăng nhập bằng Google và chưa có mật khẩu. Để đặt mật khẩu lần đầu, đăng xuất rồi chọn "Quên mật khẩu" ở trang đăng nhập và mở liên kết gửi về email.';

/** True when GoTrue lists the account's sign-in methods and a password is not among them. */
function withoutPassword(user: { app_metadata?: { providers?: unknown }; identities?: ReadonlyArray<{ provider: string }> }): boolean {
  const providers = user.identities?.map((i) => i.provider) ?? (Array.isArray(user.app_metadata?.providers) ? (user.app_metadata.providers as string[]) : []);
  return providers.length > 0 && !providers.includes('email');
}

/**
 * Signs in with the current password on a throwaway client that keeps no session, writes no cookie or storage
 * and never touches the browser's session, then ends that sign-in. Any refusal but a rate limit or the network
 * reads as a wrong password, so the form reveals nothing else about the account.
 */
async function currentPasswordHolds(email: string, password: string): Promise<FlowResult> {
  const env = supabaseEnv();
  if (!env) return { ok: false, message: AUTH_UNAVAILABLE };
  const check = createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'sce-password-check' },
  });
  const { error } = await check.auth.signInWithPassword({ email, password });
  if (error) {
    const passThrough = error.code === 'over_request_rate_limit' || error.name === 'AuthRetryableFetchError' || error.status === 0;
    return passThrough ? failed(error) : { ok: false, message: WRONG_CURRENT_PASSWORD };
  }
  // The check's own session stays valid on the server until it is signed out; one retry, then the log keeps it.
  const first = await check.auth.signOut({ scope: 'local' });
  const { error: notClosed } = first.error ? await check.auth.signOut({ scope: 'local' }) : first;
  if (notClosed) console.error('password check: its sign-in session could not be closed', { code: notClosed.code, status: notClosed.status });
  return { ok: true, value: null };
}

/**
 * A signed-in password change checks the current password first (core B37, Q3), then sends it to GoTrue as
 * well. GoTrue itself refuses a direct updateUser without it only once the project requires the current password
 * (status/core.md, Before go-live).
 */
export function changePassword(current: string, password: string): Promise<FlowResult> {
  return attempt(async (a) => {
    const { data, error } = await a.getUser();
    if (error) return failed(error);
    if (!data.user?.email) return { ok: false, message: MESSAGES.session_not_found! };
    if (withoutPassword(data.user)) return { ok: false, message: GOOGLE_ONLY };
    const checked = await currentPasswordHolds(data.user.email, current);
    if (!checked.ok) return checked;
    const updated = await a.updateUser({ password, current_password: current });
    return updated.error ? failed(updated.error, { invalid_credentials: WRONG_CURRENT_PASSWORD }) : { ok: true, value: null };
  });
}

export function listTotpFactors(): Promise<FlowResult<{ verified: TotpFactor[] }>> {
  return attempt(async (a) => {
    const { data, error } = await a.mfa.listFactors();
    if (error) return failed(error);
    return { ok: true, value: { verified: data.totp.map((f) => ({ id: f.id, friendlyName: f.friendly_name ?? null, createdAt: f.created_at })) } };
  });
}

/** Removes stale unverified TOTP factors first, so repeated attempts leave nothing behind (core B4). */
export function startTotpEnrollment(friendlyName: string): Promise<FlowResult<TotpEnrollment>> {
  return attempt(async (a) => {
    const listed = await a.mfa.listFactors();
    if (listed.error) return failed(listed.error);
    for (const f of listed.data.all) {
      if (f.factor_type === 'totp' && f.status === 'unverified') await a.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await a.mfa.enroll({ factorType: 'totp', friendlyName, issuer: 'Sự kiện SCE' });
    if (error) return failed(error, { mfa_factor_name_conflict: 'Tên thiết bị đã được dùng. Thử lại.' });
    return { ok: true, value: { factorId: data.id, uri: data.totp.uri, secret: data.totp.secret } };
  });
}

/** Verifies the code of a new or existing factor; success upgrades the session to AAL2. */
export function verifyTotp(factorId: string, code: string): Promise<FlowResult> {
  return attempt(async (a) => {
    const { error } = await a.mfa.challengeAndVerify({ factorId, code });
    return error ? failed(error) : { ok: true, value: null };
  });
}

/** The sign-in step: the session's verified TOTP factor and a code. */
export function challengeTotp(code: string): Promise<FlowResult> {
  return attempt(async (a) => {
    const { data, error } = await a.mfa.listFactors();
    if (error) return failed(error);
    const factor = data.totp[0];
    if (!factor) return { ok: false, message: 'Tài khoản chưa thiết lập xác thực hai lớp.' };
    const verified = await a.mfa.challengeAndVerify({ factorId: factor.id, code });
    return verified.error ? failed(verified.error) : { ok: true, value: null };
  });
}

export function removeTotpFactor(factorId: string): Promise<FlowResult> {
  return attempt(async (a) => {
    const { error } = await a.mfa.unenroll({ factorId });
    return error ? failed(error) : { ok: true, value: null };
  });
}
