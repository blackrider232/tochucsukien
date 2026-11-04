import { screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Alert } from '../alert';
import { Button, IconButton } from '../button';
import { Checkbox, RadioGroup, Switch, Textarea } from '../controls';
import { DataTable } from '../data-table';
import { Form, FormField, useZodForm } from '../form';
import type { Column } from '../kit.types';
import { RowMenu } from '../row-menu';
import { renderUi } from './helpers';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

describe('Button', () => {
  it('with href is a link that looks like the button', () => {
    renderUi(<Button href="/events/new" icon="plus">Tạo sự kiện</Button>);
    expect(screen.getByRole('link', { name: 'Tạo sự kiện' })).toHaveAttribute('href', '/events/new');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('with newTab opens safely and says so', () => {
    renderUi(<Button href="/in" newTab variant="secondary">In</Button>);
    const link = screen.getByRole('link', { name: 'In (mở tab mới)' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('while loading stays focusable, is busy and aria-disabled, and ignores clicks and submits', async () => {
    const onClick = vi.fn();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const { user } = renderUi(
      <form onSubmit={onSubmit}>
        <Button loading onClick={onClick}>Lưu</Button>
        <Button type="submit" loading>Gửi</Button>
      </form>,
    );
    const save = screen.getByRole('button', { name: 'Lưu' });
    expect(save).not.toBeDisabled();
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(save).toHaveAttribute('aria-busy', 'true');
    await user.click(save);
    await user.click(screen.getByRole('button', { name: 'Gửi' }));
    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('pressed is a toggle', () => {
    renderUi(<Button variant="secondary" pressed>Chỉ VIP</Button>);
    expect(screen.getByRole('button', { name: 'Chỉ VIP' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('IconButton carries any tone through data-tone', () => {
    renderUi(<IconButton icon="trash" label="Xóa" tone="blue" />);
    expect(screen.getByRole('button', { name: 'Xóa' })).toHaveAttribute('data-tone', 'blue');
  });
});

const schema = z.object({
  note: z.string().min(1, 'Nhập ghi chú'),
  channel: z.enum(['email', 'zalo'], { error: 'Chọn kênh gửi' }),
});

function FormHarness({ onValid }: { onValid: (v: unknown) => void }) {
  const form = useZodForm(schema, { defaultValues: { note: '' } });
  return (
    <Form form={form} onSubmit={onValid}>
      <FormField label="Ghi chú" name="note" required><Textarea name="note" rows={4} /></FormField>
      <RadioGroup name="channel" label="Kênh gửi" required options={[{ value: 'email', label: 'Email' }, { value: 'zalo', label: 'Zalo', description: 'Tin nhắn Zalo OA' }]} />
      <button type="submit">Lưu</button>
    </Form>
  );
}

describe('form primitives', () => {
  it('Textarea and RadioGroup bind to the form, show errors and submit values', async () => {
    const onValid = vi.fn();
    const { user } = renderUi(<FormHarness onValid={onValid} />);
    const note = screen.getByRole('textbox', { name: /Ghi chú/ });
    expect(note.tagName).toBe('TEXTAREA');
    expect(note).toHaveAttribute('rows', '4');
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Nhập ghi chú')).toBeInTheDocument();
    const group = screen.getByRole('radiogroup', { name: /Kênh gửi/ });
    expect(group).toHaveAttribute('aria-invalid', 'true');
    expect(group).toHaveAccessibleDescription('Chọn kênh gửi');
    await user.type(note, 'Gọi trước 1 ngày');
    await user.click(within(group).getByRole('radio', { name: /Zalo/ }));
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(onValid).toHaveBeenCalledWith({ note: 'Gọi trước 1 ngày', channel: 'zalo' }, expect.anything());
  });

  it('RadioGroup outside a form posts its defaultValue', () => {
    renderUi(<RadioGroup name="role" label="Vai trò" defaultValue="user" options={[{ value: 'admin', label: 'Quản trị' }, { value: 'user', label: 'Chuyên viên' }]} />);
    expect(screen.getByRole('radio', { name: 'Chuyên viên' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Chuyên viên' })).toHaveAttribute('name', 'role');
  });

  it('Checkbox is controlled outside a form and strikes a done task', async () => {
    function Task() {
      const [done, setDone] = useState(false);
      return <Checkbox name="t1" label="Gửi giấy mời" checked={done} onChange={setDone} strike />;
    }
    const { user } = renderUi(<Task />);
    const box = screen.getByRole('checkbox', { name: 'Gửi giấy mời' });
    await user.click(box);
    expect(box).toBeChecked();
    expect(screen.getByText('Gửi giấy mời')).toHaveClass('line-through');
  });

  it('Switch is a labelled role=switch that reports the next state', async () => {
    const onChange = vi.fn();
    const { user } = renderUi(<Switch checked={false} onChange={onChange} label="Âm báo check-in" description="Phát tiếng bíp khi quét" />);
    const sw = screen.getByRole('switch', { name: 'Âm báo check-in' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(sw).toHaveAccessibleDescription('Phát tiếng bíp khi quét');
    await user.click(screen.getByText('Âm báo check-in'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('Alert', () => {
  it('names its tone for screen readers and uses a distinct icon per tone', () => {
    const { container } = renderUi(
      <>
        <Alert tone="danger" title="Không lưu được">Kiểm tra mạng rồi thử lại.</Alert>
        <Alert tone="info">Danh sách đã được nhập.</Alert>
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Lỗi: Không lưu đượcKiểm tra mạng rồi thử lại.');
    expect(screen.getByRole('status')).toHaveTextContent('Thông tin: Danh sách đã được nhập.');
    const icons = [...container.querySelectorAll('[data-tone] > svg')].map((s) => s.getAttribute('class') ?? '');
    expect(new Set(icons.map((c) => c.match(/lucide-[\w-]+/)?.[0])).size).toBe(2);
  });
});

describe('RowMenu', () => {
  it('opens on the first item, moves with arrows, runs an item and returns focus to the trigger', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const { user } = renderUi(
      <RowMenu
        label="Thao tác với Nguyễn Văn An"
        items={[
          { id: 'edit', label: 'Sửa', icon: 'pencil', onSelect: onEdit },
          { id: 'skip', label: 'Gửi lại thư mời', disabled: true, onSelect: vi.fn() },
          { id: 'delete', label: 'Xóa', icon: 'trash', tone: 'danger', onSelect: onDelete },
        ]}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Thao tác với Nguyễn Văn An' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'Sửa' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Xóa' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Sửa' })).toHaveFocus();
    await user.keyboard('{End}{Enter}');
    expect(onDelete).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes on Escape with focus back on the trigger, and ignores disabled items', async () => {
    const onSkip = vi.fn();
    const { user } = renderUi(<RowMenu items={[{ id: 'skip', label: 'Gửi lại', disabled: true, onSelect: onSkip }, { id: 'open', label: 'Mở', href: '/events/e1' }]} />);
    const trigger = screen.getByRole('button', { name: 'Thao tác' });
    await user.click(trigger);
    expect(screen.getByRole('menuitem', { name: 'Mở' })).toHaveAttribute('href', '/events/e1');
    await user.click(screen.getByRole('menuitem', { name: 'Gửi lại' }));
    expect(onSkip).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

interface Guest { id: string; name: string; org: string }
const COLUMNS: Column<Guest>[] = [
  { id: 'name', header: 'Họ tên', cell: (g) => g.name },
  { id: 'org', header: 'Đơn vị', cell: (g) => g.org, hideOnMobile: true },
  { id: 'actions', header: 'Thao tác', cell: (g) => <RowMenu label={`Thao tác với ${g.name}`} items={[{ id: 'edit', label: 'Sửa', onSelect: () => {} }]} /> },
];
const EMPTY = { icon: 'users' as const, title: 'Chưa có khách mời' };

describe('DataTable phone and loading states', () => {
  it('shows skeleton rows and aria-busy while loading instead of the empty state', () => {
    renderUi(<DataTable rows={[]} columns={COLUMNS} rowKey={(g) => g.id} empty={EMPTY} loading />);
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải dữ liệu…');
    expect(screen.queryByText('Chưa có khách mời')).not.toBeInTheDocument();
  });

  it('hides hideOnMobile cells below md and keeps checkbox, number and title on one line', () => {
    renderUi(
      <DataTable rows={[{ id: '1', name: 'Nguyễn Văn An', org: 'Sở KH&ĐT' }]} columns={COLUMNS} rowKey={(g) => g.id} empty={EMPTY} numbered
        selection={{ selected: new Set(), onChange: () => {} }} rowTone={() => 'rose'} />,
    );
    const row = screen.getAllByRole('row')[1]!;
    const cells = within(row).getAllByRole('cell');
    expect(cells[3]).toHaveClass('max-md:hidden');
    const titleLine = cells[0]!.parentElement!;
    expect(titleLine).toHaveClass('md:contents');
    expect(within(titleLine).getAllByRole('cell')).toHaveLength(3);
    expect(row.className).not.toMatch(/border-l-4/);
    expect(within(row).getByRole('button', { name: 'Thao tác với Nguyễn Văn An' })).toBeInTheDocument();
  });
});
