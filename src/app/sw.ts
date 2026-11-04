// Service worker source, compiled by Serwist (next.config.ts) to public/sw.js.
// It caches the app shell's static assets and an offline page. Pages, RSC payloads and API
// responses are never cached: they carry personal data, and writes need the network anyway.

import { CacheFirst, ExpirationPlugin, Serwist, type PrecacheEntry, type RuntimeCaching } from 'serwist';

declare const self: {
  __SW_MANIFEST: Array<PrecacheEntry | string> | undefined;
  addEventListener(type: 'message', listener: (event: { data?: { type?: string } }) => void): void;
  skipWaiting(): Promise<void>;
};

const staticAssets: RuntimeCaching[] = [
  {
    matcher: ({ url, request }) => url.pathname.startsWith('/_next/static/') || request.destination === 'font',
    handler: new CacheFirst({
      cacheName: 'static-assets',
      plugins: [new ExpirationPlugin({ maxEntries: 128, maxAgeSeconds: 30 * 24 * 60 * 60 })],
    }),
  },
  {
    matcher: ({ url }) => url.pathname.startsWith('/icons/'),
    handler: new CacheFirst({
      cacheName: 'icons',
      plugins: [new ExpirationPlugin({ maxEntries: 16, maxAgeSeconds: 30 * 24 * 60 * 60 })],
    }),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // A new worker waits until the user accepts the update prompt (SKIP_WAITING below).
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: staticAssets,
  fallbacks: {
    entries: [{ url: '/offline.html', matcher: ({ request }) => request.destination === 'document' }],
  },
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

serwist.addEventListeners();
