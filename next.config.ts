import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';
import { randomUUID } from 'node:crypto';

const isProd = process.env.NODE_ENV === 'production';
const isDev = !isProd;

// One id per build. It names the Next build and revisions the precached offline page,
// so installed PWAs drop old entries and pick up the new shell after a deploy.
const buildId = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_SHA ?? randomUUID();

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  // The update prompt registers the worker itself so it can ask before activating a new version.
  register: false,
  additionalPrecacheEntries: [{ url: '/offline.html', revision: buildId }],
});

// Origins the app talks to. Supabase comes from the environment; Google is for Gmail sending and sign-in.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHttp = supabaseUrl ? new URL(supabaseUrl).origin : 'https://*.supabase.co';
const supabaseWs = supabaseHttp.replace(/^http/, 'ws');

// Next injects inline scripts and styles, so 'unsafe-inline' stays until a nonce is wired through the proxy.
// Everything else is closed: no objects, no foreign frames, no foreign form targets.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://accounts.google.com/gsi/client`,
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseHttp} ${supabaseWs} https://accounts.google.com https://oauth2.googleapis.com https://gmail.googleapis.com https://www.googleapis.com`,
  "frame-src https://accounts.google.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "media-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  generateBuildId: async () => buildId,
  // Inlined into client bundles so useEventChanges() can tell it runs on the dev memory runtime.
  env: { SCE_DEV_MEMORY: process.env.SCE_DEV_MEMORY ?? '' },
  // dispatch is the one server action, so this caps every command's input. Next's 1 MB default refuses a full guests
  // batch (MAX_BATCH 2000 rows, about 1.1 MB of typical rows); directory chunks its imports at 600 KB. 2 MB fits both
  // with headroom (src/core/commands/body-limit.test.ts).
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  async redirects() {
    return [{ source: '/code/index.html', destination: '/', permanent: true }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Camera stays available to the page itself for the QR scanner.
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

// Serwist only wraps production builds: it adds a webpack config, which Turbopack (next dev) rejects.
export default isProd ? withSerwist(nextConfig) : nextConfig;
