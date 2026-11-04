'use client';

import { useEffect, useState } from 'react';
import type { IsoDate } from '@/core/brand';
import { todayVN } from '@/core/dates';

/** VN "today", re-read every minute so a page left open overnight rolls over (m2 BUG-42). */
export function useToday(initial: IsoDate): IsoDate {
  const [today, setToday] = useState(initial);
  useEffect(() => {
    const timer = setInterval(() => setToday(todayVN()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return today;
}
