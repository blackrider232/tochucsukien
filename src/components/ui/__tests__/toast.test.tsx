import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToast } from '../toast';
import { renderUi } from './helpers';

function Probe() {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast.success('Đã lưu <b>xong</b>')}>ok</button>
      <button onClick={() => toast.error('Không lưu được')}>fail</button>
    </>
  );
}

describe('useToast', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('shows plain text as a status and removes it after 4 seconds', () => {
    const { baseElement } = renderUi(<Probe />);
    act(() => screen.getByRole('button', { name: 'ok' }).click());
    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Đã lưu <b>xong</b>');
    expect(baseElement.querySelector('b')).toBeNull();
    act(() => { vi.advanceTimersByTime(3900); });
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('announces errors as alerts, keeps them longer, and can be dismissed', () => {
    renderUi(<Probe />);
    act(() => screen.getByRole('button', { name: 'fail' }).click());
    expect(screen.getByRole('alert')).toHaveTextContent('Lỗi: Không lưu được');
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    act(() => screen.getByRole('button', { name: 'Đóng thông báo' }).click());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
