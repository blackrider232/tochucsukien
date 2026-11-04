'use client';

import { useEffect } from 'react';
import { Button, EmptyState } from '@/components/ui';

// Inside the shell: a failing module shows one panel, and the rest of the app stays reachable.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="rounded-card border border-line bg-surface shadow-card">
      <EmptyState
        icon="alert-triangle"
        title="Đã xảy ra lỗi"
        text={error.digest ? `Vui lòng thử lại. Nếu lỗi lặp lại, báo mã lỗi ${error.digest} cho quản trị viên.` : 'Vui lòng thử lại. Nếu lỗi lặp lại, báo cho quản trị viên.'}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={reset}>Thử lại</Button>
            <Button href="/events" variant="secondary">Về danh sách sự kiện</Button>
          </div>
        }
      />
    </div>
  );
}
