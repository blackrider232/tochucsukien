// A legacy blob froze a full copy of the built-ins at the first admin save (m3 B10).
// An entry equal to the legacy original was never edited, so it must not become an override.
// Comparing fingerprints avoids shipping the 78 KB original catalog a second time.

import { createHash } from 'node:crypto';

export interface FingerprintInput {
  group?: unknown;
  code?: unknown;
  title?: unknown;
  type?: unknown;
  description?: unknown;
  content?: unknown;
}

const norm = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

export function legacyFingerprint(e: FingerprintInput): string {
  const canonical = [e.group, e.code, e.title, e.type, e.description, e.content].map(norm).join('\u0001');
  return createHash('sha1').update(canonical, 'utf8').digest('hex');
}
