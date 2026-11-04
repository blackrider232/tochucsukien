import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Tests run on the server side of the boundary, so the server-only marker resolves to its empty module, as Next's
// server layer resolves it. Both spellings: the package name (not a declared dependency) and Next's own path.
const serverOnly = createRequire(import.meta.url).resolve('next/dist/compiled/server-only/empty.js');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^server-only$/, replacement: serverOnly },
      { find: /^next\/dist\/compiled\/server-only$/, replacement: serverOnly },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
});
