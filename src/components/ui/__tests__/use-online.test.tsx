import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOnline } from '@/components/ui';

afterEach(() => vi.restoreAllMocks());

describe('useOnline (exported from the kit)', () => {
  it('follows the browser online and offline events', () => {
    const online = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
    online.mockReturnValue(false);
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(result.current).toBe(false);
    online.mockReturnValue(true);
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(result.current).toBe(true);
  });
});
