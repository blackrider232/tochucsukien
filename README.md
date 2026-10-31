# Phần mềm Quản trị Tổ chức Sự kiện SCE (SCE Event Management)

Hệ thống quản trị quy trình, hậu cần, biểu mẫu và điều hành sự kiện trực thuộc **Trung tâm Xúc tiến Đầu tư và Hỗ trợ Doanh nghiệp Hà Nội (SCE) - Sở Tài chính Hà Nội**.

## 1. Tính năng nổi bật
- **Tiến độ Sự kiện 4 Tầng (Progressive Disclosure):** Tự động tính hạn chót ngày làm việc, đếm ngược sự kiện ($T-45$ đến $T_0$, $T+3$) và kích hoạt chế độ báo cáo hàng ngày ($T-10$).
- **Smart Template Studio:** Tích hợp sẵn thư viện >25 biểu mẫu hành chính chuẩn Nghị định 30/2020/NĐ-CP, hỗ trợ soạn thảo trực tiếp trên khổ A4 và xuất file Word, Excel, PDF.
- **Quản lý Khách mời & Gian hàng CRM:** Kiểm soát chỉ tiêu danh sách khách mời ($\ge 130\%$), in biển tên chữ A để bàn và thẻ đại biểu QR ($\ge 120\%$), quản lý gian hàng hội chợ triển lãm.
- **Tác nghiệp Hiện trường Giờ G:** Checklist kiểm tra trước khai mạc ($T_0 - 2\text{h}$), trực hội trường, check-in đại biểu qua điện thoại và ghi nhận sự cố phát sinh.
- **Báo cáo & Tổng kết:** Tự động sinh báo cáo UBND Thành phố, tổng hợp kết quả truyền thông báo chí.
- **Xác thực & Bảo mật:** Tích hợp Supabase Auth (Email/Password, Bcrypt, 2FA TOTP và Google OAuth), phân quyền RBAC 4 phòng ban chuyên môn.

## 2. Công nghệ sử dụng
- Single Page Application (SPA) / Progressive Web App (PWA).
- Tailwind CSS, Font Awesome 6, SweetAlert2.
- Supabase JS SDK v2.
