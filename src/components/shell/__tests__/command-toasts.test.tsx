import { act, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import '@/components/ui/__tests__/helpers';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/core/commands/dispatch', () => ({
  dispatch: async () => ({ ok: false, kind: 'conflict', message: 'Dữ liệu đã được người khác cập nhật. Đang tải lại…' }),
}));

const { useCommand } = await import('@/core/commands');
const { CommandToasts } = await import('../command-toasts');

describe('CommandToasts', () => {
  it('shows a command failure as a kit toast', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ToastProvider><CommandToasts>{children}</CommandToasts></ToastProvider>
    );
    const { result } = renderHook(() => useCommand(), { wrapper });
    await act(() => result.current('guests.update' as never, {} as never));
    expect(screen.getByText('Dữ liệu đã được người khác cập nhật. Đang tải lại…')).toBeInTheDocument();
  });
});
