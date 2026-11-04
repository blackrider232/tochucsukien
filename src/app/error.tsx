'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main-content" className="mx-auto flex min-h-dvh max-w-lg items-center justify-center p-4">
      <div role="alert" className="w-full rounded-card border border-line bg-surface shadow-card">
        <EmptyState
          icon="alert-triangle"
          title="Đã xảy ra lỗi"
          text={error.digest ? `Vui lòng thử lại. Nếu lỗi lặp lại, báo mã lỗi ${error.digest} cho quản trị viên.` : 'Vui lòng thử lại. Nếu lỗi lặp lại, báo cho quản trị viên.'}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={reset}>Thử lại</Button>
              <Link href="/" className="inline-flex min-h-touch items-center rounded-control border border-line-strong px-4 text-sm font-semibold text-ink hover:bg-surface-3">
                Về trang chủ
              </Link>
            </div>
          }
        />
      </div>
    </main>
  );
}
