'use client';

import { useRouter } from 'next/navigation';
import { SectionCard } from '@/components/ui';
import type { IsoDate } from '@/core/brand';
import type { DepartmentName } from '@/core/vocab';
import { EventForm } from './event-form';

export function NewEvent({ departments, today }: { departments: ReadonlyArray<DepartmentName>; today: IsoDate }) {
  const router = useRouter();
  return (
    <SectionCard title="Tạo sự kiện mới" subtitle="Khởi tạo kế hoạch tổ chức sự kiện theo chuẩn quy trình SCE" icon="calendar-check" accent="blue">
      <EventForm departments={departments} today={today} onCancel={() => router.push('/events')} onDone={(id) => router.push(`/events/${id}/plan`)} />
    </SectionCard>
  );
}
