// The server-only marker type-checks under both spellings without the package: Next aliases each on every bundling
// layer, and vitest and scripts/server-context.ts resolve each to the empty module.
declare module 'server-only';
declare module 'next/dist/compiled/server-only';
