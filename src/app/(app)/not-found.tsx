import { Button, EmptyState } from '@/components/ui';

// Inside the shell, so a missing page or an event the user cannot see keeps the sidebar.
export default function AppNotFound() {
  return (
    <div className="rounded-card border border-line bg-surface shadow-card">
      <EmptyState
        icon="map"
        title="Không tìm thấy trang hoặc sự kiện"
        text="Đường dẫn không đúng, sự kiện đã bị xóa, hoặc bạn không có quyền xem nội dung này."
        action={<Button href="/events" icon="arrow-left">Về danh sách sự kiện</Button>}
      />
    </div>
  );
}
