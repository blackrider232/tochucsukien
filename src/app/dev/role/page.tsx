import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Button, SectionCard } from '@/components/ui';
import { controlClass } from '@/components/ui/filter-bar';
import { DEFAULT_DEV_DEPARTMENT, DEV_ROLE_COOKIE, DEV_ROLE_LABELS, DEV_ROLES, choosesDepartment, devActor, devMemoryEnabled, parseDevRole } from '@/core/dev/mode';
import { DEPARTMENTS } from '@/core/vocab';

export const metadata: Metadata = { title: 'Đổi vai trò (dev)' };

// Dev memory runtime only: picks the actor requestContext() returns. A 404 everywhere else.
// Plain forms, so it works for a pending or locked actor and without JavaScript.
export default async function DevRolePage() {
  if (!devMemoryEnabled()) notFound();
  const current = parseDevRole((await cookies()).get(DEV_ROLE_COOKIE)?.value);
  const department = choosesDepartment(current.role) ? current.department : DEFAULT_DEV_DEPARTMENT;
  return (
    <main id="main" className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <SectionCard title="Đổi vai trò" subtitle={`Đang đăng nhập: ${devActor(current).profile.fullname}`} icon="users" accent="purple">
        <form method="post" action="/dev/role/select" className="flex flex-col gap-4">
          <fieldset className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <legend className="mb-2 font-medium">Vai trò</legend>
            {DEV_ROLES.map((role) => (
              <label key={role} className="flex items-center gap-2">
                <input type="radio" name="role" value={role} defaultChecked={role === current.role} />
                {DEV_ROLE_LABELS[role]}
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1 text-sm">
            Phòng ban (Lãnh đạo Phòng, Chuyên viên, Chờ duyệt, Bị khóa)
            <select name="department" className={controlClass} defaultValue={DEPARTMENTS.find((d) => d.name === department)?.code}>
              {DEPARTMENTS.filter((d) => d.canChairEvents).map((d) => (
                <option key={d.code} value={d.code}>{d.name}</option>
              ))}
            </select>
          </label>
          <div>
            <Button type="submit">Đổi vai trò</Button>
          </div>
        </form>
      </SectionCard>
      <SectionCard title="Dữ liệu dev" subtitle="Xoá toàn bộ dữ liệu trong bộ nhớ và chạy lại devSeed của các module" icon="trash" accent="rose">
        <form method="post" action="/dev/reset">
          <Button type="submit" variant="danger">Đặt lại dữ liệu</Button>
        </form>
      </SectionCard>
    </main>
  );
}
