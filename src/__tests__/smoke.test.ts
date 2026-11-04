import { describe, expect, it } from 'vitest';

describe('toolchain', () => {
  it('resolves the @/ alias', async () => {
    const vocab = await import('@/core/vocab');
    expect(vocab).toBeDefined();
  });
});
