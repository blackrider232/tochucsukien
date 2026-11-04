import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderUi, withAppContext } from '@/components/ui/__tests__/helpers';
import type { Instant, TemplateId, Version } from '@/core/brand';
import { AdminTemplates } from '../components/admin-templates';
import { TemplateStudio } from '../components/template-studio';
import { resolveCatalog, type StoredTemplate } from '../domain/catalog';
import { event, TODAY } from './fixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
const dispatch = vi.fn();
vi.mock('@/core/commands/dispatch', () => ({ dispatch: (...a: unknown[]) => dispatch(...a) }));

const XSS = '<img src=x onerror="window.__pwned=1">';
const E1 = event({ name: `${XSS} Hội nghị`, location: '<script>window.__pwned=2</script>Sảnh A' });
const E2 = event({ id: '22222222-2222-4222-8222-222222222222' as typeof E1.id, name: 'Hội chợ OCOP', eventDate: '2026-12-20' as typeof E1.eventDate, location: '', budget: null });
const stored = (over: Partial<StoredTemplate>): StoredTemplate => ({
  templateKey: 'form_kh_ubnd', baseBuiltinKey: 'form_kh_ubnd', level: 'cap_ubnd', code: 'KH-UBND', title: 'Kế hoạch đã sửa', kind: 'doc',
  description: 'Mô tả', contentHtml: '<p>Bản sửa {{TEN_SU_KIEN}}</p>', version: 3 as Version, updatedAt: '2026-11-01T00:00:00.000Z' as Instant, ...over,
});
const catalog = resolveCatalog([]);
const studio = (props: Partial<Parameters<typeof TemplateStudio>[0]> = {}) =>
  renderUi(withAppContext(<TemplateStudio templates={catalog} events={[E1, E2]} today={TODAY} isAdmin={false} params={{}} {...props} />));
const paper = () => document.querySelector('.font-serif') as HTMLElement;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  dispatch.mockReset();
  window.history.replaceState(null, '', '/templates');
  delete (window as { __pwned?: number }).__pwned;
});

describe('template studio', () => {
  it('shows the user-entered event fields as text, never as markup (m3 B01)', () => {
    studio({ params: { t: 'form_kh_ubnd', event: E1.id } });
    expect(paper().querySelector('img, script')).toBeNull();
    expect(paper()).toHaveTextContent(`${XSS} Hội nghị`);
    expect(paper()).toHaveTextContent('<script>window.__pwned=2</script>Sảnh A');
    expect(screen.getByRole('option', { name: /<img src=x/ })).toBeInTheDocument();
    expect(document.querySelectorAll('[onerror]')).toHaveLength(0);
    expect((window as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('opens the template and event named in the address, with the NĐ30 date line and the agency from settings', () => {
    studio({ params: { t: 'form_baocao_stc_quyettoan', event: E1.id } });
    expect(screen.getByRole('heading', { level: 2, name: /Báo cáo kết quả tổ chức sự kiện \(Sở Tài chính/ })).toBeInTheDocument();
    expect(paper()).toHaveTextContent('Hà Nội, ngày 04 tháng 11 năm 2026');
    expect(paper()).toHaveTextContent('SỞ TÀI CHÍNH HÀ NỘI');
  });

  it('defaults to the next upcoming event and to the UBND plan when the address names nothing', () => {
    studio();
    expect(screen.getByLabelText('Điền dữ liệu từ')).toHaveValue(E1.id);
    expect(screen.getByRole('heading', { level: 2, name: /Kế hoạch tổ chức chương trình sự kiện/ })).toBeInTheDocument();
  });

  it.each(['form_khong_co', '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a'])('says the template is gone for an unknown or deleted id (%s) and does not open the UBND plan (m3 B08)', async (t) => {
    const { user } = studio({ params: { t, event: E1.id } });
    expect(screen.getByRole('alert')).toHaveTextContent('Biểu mẫu này không còn tồn tại');
    expect(screen.queryByRole('heading', { level: 2, name: /Kế hoạch tổ chức chương trình sự kiện/ })).toBeNull();
    expect(paper()).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Về thư viện biểu mẫu' }));
    expect(screen.queryByText('Biểu mẫu này không còn tồn tại')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: /Kế hoạch tổ chức chương trình sự kiện/ })).toBeInTheDocument();
  });

  it('treats an empty ?t= as no template named and opens the default one', () => {
    studio({ params: { t: '' } });
    expect(screen.queryByText('Biểu mẫu này không còn tồn tại')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: /Kế hoạch tổ chức chương trình sự kiện/ })).toBeInTheDocument();
  });

  it('re-derives the preview when the event changes: blanks and a warning for what the event lacks, never invented values (m3 B12, B20)', async () => {
    const { user } = studio({ params: { t: 'form_baocao_stc_quyettoan', event: E1.id } });
    expect(paper().querySelectorAll('.tpl-blank')).toHaveLength(1);
    await user.selectOptions(screen.getByLabelText('Điền dữ liệu từ'), E2.id);
    expect(paper()).toHaveTextContent('Hội chợ OCOP');
    expect(paper()).not.toHaveTextContent('Hội nghị');
    expect(paper().querySelectorAll('.tpl-blank')).toHaveLength(2);
    expect(screen.getByText('Sự kiện còn thiếu thông tin')).toBeInTheDocument();
    expect(paper()).not.toHaveTextContent('350.000.000');
    expect(window.location.search).toContain(`event=${E2.id}`);
  });

  it('shows the raw template with a notice when no event is chosen', async () => {
    const { user } = studio({ params: { t: 'form_kh_ubnd', event: E1.id } });
    await user.selectOptions(screen.getByLabelText('Điền dữ liệu từ'), '');
    expect(paper()).toHaveTextContent('{{TEN_SU_KIEN}}');
    expect(screen.getByText('Chưa chọn sự kiện')).toBeInTheDocument();
  });

  it('with no events says so and still shows the template', () => {
    studio({ events: [] });
    expect(screen.getByRole('option', { name: '(Chưa có sự kiện nào)' })).toBeInTheDocument();
    expect(paper()).toHaveTextContent('{{TEN_SU_KIEN}}');
  });

  it('searches without tone marks, filters by level, selects with the keyboard and keeps the address in step', async () => {
    const { user } = studio({ params: { event: E1.id } });
    await user.type(screen.getByRole('searchbox'), 'giay moi');
    const found = within(screen.getByRole('list')).getAllByRole('listitem').map((li) => li.textContent);
    expect(found.filter((t) => /^GM-/.test(t ?? ''))).toHaveLength(2);
    expect(found.some((t) => t?.includes('Mẫu Giấy mời Đại biểu'))).toBe(true);
    expect(found.length).toBeLessThan(23);
    await user.clear(screen.getByRole('searchbox'));
    await user.click(screen.getByRole('tab', { name: /Cấp Sở Tài chính/ }));
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2);
    expect(window.location.search).toContain('level=cap_stc');
    const second = within(screen.getByRole('list')).getAllByRole('button', { pressed: false })[0]!;
    second.focus();
    await user.keyboard('{Enter}');
    expect(window.location.search).toContain('t=form_totrinh_stc_ubnd');
    await user.type(screen.getByRole('searchbox'), 'không có mẫu nào như vậy');
    expect(screen.getByText('Không tìm thấy biểu mẫu phù hợp.')).toBeInTheDocument();
  });

  it('shows the Excel button only for a document with a data table (m3 B17)', () => {
    const { unmount } = studio({ params: { t: 'form_kh_ubnd', event: E1.id } });
    expect(screen.queryByRole('button', { name: 'Tải Excel (.xlsx)' })).toBeNull();
    unmount();
    studio({ params: { t: 'form_checklist_hientruong', event: E1.id } });
    expect(screen.getByRole('button', { name: 'Tải Excel (.xlsx)' })).toBeInTheDocument();
  });

  it('labels the downloads honestly: .doc and .xlsx, not .docx', () => {
    studio({ params: { t: 'form_checklist_hientruong', event: E1.id } });
    expect(screen.getByRole('button', { name: 'Tải Word (.doc)' })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('.docx');
  });

  it('hides every admin entry from a non-admin and offers them to an admin (m3 B05)', () => {
    const { unmount } = studio({ isAdmin: false });
    expect(screen.queryByText('Quản trị biểu mẫu')).toBeNull();
    expect(screen.queryByText('Sửa mẫu (Admin)')).toBeNull();
    unmount();
    studio({ isAdmin: true });
    expect(screen.getByRole('link', { name: 'Quản trị biểu mẫu' })).toHaveAttribute('href', '/admin/templates');
    expect(screen.getByRole('link', { name: 'Sửa mẫu (Admin)' })).toHaveAttribute('href', '/admin/templates?edit=form_kh_ubnd');
  });

  it('links the print route with the template and the event, in a new tab', () => {
    studio({ params: { t: 'form_kh_ubnd', event: E1.id } });
    const link = screen.getByRole('link', { name: /In \/ PDF/ });
    expect(link).toHaveAttribute('href', `/templates/print?t=form_kh_ubnd&event=${E1.id}`);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('downloads a Word file whose title and fields are escaped, and says so (m3 B29)', async () => {
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => (blobs.push(b as Blob), 'blob:x'));
    URL.revokeObjectURL = vi.fn();
    const { user } = studio({ params: { t: 'form_kh_ubnd', event: E1.id } });
    await user.click(screen.getByRole('button', { name: 'Tải Word (.doc)' }));
    expect(blobs).toHaveLength(1);
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blobs[0]!);
    });
    expect(blobs[0]!.type).toContain('application/msword');
    expect(text).toContain('&lt;img src=x onerror=');
    expect(text).not.toMatch(/<img src=x|<script/i);
    expect(await screen.findByText(/Đã tạo file Word \(\.doc\)/)).toBeInTheDocument();
  });

  it('tells the user when copying fails instead of failing silently (m3 B32)', async () => {
    const { user } = studio({ params: { t: 'form_kh_ubnd', event: E1.id } });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true });
    await user.click(screen.getByRole('button', { name: 'Sao chép nội dung văn bản' }));
    expect(await screen.findByText(/Không sao chép được/)).toBeInTheDocument();
  });
});

describe('admin templates', () => {
  const templates = resolveCatalog([stored({}), stored({ templateKey: '2d1f6f3e-8f4a-4a53-9b0c-0a1f2b3c4d5e', baseBuiltinKey: null, code: '', title: `${XSS} Mẫu riêng`, level: 'cap_stc' })]);
  const admin = (props: Partial<Parameters<typeof AdminTemplates>[0]> = {}) => renderUi(withAppContext(<AdminTemplates templates={templates} {...props} />));
  const footerClose = (dialog: HTMLElement) => within(dialog).getAllByRole('button', { name: 'Đóng' }).find((b) => b.textContent === 'Đóng')!;
  const rowOf = (text: string | RegExp) => screen.getAllByRole('row').find((r) => (typeof text === 'string' ? r.textContent?.includes(text) : text.test(r.textContent ?? '')))!;

  it('computes the four stat cards from the data, not from fixed text (m3 B26)', () => {
    admin();
    expect(screen.getByText('Tổng biểu mẫu chuẩn').parentElement).toHaveTextContent('24');
    expect(screen.getByText('Cấp Sở Tài chính').parentElement).toHaveTextContent('3');
    expect(screen.getByText('Cấp Trung tâm (SCE)').parentElement).toHaveTextContent('17');
    expect(screen.getByRole('option', { name: 'Tất cả phân cấp thẩm quyền (24 mẫu)' })).toBeInTheDocument();
  });

  it('shows the status of each template, and renders a custom title as text', () => {
    admin();
    expect(rowOf('Kế hoạch đã sửa')).toHaveTextContent('Đã sửa bởi Admin');
    expect(rowOf('Mẫu riêng')).toHaveTextContent('Admin tạo mới');
    expect(rowOf('Mẫu riêng')).toHaveTextContent('Biểu mẫu nội bộ');
    expect(rowOf('Mẫu riêng')).toHaveTextContent(XSS);
    expect(rowOf('Giấy mời Đại biểu cấp cao')).toHaveTextContent('Mẫu gốc SCE');
    expect(document.querySelector('table img, [role=table] img')).toBeNull();
  });

  it('offers reset only for a modified built-in and delete only for an admin-created one', async () => {
    const { user } = admin();
    const items = async (text: string) => {
      await user.click(within(rowOf(text)).getByRole('button', { name: /Thao tác với/ }));
      const names = screen.getAllByRole('menuitem').map((i) => i.textContent);
      await user.keyboard('{Escape}');
      return names;
    };
    expect(await items('Kế hoạch đã sửa')).toEqual(['Chỉnh sửa nội dung', 'Xem trước biểu mẫu', 'Khôi phục về mẫu gốc']);
    expect(await items('Mẫu riêng')).toEqual(['Chỉnh sửa nội dung', 'Xem trước biểu mẫu', 'Xóa biểu mẫu']);
    expect(await items('Giấy mời Đại biểu cấp cao')).toEqual(['Chỉnh sửa nội dung', 'Xem trước biểu mẫu']);
  });

  it('resets after a confirm that names the template, through the command', async () => {
    dispatch.mockResolvedValue({ ok: true, value: null });
    const { user } = admin();
    await user.click(within(rowOf('Kế hoạch đã sửa')).getByRole('button', { name: /Thao tác với/ }));
    await user.click(screen.getByRole('menuitem', { name: /Khôi phục về mẫu gốc/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Mọi sửa đổi của Admin đối với biểu mẫu "Kế hoạch đã sửa" sẽ bị hủy bỏ');
    expect(dispatch).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Đồng ý khôi phục' }));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith('templates.resetOne', { id: 'form_kh_ubnd' }));
  });

  it('warns that admin-created templates are kept before resetting all, and says when there is nothing to reset', async () => {
    dispatch.mockResolvedValue({ ok: true, value: { restored: 1, keptCustom: 1 } });
    const { user, unmount } = admin();
    await user.click(screen.getByRole('button', { name: 'Khôi phục mẫu gốc SCE' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('1 biểu mẫu gốc đã sửa sẽ quay về mẫu chuẩn ban hành. 1 biểu mẫu do Admin tạo được giữ nguyên.');
    await user.click(within(dialog).getByRole('button', { name: 'Hủy' }));
    expect(dispatch).not.toHaveBeenCalled();
    unmount();
    const none = renderUi(withAppContext(<AdminTemplates templates={catalog} />));
    await none.user.click(screen.getByRole('button', { name: 'Khôi phục mẫu gốc SCE' }));
    expect(await screen.findByText('Chưa có biểu mẫu gốc nào bị sửa.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('opens the editor from ?edit= and asks before discarding an unsaved change (m3 B21)', async () => {
    const { user } = admin({ editId: 'form_kh_ubnd' });
    const dialog = await screen.findByRole('dialog', { name: /Sửa đổi biểu mẫu chuẩn: Kế hoạch đã sửa/ });
    expect(within(dialog).getByLabelText(/Tên biểu mẫu chuẩn/)).toHaveValue('Kế hoạch đã sửa');
    await user.click(footerClose(dialog));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();

    admin({ editId: 'form_kh_ubnd' });
    const again = await screen.findByRole('dialog');
    await user.type(within(again).getByLabelText(/Tên biểu mẫu chuẩn/), ' (sửa)');
    await user.click(footerClose(again));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Đóng mà không lưu?');
    await user.click(within(confirm).getByRole('button', { name: 'Tiếp tục chỉnh sửa' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('saves a built-in through saveOverride with the version it loaded, and a custom one through updateCustom', async () => {
    dispatch.mockResolvedValue({ ok: true, value: null });
    const { user, unmount } = admin({ editId: 'form_kh_ubnd' });
    await user.type(within(await screen.findByRole('dialog')).getByLabelText(/Tên biểu mẫu chuẩn/), '!');
    await user.click(screen.getByRole('button', { name: 'Lưu cập nhật biểu mẫu chuẩn' }));
    await waitFor(() => expect(dispatch).toHaveBeenCalled());
    expect(dispatch).toHaveBeenCalledWith('templates.saveOverride', { id: 'form_kh_ubnd', version: 3, draft: expect.objectContaining({ title: 'Kế hoạch đã sửa!', code: 'KH-UBND', level: 'cap_ubnd' }) });
    unmount();
    dispatch.mockClear();
    const custom = '2d1f6f3e-8f4a-4a53-9b0c-0a1f2b3c4d5e';
    const second = admin({ editId: custom });
    await second.user.click(await screen.findByRole('button', { name: 'Lưu cập nhật biểu mẫu chuẩn' }));
    await waitFor(() => expect(dispatch).toHaveBeenCalled());
    expect(dispatch.mock.calls[0]![0]).toBe('templates.updateCustom');
    expect(dispatch.mock.calls[0]![1]).toMatchObject({ id: custom as TemplateId, version: 3 });
  });

  it('refuses to save without a title, naming the field, and sends nothing', async () => {
    const { user } = admin();
    await user.click(screen.getByRole('button', { name: 'Thêm biểu mẫu mới' }));
    const dialog = await screen.findByRole('dialog', { name: /Thêm biểu mẫu chuẩn mới/ });
    await user.click(within(dialog).getByRole('button', { name: 'Lưu cập nhật biểu mẫu chuẩn' }));
    expect(await within(dialog).findByText('Nhập tên biểu mẫu chuẩn')).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('restores every field of the original, including level and kind, from the editor (m3 B27)', async () => {
    const t = resolveCatalog([stored({ level: 'cap_stc', kind: 'grid', title: 'Đổi hết' })]);
    const { user } = renderUi(withAppContext(<AdminTemplates templates={t} editId="form_kh_ubnd" />));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Nhóm quy trình')).toHaveValue('cap_stc');
    await user.click(within(dialog).getByRole('button', { name: 'Khôi phục mẫu gốc SCE' }));
    expect(within(dialog).getByLabelText('Nhóm quy trình')).toHaveValue('cap_ubnd');
    expect(within(dialog).getByLabelText('Định dạng biểu mẫu')).toHaveValue('doc');
    expect(within(dialog).getByLabelText(/Tên biểu mẫu chuẩn/)).toHaveValue('Kế hoạch tổ chức chương trình sự kiện (UBND Thành phố Hà Nội)');
    expect(within(dialog).getByRole('status')).toHaveTextContent('Có thay đổi chưa lưu');
  });
});
