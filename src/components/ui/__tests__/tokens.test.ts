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
    const lightControl = globalsCss.replace('--control-border: #7d8798;', '--control-border: #c5cdd9;');
    expect(failures(lightControl)).toContain('light control-border on surface: 1.60 < 3');
    const darkHover = globalsCss.replace('--primary-hover: #0a58d1;\n  --on-primary: #ffffff;\n  --link: #8ab8ff;', '--primary-hover: #5b93ff;\n  --on-primary: #ffffff;\n  --link: #8ab8ff;');
    expect(failures(darkHover)).toContain('dark on-primary on primary-hover: 2.97 < 4.5');
  });
});
