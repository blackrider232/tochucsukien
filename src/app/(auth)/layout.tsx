import Image from 'next/image';
import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/ui';

// Sign-in screens render before a session exists: no shell, one centred column.
export const dynamic = 'force-dynamic';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main-content" tabIndex={-1} className="min-h-dvh bg-app px-4 py-8 outline-none sm:py-12">
      <div className="mx-auto w-full max-w-md space-y-5">
        <div className="flex justify-end">
          <ThemeToggle />
        </div>
        <header className="flex flex-col items-center gap-2 text-center">
          <Image src="/icons/logo-192.png" alt="" width={166} height={64} priority className="h-16 w-auto" />
          <h1 className="text-xl font-bold text-ink">Quản trị tổ chức sự kiện</h1>
          <p className="text-sm text-ink-2">Trung tâm Xúc tiến đầu tư và Hỗ trợ doanh nghiệp Hà Nội</p>
        </header>
        {children}
      </div>
    </main>
  );
}
