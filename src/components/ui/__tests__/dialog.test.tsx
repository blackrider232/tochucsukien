import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Dialog } from '../dialog';
import { renderUi } from './helpers';

function Harness({ dirty = false }: { dirty?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Mở hộp thoại</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Sửa khách mời" subtitle="Nhập thông tin" dirty={dirty} footer={<button>Lưu</button>}>
        <input aria-label="Họ tên" />
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('exposes an accessible modal dialog and focuses its first control', async () => {
    const { user } = renderUi(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Mở hộp thoại' }));
    const dialog = screen.getByRole('dialog', { name: 'Sửa khách mời' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Nhập thông tin');
    expect(screen.getByLabelText('Họ tên')).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('traps Tab inside the dialog in both directions', async () => {
    const { user } = renderUi(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Mở hộp thoại' }));
    const close = screen.getByRole('button', { name: 'Đóng' });
    const save = screen.getByRole('button', { name: 'Lưu' });
    expect(screen.getByLabelText('Họ tên')).toHaveFocus();
    await user.tab();
    expect(save).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(save).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(screen.getByLabelText('Họ tên')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Mở hộp thoại' })).not.toHaveFocus();
  });

  it('closes on Escape, returns focus to the opener and unlocks scroll', async () => {
    const { user } = renderUi(<Harness />);
    const opener = screen.getByRole('button', { name: 'Mở hộp thoại' });
    await user.click(opener);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
  });

  it('asks before closing a dirty dialog and keeps it open when the user keeps editing', async () => {
    const { user } = renderUi(<Harness dirty />);
    await user.click(screen.getByRole('button', { name: 'Mở hộp thoại' }));
    await user.keyboard('{Escape}');
    const ask = await screen.findByRole('alertdialog', { name: 'Đóng mà không lưu?' });
    expect(ask).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tiếp tục chỉnh sửa' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Sửa khách mời' })).toBeInTheDocument();
  });

  it('closes a dirty dialog after the user discards the changes', async () => {
    const { user } = renderUi(<Harness dirty />);
    await user.click(screen.getByRole('button', { name: 'Mở hộp thoại' }));
    await user.click(screen.getByRole('button', { name: 'Đóng' }));
    await user.click(await screen.findByRole('button', { name: 'Đóng, không lưu' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
