'use client';

// Client mirror of the request context, provided once by the (app) layout:
// <AppContextProvider value={await appContextValue()}>. The kit re-exports
// these hooks; feature components call them through @/components/ui.

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildWorkCalendar, type WorkCalendar } from '@/core/dates';
import { devMemoryEnabled } from '@/core/dev/mode';
import type { SystemSettings } from '@/core/settings';
import { supabaseEnv } from './env';
import type { AppContextValue } from './index';

const AppContext = createContext<AppContextValue | null>(null);

export function AppContextProvider({ value, children }: { value: AppContextValue; children: ReactNode }) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useAppContext must be used inside <AppContextProvider> (the (app) layout)');
  return value;
}

export function useSettings(): SystemSettings {
  return useAppContext().settings;
}

export function useCalendar(): WorkCalendar {
  const { holidays } = useAppContext();
  return useMemo(() => buildWorkCalendar(holidays), [holidays]);
}

let browserClient: SupabaseClient | null = null;
function getBrowserClient(): SupabaseClient | null {
  const env = supabaseEnv();
  if (!env) return null;
  browserClient ??= createBrowserClient(env.url, env.publishableKey);
  return browserClient;
}

const REFRESH_DEBOUNCE_MS = 400;

/** Subscribes to postgres_changes for these tables filtered by event_id; debounced router.refresh(). A no-op in dev memory mode. */
export function useEventChanges(eventId: string, tables: ReadonlyArray<`sce_tcsk_${string}`>): { connected: boolean } {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = tables.join(',');

  useEffect(() => {
    const client = devMemoryEnabled() ? null : getBrowserClient();
    if (!client || key === '') return;
    let channel = client.channel(`sce:${eventId}:${key}`);
    for (const table of key.split(',')) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `event_id=eq.${eventId}` }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => router.refresh(), REFRESH_DEBOUNCE_MS);
      });
    }
    channel.subscribe((status) => setConnected(status === 'SUBSCRIBED'));
    return () => {
      if (timer.current) clearTimeout(timer.current);
      setConnected(false);
      void client.removeChannel(channel);
    };
  }, [eventId, key, router]);

  return { connected };
}
