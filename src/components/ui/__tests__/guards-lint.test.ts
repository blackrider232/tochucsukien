// @vitest-environment node
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });

async function messages(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.severity === 2).map((m) => m.message);
}

const FEATURE = 'src/features/guests/components/guest-row.tsx';
const KIT = 'src/components/ui/fixture.tsx';

describe('UI guards in pnpm lint', () => {
  it('G1 bans palette colour classes in features, the app and the kit', async () => {
    const bad = `export const A = () => <p className="text-red-600 dark:text-red-400">x</p>;`;
    expect(await messages(FEATURE, bad)).toEqual(expect.arrayContaining([expect.stringContaining('Use a token class')]));
    expect(await messages(KIT, `export const tone = 'bg-emerald-50';`)).toEqual([expect.stringContaining('Use a token class')]);
    expect(await messages('src/app/(app)/x/page.tsx', 'export const c = (on: boolean) => `px-2 ${on ? "bg-white" : ""}`;')).toEqual([expect.stringContaining('Use a token class')]);
    expect(await messages(FEATURE, `export const A = () => <p className="bg-surface text-danger-ink border-control-border">x</p>;`)).toEqual([]);
  });

  it('G2 bans arbitrary values in features and the app, not in the kit', async () => {
    const bad = `export const A = () => <p className="w-[37px] text-[13px]">x</p>;`;
    expect(await messages(FEATURE, bad)).toEqual([expect.stringContaining('No arbitrary Tailwind values')]);
    expect(await messages('src/app/(print)/x/page.tsx', 'const s = `mt-[3px]`; export default s;')).toEqual([expect.stringContaining('No arbitrary Tailwind values')]);
    expect(await messages(KIT, bad)).toEqual([]);
  });

  it('G3 bans raw hex colours', async () => {
    expect(await messages(FEATURE, `export const A = () => <svg><path fill="#1e3a8a" /></svg>;`)).toEqual([expect.stringContaining('No raw hex')]);
    expect(await messages(KIT, `export const c = '#fff';`)).toEqual([expect.stringContaining('No raw hex')]);
    expect(await messages(FEATURE, `export const a = '#main-content';`)).toEqual([]);
  });

  it('G5 bans icon packs outside the kit icon file', async () => {
    const bad = `import { Star } from 'lucide-react';\nexport const S = Star;`;
    expect(await messages(FEATURE, bad)).toEqual([expect.stringContaining('Icons come from the kit')]);
    expect(await messages('src/components/ui/button.tsx', bad)).toEqual([expect.stringContaining('Icons come from the kit')]);
    expect(await messages('src/components/ui/icons.tsx', bad)).toEqual([]);
  });

  it('G6 bans deep kit imports from features and the app, but not test helpers', async () => {
    const bad = `import { controlClass } from '@/components/ui/control-class';\nexport const c = controlClass;`;
    expect(await messages(FEATURE, bad)).toEqual([expect.stringContaining("Import the UI kit from '@/components/ui' only")]);
    expect(await messages('src/app/dev/role/page.tsx', bad)).toEqual([expect.stringContaining("Import the UI kit from '@/components/ui' only")]);
    const helper = `import { renderUi } from '@/components/ui/__tests__/helpers';\nexport const r = renderUi;`;
    expect(await messages('src/features/guests/__tests__/x.test.tsx', helper)).toEqual([]);
  });

  it('G8 bans <main> in features and shell pages', async () => {
    const bad = `export default function P() { return <main>x</main>; }`;
    expect(await messages(FEATURE, bad)).toEqual([expect.stringContaining('AppShell renders the only <main>')]);
    expect(await messages('src/app/(app)/events/[eventId]/guests/page.tsx', bad)).toEqual([expect.stringContaining('AppShell renders the only <main>')]);
    expect(await messages('src/app/(auth)/login/page.tsx', bad)).toEqual([]);
  });
});
