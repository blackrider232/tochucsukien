import { Alert, Button, SectionCard } from '@/components/ui';

/** /pending: what an unfinished account can do. The status comes from the session's gate, never from the URL. */
export function PendingScreen({ status }: { status: 'pending' | 'locked' }) {
  const locked = status === 'locked';
  return (
    <SectionCard
      title={locked ? 'Tài khoản đã bị khóa' : 'Tài khoản đang chờ phê duyệt'}
      subtitle={locked ? 'Bạn không thể xem hay sửa dữ liệu sự kiện.' : 'Quản trị viên cần duyệt trước khi bạn dùng được hệ thống.'}
      icon={locked ? 'lock' : 'clock'}
    >
      <div className="space-y-4">
        <Alert tone={locked ? 'danger' : 'info'}>
          {locked
            ? 'Liên hệ quản trị viên của Trung tâm để được mở khóa. Sau khi mở khóa, tải lại trang này.'
            : 'Hệ thống đã ghi nhận đăng ký của bạn. Khi quản trị viên duyệt, tải lại trang này để vào hệ thống.'}
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Button href="/pending" variant="secondary" icon="refresh">Tải lại</Button>
          <form method="post" action="/auth/signout">
            <Button type="submit" variant="ghost" icon="log-out">Đăng xuất</Button>
          </form>
        </div>
      </div>
    </SectionCard>
  );
}
