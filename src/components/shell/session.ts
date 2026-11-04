/** Sign-out is a plain form POST so it works without JavaScript and carries the session cookie. */
export const SIGN_OUT_PATH = '/auth/signout';

/** Session lifetime the idle guard works against: warn at 28 minutes, sign out at 30. */
export const IDLE_WARN_MS = 28 * 60_000;
export const IDLE_LOGOUT_MS = 30 * 60_000;
