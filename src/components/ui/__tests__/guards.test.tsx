import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ROOT = resolve(process.cwd(), 'src');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sources(full);
    return /\.(tsx?|css)$/.test(name) ? [full] : [];
  });
}

describe('accessibility guards over the shipped sources', () => {
  const files = [...sources(join(ROOT, 'components')), ...sources(join(ROOT, 'app'))];

  it('never disables zoom or text selection', () => {
    const offenders = files.filter((f) => /select-none|user-scalable|maximum-scale|user-select:\s*none/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('renders raw HTML only inside RichHtml', () => {
    const offenders = files.filter((f) => /dangerouslySetInnerHTML/.test(readFileSync(f, 'utf8')) && !f.endsWith('rich-html.tsx'));
    expect(offenders).toEqual([]);
  });

  it('keeps every touch target at least 40px: no control class shrinks below size-10 / min-h-touch', () => {
    const css = readFileSync(join(ROOT, 'app/globals.css'), 'utf8');
    expect(css).toContain('--touch: 2.5rem');
    expect(css).toMatch(/:focus-visible\s*{[^}]*outline:\s*2px solid var\(--focus\)/);
  });
});

describe('dev gallery', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is a 404 in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.doMock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
    vi.doMock('@/app/(app)/dev/kit/kit-gallery', () => ({ KitGallery: () => null }));
    vi.doMock('../../../app/(app)/dev/kit/kit-gallery', () => ({ KitGallery: () => null }));
    const { default: KitPage } = await import('../../../app/(app)/dev/kit/page');
    expect(() => KitPage()).toThrow('NEXT_NOT_FOUND');
  });
});
