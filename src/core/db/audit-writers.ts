// Server-only. The command pipeline's audit writers write a row for whatever
// Actor they are handed, so only core/auth/admin.ts, which builds dispatch's
// writer, imports this module (audit-guards.test.ts holds the list). Tests
// import the implementations from ./memory and ./supabase directly.
// 'server-only' is not a declared dependency; Next aliases this path per
// bundling layer exactly as it does 'server-only' and fails a client build.

import 'next/dist/compiled/server-only';

export { memoryAuditWriter } from './memory';
export { supabaseAuditWriter } from './supabase';
