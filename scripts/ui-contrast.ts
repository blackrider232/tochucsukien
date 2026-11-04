// WCAG 2.1 contrast of the design tokens in src/app/globals.css, in both themes.
// contrastReport() is pure over the two stylesheets, so a test can feed it a broken copy.
// Usage: pnpm tsx scripts/ui-contrast.ts   (prints every pair and its ratio)

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

type Rgba = { r: number; g: number; b: number; a: number };
type Scope = ReadonlyMap<string, string>;
export type Theme = 'light' | 'dark';

export interface PairResult {
  theme: Theme;
  fg: string;
  bg: string;
  min: number;
  ratio: number;
}

const TONES = ['slate', 'blue', 'indigo', 'purple', 'amber', 'emerald', 'rose', 'red', 'teal', 'cyan', 'sky'] as const;
const SURFACES = ['surface', 'surface-2', 'surface-3', 'app'];

/** Text pairs need 4.5:1 (1.4.3); control boundaries and focus rings need 3:1 (1.4.11). */
const PAIRS: ReadonlyArray<{ fg: string; bg: ReadonlyArray<string>; min: number }> = [
  { fg: 'ink', bg: [...SURFACES, 'selected'], min: 4.5 },
  { fg: 'ink-2', bg: [...SURFACES, 'selected'], min: 4.5 },
  { fg: 'ink-muted', bg: [...SURFACES, 'selected'], min: 4.5 },
  { fg: 'link', bg: SURFACES, min: 4.5 },
  { fg: 'danger-ink', bg: SURFACES, min: 4.5 },
  { fg: 'success-ink', bg: SURFACES, min: 4.5 },
  { fg: 'warning-ink', bg: SURFACES, min: 4.5 },
  { fg: 'on-primary', bg: ['primary', 'primary-hover', 'danger', 'danger-hover', 'sidebar-active'], min: 4.5 },
  { fg: 'primary', bg: ['on-primary'], min: 4.5 },
  { fg: 'control-border', bg: ['surface', 'surface-2', 'app'], min: 3 },
  { fg: 'danger-ink', bg: ['surface'], min: 3 },
  { fg: 'focus', bg: ['surface', 'surface-2', 'app', 'sidebar'], min: 3 },
  { fg: 'sidebar-ink', bg: ['sidebar', 'sidebar-hover'], min: 4.5 },
  { fg: 'sidebar-muted', bg: ['sidebar', 'sidebar-hover'], min: 4.5 },
  { fg: 'paper-ink', bg: ['paper'], min: 4.5 },
];

function block(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`globals.css has no "${selector}" block`);
  const open = css.indexOf('{', at);
  return css.slice(open + 1, css.indexOf('}', open));
}

function decls(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out.set(m[1]!, m[2]!.trim());
  return out;
}

const merge = (...maps: ReadonlyArray<ReadonlyMap<string, string>>) => new Map(maps.flatMap((m) => [...m]));

function hex(v: string): Rgba {
  const h = v.slice(1);
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return { r: parseInt(full.slice(0, 2), 16) / 255, g: parseInt(full.slice(2, 4), 16) / 255, b: parseInt(full.slice(4, 6), 16) / 255, a: 1 };
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp = (c: number) => Math.min(1, Math.max(0, c));

function oklabToRgb(L: number, a: number, b: number, alpha = 1): Rgba {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    r: clamp(toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    g: clamp(toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    b: clamp(toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
    a: alpha,
  };
}

function parse(value: string, scope: Scope, depth = 0): Rgba {
  if (depth > 20) throw new Error(`token cycle at ${value}`);
  const v = value.trim();
  const ref = /^var\(--([\w-]+)\)$/.exec(v);
  if (ref) {
    const next = scope.get(ref[1]!);
    if (next === undefined) throw new Error(`unknown token --${ref[1]}`);
    return parse(next, scope, depth + 1);
  }
  if (v.startsWith('#')) return hex(v);
  const rgb = /^rgb\((\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\)$/.exec(v);
  if (rgb) return { r: +rgb[1]! / 255, g: +rgb[2]! / 255, b: +rgb[3]! / 255, a: rgb[4] ? +rgb[4] : 1 };
  const ok = /^oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)$/.exec(v);
  if (ok) {
    const [L, C, H] = [+ok[1]! / 100, +ok[2]!, (+ok[3]! * Math.PI) / 180];
    return oklabToRgb(L, C * Math.cos(H), C * Math.sin(H));
  }
  // color-mix(in oklab, X p%, transparent) is X at alpha p.
  const mix = /^color-mix\(in oklab,\s*(.+?)\s+([\d.]+)%,\s*transparent\)$/.exec(v);
  if (mix) return { ...parse(mix[1]!, scope, depth + 1), a: +mix[2]! / 100 };
  throw new Error(`cannot parse colour "${v}"`);
}

function over(top: Rgba, under: Rgba): Rgba {
  const a = top.a;
  return { r: top.r * a + under.r * (1 - a), g: top.g * a + under.g * (1 - a), b: top.b * a + under.b * (1 - a), a: 1 };
}

const luminance = (c: Rgba) => 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);

export function ratio(fg: Rgba, bg: Rgba): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Resolves a colour and flattens any transparency over `base`, the way the browser paints it. */
function solid(name: string, scope: Scope, base: Rgba): Rgba {
  return over(parse(`var(--${name})`, scope), base);
}

/** Every pair in both themes, plus Badge text on its tint and white on each tone's 700 (accent buttons). */
export function contrastReport(globalsCss: string, tailwindCss: string): PairResult[] {
  const palette = decls(block(tailwindCss, '@theme default'));
  const light = merge(palette, decls(block(globalsCss, ':root,\n[data-theme="light"]')));
  const dark = merge(light, decls(block(globalsCss, '[data-theme="dark"]')));
  const toneBase = decls(block(globalsCss, '[data-tone]'));
  const toneDark = decls(block(globalsCss, '[data-theme="dark"] [data-tone]:not([data-theme="dark"] [data-theme="light"] [data-tone]),\n[data-theme="dark"][data-tone]'));
  const out: PairResult[] = [];

  for (const [theme, scope] of [['light', light], ['dark', dark]] as const) {
    const surface = solid('surface', scope, { r: 1, g: 1, b: 1, a: 1 });
    for (const p of PAIRS) {
      for (const bgName of p.bg) {
        const backdrop = bgName.startsWith('sidebar') ? solid('sidebar', scope, surface) : surface;
        const bg = solid(bgName, scope, backdrop);
        out.push({ theme, fg: p.fg, bg: bgName, min: p.min, ratio: ratio(solid(p.fg, scope, bg), bg) });
      }
    }
    for (const tone of TONES) {
      const toneVars = decls(block(globalsCss, `[data-tone="${tone}"]`));
      const t = merge(scope, toneVars, toneBase, theme === 'dark' ? toneDark : new Map());
      const bg = solid('tone-bg', t, surface);
      out.push({ theme, fg: `tone-fg (${tone})`, bg: `tone-bg (${tone})`, min: 4.5, ratio: ratio(solid('tone-fg', t, bg), bg) });
      const button = solid('t700', t, surface);
      out.push({ theme, fg: 'on-primary', bg: `t700 (${tone})`, min: 4.5, ratio: ratio(solid('on-primary', t, button), button) });
    }
  }
  return out;
}

export function readStylesheets(): { globalsCss: string; tailwindCss: string } {
  const require = createRequire(import.meta.url);
  return {
    globalsCss: readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/app/globals.css'), 'utf8'),
    tailwindCss: readFileSync(require.resolve('tailwindcss/theme.css'), 'utf8'),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { globalsCss, tailwindCss } = readStylesheets();
  const rows = contrastReport(globalsCss, tailwindCss);
  for (const r of rows) {
    console.log(`${r.ratio >= r.min ? 'ok  ' : 'FAIL'} ${r.theme.padEnd(5)} ${r.fg.padEnd(22)} on ${r.bg.padEnd(20)} ${r.ratio.toFixed(2)} (min ${r.min})`);
  }
  const failed = rows.filter((r) => r.ratio < r.min).length;
  console.log(failed === 0 ? `all ${rows.length} pairs pass` : `${failed} of ${rows.length} pairs fail`);
  process.exitCode = failed === 0 ? 0 : 1;
}
