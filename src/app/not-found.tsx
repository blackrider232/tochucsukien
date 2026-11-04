import { Button, EmptyState } from '@/components/ui';

export default function NotFound() {
  return (
    <main id="main-content" className="mx-auto flex min-h-dvh max-w-lg items-center justify-center p-4">
      <div className="w-full rounded-card border border-line bg-surface shadow-card">
        <EmptyState
          icon="map"
          title="Không tìm thấy trang"
          text="Đường dẫn không đúng, hoặc bạn không có quyền xem nội dung này."
          action={<Button href="/">Về trang chủ</Button>}
        />
      </div>
    </main>
  );
}
