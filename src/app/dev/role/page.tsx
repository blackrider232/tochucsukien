import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Button, FormField, RadioGroup, SectionCard, Select } from '@/components/ui';
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
    <main id="main-content" className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <SectionCard title="Đổi vai trò" subtitle={`Đang đăng nhập: ${devActor(current).profile.fullname}`} icon="users" accent="purple">
        <form method="post" action="/dev/role/select" className="flex flex-col gap-4">
          <RadioGroup
            name="role"
            label="Vai trò"
            orientation="horizontal"
            defaultValue={current.role}
            options={DEV_ROLES.map((role) => ({ value: role, label: DEV_ROLE_LABELS[role] }))}
          />
          <FormField label="Phòng ban" name="department" hint="Dùng cho Lãnh đạo Phòng, Chuyên viên, Chờ duyệt và Bị khóa.">
            <Select
              name="department"
              defaultValue={DEPARTMENTS.find((d) => d.name === department)?.code}
              options={DEPARTMENTS.filter((d) => d.canChairEvents).map((d) => ({ value: d.code, label: d.name }))}
            />
          </FormField>
          <div>
            <Button type="submit">Đổi vai trò</Button>
          </div>
        </form>
      </SectionCard>
      <SectionCard title="Dữ liệu dev" subtitle="Xóa toàn bộ dữ liệu trong bộ nhớ và chạy lại devSeed của các module" icon="trash" accent="rose">
        <form method="post" action="/dev/reset">
          <Button type="submit" variant="danger">Đặt lại dữ liệu</Button>
        </form>
      </SectionCard>
    </main>
  );
}
