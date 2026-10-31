# HỆ THỐNG QUẢN TRỊ TỔ CHỨC SỰ KIỆN & HỘI CHỢ TRIỂN LÃM (SCE EVENT MANAGEMENT)
## MASTER PROJECT KNOWLEDGE BASE & SYSTEM ARCHITECTURE SPECIFICATION

> **LƯU Ý CỐT LÕI CHO TOÀN BỘ AI AGENTS VÀ LẬP TRÌNH VIÊN:**  
> Tài liệu này là **Single Source of Truth (Nguồn chân lý duy nhất)** của dự án. Mọi tác vụ đọc hiểu, tạo mới phân hệ, sửa đổi mã nguồn, cập nhật biểu mẫu hoặc cấu hình hạ tầng đều bắt buộc phải tuân thủ và đồng bộ với tri thức được định nghĩa trong file này.

---

## 1. TỔNG QUAN DỰ ÁN & ĐƠN VỊ SỬ DỤNG

- **Tên dự án:** Phần mềm Quản trị Tổ chức Sự kiện & Hội chợ Triển lãm (SCE Event Management).
- **Cơ quan chủ quản & Đơn vị sử dụng:** **Trung tâm Xúc tiến Đầu tư và Hỗ trợ Doanh nghiệp Hà Nội (SCE)** trực thuộc **Sở Tài chính Hà Nội**.
- **Mục tiêu hệ thống:**
  - Số hóa toàn diện và chuẩn hóa quy trình điều hành sự kiện cấp Thành phố và cấp Trung tâm.
  - Tự động hóa tiến độ đếm ngược thời gian ($T - 45$ đến $T_0$ và $T + 3$), kích hoạt chế độ báo cáo tiến độ khẩn cấp hàng ngày từ mốc $T - 10$.
  - Tích hợp kho **23 biểu mẫu hành chính chuẩn hóa** theo Nghị định 30/2020/NĐ-CP và thẩm quyền 3 cấp (UBND TP, Sở Tài chính, Trung tâm SCE).
  - Quản trị quan hệ khách mời (CRM), kiểm soát chỉ tiêu phát hành giấy mời ($\ge 130\%$), in biển tên để bàn chữ A và thẻ đeo mã QR ($\ge 120\%$).
  - Thiết kế sơ đồ phân khu chỗ ngồi hội trường đa dạng và quản lý phân lô gian hàng hội chợ triển lãm ($3\text{m} \times 3\text{m}$).
  - Điều hành tác nghiệp hiện trường thời gian thực ngày sự kiện ($T_0 - 2\text{h}$) và check-in đại biểu nhanh trên thiết bị di động.

---

## 2. CẤU TRÚC THƯ MỤC CHUẨN HÓA CỦA DỰ ÁN

Dự án được phân chia thành các thư mục chuyên biệt:

```
Tổ chức sự kiện/
│
├── PROJECT_KNOWLEDGE.md         # [DUY NHẤT Ở ROOT] Toàn bộ kiến thức & đặc tả kiến trúc chuẩn của dự án
├── .gitignore                   # Cấu hình bỏ qua các file tạm/không cần thiết trong git
│
├── doc/                         # TÀI LIỆU NGHIỆP VỤ & KHO BIỂU MẪU CHUẨN
│   ├── QUY TRÌNH CHI TIẾT (Sửa).docx                    # Quy trình tổ chức sự kiện gốc đã chuẩn hóa
│   ├── KE_HOACH_XAY_DUNG_PHAN_MEM_TO_CHUC_SU_KIEN.md   # Lộ trình và kế hoạch xây dựng 7 phân hệ
│   ├── README_OLD.md                                   # Bản tóm tắt tính năng ban đầu
│   └── Biểu mẫu/                                       # Kho 23 biểu mẫu hành chính chuẩn 3 cấp (.doc)
│       ├── manifest.json                               # Danh mục metadata chi tiết của 23 biểu mẫu
│       ├── README.md                                   # Hướng dẫn chỉnh sửa và phân nhóm biểu mẫu
│       └── 01..23. [Cấp thẩm quyền] Tên biểu mẫu.doc   # File Word mẫu có thẻ Merge Fields
│
├── icon/                        # BỘ NHẬN DIỆN THƯƠNG HIỆU & ICONS
│   ├── logo-192.png                                    # Logo SCE kích thước 192x192
│   ├── logo-512.png                                    # Logo SCE kích thước 512x512
│   ├── Logo (tách nền sát cạnh).png                    # Logo độ phân giải cao tách nền
│   ├── apple-touch-icon.png                            # Icon cho thiết bị iOS Safari
│   ├── app-icon-192.png                                # Icon Web App PWA 192
│   └── app-icon-512.png                                # Icon Web App PWA 512
│
├── code/                        # TOÀN BỘ MÃ NGUỒN ỨNG DỤNG, DATABASE & KIỂM THỬ
│   ├── index.html                                      # Ứng dụng Web SPA chính (Single Page Application)
│   ├── manifest.json                                   # Cấu hình PWA Web App Manifest
│   ├── sw.js                                           # Service Worker quản lý offline caching
│   ├── index.html.bak                                  # Bản sao lưu dự phòng mã nguồn
│   ├── test_suite.py                                   # Bộ kiểm thử tự động toàn diện (DOM, JS, Logic)
│   ├── import_templates_from_folder.py                 # Script tự động đồng bộ biểu mẫu .doc vào index.html
│   └── database/                                       # Cấu trúc CSDL và chính sách bảo mật
│       └── supabase_tcsk_schema.sql                    # Script DDL PostgreSQL & chính sách RLS Supabase
│
└── mcp/                         # MODEL CONTEXT PROTOCOL (MCP) CHO AI AGENTS
    ├── mcp_servers.json                                # Cấu hình server MCP Supabase & Filesystem
    └── README.md                                       # Hướng dẫn AI Agent kết nối và tương tác hệ thống
```

---

## 3. CƠ SỞ DỮ LIỆU & BẢO MẬT (SUPABASE ARCHITECTURE)

- **Supabase Project URL:** `https://xqmeeticiwclsvckpqrd.supabase.co`
- **Chiến lược tích hợp Auth:** Dùng chung hệ sinh thái xác thực `auth.users` với phân hệ `/quanlydauthau`, nhưng thiết lập hệ thống bảng dữ liệu và Profile hoàn toàn độc lập cho phân hệ Sự kiện (`tcsk`):
  
### Danh mục bảng dữ liệu:
1. `public.sce_tcsk_profiles`:
   - Quản lý danh tính người dùng trong phân hệ sự kiện.
   - Các trường chính: `id` (UUID references `auth.users`), `email`, `full_name`, `department`, `role`, `is_active`, `last_sign_in_at`, `created_at`, `updated_at`.
2. `public.sce_tcsk_app_data`:
   - Lưu trữ dữ liệu cấu trúc sự kiện, tiến độ các bước, danh sách khách mời CRM, sơ đồ chỗ ngồi, danh mục gian hàng hội chợ.
   - Các trường chính: `id` (UUID), `event_id` (TEXT), `data_type` (TEXT: `event_meta`, `tasks`, `guests`, `halls`, `booths`), `payload` (JSONB), `updated_by` (UUID), `updated_at` (TIMESTAMPTZ).
3. `public.sce_tcsk_backups`:
   - Lưu trữ các bản snapshot dữ liệu toàn diện phục vụ khôi phục khẩn cấp.
   - Các trường chính: `id` (UUID), `backup_name` (TEXT), `backup_type` (TEXT: `auto`, `manual`), `snapshot_data` (JSONB), `created_by` (UUID), `created_at` (TIMESTAMPTZ).
4. `public.sce_tcsk_audit_logs`:
   - Nhật ký kiểm toán bất biến (Immutable Audit Trail) ghi lại mọi thao tác tạo, sửa, xóa, duyệt, in ấn, check-in.
   - Các trường chính: `id` (UUID), `user_id` (UUID), `action` (TEXT), `target_type` (TEXT), `target_id` (TEXT), `details` (JSONB), `ip_address` (TEXT), `created_at` (TIMESTAMPTZ).

### Chính sách bảo mật dữ liệu (Row Level Security - RLS):
- RLS được kích hoạt 100% trên toàn bộ các bảng (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).
- Nguyên tắc: Người dùng chỉ được xem/sửa dữ liệu khi đã xác thực và có quyền hạn phòng ban phù hợp theo RBAC. Thao tác xóa hoặc quản trị mẫu template yêu cầu vai trò `admin` hoặc `leader`.

---

## 4. MA TRẬN PHÂN QUYỀN VAI TRÒ (RBAC MATRIX)

Trung tâm có **4 phòng ban chuyên môn** và Ban Giám đốc:
1. `Phòng Hành chính - Tổ chức`
2. `Phòng Phát triển doanh nghiệp`
3. `Phòng Xúc tiến đầu tư`
4. `Phòng Tư vấn doanh nghiệp`

### Bảng phân quyền chi tiết:
| Vai trò (`role`) | Tên hiển thị | Phạm vi quyền hạn | Thao tác được phép |
| :--- | :--- | :--- | :--- |
| `admin` | Quản trị hệ thống | Toàn bộ 4 phòng ban | Toàn quyền cấu hình hệ thống, quản lý tài khoản, xem Audit log, sao lưu/khôi phục CSDL. |
| `leader` | Ban Giám đốc | Toàn bộ 4 phòng ban | Phê duyệt kế hoạch, xem báo cáo tổng hợp UBND TP, chỉ đạo mọi sự kiện. |
| `dept_leader` | Lãnh đạo Phòng | Phòng ban phụ trách | Phân công chuyên viên chủ trì, duyệt bước tác nghiệp, theo dõi tiến độ sự kiện của phòng. |
| `team_lead` | Trưởng nhóm / Tổ trưởng | Nhóm công việc | Điều phối các bước việc chi tiết, đôn đốc nhắc việc thành viên trong nhóm. |
| `user` / `staff` | Chuyên viên nghiệp vụ | Nhiệm vụ được giao | Cập nhật tiến độ bước việc, soạn thảo biểu mẫu, quản lý khách mời, check-in hiện trường. |

---

## 5. CHUẨN HÓA 02 LUỒNG QUY TRÌNH NGHIỆP VỤ

### 5.1. Luồng 1 — Hội nghị, Hội thảo, Tọa đàm (`hoi_nghi`)
- **Giai đoạn I: Chuẩn bị trước sự kiện ($T - 45$ đến $T - 1$ ngày làm việc):**
  - **Nhóm 1 (Khách mời & Lễ tân):** Lập danh sách khách mời VIP & Doanh nghiệp (đạt định mức $\ge 130\%$), phát hành giấy mời, theo dõi bưu điện chuyển phát, gọi điện xác nhận RSVP, lập phương án đón tiếp.
  - **Nhóm 2 (Biển tên, Thẻ & Chỗ ngồi):** Rà soát họ tên/chức danh, in biển tên để bàn chữ A, in thẻ đại biểu đeo cổ có mã QR ($\ge 120\%$), in thẻ xe VIP, phân chia sơ đồ hội trường và sắp xếp chỗ ngồi.
  - **Nhóm 3 (Nội dung, Tham luận, MOU & Kịch bản):** Duyệt ấn phẩm, video clip, trình UBND TP phê duyệt bài phát biểu, xin ý kiến Sở Ngoại vụ về dự thảo MOU song ngữ, hoàn thiện kịch bản tổng thể (Run-sheet) và kịch bản chi tiết MC.
  - **Nhóm 4 (Địa điểm & Kỹ thuật):** Khảo sát địa điểm, lập dự toán kinh phí, ký hợp đồng nhà thầu tổ chức sự kiện, kiểm tra âm thanh, ánh sáng, màn hình LED, cabin dịch song song, phòng tiếp VIP.
  - **Nhóm 5 (Truyền thông & Báo chí):** Xây dựng kế hoạch truyền thông, phát hành thông cáo báo chí, mời phóng viên, quản lý tác nghiệp báo chí, cấp thẻ phóng viên.
  - **Nhóm 6 (Chế độ Báo cáo định kỳ):** Kích hoạt cơ chế báo cáo tiến độ khẩn cấp hàng ngày trình Lãnh đạo Trung tâm và UBND Thành phố từ mốc $T - 10$.
- **Giai đoạn II: Trong & Sau ngày diễn ra sự kiện ($T_0$ đến $T + 3$):**
  - Gồm **09 bước tác nghiệp giờ G:**
    1. Kiểm tra hiện trường toàn diện ($T_0 - 2\text{h}$)
    2. Điểm danh và vào vị trí lễ tân đón tiếp
    3. Đón tiếp đại biểu VIP tại phòng tiếp khách riêng
    4. Hướng dẫn báo chí tác nghiệp đúng vị trí
    5. Trực kỹ thuật và điều phối hội trường suốt chương trình
    6. Hướng dẫn đại biểu dự tiệc chiêu đãi (nếu có)
    7. Tiễn khách và trao quà lưu niệm
    8. Thu dọn ấn phẩm, kiểm kê thiết bị và bàn giao hội trường
    9. Tổng hợp kết quả truyền thông ($T + 1$) và gửi Thư cảm ơn đại biểu ($T + 3$).

### 5.2. Luồng 2 — Hội chợ, Triển lãm xúc tiến thương mại (`hoi_cho`)
- Kế thừa toàn bộ cấu trúc 5 Nhóm việc + Báo cáo + Tác nghiệp $T_0$ của Luồng 1.
- **Bổ sung đặc thù nghiệp vụ Hội chợ (Phụ lục III):**
  - Phân lô mặt bằng gian hàng chuẩn $3\text{m} \times 3\text{m}$ (Gian tiêu chuẩn, Gian OCOP/Làng nghề, Gian đặc biệt).
  - Quản lý hồ sơ doanh nghiệp tham gia, ngành hàng, danh mục sản phẩm trưng bày, kiểm duyệt quy cách an toàn.
  - Quản lý 03 mức hỗ trợ kinh phí theo quy định nhà nước (100% kinh phí NSNN, 50% kinh phí, 100% doanh nghiệp tự túc).
  - Lập lịch phân công cán bộ SCE trực hỗ trợ doanh nghiệp tại hiện trường hội chợ xuyên suốt các ngày diễn ra sự kiện.

---

## 6. DANH MỤC 23 BIỂU MẪU HÀNH CHÍNH CHUẨN 3 CẤP THẨM QUYỀN

Toàn bộ hệ thống biểu mẫu tuân thủ thể thức Nghị định 30/2020/NĐ-CP và ký hiệu văn bản chính thức của SCE (`-TTXT`), phân cấp theo 3 cấp thẩm quyền:

### Cấp 1: Cấp UBND Thành phố Hà Nội (04 biểu mẫu)
1. `01. [UBND] KH-UBND`: Kế hoạch tổ chức chương trình sự kiện (UBND TP ban hành).
2. `02. [UBND] GM-UBND`: Giấy mời Đại biểu cấp cao, Bộ ngành Trung ương & Ngoại giao đoàn.
3. `03. [UBND] UBND-KT`: Công văn chỉ đạo phối hợp triển khai công tác tổ chức sự kiện.
4. `04. [UBND] BC-UBND`: Báo cáo kết quả tổ chức sự kiện trình Thường trực UBND TP & Thành ủy.

### Cấp 2: Cấp Sở Tài chính Hà Nội (02 biểu mẫu)
5. `05. [STC] TTr-STC`: Tờ trình về việc phê duyệt Kế hoạch & Dự toán tổ chức sự kiện.
6. `06. [STC] BC-STC`: Báo cáo kết quả tổ chức sự kiện (Sở Tài chính báo cáo UBND TP).

### Cấp 3: Cấp Trung tâm SCE (Ký hiệu TTXT) (17 biểu mẫu)
7. `07. [SCE] QĐ-TTXT`: Quyết định thành lập Ban Tổ chức và các Tổ công tác phục vụ sự kiện.
8. `08. [SCE] QĐ-TTXT`: Quyết định phân công nhiệm vụ chi tiết tổ chức sự kiện.
9. `09. [SCE] Bảng danh sách khách mời VIP & Doanh nghiệp` (Kiểm soát định mức $\ge 130\%$).
10. `10. [SCE] GM-TTXT`: Giấy mời Đại biểu và Doanh nghiệp.
11. `11. [SCE] THEXE-TTXT`: Thẻ xe VIP ưu tiên (gửi kèm Giấy mời).
12. `12. [SCE] BB-TTXT`: Biên bản bàn giao Thẻ Đại biểu và Tài liệu hội nghị.
13. `13. [SCE] TTXT-XTĐT`: Công văn gửi Sở Ngoại vụ rà soát dự thảo Bản ghi nhớ hợp tác (MOU).
14. `14. [SCE] Dự thảo Bản ghi nhớ hợp tác (MOU)` Song ngữ mẫu (Việt - Anh).
15. `15. [SCE] Kịch bản Chương trình tổng thể (Run-sheet) & Kịch bản chi tiết lời dẫn MC`.
16. `16. [SCE] Thông cáo Báo chí chính thức` (Press Release).
17. `17. [SCE] Danh sách Cơ quan Thông tấn, Báo chí đăng ký tác nghiệp`.
18. `18. [SCE] BC-TTXT`: Báo cáo tổng hợp Kết quả truyền thông & Link bài báo ($T + 1$).
19. `19. [SCE] BC-TTXT`: Báo cáo tiến độ hàng ngày (Mốc $T - 10$) trình Lãnh đạo TT & UBND TP.
20. `20. [SCE] Checklist kiểm tra Hiện trường trước giờ khai mạc` ($T_0 - 2\text{h}$).
21. `21. [SCE] Phiếu tổng hợp Câu hỏi & Kiến nghị của Doanh nghiệp` tại hội trường.
22. `22. [SCE] Lịch phân công Cán bộ trực hỗ trợ Doanh nghiệp` Hội chợ / Triển lãm.
23. `23. [SCE] TTXT-XTĐT`: Thư cảm ơn Đại biểu & Doanh nghiệp sau sự kiện ($T + 3$).

---

## 7. CHI TIẾT 07 PHÂN HỆ CHỨC NĂNG CỐT LÕI

Hệ thống được thiết kế theo mô hình kiến trúc gồm 07 phân hệ chuyên biệt:

1. **Phân hệ 1 — Core & Auth:**
   - Quản trị xác thực Supabase Auth, quản lý hồ sơ `sce_tcsk_profiles`, phân quyền RBAC 4 phòng ban.
   - Ghi nhật ký kiểm toán bất biến `sce_tcsk_audit_logs` và tự động sao lưu `sce_tcsk_backups`.
2. **Phân hệ 2 — Event & Countdown Engine:**
   - Quản lý dữ liệu 3 cấp độ (Sự kiện -> Nhóm việc -> Bước chi tiết).
   - Giao diện Progressive Disclosure 4 tầng (Dashboard tổng thể -> Danh sách sự kiện -> Chi tiết nhóm -> Modal tác nghiệp & biểu mẫu).
   - Thuật toán tính hạn chót trừ lùi ngày làm việc (bỏ qua Thứ Bảy, Chủ Nhật và ngày lễ) từ $T_0$.
   - Tự động kích hoạt cơ chế báo cáo khẩn cấp hàng ngày từ mốc $T - 10$.
3. **Phân hệ 3 — Smart Template Studio:**
   - Trình soạn thảo văn bản trực tiếp định dạng A4 tích hợp sẵn ngay trên Web.
   - Trộn dữ liệu tự động (Mail Merge) từ thông tin sự kiện vào các trường biến số dạng `{{TEN_SU_KIEN}}`, `{{NGAY_TO_CHUC}}`, `{{SO_LUONG_KHACH}}`, v.v.
   - Tải về trực tiếp các định dạng `.docx`, `.xlsx`, `.pdf`.
4. **Phân hệ 4 — Guest & Seating Management (CRM Khách mời & Sơ đồ Hội trường):**
   - Quản lý danh bạ đại biểu, phân loại nhóm (VIP Trung ương, Lãnh đạo TP, Sở ngành, Ngoại giao đoàn, Báo chí, Doanh nghiệp).
   - Kiểm soát chỉ tiêu an toàn: Số giấy mời phát hành $\ge 130\%$ sức chứa hội trường; In thẻ QR $\ge 120\%$.
   - Theo dõi trạng thái gửi bưu điện bảo đảm và xác nhận tham dự (RSVP: Xác nhận, Từ chối, Chưa phản hồi).
   - Bộ công cụ in ấn: Tự động in Biển tên để bàn chữ A (chọn 6 mẫu phông nền trang trọng hoặc tải ảnh nền tùy chỉnh) và Thẻ đại biểu đeo cổ có mã QR.
   - Sơ đồ chỗ ngồi tương tác: Hỗ trợ mẫu hội trường chuẩn (Trung tâm Hội nghị Quốc gia NCC, Hội trường UBND TP Hà Nội, Hội trường Khách sạn Quốc tế) và tùy biến phân khu (Khu VIP 1, Khu VIP 2, Đại biểu, Khách mời, Doanh nghiệp).
   - Thuật toán tự động xếp chỗ ngẫu nhiên theo đúng phân khu (`autoRandomAssignSeats`).
   - Quản lý danh sách dự tiệc chiêu đãi và sơ đồ bàn tiệc VIP.
5. **Phân hệ 5 — Exhibition Booths & Enterprise Support (Gian hàng Hội chợ):**
   - Thiết kế sơ đồ mặt bằng gian hàng chuẩn $3\text{m} \times 3\text{m}$.
   - Quản lý hồ sơ doanh nghiệp tham gia, ngành hàng, danh mục sản phẩm, nhu cầu kết nối giao thương B2B.
   - Phân loại 03 mức hỗ trợ ngân sách nhà nước (100% NSNN, 50%, Tự túc 100%).
   - Bảng phân công ca trực cán bộ SCE hỗ trợ doanh nghiệp tại hiện trường hội chợ.
6. **Phân hệ 6 — D-Day Live Operations (Tác nghiệp Hiện trường Giờ G):**
   - Bảng điều hành tác nghiệp thời gian thực từ $T_0 - 2\text{h}$ đến khi bế mạc sự kiện.
   - Checklist hiện trường âm thanh, ánh sáng, màn hình LED, cabin dịch, phòng VIP, bàn báo chí.
   - Ứng dụng Web PWA trên điện thoại di động: Quét mã QR check-in đại biểu nhanh, phát thẻ và cấp quyền truy cập tài liệu hội nghị.
   - Kênh phối hợp liên lạc trực tuyến giữa các vị trí tác nghiệp.
7. **Phân hệ 7 — Executive Reporting & Ecosystem Integration (Báo cáo & Liên thông):**
   - Tự động trích xuất Báo cáo tiến độ gửi Lãnh đạo Trung tâm và Báo cáo UBND Thành phố Hà Nội.
   - Báo cáo tổng kết sự kiện, thống kê truyền thông & link bài báo ($T + 1$), tổng hợp kết quả giao thương hội chợ.
   - Liên thông dữ liệu dự toán kinh phí và nhà thầu tổ chức sự kiện với phân hệ `/quanlydauthau`.

---

## 8. HƯỚNG DẪN KỸ THUẬT & QUY CHUẨN PHÁT TRIỂN TIẾP THEO

1. **Vị trí tệp tin nguồn:**
   - File giao diện chính: [code/index.html](file:///g:/My%20Drive/Personal/AI%20Software/Tổ%20chức%20sự%20kiện/code/index.html)
   - File Service Worker: [code/sw.js](file:///g:/My%20Drive/Personal/AI%20Software/Tổ%20chức%20sự%20kiện/code/sw.js)
   - File PWA Manifest: [code/manifest.json](file:///g:/My%20Drive/Personal/AI%20Software/Tổ%20chức%20sự%20kiện/code/manifest.json)
   - File Database Schema: [code/database/supabase_tcsk_schema.sql](file:///g:/My%20Drive/Personal/AI%20Software/Tổ%20chức%20sự%20kiện/code/database/supabase_tcsk_schema.sql)
   - Thư mục biểu mẫu: [doc/Biểu mẫu/](file:///g:/My%20Drive/Personal/AI%20Software/Tổ%20chức%20sự%20kiện/doc/Biểu%20mẫu)
   - Thư mục icons: [icon/](file:///g:/My%20Drive/Personal/AI%20Software/Tổ%20chức%20sự%20kiện/icon)
2. **Quy tắc đường dẫn tương đối trong mã nguồn:**
   - Trong `code/index.html`, đường dẫn tới icons là `../icon/<tên_icon>.png`.
   - Trong `code/manifest.json`, đường dẫn icons là `../icon/<tên_icon>.png`.
   - Trong `code/sw.js`, đường dẫn icons trong cache list là `../icon/<tên_icon>.png`.
   - Trong `code/import_templates_from_folder.py`, đường dẫn biểu mẫu là `../doc/Biểu mẫu/`.
3. **Quy trình Kiểm thử Tự động (Automated Testing):**
   - Trước khi xác nhận hoàn thành bất kỳ tính năng mới hoặc bản sửa lỗi nào, bắt buộc phải chạy lệnh kiểm thử:
     ```bash
     python code/test_suite.py
     ```
   - Mọi bài kiểm tra DOM, cú pháp JavaScript (Node.js syntax check) và thuật toán phân khu xếp chỗ phải đạt kết quả **100% PASSED**.
4. **Quy tắc thông báo hoàn tất nhiệm vụ (Bắt buộc):**
   - Khi hoàn tất toàn bộ yêu cầu của người dùng hoặc khi dừng lại chờ phản hồi, phải chạy lệnh gửi thông báo về điện thoại qua terminal:
     ```bash
     tele_ag echo "Đã xong: <tóm tắt ngắn gọn>"
     ```
