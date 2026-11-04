'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { usePref } from '@/core/prefs';
import { IconButton } from './button';

export type ThemeName = 'light' | 'dark';

const QUERY = '(prefers-color-scheme: dark)';

function subscribeSystem(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/** Saved choice wins; with none, follows the system. Applies data-theme on <html>. */
export function useTheme(): { theme: ThemeName; toggle: () => void; set: (t: ThemeName) => void } {
  const [saved, setSaved] = usePref<ThemeName | 'system'>('theme', 'system');
  const systemDark = useSyncExternalStore(subscribeSystem, () => window.matchMedia(QUERY).matches, () => false);
  const theme: ThemeName = saved === 'system' ? (systemDark ? 'dark' : 'light') : saved;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const set = useCallback((t: ThemeName) => setSaved(t), [setSaved]);
  const toggle = useCallback(() => setSaved(theme === 'dark' ? 'light' : 'dark'), [setSaved, theme]);
  return { theme, toggle, set };
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <IconButton
      icon={theme === 'dark' ? 'sun' : 'moon'}
      label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
      onClick={toggle}
    />
  );
}
