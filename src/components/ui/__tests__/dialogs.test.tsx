import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDialogs } from '../dialogs';
import { renderUi } from './helpers';

function Probe({ onResult }: { onResult: (r: unknown) => void }) {
  const dialogs = useDialogs();
  return (
    <>
      <button onClick={async () => onResult(await dialogs.confirm({ title: 'Xóa khách?', text: '<img src=x onerror=alert(1)> Không hoàn tác được', tone: 'danger', confirmLabel: 'Xóa' }))}>confirm</button>
      <button onClick={async () => onResult(await dialogs.prompt({ title: 'Lý do', label: 'Nhập lý do', required: true, defaultValue: '' }))}>prompt</button>
      <button onClick={async () => onResult(await dialogs.alert({ title: 'Đã lưu', text: 'Xong' }))}>alert</button>
    </>
  );
}

describe('useDialogs', () => {
  it('confirm resolves true on the confirm button and false on cancel', async () => {
    const results: unknown[] = [];
    const { user } = renderUi(<Probe onResult={(r) => results.push(r)} />);
    await user.click(screen.getByRole('button', { name: 'confirm' }));
    await user.click(await screen.findByRole('button', { name: 'Xóa' }));
    await waitFor(() => expect(results).toEqual([true]));
    await user.click(screen.getByRole('button', { name: 'confirm' }));
    await user.click(await screen.findByRole('button', { name: 'Hủy' }));
    await waitFor(() => expect(results).toEqual([true, false]));
  });

  it('confirm resolves false on Escape and focuses the safe button of a dangerous confirm', async () => {
    const results: unknown[] = [];
    const { user } = renderUi(<Probe onResult={(r) => results.push(r)} />);
    await user.click(screen.getByRole('button', { name: 'confirm' }));
    expect(await screen.findByRole('button', { name: 'Hủy' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(results).toEqual([false]));
  });

  it('renders option text as text, never as HTML', async () => {
    const { user, baseElement } = renderUi(<Probe onResult={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'confirm' }));
    expect(await screen.findByText(/Không hoàn tác được/)).toHaveTextContent('<img src=x onerror=alert(1)>');
    expect(baseElement.querySelector('img')).toBeNull();
  });

  it('prompt rejects an empty required value, then resolves the typed text; cancel resolves null', async () => {
    const results: unknown[] = [];
    const { user } = renderUi(<Probe onResult={(r) => results.push(r)} />);
    await user.click(screen.getByRole('button', { name: 'prompt' }));
    await user.click(await screen.findByRole('button', { name: 'Xác nhận' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Vui lòng nhập nội dung.');
    await user.type(screen.getByLabelText(/Nhập lý do/), 'Khách hủy');
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(results).toEqual(['Khách hủy']));
    await user.click(screen.getByRole('button', { name: 'prompt' }));
    await user.click(await screen.findByRole('button', { name: 'Hủy' }));
    await waitFor(() => expect(results).toEqual(['Khách hủy', null]));
  });

  it('alert has a single acknowledge button and resolves', async () => {
    const results: unknown[] = [];
    const { user } = renderUi(<Probe onResult={(r) => results.push(r)} />);
    await user.click(screen.getByRole('button', { name: 'alert' }));
    expect(screen.queryByRole('button', { name: 'Hủy' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Đã hiểu' }));
    await waitFor(() => expect(results).toEqual([undefined]));
  });
});
