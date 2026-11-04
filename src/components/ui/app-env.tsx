'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { buildWorkCalendar, type Holiday, type WorkCalendar } from '@/core/dates';
import type { SystemSettings } from '@/core/settings';

interface AppEnv {
  settings: SystemSettings;
  holidays: ReadonlyArray<Holiday>;
}

const AppEnvContext = createContext<AppEnv | null>(null);

/** Supplies the non-secret app data the kit reads: system settings and the holiday list. Mounted by the (app) and (print) layouts. */
export function AppEnvProvider({ settings, holidays, children }: AppEnv & { children: ReactNode }) {
  const value = useMemo(() => ({ settings, holidays }), [settings, holidays]);
  return <AppEnvContext.Provider value={value}>{children}</AppEnvContext.Provider>;
}

function useEnv(): AppEnv {
  const env = useContext(AppEnvContext);
  if (!env) throw new Error('This component needs <AppEnvProvider> above it (the (app) and (print) layouts mount it).');
  return env;
}

export function useSettings(): SystemSettings {
  return useEnv().settings;
}

export function useHolidays(): ReadonlyArray<Holiday> {
  return useEnv().holidays;
}

export function useCalendar(): WorkCalendar {
  const { holidays } = useEnv();
  return useMemo(() => buildWorkCalendar(holidays), [holidays]);
}

/** For DateInput: tolerates a missing provider so a date field still works on a bare page. */
export function useOptionalHolidays(): ReadonlyArray<Holiday> {
  return useContext(AppEnvContext)?.holidays ?? [];
}
