'use client';

// /admin/users: one accounts screen (core B26). Everyone with core.users.read
// sees the list RLS allows; only core.users.manage gets actions (core B38).

import { useMemo, useState } from 'react';
import { z } from 'zod';
import { Alert, Badge, Button, DataTable, Dialog, FilterBar, Form, FormField, RowMenu, SectionCard, Select, StatusBadge, TextInput, useDialogs, useZodForm, type Column, type RowMenuItem } from '@/components/ui';
import type { Profile } from '@/core/auth';
import type { Email } from '@/core/brand';
import { useCommand } from '@/core/commands';
import { matchesQuery } from '@/core/text';
import { DEPARTMENTS, ROLES, enumOptions, type DepartmentName, type Role } from '@/core/vocab';
import { PROFILE_STATUS } from '../domain/labels';
import { PASSWORD_MIN, ROLE_VALUES, createUserSchema, departmentSchema, roleSchema } from '../domain/schemas';

export interface UsersScreenProps {
  profiles: ReadonlyArray<Profile>;
  canManage: boolean;
  selfId: Profile['id'];
  /** dept_leader: the list is the own department only. */
  scopedTo: DepartmentName | null;
}

const ROLE_OPTIONS = ROLE_VALUES.map((r) => ({ value: r, label: ROLES[r].optionLabel }));
const DEPARTMENT_OPTIONS = DEPARTMENTS.map((d) => ({ value: d.name, label: d.name }));
const NO_DEPARTMENT = '(Chưa có phòng ban)';

type Editing = { kind: 'role' | 'department'; profile: Profile } | { kind: 'create' } | null;

export function UsersScreen({ profiles, canManage, selfId, scopedTo }: UsersScreenProps) {
  const run = useCommand();
  const dialogs = useDialogs();
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('all');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<Editing>(null);

  const activeAdmins = profiles.filter((p) => p.role === 'admin' && p.status === 'active').length;
  const isLastAdmin = (p: Profile) => p.role === 'admin' && p.status === 'active' && activeAdmins <= 1;
  const pending = profiles.filter((p) => p.status === 'pending');
  const shown = useMemo(
    () => profiles.filter((p) => (dept === 'all' || (p.department ?? '') === dept) && (status === 'all' || p.status === status) && matchesQuery(q, p.fullname, p.email)),
    [profiles, dept, status, q],
  );

  const approveAll = async () => {
    const ok = await dialogs.confirm({
      title: `Phê duyệt ${pending.length} tài khoản?`,
      text: 'Tất cả các tài khoản cán bộ đang chờ sẽ được kích hoạt quyền truy cập vào hệ thống.',
      confirmLabel: 'Phê duyệt ngay',
      tone: 'success',
    });
    if (ok) await run('core.users.setStatus', { ids: pending.map((p) => p.id), status: 'active' }, { success: `Đã phê duyệt kích hoạt ${pending.length} tài khoản cán bộ.` });
  };
  const lock = async (p: Profile) => {
    const ok = await dialogs.confirm({
      title: `Khóa tài khoản ${p.fullname}?`,
      text: 'Người này không đăng nhập và không xem được dữ liệu cho tới khi được mở khóa. Dữ liệu họ đã nhập vẫn giữ nguyên.',
      confirmLabel: 'Khóa tài khoản',
      tone: 'danger',
    });
    if (ok) await run('core.users.setStatus', { ids: [p.id], status: 'locked' }, { success: `Đã khóa tài khoản ${p.fullname}` });
  };

  const menu = (p: Profile): RowMenuItem[] => {
    const self = p.id === selfId;
    const last = isLastAdmin(p);
    const status: RowMenuItem =
      p.status === 'pending'
        ? { id: 'approve', label: 'Duyệt tài khoản', icon: 'check', onSelect: () => void run('core.users.setStatus', { ids: [p.id], status: 'active' }, { success: `Đã duyệt tài khoản "${p.fullname}"` }) }
        : p.status === 'locked'
          ? { id: 'unlock', label: 'Mở khóa', icon: 'unlock', onSelect: () => void run('core.users.setStatus', { ids: [p.id], status: 'active' }, { success: `Đã mở khóa tài khoản ${p.fullname}` }) }
          : {
              id: 'lock', icon: 'lock', tone: 'danger', disabled: self || last, onSelect: () => void lock(p),
              label: self ? 'Khóa tài khoản (không thể tự khóa)' : last ? 'Khóa tài khoản (quản trị viên cuối cùng)' : 'Khóa tài khoản',
            };
    return [
      status,
      { id: 'role', label: last ? 'Đổi vai trò (quản trị viên cuối cùng)' : 'Đổi vai trò…', icon: 'shield', disabled: last, onSelect: () => setEditing({ kind: 'role', profile: p }) },
      { id: 'department', label: 'Chuyển phòng ban…', icon: 'arrow-left-right', onSelect: () => setEditing({ kind: 'department', profile: p }) },
    ];
  };

  const columns: Column<Profile>[] = [
    {
      id: 'name', header: 'Cán bộ', sortValue: (p) => p.fullname,
      cell: (p) => (
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 font-semibold text-ink">
            <span className="break-words">{p.fullname}</span>
            {p.id === selfId && <Badge tone="slate">Bạn</Badge>}
            {isLastAdmin(p) && <Badge tone="purple" icon="shield">Quản trị viên cuối cùng</Badge>}
          </p>
          <p className="break-all font-mono text-xs text-ink-2">{p.email}</p>
        </div>
      ),
    },
    { id: 'department', header: 'Phòng chuyên môn', hideOnMobile: true, sortValue: (p) => p.department ?? '', cell: (p) => p.department ?? <span className="text-ink-muted">{NO_DEPARTMENT}</span> },
    { id: 'role', header: 'Vai trò', sortValue: (p) => -ROLES[p.role].rank, cell: (p) => <StatusBadge registry={ROLES} value={p.role} /> },
    { id: 'status', header: 'Trạng thái', sortValue: (p) => p.status, cell: (p) => <StatusBadge registry={PROFILE_STATUS} value={p.status} /> },
    ...(canManage ? [{ id: 'actions', header: 'Thao tác', align: 'right' as const, cell: (p: Profile) => <RowMenu label={`Thao tác với ${p.fullname}`} items={menu(p)} /> }] : []),
  ];

  return (
    <div className="space-y-4">
      {!canManage && (
        <Alert tone="info">
          {scopedTo ? `Danh sách cán bộ thuộc ${scopedTo}. ` : ''}Bạn chỉ xem danh sách. Chỉ quản trị viên duyệt, khóa, phân quyền và tạo tài khoản.
        </Alert>
      )}
      {canManage && pending.length > 0 && (
        <Alert tone="warning" title={`Có ${pending.length} tài khoản cán bộ mới đang chờ phê duyệt`} action={<Button icon="check" onClick={() => void approveAll()}>Phê duyệt tất cả</Button>}>
          Duyệt từng tài khoản trong menu thao tác của dòng, hoặc phê duyệt tất cả để kích hoạt quyền đăng nhập.
        </Alert>
      )}
      <SectionCard
        title="Danh sách cán bộ"
        subtitle={`${profiles.length} tài khoản · ${activeAdmins} quản trị viên đang hoạt động`}
        icon="users"
        actions={canManage ? <Button variant={pending.length > 0 ? 'secondary' : 'primary'} icon="plus" onClick={() => setEditing({ kind: 'create' })}>Thêm tài khoản</Button> : undefined}
      >
        <div className="space-y-3">
          <FilterBar
            search={{ value: q, onChange: setQ, placeholder: 'Tìm theo họ tên hoặc email' }}
            filters={[
              { id: 'dept', label: 'Phòng chuyên môn', value: dept, onChange: setDept, options: [{ value: 'all', label: 'Tất cả phòng ban' }, ...DEPARTMENT_OPTIONS, { value: '', label: NO_DEPARTMENT }] },
              { id: 'status', label: 'Trạng thái', value: status, onChange: setStatus, options: [{ value: 'all', label: 'Tất cả trạng thái' }, ...enumOptions(PROFILE_STATUS).map((o) => ({ value: o.value, label: o.label }))] },
            ]}
          />
          <DataTable
            rows={shown}
            columns={columns}
            rowKey={(p) => p.id}
            rowTone={(p) => (p.status === 'pending' ? 'amber' : null)}
            empty={{ icon: 'search', title: 'Không tìm thấy tài khoản phù hợp', text: 'Đổi từ khóa hoặc bộ lọc.' }}
          />
        </div>
      </SectionCard>
      {editing?.kind === 'role' && <RoleDialog profile={editing.profile} onClose={() => setEditing(null)} />}
      {editing?.kind === 'department' && <DepartmentDialog profile={editing.profile} onClose={() => setEditing(null)} />}
      {editing?.kind === 'create' && <CreateUserDialog onClose={() => setEditing(null)} />}
    </div>
  );
}

const roleForm = z.object({ role: roleSchema });
function RoleDialog({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const run = useCommand();
  const form = useZodForm(roleForm, { defaultValues: { role: profile.role } });
  const submit = async ({ role }: { role: Role }) => {
    if (role === profile.role) return onClose();
    if (await run('core.users.setRole', { id: profile.id, role }, { success: `Đã cập nhật vai trò của ${profile.fullname}: ${ROLES[role].label}` })) onClose();
  };
  return (
    <Dialog open onClose={onClose} dirty={form.formState.isDirty} size="sm" icon="shield" title="Đổi vai trò" subtitle={`${profile.fullname} · ${profile.email}`}>
      <Form form={form} onSubmit={submit} className="space-y-4">
        <FormField label="Vai trò phân quyền" name="role" required hint="Quản trị viên và Ban Giám đốc phải thiết lập xác thực hai lớp ở lần đăng nhập tới.">
          <Select name="role" options={ROLE_OPTIONS} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" icon="check" loading={form.formState.isSubmitting}>Lưu vai trò</Button>
        </div>
      </Form>
    </Dialog>
  );
}

const departmentForm = z.object({ department: departmentSchema });
function DepartmentDialog({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const run = useCommand();
  const form = useZodForm(departmentForm, { defaultValues: { department: profile.department ?? 'Phòng Xúc tiến đầu tư' } });
  const submit = async ({ department }: { department: DepartmentName }) => {
    if (department === profile.department) return onClose();
    if (await run('core.users.setDepartment', { id: profile.id, department }, { success: `Đã chuyển ${profile.fullname} sang ${department}` })) onClose();
  };
  return (
    <Dialog open onClose={onClose} dirty={form.formState.isDirty} size="sm" icon="arrow-left-right" title="Chuyển phòng ban" subtitle={`${profile.fullname} · ${profile.email}`}>
      <Form form={form} onSubmit={submit} className="space-y-4">
        <FormField label="Phòng chuyên môn" name="department" required hint="Lãnh đạo Phòng và Chuyên viên chỉ thấy sự kiện của phòng mình chủ trì hoặc phối hợp.">
          <Select name="department" options={DEPARTMENT_OPTIONS} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" icon="check" loading={form.formState.isSubmitting}>Chuyển phòng ban</Button>
        </div>
      </Form>
    </Dialog>
  );
}

function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const run = useCommand();
  const form = useZodForm(createUserSchema, { defaultValues: { email: '', password: '', fullname: '', department: 'Phòng Xúc tiến đầu tư', role: 'user' } });
  const submit = async (v: z.output<typeof createUserSchema>) => {
    const created = await run('core.users.create', { ...v, email: v.email as Email }, { success: `Đã tạo tài khoản cán bộ: ${v.fullname} (${v.email})` });
    if (created) onClose();
  };
  return (
    <Dialog open onClose={onClose} dirty={form.formState.isDirty} size="lg" icon="user-cog" title="Cấp tài khoản cán bộ mới" subtitle="Tài khoản được kích hoạt ngay, không cần duyệt. Phiên đăng nhập của bạn giữ nguyên.">
      <Form form={form} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <FormField label="Email đăng nhập" name="email" required>
          <TextInput name="email" type="email" autoComplete="off" placeholder="canbo@sce.gov.vn" />
        </FormField>
        <FormField label="Mật khẩu ban đầu" name="password" required hint={`Tối thiểu ${PASSWORD_MIN} ký tự. Gửi riêng cho cán bộ và đề nghị đổi sau lần đăng nhập đầu.`}>
          <TextInput name="password" type="password" autoComplete="new-password" />
        </FormField>
        <FormField label="Họ và tên cán bộ" name="fullname" required>
          <TextInput name="fullname" placeholder="Nguyễn Văn A" />
        </FormField>
        <FormField label="Phòng chuyên môn" name="department" required>
          <Select name="department" options={DEPARTMENT_OPTIONS} />
        </FormField>
        <FormField label="Vai trò phân quyền" name="role" required>
          <Select name="role" options={ROLE_OPTIONS} />
        </FormField>
        <div className="flex items-end justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" icon="plus" loading={form.formState.isSubmitting}>Thêm tài khoản</Button>
        </div>
      </Form>
    </Dialog>
  );
}
