import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { THEME_BOOT_SCRIPT } from '@/core/prefs/boot';
import { ThemeToggle } from '../theme';
import { prefStorage, renderUi } from './helpers';

describe('theme', () => {
  beforeEach(() => {
    prefStorage().clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('toggles between light and dark, sets data-theme and remembers the choice', async () => {
    const { user } = renderUi(<ThemeToggle />);
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    await user.click(screen.getByRole('button', { name: 'Chuyển sang giao diện tối' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(prefStorage().getItem('theme')).toBe('dark');
    await user.click(screen.getByRole('button', { name: 'Chuyển sang giao diện sáng' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });

  it('the boot script applies a saved theme before first paint', () => {
    prefStorage().setItem('theme', 'dark');
    new Function(THEME_BOOT_SCRIPT)();
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });
});
