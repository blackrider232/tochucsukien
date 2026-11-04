import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContactId, Email, EventId } from '@/core/brand';
import { registry } from '@/core/registry';
import { renderUi, withAppContext } from '@/components/ui/__tests__/helpers';
import type { MasterContact } from '../contract';
import { ContactPickerDialog, ContactSuggest } from '../components/contact-suggest';
import { DirectoryScreen } from '../components/directory-screen';
import { BatchImportDialog } from '../components/event-import';
import { CsvImportDialog } from '../components/csv-import-dialog';
import { ResetDialog } from '../components/reset-dialog';

const dispatch = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => '/' }));
vi.mock('@/core/commands/dispatch', () => ({ dispatch }));

const XSS = '<img src=x onerror="window.__pwned=1">';
const SCRIPT = '<script>window.__pwned=2</script>';
let n = 0;
const contact = (over: Partial<MasterContact> = {}): MasterContact => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` as ContactId, name: 'Nguyễn Văn An', group: 'VIP', title: 'Giám đốc', organization: 'Sở Mẫu', phone: '0912.345.678',
  email: 'an@example.com' as Email, address: 'Số 1', taxCode: '', notes: '', hasBanquet: true, updatedAt: '2026-11-04T00:00:00.000Z' as never, version: 1 as never, ...over,
});
const hostile = () => contact({ name: `${XSS} Đại biểu`, title: XSS, organization: `${SCRIPT} Công ty`, address: XSS, notes: XSS, phone: XSS });
const EVENT = '11111111-1111-4111-8111-111111111111' as EventId;

function expectNoMarkup(root: HTMLElement) {
  expect(root.querySelector('img, script')).toBeNull();
  expect(root.querySelectorAll('[onerror], [onclick]')).toHaveLength(0);
  expect((window as { __pwned?: number }).__pwned).toBeUndefined();
}

beforeEach(() => {
  dispatch.mockReset();
});

describe('the directory screen renders contact text as text (m4c B1-B4, B12)', () => {
  it('shows markup in name, title, organization, address, phone and notes verbatim', () => {
    const { container } = renderUi(withAppContext(<DirectoryScreen contacts={[hostile()]} canAdmin events={[]} />));
    expect(screen.getByText(`${XSS} Đại biểu`)).toBeInTheDocument();
    expect(screen.getByText(`${SCRIPT} Công ty`)).toBeInTheDocument();
    expect(screen.getAllByText(XSS).length).toBeGreaterThanOrEqual(3);
    expectNoMarkup(container);
  });

  it('the batch copy dialog does too, and the CSV preview shows a hostile cell as text', async () => {
    dispatch.mockResolvedValue({ ok: true, value: { existingIds: [] } });
    const { container } = renderUi(withAppContext(<BatchImportDialog eventId={EVENT} eventName={XSS} contacts={[hostile()]} onClose={() => undefined} />));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(`${XSS} Đại biểu`)).toBeInTheDocument();
    expectNoMarkup(container);
  });

  it('the CSV preview lists a hostile row as plain text', async () => {
    const user = userEvent.setup();
    renderUi(withAppContext(<CsvImportDialog contacts={[]} onClose={() => undefined} />));
    await user.click(screen.getByRole('textbox', { name: 'Nội dung CSV' }));
    await user.paste(`Họ tên,Cơ quan\n${XSS},${SCRIPT}\nBình,`);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText(XSS)).toBeInTheDocument());
    expect(within(dialog).getByText(SCRIPT)).toBeInTheDocument();
    expect(within(dialog).getAllByText('Sẽ thêm mới').length).toBeGreaterThanOrEqual(2);
    expect(dialog).toHaveTextContent('Dòng 3: Cơ quan / doanh nghiệp: Nhập cơ quan / doanh nghiệp');
    expectNoMarkup(dialog);
  });
});

describe('the CSV import commits once', () => {
  it('a double click on "Nhập" sends one command', async () => {
    const user = userEvent.setup();
    let settle: (r: unknown) => void = () => undefined;
    dispatch.mockReturnValue(new Promise((resolve) => (settle = resolve)));
    renderUi(withAppContext(<CsvImportDialog contacts={[]} onClose={() => undefined} />));
    await user.click(screen.getByRole('textbox', { name: 'Nội dung CSV' }));
    await user.paste('Họ tên,Cơ quan\nAn,Sở A\nBình,Sở B');
    const commit = await screen.findByRole('button', { name: 'Nhập 2 đối tượng' });
    await user.dblClick(commit);
    await waitFor(() => expect(dispatch).toHaveBeenCalled());
    expect(dispatch.mock.calls.filter(([id]) => id === 'directory.importCsv')).toHaveLength(1);
    expect(commit).toHaveAttribute('aria-busy', 'true');
    settle({ ok: false, kind: 'unavailable', message: 'x' });
    await waitFor(() => expect(commit).not.toHaveAttribute('aria-busy'));
  });
});

describe('a large import or bulk delete goes in chunks, each its own command with its own undo', () => {
  it('imports 1200 CSV rows as three importCsv commands of at most 500', async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    dispatch.mockImplementation(async (_id: string, input: { items: unknown[] }) => ({ ok: true, value: { created: input.items.length, skipped: 0 } }));
    renderUi(withAppContext(<CsvImportDialog contacts={[]} onClose={close} />));
    await user.click(screen.getByRole('textbox', { name: 'Nội dung CSV' }));
    await user.paste(['Họ tên,Cơ quan', ...Array.from({ length: 1200 }, (_, i) => `Khách ${i},Sở ${i}`)].join('\n'));
    await user.click(await screen.findByRole('button', { name: 'Nhập 1200 đối tượng' }));
    await waitFor(() => expect(close).toHaveBeenCalled());
    const sent = dispatch.mock.calls.filter(([id]) => id === 'directory.importCsv').map(([, input]) => (input as { items: { draft: { name: string } }[] }).items);
    expect(sent.map((items) => items.length)).toEqual([500, 500, 200]);
    expect(new Set(sent.flat().map((i) => i.draft.name)).size).toBe(1200);
  });

  it('stops at the first refused chunk and keeps the dialog open', async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    dispatch
      .mockResolvedValueOnce({ ok: true, value: { created: 500, skipped: 0 } })
      .mockResolvedValueOnce({ ok: false, kind: 'unavailable', message: 'Không kết nối được máy chủ. Vui lòng thử lại.' });
    renderUi(withAppContext(<CsvImportDialog contacts={[]} onClose={close} />));
    await user.click(screen.getByRole('textbox', { name: 'Nội dung CSV' }));
    await user.paste(['Họ tên,Cơ quan', ...Array.from({ length: 1200 }, (_, i) => `Khách ${i},Sở ${i}`)].join('\n'));
    await user.click(await screen.findByRole('button', { name: 'Nhập 1200 đối tượng' }));
    expect(await screen.findByText('Đã nhập 500 / 1200 đối tượng. Phần còn lại chưa được nhập.')).toBeInTheDocument();
    expect(dispatch.mock.calls.filter(([id]) => id === 'directory.importCsv')).toHaveLength(2);
    expect(close).not.toHaveBeenCalled();
  });

  it('deletes 1200 selected contacts as three deleteMany commands', async () => {
    const user = userEvent.setup();
    dispatch.mockImplementation(async (_id: string, input: { items: unknown[] }) => ({ ok: true, value: { deleted: input.items.length } }));
    const many = Array.from({ length: 1200 }, (_, i) => contact({ name: `Khách ${i}`, organization: `Sở ${i}`, email: null }));
    renderUi(withAppContext(<DirectoryScreen contacts={many} canAdmin events={[]} />));
    await user.click(screen.getByRole('button', { name: 'Chọn cả 1200 kết quả' }));
    await user.click(screen.getByRole('button', { name: 'Xóa 1200 đã chọn' }));
    await user.click(await screen.findByRole('button', { name: 'Xóa 1200 đối tượng' }));
    await waitFor(() => expect(dispatch.mock.calls.filter(([id]) => id === 'directory.deleteMany')).toHaveLength(3));
    const sent = dispatch.mock.calls.filter(([id]) => id === 'directory.deleteMany').map(([, input]) => (input as { items: { id: string }[] }).items);
    expect(sent.map((items) => items.length)).toEqual([500, 500, 200]);
    expect(new Set(sent.flat().map((i) => i.id))).toEqual(new Set(many.map((c) => c.id)));
  });
});

describe('the copy into an event when the match check fails', () => {
  it('still lets the admin copy, since the copy itself skips who is already there', async () => {
    const user = userEvent.setup();
    dispatch.mockImplementation(async (id: string) =>
      id === 'directory.eventMatches' ? { ok: false, kind: 'unavailable', message: 'Không kết nối được máy chủ. Vui lòng thử lại.' } : { ok: true, value: { added: 1, updated: 0, skipped: 0, missing: 0 } },
    );
    const c = contact();
    renderUi(withAppContext(<BatchImportDialog eventId={EVENT} contacts={[c]} initialSelected={[c.id]} onClose={() => undefined} />));
    expect(await screen.findByText(/Chưa kiểm tra được đại biểu nào đã có trong sự kiện/)).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Nhập đại biểu đã chọn' });
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith('directory.importToEvent', { eventId: EVENT, ids: [c.id], onExisting: 'skip' }));
  });
});

describe('the reset dialog checks the phrase before it sends anything', () => {
  it('refuses a wrong phrase in the dialog, then sends the typed phrase for the command to check again', async () => {
    const user = userEvent.setup();
    dispatch.mockResolvedValue({ ok: true, value: { deleted: 3, backupId: 7 } });
    renderUi(withAppContext(<ResetDialog count={3} onClose={() => undefined} />));
    const input = screen.getByRole('textbox', { name: /Gõ "xóa toàn bộ" để xác nhận/ });
    await user.type(input, 'xóa toàn');
    await user.click(screen.getByRole('button', { name: 'Xóa toàn bộ' }));
    expect(await screen.findByText('Gõ đúng cụm từ "xóa toàn bộ"')).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
    await user.type(input, ' BO');
    await user.click(screen.getByRole('button', { name: 'Xóa toàn bộ' }));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith('directory.resetAll', { phrase: 'xóa toàn BO' }));
  });
});

describe('read-only and admin views (m4c B8)', () => {
  it('a reader sees the list, search, export and the copy, but no add, edit, delete, import or reset', () => {
    renderUi(withAppContext(<DirectoryScreen contacts={[contact()]} canAdmin={false} events={[]} />));
    expect(screen.getByRole('button', { name: 'Xuất CSV' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    for (const label of [/Thêm đối tượng mới/, /Nhập từ CSV/, /Sửa /, /Thao tác khác/, /Thao tác với/]) expect(screen.queryByRole('button', { name: label })).toBeNull();
  });
  it('an admin sees them all', () => {
    renderUi(withAppContext(<DirectoryScreen contacts={[contact()]} canAdmin events={[]} />));
    for (const label of [/Thêm đối tượng mới/, /Nhập từ CSV/, /Sửa Nguyễn Văn An/, /Thao tác khác với CSDL/]) expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  });
  it('an empty directory says so and offers no demo data on its own (decision 13)', () => {
    renderUi(withAppContext(<DirectoryScreen contacts={[]} canAdmin events={[]} />));
    expect(screen.getByText('CSDL khách mời đang trống')).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('search on the screen is tone-insensitive and ranked', () => {
  it('finds a name typed without tone marks and narrows by group', async () => {
    const user = userEvent.setup();
    renderUi(withAppContext(<DirectoryScreen contacts={[contact({ name: 'Đặng Thị Hồng', organization: 'A' }), contact({ name: 'Trần Văn B', organization: 'B', group: 'BaoChi' })]} canAdmin events={[]} />));
    await user.type(screen.getByRole('searchbox'), 'dang thi');
    await waitFor(() => expect(screen.queryByText('Trần Văn B')).toBeNull());
    expect(screen.getByText('Đặng Thị Hồng')).toBeInTheDocument();
    expect(screen.getByText('Hiển thị 1 / 1 đối tượng')).toBeInTheDocument();
  });
});

describe('the live auto-suggest (m4c §1.3, B61)', () => {
  it('lists suggestions as text inside the dropdown, keyboard pickable, with the pick passed on', async () => {
    const user = userEvent.setup();
    const picked = vi.fn();
    dispatch.mockResolvedValue({ ok: true, value: [hostile(), contact({ name: 'Bình' })] });
    renderUi(withAppContext(<ContactSuggest name="masterContactId" onPick={picked} />));
    const input = screen.getByRole('combobox');
    await user.type(input, 'img');
    const list = await screen.findByRole('listbox');
    expect(await within(list).findAllByRole('option')).toHaveLength(1);
    expect(within(list).getByText(`${XSS} Đại biểu`)).toBeInTheDocument();
    expectNoMarkup(list);
    expect(dispatch).toHaveBeenCalledWith('directory.search', { q: 'img', limit: 8 });
    await user.keyboard('{Enter}');
    expect(picked).toHaveBeenCalledWith(expect.objectContaining({ name: `${XSS} Đại biểu` }));
  });

  it('asks nothing for a blank query and says so when the search fails', async () => {
    const user = userEvent.setup();
    dispatch.mockResolvedValue({ ok: false, kind: 'unavailable', message: 'Không kết nối được máy chủ. Vui lòng thử lại.' });
    renderUi(withAppContext(<ContactSuggest name="x" onPick={() => undefined} />));
    const input = screen.getByRole('combobox');
    await user.type(input, '  ');
    await new Promise((r) => setTimeout(r, 400));
    expect(dispatch).not.toHaveBeenCalled();
    await user.type(input, 'an');
    expect(await screen.findByText('Không tìm thấy kết quả do lỗi kết nối. Thử lại sau.')).toBeInTheDocument();
  });
});

describe('the picker', () => {
  it('shows hostile results as text and picks with a button, then closes', async () => {
    const user = userEvent.setup();
    const picked = vi.fn();
    const close = vi.fn();
    dispatch.mockResolvedValue({ ok: true, value: [hostile()] });
    const { container } = renderUi(withAppContext(<ContactPickerDialog onPick={picked} onClose={close} />));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText(`${XSS} Đại biểu`)).toBeInTheDocument());
    expectNoMarkup(container);
    await user.click(within(dialog).getAllByRole('button', { name: 'Chọn' })[0]!);
    expect(picked).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalled();
  });
});

describe('routing', () => {
  it('the list is open to everyone who can read the directory, and is a nav entry for them', () => {
    expect(registry.routeFor('/admin/directory')?.permission).toBe('directory.read');
    expect(registry.navFor('admin').find((e) => e.id === 'admin-guests')?.permission).toBe('directory.read');
  });
});
