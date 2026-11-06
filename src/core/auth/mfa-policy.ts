/**
 * The MFA requirement switch. Enforced unless the environment says MFA_ENFORCED=false (a demo deployment).
 * The database has the same switch, tcsk.flags('mfa_enforced') (migration 202611061000_core_mfa_switch.sql);
 * flip both together. Mismatched, the account is refused, never over-granted.
 */
export function mfaEnforced(): boolean {
  return process.env.MFA_ENFORCED !== 'false';
}
