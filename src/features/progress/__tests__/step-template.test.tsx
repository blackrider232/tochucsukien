import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventId, GroupId, Instant, IsoDate, StepId, TemplateId, Version } from '@/core/brand';
import { renderUi, withAppContext } from '@/components/ui/__tests__/helpers';
import type { EventPlan } from '../contract';
import { PlanView } from '../components/plan-view';
import type { PlanScreenData } from '../components/plan-context';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
const dispatch = vi.fn();
vi.mock('@/core/commands/dispatch', () => ({ dispatch: (...a: unknown[]) => dispatch(...a) }));

const E = 'e0000000-0000-4000-8000-000000000001' as EventId;
const G = 'b0000000-0000-4000-8000-000000000001' as GroupId;
const S = 'a0000000-0000-4000-8000-000000000001' as StepId;
const at = '2026-11-01T00:00:00.000Z' as Instant;
const LIVE_CUSTOM = '11111111-1111-4111-8111-111111111111';
const DELETED_CUSTOM = '22222222-2222-4222-8222-222222222222';

const catalog: PlanScreenData['templates'] = [
  { id: 'form_dskhach' as TemplateId, code: 'form_dskhach', title: 'Danh sách khách mời', origin: 'builtin' },
  { id: 'form_giaymoi_vip' as TemplateId, code: 'form_giaymoi_vip', title: 'Giấy mời đại biểu', origin: 'builtin' },
  { id: LIVE_CUSTOM as TemplateId, code: '', title: 'Thư cảm ơn của đơn vị', origin: 'custom' },
];

const planWith = (templateKey: string): EventPlan => ({
  event: {
    id: E, name: 'Hội nghị', type: 'hoi_nghi', eventDate: '2026-12-15' as IsoDate, eventTime: '08:30' as EventPlan['event']['eventTime'],
    location: 'HN', department: 'Phòng Xúc tiến đầu tư', supportingDepartments: [], leadPerson: '', budget: null, targetGuests: 150,
    status: 'preparing', note: '', deletedAt: null, version: 1 as Version, createdAt: at, createdBy: null, updatedAt: at,
  },
  groups: [{
    id: G, eventId: E, phase: 'phase_prepare', name: 'Nhóm', leadPerson: '', note: '', sort: 0, version: 1 as Version,
    steps: [{
      id: S, eventId: E, groupId: G, name: 'Bước', requirement: '', offsetDays: 3, dayType: 'workday', targetPhase: 'before', completedAt: null,
      completedBy: null, assignee: '', templateKey, subTasks: [], links: [], sort: 0, version: 1 as Version,
    }],
  }],
});

const show = (templateKey: string) =>
  renderUi(withAppContext(<PlanView data={{ plans: [planWith(templateKey)], perms: { [E]: { write: true, edit: true, remove: true } }, today: '2026-11-04' as IsoDate, createDepartments: [], templates: catalog }} />));

beforeEach(() => dispatch.mockReset());

describe('the step dialog picks a template from the library (templates change request C)', () => {
  it('is a list of the library’s forms, not free text, with the custom ones labelled', async () => {
    const { user } = show('');
    await user.click(screen.getByRole('button', { name: 'Sửa bước việc' }));
    const select = await screen.findByRole('combobox', { name: /Mã Biểu Mẫu Liên Kết/ });
    const options = within(select).getAllByRole('option').map((o) => [o.getAttribute('value'), o.textContent]);
    expect(options).toEqual([
      ['', 'Chưa gắn biểu mẫu'],
      ['form_dskhach', 'form_dskhach: Danh sách khách mời'],
      ['form_giaymoi_vip', 'form_giaymoi_vip: Giấy mời đại biểu'],
      [LIVE_CUSTOM, 'Tùy chỉnh: Thư cảm ơn của đơn vị'],
    ]);
  });

  it('saves the chosen template id as the step’s key', async () => {
    dispatch.mockResolvedValue({ ok: true, value: undefined });
    const { user } = show('');
    await user.click(screen.getByRole('button', { name: 'Sửa bước việc' }));
    await user.selectOptions(await screen.findByRole('combobox', { name: /Mã Biểu Mẫu Liên Kết/ }), LIVE_CUSTOM);
    await user.click(screen.getByRole('button', { name: 'Lưu Bước Việc' }));
    expect(dispatch).toHaveBeenCalledWith('progress.updateStep', expect.objectContaining({ patch: expect.objectContaining({ templateKey: LIVE_CUSTOM }) }));
  });

  it('opens a legacy key on the form it maps to, and keeps a key the library does not know instead of blanking it', async () => {
    const legacy = show('form_giaymoi');
    await legacy.user.click(screen.getByRole('button', { name: 'Sửa bước việc' }));
    expect(await screen.findByRole('combobox', { name: /Mã Biểu Mẫu Liên Kết/ })).toHaveValue('form_giaymoi_vip');
    legacy.unmount();

    const unknown = show('form_cu_khong_co');
    await unknown.user.click(screen.getByRole('button', { name: 'Sửa bước việc' }));
    const select = await screen.findByRole('combobox', { name: /Mã Biểu Mẫu Liên Kết/ });
    expect(select).toHaveValue('form_cu_khong_co');
    expect(within(select).getByRole('option', { name: /form_cu_khong_co/ })).toBeInTheDocument();
  });
});

describe('a step’s template link follows the readable catalog (templates change request D)', () => {
  it('links a live built-in and a live custom template to the library', () => {
    show(LIVE_CUSTOM);
    expect(screen.getByRole('link', { name: /Xem Biểu Mẫu/ })).toHaveAttribute('href', `/templates?t=${LIVE_CUSTOM}&event=${E}`);
  });

  it('says "Chưa gắn biểu mẫu" for a custom template that was deleted, instead of linking to a page that no longer exists', () => {
    show(DELETED_CUSTOM);
    expect(screen.queryByRole('link', { name: /Xem Biểu Mẫu/ })).toBeNull();
    expect(screen.getByText(/Chưa gắn biểu mẫu/)).toBeInTheDocument();
  });

  it('keeps linking a legacy key through the alias table', () => {
    show('form_giaymoi');
    expect(screen.getByRole('link', { name: /Xem Biểu Mẫu/ })).toHaveAttribute('href', `/templates?t=form_giaymoi_vip&event=${E}`);
  });
});
