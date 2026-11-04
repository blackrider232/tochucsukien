'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useCalendar, useSettings } from '@/core/auth';
import { summarize } from '../domain/dashboard';
import { ALWAYS_OPEN, EventCard } from './event-card';
import { PlanProvider, usePlan, type PlanScreenData } from './plan-context';

/** One event's plan, every group open. */
export function PlanView({ data }: { data: PlanScreenData }) {
  const router = useRouter();
  return (
    <PlanProvider data={data} afterDelete={() => router.push('/events')}>
      <Plan />
    </PlanProvider>
  );
}

function Plan() {
  const { data, today } = usePlan();
  const cal = useCalendar();
  const settings = useSettings();
  const plan = data.plans[0]!;
  const summary = useMemo(() => summarize(cal, plan, today, settings), [cal, plan, today, settings]);
  return <EventCard summary={summary} groups={plan.groups} expansion={ALWAYS_OPEN} standalone />;
}
