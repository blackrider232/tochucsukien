// Parsing of sce_tcsk_profiles and sce_tcsk_holidays rows, shared by the proxy
// and requestContext(). The session reads these with the raw client because
// neither table has the managed columns of a Db table.

import { z } from 'zod';
import type { Email, Instant, IsoDate, UserId } from '@/core/brand';
import { parseInstant, parseIsoDate, type Holiday } from '@/core/dates';
import { isDepartmentName } from '@/core/vocab';
import type { Profile } from './index';

const profileRow = z.object({
  id: z.string(),
  email: z.string(),
  fullname: z.string(),
  role: z.enum(['admin', 'leader', 'dept_leader', 'user']),
  department: z.string().nullable(),
  status: z.enum(['pending', 'active', 'locked']),
  created_at: z.string(),
  updated_at: z.string(),
});

export function parseProfileRow(row: unknown): Profile {
  const r = profileRow.parse(row);
  return {
    id: r.id as UserId,
    email: r.email as Email,
    fullname: r.fullname,
    role: r.role,
    department: isDepartmentName(r.department) ? r.department : null,
    status: r.status,
    createdAt: (parseInstant(r.created_at) ?? r.created_at) as Instant,
    updatedAt: (parseInstant(r.updated_at) ?? r.updated_at) as Instant,
  };
}

const holidayRow = z.object({ holiday_date: z.string(), name: z.string(), kind: z.enum(['holiday', 'compensatory_workday']) });

export function parseHolidayRows(rows: unknown): Holiday[] {
  return z
    .array(holidayRow)
    .parse(rows ?? [])
    .flatMap((r) => {
      const date = parseIsoDate(r.holiday_date);
      return date ? [{ date: date as IsoDate, name: r.name, kind: r.kind }] : [];
    });
}
