// Next.js 16 proxy (formerly middleware): session refresh, gate redirect,
// registry route guard and legacy ?tab= redirects. Logic lives in core/auth.

import type { NextRequest } from 'next/server';
import { handleProxy } from '@/core/auth/proxy';

export function proxy(request: NextRequest) {
  return handleProxy(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|icons/|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:png|jpg|jpeg|svg|webp|ico|js|css|map)$).*)'],
};
