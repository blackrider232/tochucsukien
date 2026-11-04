// Server-only entry of core/auth. Kept out of '@/core/auth' because it reads
// next/headers, which Next.js rejects in any module graph a client component
// or the proxy can reach.

export { requestContext, appContextValue, loadRequestContext, signOut } from './request-context';
export { createAuthUser } from './admin';
export { currentGate } from './session-gate';
export { exchangeAuthLink } from './callback';
