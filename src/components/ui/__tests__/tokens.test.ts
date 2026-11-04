import { describe, expect, it } from 'vitest';
import { contrastReport, readStylesheets } from '../../../../scripts/ui-contrast';

const { globalsCss, tailwindCss } = readStylesheets();
const failures = (css: string) =>
  contrastReport(css, tailwindCss)
    .filter((r) => r.ratio < r.min)
    .map((r) => `${r.theme} ${r.fg} on ${r.bg}: ${r.ratio.toFixed(2)} < ${r.min}`);

describe('design tokens meet WCAG 2.1 AA in both themes', () => {
  it('every text, control-border, focus and tone pair passes', () => {
    expect(failures(globalsCss)).toEqual([]);
  });

  it('covers both themes, every surface and every tone', () => {
    const rows = contrastReport(globalsCss, tailwindCss);
    expect(new Set(rows.map((r) => r.theme))).toEqual(new Set(['light', 'dark']));
    expect(rows.filter((r) => r.fg === 'control-border').map((r) => r.bg)).toContain('surface');
    expect(rows.filter((r) => r.fg.startsWith('tone-fg')).length).toBe(22);
  });

  it('fails when a token regresses to the audited values', () => {
    const lightControl = globalsCss.replace('--control-border: #64748b;', '--control-border: #cbd5e1;');
    expect(failures(lightControl)).toContain('light control-border on surface: 1.48 < 3');
    const darkHover = globalsCss.replace('--primary-hover: #1d4ed8;\n  --on-primary: #ffffff;\n  --link: #93c5fd;', '--primary-hover: #3b82f6;\n  --on-primary: #ffffff;\n  --link: #93c5fd;');
    expect(failures(darkHover)).toContain('dark on-primary on primary-hover: 3.68 < 4.5');
  });
});
