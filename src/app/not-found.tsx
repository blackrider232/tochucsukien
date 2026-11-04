import Link from 'next/link';
import { EmptyState } from '@/components/ui/empty-state';

export default function NotFound() {
  return (
    <main id="main-content" className="mx-auto flex min-h-dvh max-w-lg items-center justify-center p-4">
      <div className="w-full rounded-card border border-line bg-surface shadow-card">
        <EmptyState
          icon="map"
          title="Không tìm thấy trang"
          text="Đường dẫn không đúng, hoặc bạn không có quyền xem nội dung này."
          action={
            <Link href="/" className="inline-flex min-h-touch items-center rounded-control bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-hover">
              Về trang chủ
            </Link>
          }
        />
      </div>
    </main>
  );
}
