import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandResult } from '@/core/commands';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const dispatch = vi.fn<(id: string, input: unknown) => Promise<CommandResult<unknown>>>();
vi.mock('./dispatch', () => ({ dispatch: (id: string, input: unknown) => dispatch(id, input) }));

const { CommandFeedbackProvider, clearUndo, useCommand, useCommandResult, useUndo } = await import('./client');

const notes: Array<[string, string]> = [];
const wrapper = ({ children }: { children: ReactNode }) => (
  <CommandFeedbackProvider value={{ notify: (tone, text) => notes.push([tone, text]) }}>{children}</CommandFeedbackProvider>
);
const hooks = () => renderHook(() => ({ run: useCommand(), result: useCommandResult(), undo: useUndo() }), { wrapper });
const OFFLINE = 'Ngoại tuyến: chưa gửi được thay đổi. Chờ có mạng lại rồi thử lại.';
const goOffline = () => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
const inverse = (label: string) => ({ command: 'guests.delete', input: { id: label }, label }) as never;

beforeEach(() => {
  refresh.mockReset();
  dispatch.mockReset();
  notes.length = 0;
  clearUndo();
  vi.restoreAllMocks();
});

describe('useCommand', () => {
  it('returns the value, toasts the explicit success text and refreshes', async () => {
    dispatch.mockResolvedValueOnce({ ok: true, value: 7 });
    const { result } = hooks();
    let value: unknown;
    await act(async () => {
      value = await result.current.run('guests.update' as never, {} as never, { success: 'Đã cập nhật: A' });
    });
    expect(value).toBe(7);
    expect(notes).toEqual([['success', 'Đã cập nhật: A']]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('is silent on success without a success text', async () => {
    dispatch.mockResolvedValueOnce({ ok: true, value: null });
    const { result } = hooks();
    await act(() => result.current.run('guests.update' as never, {} as never));
    expect(notes).toEqual([]);
  });

  it('always toasts failures; a conflict warns and reloads (core B15)', async () => {
    dispatch.mockResolvedValueOnce({ ok: false, kind: 'conflict', message: 'Dữ liệu đã được người khác cập nhật. Đang tải lại…' });
    dispatch.mockResolvedValueOnce({ ok: false, kind: 'forbidden', message: 'Bạn không có quyền thực hiện thao tác này.' });
    const { result } = hooks();
    let first: unknown = 'unset';
    await act(async () => {
      first = await result.current.run('guests.update' as never, {} as never, { success: 'x' });
    });
    expect(first).toBeUndefined();
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(() => result.current.run('guests.update' as never, {} as never));
    expect(notes).toEqual([
      ['warning', 'Dữ liệu đã được người khác cập nhật. Đang tải lại…'],
      ['error', 'Bạn không có quyền thực hiện thao tác này.'],
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('a change saved without its audit row warns with that message instead of the success text, and keeps the value and the undo', async () => {
    const unaudited = 'Đã lưu thay đổi nhưng chưa ghi được nhật ký hệ thống. Vui lòng báo quản trị viên, không thực hiện lại.';
    dispatch.mockResolvedValueOnce({ ok: true, value: 7, inverse: inverse('Thêm A'), unaudited });
    const { result } = hooks();
    let value: unknown;
    await act(async () => {
      value = await result.current.run('guests.create' as never, {} as never, { success: 'Đã thêm: A' });
    });
    expect(value).toBe(7);
    expect(notes).toEqual([['warning', unaudited]]);
    expect(result.current.undo).toMatchObject({ canUndo: true, undoLabel: 'Thêm A' });
  });

  it('a network failure becomes an error toast, not an exception', async () => {
    dispatch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = hooks();
    await act(() => result.current.run('guests.update' as never, {} as never));
    expect(notes).toEqual([['error', 'Không kết nối được máy chủ. Vui lòng thử lại.']]);
  });

  it('useCommandResult returns the whole result, so a caller tells a refusal from a failed request (live G)', async () => {
    dispatch.mockResolvedValueOnce({ ok: false, kind: 'conflict', message: 'Đã có người check-in.' });
    dispatch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    dispatch.mockResolvedValueOnce({ ok: true, value: undefined });
    const { result } = hooks();
    const got: unknown[] = [];
    await act(async () => {
      got.push(await result.current.result('live.checkIn' as never, {} as never));
      got.push(await result.current.result('live.checkIn' as never, {} as never));
      got.push(await result.current.result('live.checkIn' as never, {} as never, { success: 'Đã check-in' }));
    });
    expect(got).toEqual([
      { ok: false, kind: 'conflict', message: 'Đã có người check-in.' },
      { ok: false, kind: 'unavailable', message: 'Không kết nối được máy chủ. Vui lòng thử lại.' },
      { ok: true, value: undefined },
    ]);
    expect(notes).toEqual([
      ['warning', 'Đã có người check-in.'],
      ['error', 'Không kết nối được máy chủ. Vui lòng thử lại.'],
      ['success', 'Đã check-in'],
    ]);
  });

  it('offline (decision 6): sends nothing, says Ngoại tuyến and answers kind offline', async () => {
    goOffline();
    const { result } = hooks();
    let value: unknown = 'unset';
    let full: unknown;
    await act(async () => {
      value = await result.current.run('guests.update' as never, {} as never, { success: 'x' });
      full = await result.current.result('guests.update' as never, {} as never);
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(value).toBeUndefined();
    expect(full).toEqual({ ok: false, kind: 'offline', message: OFFLINE });
    expect(notes).toEqual([
      ['warning', OFFLINE],
      ['warning', OFFLINE],
    ]);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('useUndo', () => {
  it('pushes inverses, undoes through dispatch and offers redo', async () => {
    dispatch.mockResolvedValueOnce({ ok: true, value: 1, inverse: inverse('Thêm A') });
    const { result } = hooks();
    await act(() => result.current.run('guests.create' as never, {} as never));
    expect(result.current.undo).toMatchObject({ canUndo: true, undoLabel: 'Thêm A', canRedo: false });

    dispatch.mockResolvedValueOnce({ ok: true, value: null, inverse: inverse('Xóa A') });
    await act(() => result.current.undo.undo());
    expect(dispatch).toHaveBeenLastCalledWith('guests.delete', { id: 'Thêm A' });
    expect(result.current.undo).toMatchObject({ canUndo: false, canRedo: true, redoLabel: 'Xóa A' });

    dispatch.mockResolvedValueOnce({ ok: true, value: 1, inverse: inverse('Thêm A') });
    await act(() => result.current.undo.redo());
    expect(result.current.undo).toMatchObject({ canUndo: true, canRedo: false, undoLabel: 'Thêm A' });
  });

  it('a failed undo is reported and dropped from the stack', async () => {
    dispatch.mockResolvedValueOnce({ ok: true, value: 1, inverse: inverse('Thêm A') });
    const { result } = hooks();
    await act(() => result.current.run('guests.create' as never, {} as never));
    dispatch.mockResolvedValueOnce({ ok: false, kind: 'forbidden', message: 'Bạn không có quyền thực hiện thao tác này.' });
    await act(() => result.current.undo.undo());
    expect(notes.at(-1)).toEqual(['error', 'Bạn không có quyền thực hiện thao tác này.']);
    expect(result.current.undo).toMatchObject({ canUndo: false, canRedo: false });
  });

  it('an undo saved without its audit row warns with that message instead of "Đã hoàn tác", and still offers redo', async () => {
    const unaudited = 'Đã lưu thay đổi nhưng chưa ghi được nhật ký hệ thống. Vui lòng báo quản trị viên, không thực hiện lại.';
    dispatch.mockResolvedValueOnce({ ok: true, value: 1, inverse: inverse('Thêm A') });
    const { result } = hooks();
    await act(() => result.current.run('guests.create' as never, {} as never));
    dispatch.mockResolvedValueOnce({ ok: true, value: null, inverse: inverse('Xóa A'), unaudited });
    await act(() => result.current.undo.undo());
    expect(notes).toEqual([['warning', unaudited]]);
    expect(result.current.undo).toMatchObject({ canUndo: false, canRedo: true, redoLabel: 'Xóa A' });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('offline: an undo sends nothing, says Ngoại tuyến and keeps the inverse for later', async () => {
    dispatch.mockResolvedValueOnce({ ok: true, value: 1, inverse: inverse('Thêm A') });
    const { result } = hooks();
    await act(() => result.current.run('guests.create' as never, {} as never));
    goOffline();
    await act(() => result.current.undo.undo());
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(notes.at(-1)).toEqual(['warning', OFFLINE]);
    expect(result.current.undo).toMatchObject({ canUndo: true, undoLabel: 'Thêm A', canRedo: false });
  });

  it('a new command clears redo; undoable:false keeps it off the stack; the stack holds 30', async () => {
    const { result } = hooks();
    for (let i = 0; i < 32; i++) {
      dispatch.mockResolvedValueOnce({ ok: true, value: i, inverse: inverse(`#${i}`) });
      await act(() => result.current.run('guests.create' as never, {} as never));
    }
    dispatch.mockResolvedValueOnce({ ok: true, value: 0, inverse: inverse('toggle') });
    await act(() => result.current.run('guests.update' as never, {} as never, { undoable: false }));
    expect(result.current.undo.undoLabel).toBe('#31');
    let undone = 0;
    dispatch.mockResolvedValue({ ok: true, value: null });
    while (result.current.undo.canUndo) {
      await act(() => result.current.undo.undo());
      undone += 1;
    }
    expect(undone).toBe(30);
  });
});
