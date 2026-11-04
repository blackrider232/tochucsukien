// @vitest-environment node
import { describe, expect, it } from 'vitest';

describe('the server-only marker in tests', () => {
  it('resolves the package name and the path Next aliases to the empty server module, so no test mocks it', async () => {
    await expect(import('server-only')).resolves.toBeDefined();
    await expect(import('next/dist/compiled/server-only')).resolves.toBeDefined();
  });
});
