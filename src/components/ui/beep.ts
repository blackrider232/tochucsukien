'use client';

import { useCallback, useMemo } from 'react';
import { useBoolPref } from '@/core/prefs';

let audio: AudioContext | null = null;

/** One AudioContext for the whole page (m5 BUG-24), created on first use inside a user gesture. */
function context(): AudioContext | null {
  if (audio) return audio;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  audio = new Ctor();
  return audio;
}

function tone(frequency: number, seconds: number, type: OscillatorType): void {
  const ctx = context();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + seconds);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + seconds + 0.02);
}

/** Check-in sound. On/off is a per-device preference. */
export function useBeep(): { enabled: boolean; setEnabled: (v: boolean) => void; ok: () => void; error: () => void } {
  const [enabled, setEnabled] = useBoolPref('sce_beep', true);
  const ok = useCallback(() => { if (enabled) tone(880, 0.12, 'sine'); }, [enabled]);
  const error = useCallback(() => { if (enabled) tone(220, 0.35, 'square'); }, [enabled]);
  return useMemo(() => ({ enabled, setEnabled, ok, error }), [enabled, setEnabled, ok, error]);
}
