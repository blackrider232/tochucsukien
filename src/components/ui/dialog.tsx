'use client';

import { useCallback } from 'react';
import type { DialogProps } from './kit.types';
import { DialogShell } from './dialog-shell';
import { useDialogs } from './dialogs';

/** Modal dialog. With `dirty`, every close path asks "Đóng mà không lưu?" first. */
export function Dialog({ dirty, onClose, ...rest }: DialogProps) {
  const dialogs = useDialogs();
  const requestClose = useCallback(async () => {
    if (dirty) {
      const discard = await dialogs.confirm({
        title: 'Đóng mà không lưu?',
        text: 'Các thay đổi chưa lưu sẽ bị mất.',
        confirmLabel: 'Đóng, không lưu',
        cancelLabel: 'Tiếp tục chỉnh sửa',
        tone: 'warning',
      });
      if (!discard) return;
    }
    onClose();
  }, [dirty, dialogs, onClose]);

  return <DialogShell {...rest} onRequestClose={requestClose} />;
}
