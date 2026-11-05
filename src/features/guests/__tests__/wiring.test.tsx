// The guest list's links to venue and directory, through their public entries only.

import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContactId, Email, HHmm, Instant, IsoDate, Version } from '@/core/brand';
import { renderUi, withAppContext } from '@/components/ui/__tests__/helpers';
import type { MasterContact } from '@/features/directory';
import { GuestsPage } from '../components/guests-page';
import type { GuestScreenData } from '../domain/screen';
import { EVENT, entry } from './roster-fixture';

const router = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/' }));
const dispatch = vi.fn();
vi.mock('@/core/commands/dispatch', () => ({ dispatch: (...a: unknown[]) => dispatch(...a) }));

const XSS = '<img src=x onerror="window.__pwned=1">';
const at = '2026-11-01T00:00:00.000Z' as Instant;
const contact = (n: number, over: Partial<MasterContact> = {}): MasterContact => ({
  id: `c000000${n}-0000-4000-8000-000000000000` as ContactId, name: `Bà Trần Thị ${n}`, group: 'SoNganh', title: 'Giám đốc', organization: `Sở Mẫu ${n}`,
  phone: `09000000${n}`, email: `bd${n}@example.com` as Email, address: '', taxCode: '', notes: 'Đón ở sảnh', hasBanquet: true, updatedAt: at, version: 1 as Version, ...over,
});

function data(over: Partial<GuestScreenData> = {}): GuestScreenData {
  return {
    event: { id: EVENT, name: 'Hội nghị', eventDate: '2026-12-15' as IsoDate, eventTime: '08:30' as HHmm, location: 'Hà Nội', department: 'Phòng Xúc tiến đầu tư', targetGuests: 10 },
    roster: [entry({ name: 'Ông Có Ghế', seatCode: 'A-03', hasBanquet: true }), entry({ name: 'Bà Chưa Ghế' })],
    vipSeats: [],
    canWrite: true,
    canSeeSeating: true,
    canReadDirectory: true,
    directoryContacts: null,
    ...over,
  };
}
const show = (d: GuestScreenData) => renderUi(withAppContext(<GuestsPage data={d} initialPopup={null} />));

beforeEach(() => {
  dispatch.mockReset();
  router.push.mockReset();
  router.replace.mockReset();
});

describe('the seat in the guest list links to the seating chart (venue)', () => {
  it('is a link to /events/<id>/seating for a seated guest, and plain "Chưa xếp" for the others', () => {
    show(data());
    const link = screen.getByRole('link', { name: /A-03/ });
    expect(link).toHaveAttribute('href', `/events/${EVENT}/seating`);
    expect(screen.queryAllByRole('link', { name: /Chưa xếp/ })).toHaveLength(0);
    expect(screen.getByText('Chưa xếp')).toBeInTheDocument();
  });

  it('stays plain text for someone who cannot read the seating chart', () => {
    show(data({ canSeeSeating: false }));
    expect(screen.queryByRole('link', { name: /A-03/ })).toBeNull();
    expect(screen.getByText('A-03')).toBeInTheDocument();
  });

  it('links from the KPI pop-up lists too', async () => {
    renderUi(withAppContext(<GuestsPage data={data()} initialPopup="banquet" />));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByRole('link', { name: /A-03/ })[0]).toHaveAttribute('href', `/events/${EVENT}/seating`);
  });
});

describe('the add-guest form looks people up in the directory', () => {
  const searchResult = [contact(1), contact(2, { name: `${XSS} Ông Nguyễn`, email: null, hasBanquet: false, group: 'VIP' })];

  async function openNewGuest(d = data()) {
    dispatch.mockImplementation(async (id: string) => (id === 'directory.search' ? { ok: true, value: searchResult } : { ok: true, value: undefined }));
    const view = show(d);
    await view.user.click(screen.getAllByRole('button', { name: 'Thêm khách mời' })[0]!);
    return { ...view, dialog: await screen.findByRole('dialog', { name: /Thêm khách mời mới/ }) };
  }

  it('offers the lookup on a new guest, and fills the form from the picked contact', async () => {
    const { user, dialog } = await openNewGuest();
    await user.type(within(dialog).getByRole('combobox', { name: /Tra cứu CSDL khách mời/ }), 'tran');
    const option = await within(dialog).findByRole('option', { name: /Bà Trần Thị 1/ });
    await user.click(option);

    expect(dispatch).toHaveBeenCalledWith('directory.search', expect.objectContaining({ q: 'tran' }));
    expect(within(dialog).getByLabelText(/Họ và tên đại biểu/)).toHaveValue('Bà Trần Thị 1');
    expect(within(dialog).getByLabelText(/Cơ quan \/ đơn vị công tác/)).toHaveValue('Sở Mẫu 1');
    expect(within(dialog).getByLabelText(/Chức danh/)).toHaveValue('Giám đốc');
    expect(within(dialog).getByLabelText('Số điện thoại')).toHaveValue('090000001');
    expect(within(dialog).getByLabelText('Email')).toHaveValue('bd1@example.com');
    expect(within(dialog).getByLabelText(/Nhóm khách mời/)).toHaveValue('SoNganh');
    expect(within(dialog).getByRole('checkbox', { name: /Đăng ký dự tiệc/ })).toBeChecked();
  });

  it('saves the guest with the link to the contact it was copied from', async () => {
    const { user, dialog } = await openNewGuest();
    await user.type(within(dialog).getByRole('combobox', { name: /Tra cứu CSDL khách mời/ }), 'tran');
    await user.click(await within(dialog).findByRole('option', { name: /Bà Trần Thị 1/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Lưu khách mời' }));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith('guests.create', expect.anything()));
    const call = dispatch.mock.calls.find((c) => c[0] === 'guests.create')!;
    expect(call[1]).toMatchObject({ eventId: EVENT, draft: { name: 'Bà Trần Thị 1', organization: 'Sở Mẫu 1', masterContactId: searchResult[0]!.id, group: 'SoNganh' } });
  });

  it('shows a contact’s markup as text', async () => {
    const { user, dialog } = await openNewGuest();
    await user.type(within(dialog).getByRole('combobox', { name: /Tra cứu CSDL khách mời/ }), 'nguyen');
    await within(dialog).findByRole('option', { name: /Ông Nguyễn/ });
    expect(dialog.querySelector('img, script')).toBeNull();
    expect((window as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('does not offer it when editing a guest (a pick would overwrite what staff typed), nor without directory access', async () => {
    const view = show(data());
    await view.user.click(screen.getByRole('button', { name: 'Sửa Ông Có Ghế' }));
    const editDialog = await screen.findByRole('dialog', { name: /Cập nhật hồ sơ đại biểu/ });
    expect(within(editDialog).queryByRole('combobox', { name: /Tra cứu CSDL khách mời/ })).toBeNull();
    view.unmount();

    const none = show(data({ canReadDirectory: false }));
    await none.user.click(screen.getAllByRole('button', { name: 'Thêm khách mời' })[0]!);
    const dialog = await screen.findByRole('dialog', { name: /Thêm khách mời mới/ });
    expect(within(dialog).queryByRole('combobox', { name: /Tra cứu CSDL khách mời/ })).toBeNull();
  });
});

describe('"Nhập từ CSDL Master" copies directory contacts into the event', () => {
  it('asks the page for the contacts (they are not shipped with every visit)', async () => {
    const { user } = show(data());
    await user.click(screen.getByRole('button', { name: 'Nhập từ CSDL Master' }));
    expect(router.push).toHaveBeenCalledWith(`/events/${EVENT}/guests?import=1`, { scroll: false });
  });

  it('opens the batch dialog on the contacts the page loaded, and closing it clears the address', async () => {
    dispatch.mockImplementation(async (id: string) => (id === 'directory.eventMatches' ? { ok: true, value: { existingIds: [] } } : { ok: true, value: undefined }));
    const { user } = show(data({ directoryContacts: [contact(1), contact(2)] }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Bà Trần Thị 1')).toBeInTheDocument();
    expect(within(dialog).getByText('Bà Trần Thị 2')).toBeInTheDocument();
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith('directory.eventMatches', { eventId: EVENT }));
    await user.click(within(dialog).getByRole('button', { name: 'Hủy' }));
    expect(router.replace).toHaveBeenCalledWith(`/events/${EVENT}/guests`, { scroll: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is hidden for someone who cannot write the list or read the directory', () => {
    show(data({ canWrite: false }));
    expect(screen.queryByRole('button', { name: 'Nhập từ CSDL Master' })).toBeNull();
  });
});
