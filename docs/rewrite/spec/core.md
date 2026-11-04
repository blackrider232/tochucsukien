# Spec: Core (shell, auth, RBAC, users, settings, persistence)

Source: `code/index.html` (22,715 lines, single classic `<script>` 6031-22713), `code/sw.js`, `code/manifest.json`, root `index.html`.
All `index.html:<n>` refs below mean `code/index.html` unless prefixed `root/`.
"As implemented" = what the code does today. "Intended" = what labels, comments or option text promise. Where they differ, the rewrite should build Intended unless section 7 lists it as an open question.

---

## 1. Purpose and screens

Core owns everything a user sees before any business module: entry redirect, login and registration, the authenticated shell (sidebar + top bar), the two admin tabs `Tài khoản` and `Cài đặt`, the system modals (profile/2FA, user management, backups, audit logs, Supabase config), and the persistence layer every module writes through.

### 1.1 Root redirect (`root/index.html`)
- `<title>Sự kiện SCE</title>`, links `code/manifest.json`, icon `icon/logo-192.png`.
- `<meta http-equiv="refresh" content="0; url=code/index.html">` plus `window.location.replace("code/index.html")`.
- Dark splash body (`#0f172a`): "Hệ thống Quản trị Tổ chức Sự kiện SCE" / "Đang chuyển hướng tới giao diện tác nghiệp...". `<noscript>` link "Bấm vào đây để vào ứng dụng".
- Rewrite: the Next.js app serves at `/`; keep a redirect from `/code/index.html` to `/` for installed PWAs whose `start_url` points there.

### 1.2 Document head (`index.html:1-112`)
- `<html lang="vi">`, title "Quản trị Tổ chức Sự kiện SCE".
- PWA meta: `theme-color #1e3a8a`, `apple-mobile-web-app-capable`, title "Sự kiện SCE", icons `../icon/logo-192.png`, `apple-touch-icon.png` (180), `logo-512.png`.
- Fonts: Inter 300-800 (Google Fonts); Font Awesome 6.5.1 (cdnjs).
- Tailwind CDN, `darkMode: 'class'`, brand palette `brand.{50:#eff6ff,100:#dbeafe,500:#3b82f6,600:#2563eb,700:#1d4ed8,800:#1e40af,900:#1e3a8a}`, font `Inter`.
- Scripts: supabase-js@2, sweetalert2@11, exceljs@4.4.0, qrcodejs 1.0.0, Google GSI client.
- Custom CSS: 6px scrollbars (dark thumb `#475569`), `.pulse-badge` animation (`subtle-pulse` 2s), collapsed sidebar rules (`#mainSidebar.collapsed` width 4.5rem, hides `.sidebar-text`, centers nav icons at 1.15rem).
- `<body>`: `bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-100 select-none`.

### 1.3 Login screen `#loginScreen` (`index.html:117-218`)
Visible when no session. Centered card (max-w-sm, `border-t-4 border-blue-600`).
- Logo `../icon/logo-192.png` (fallback Wikimedia Vietnam emblem URL, `index.html:120`).
- H2 "QUẢN TRỊ TỔ CHỨC SỰ KIỆN"; subtitle "Trung tâm Xúc tiến đầu tư và Hỗ trợ doanh nghiệp Hà Nội".
- `#loginError` (red box) and `#loginSuccess` (green box), hidden by default, shared by both forms.
- **Login form `#authFormLogin`**
  - "Email đăng nhập" `#loginUser` (type email, placeholder "Nhập email của bạn...").
  - "Mật khẩu" `#loginPass`; link button "Quên mật khẩu?" → forgot-password dialog (§3.1). Eye toggle shows/hides password. Enter key submits.
  - Checkbox "Ghi nhớ đăng nhập" `#rememberMe` (checked; no effect, bug B20).
  - Primary "Đăng nhập" (spinner text "Đang xác thực..." while pending).
  - Divider "Hoặc"; "Đăng nhập với Google" (Google OAuth via Supabase).
  - Footer "Chưa có tài khoản? **Đăng ký tài khoản**" → register form.
- **Register form `#authFormRegister`**
  - "Họ và tên" (placeholder "VD: Nguyễn Văn A"), "Phòng chuyên môn" select (4 departments, default "Phòng Xúc tiến đầu tư"), "Email đăng nhập" (placeholder "email@sce.hanoi.gov.vn"), "Mật khẩu (tối thiểu 6 ký tự)".
  - "Đăng ký" (spinner "Đang đăng ký..."). Footer "Đã có tài khoản? **Quay lại Đăng nhập**".
- Install pill "Tải / Cài đặt App về Điện thoại" `#btnInstallAppLogin` → PWA install (§3.10).

### 1.4 App shell `#appScreen` (`index.html:223-439`)
Flex row on md+, column on mobile.

**Sidebar `#mainSidebar`** (`index.html:228-349`). Dark (`bg-slate-900`), w-64, sticky on md+, off-canvas on mobile (`-translate-x-full`, backdrop `#sidebarBackdrop` closes it).
- Header: logo + "SỰ KIỆN SCE" / "Trung tâm XTĐT Hà Nội" (click → `tab-events`). Desktop collapse button `#btnCollapseSidebar` (icon `fa-angles-left` ↔ `fa-angles-right`, state in localStorage `sce_sidebar_collapsed`). Mobile close button.
- Section label "Danh mục chức năng", then in order (id, label, icon color, active color from `index.html:8053-8063`):

| # | Tab key | Button id | Label | Icon | Active bg |
|---|---|---|---|---|---|
| 1 | events | tabBtn-events | Tiến độ | fa-calendar-check sky/blue-300 | bg-blue-600 |
| 2 | templates | tabBtn-templates | Biểu mẫu | fa-file-signature purple-300 | bg-purple-600 |
| 3 | guests | tabBtn-guests | Khách mời & Chỗ ngồi | fa-users-rectangle amber-300 | bg-amber-600 |
| 4 | booths | tabBtn-booths | Gian hàng Hội chợ (+ `#sidebarBoothsBadge` emerald count) | fa-store emerald-400 | bg-emerald-600 |
| 5 | live | tabBtn-live | Tổ chức sự kiện | fa-mobile-screen-button emerald-300 | bg-teal-600 |
| 6 | reports | tabBtn-reports | Báo cáo & Tổng kết | fa-chart-line rose-300 | bg-rose-600 |

- Section label "Hệ thống & Quản trị":

| # | Tab key | Button id | Label | Tooltip | Active bg |
|---|---|---|---|---|---|
| 1 | admin | tabBtn-admin | Cài đặt | "Cài đặt: Quản lý phòng ban, tham số định mức, sao lưu & nhật ký" | bg-slate-700 |
| 2 | users | tabBtn-users | Tài khoản (+ `#tabUsersPendingBadge` amber count) | "Tài khoản: Tạo lập & phê duyệt tài khoản cán bộ" | bg-cyan-600 |
| 3 | admin-templates | tabBtn-admin-templates | Quản trị biểu mẫu | "Quản trị 23 biểu mẫu chuẩn hóa 3 cấp thẩm quyền" | bg-purple-700 |
| 4 | admin-halls | tabBtn-admin-halls | Quản trị Hội trường | "Quản trị Hội trường tổ chức sự kiện & phân khu" | bg-indigo-600 |
| 5 | admin-guests | tabBtn-admin-guests | CSDL Khách & DN | "Quản trị CSDL khách & doanh nghiệp dùng chung (Master Directory)" | bg-emerald-700 |

- Footer: user button (→ profile modal) with `#sidebarUserName` and `#sidebarUserRole` (`"<roleLabel> • P. <dept>"`), and sign-out icon button.
- Every nav click also closes the mobile sidebar.

**Top header** (`index.html:354-436`), gradient `from-blue-900 via-indigo-…`:
- Left: mobile hamburger; active-tab icon box `#topBarActiveIcon`; title `#topBarActiveTitle`; badges `#topBarActiveBadges`; subtitle `#topBarActiveSubtitle`. All four come from `FUNCTION_METADATA[tab]` (`index.html:7862-7985`):

| Tab | Title | Subtitle | Badge |
|---|---|---|---|
| events | Tiến Độ Tổ Chức Sự Kiện | Theo dõi tiến độ, phân công nhiệm vụ và cập nhật trạng thái thực hiện các sự kiện. | Button "Báo Cáo Hàng Ngày" (bell, `#bellDailyReportBadge` count) → `openDailyReportPopup()` (events module) |
| templates | Kho Biểu Mẫu Chuẩn Hóa | Hệ thống 23 biểu mẫu hành chính chuẩn 3 cấp thẩm quyền theo Nghị định 30/2020/NĐ-CP. | "23 Biểu Mẫu Chuẩn" |
| guests | Khách Mời & Sơ Đồ Chỗ Ngồi | Quản lý danh sách khách mời, xác nhận RSVP, in Biển tên chữ A, Thẻ đại biểu QR và phân khu hội trường. | "Hội Trường & VIP" |
| booths | Quản Lý Gian Hàng Hội Chợ | Sơ đồ phân lô mặt bằng 3m x 3m, hồ sơ doanh nghiệp tham gia, kinh phí hỗ trợ và phân công cán bộ trực SCE. | "Hội Chợ Triển Lãm" |
| live | Tác Nghiệp Hiện Trường Ngày Sự Kiện (Giờ G) | Điều hành tác nghiệp thời gian thực từ T0 - 2h, kiểm tra kỹ thuật, check-in QR và điều phối hội trường. | "T0 - 2h Hiện Trường" (icon fa-bolt teal) |
| reports | Báo Cáo & Tổng Kết Sự Kiện | Xuất báo cáo tự động trình UBND Thành phố, Ban Giám đốc và tổng hợp kết quả truyền thông. | "Trình UBND TP" |
| admin | Cài Đặt Hệ Thống & Tham Số Định Mức | Quản lý phòng ban, tham số định mức, sao lưu dữ liệu và nhật ký kiểm toán. | "Hệ Thống SCE" |
| users | Quản Lý Tài Khoản & Phân Quyền | Tạo lập tài khoản, phê duyệt cán bộ và quản trị ma trận phân quyền RBAC 4 phòng ban. | "4 Phòng Ban" |
| admin-templates | Quản Trị Biểu Mẫu Chuẩn Hóa | Quản trị và hiệu chỉnh 23 biểu mẫu hành chính chuẩn 3 cấp thẩm quyền theo Nghị định 30/2020/NĐ-CP. | "23 Biểu Mẫu Gốc" |
| admin-halls | Quản Trị Hội Trường Tổ Chức Sự Kiện | Quản lý danh mục hội trường mẫu, thiết lập phân khu và ma trận vị trí chỗ ngồi. | "Mẫu Hội Trường" |
| admin-guests | Cơ Sở Dữ Liệu Khách Mời & Doanh Nghiệp | CSDL danh bạ dùng chung 5 nhóm đối tượng chuẩn hóa phục vụ tra cứu và tự động gợi ý. | "Master Directory" |

Note: the sidebar label for `live` is "Tổ chức sự kiện" but the header calls it "Hiện trường"/"Tác Nghiệp Hiện Trường…" and uses icon `fa-bolt` while the sidebar uses `fa-mobile-screen-button`. Keep one name (open question Q7).

- Right utility group (icon buttons, 28px):
  - Undo `#btnUndo` (title "Hoàn tác (Ctrl+Z)" or "Hoàn tác (N thao tác - Ctrl+Z)"), disabled when stack empty.
  - Redo `#btnRedo` (same pattern, "Làm lại … Ctrl+Y").
  - Print "Báo cáo tiến độ (Word / In)" → `printAllEventsPlan()` (events module).
  - Cloud sync `#syncStatus` "Đồng bộ đám mây (Cloud Sync)" → `forceCloudSync()`; icon spins while running.
  - Install "Tải / Cài đặt App ra màn hình chính" `#btnInstallAppHeader`.
  - Dark mode toggle "Chuyển chế độ Giao diện Sáng / Tối" (`#darkModeIcon` moon ↔ sun).
- "Tạo Sự Kiện Mới" (mobile "Tạo SK") `#btnHeaderCreateEvent` → `openCreateEventModal()` (events module). Visible to all roles.
- Pending approvals `#btnPendingApprovalHeader` "Duyệt tài khoản (N)" (admin only, only when N>0) → `tab-users`.
- User badge `#userBadge` → profile modal. Shows name, role chip (purple for admin, amber for leader, blue otherwise), and on md+ a "P. <dept>" chip unless role admin/leader or dept empty/"Ban Giám đốc".
- Sign-out icon "Đăng xuất khỏi hệ thống".

Main area `<main>` max-w-7xl hosts one `<section id="mainTab-<key>">` per tab; `events` is the default visible tab (`index.html:1137`, no `hidden`).

### 1.5 Tab `Tài khoản` `#mainTab-users` (`index.html:443-556`)
- Card header "Danh Sách Cán Bộ 4 Phòng Ban"; buttons "Duyệt tất cả tài khoản chờ" `#btnApproveAllTop` (hidden unless pending>0) and "Tải lại danh sách".
- Pending banner `#tabUsersPendingBanner`: "Có **N** tài khoản cán bộ mới đang chờ Quản trị viên phê duyệt" / 'Bấm nút "Duyệt tài khoản" ở từng dòng hoặc "Duyệt tất cả" để kích hoạt quyền đăng nhập cho cán bộ.' + "Phê duyệt tất cả".
- Card "Cấp tài khoản cán bộ mới": "Email đăng nhập" (placeholder `canbo@sce.gov.vn`), "Mật khẩu ban đầu" ("Tối thiểu 6 ký tự"), "Họ và tên cán bộ" ("Nguyễn Văn A"), "Phòng chuyên môn" (4 depts + "Ban Giám đốc", default XTĐT), "Vai trò phân quyền": `user` "Chuyên viên thực hiện", `dept_leader` "Lãnh đạo Phòng (Xem trong phòng)", `leader` "Ban Giám đốc (Xem toàn Trung tâm)", `admin` "Quản trị viên (Toàn quyền)". Button "Thêm tài khoản".
- Search "Tìm kiếm theo họ tên hoặc email cán bộ..." (substring on fullname or email, case-insensitive) + dept filter ("Tất cả 4 Phòng chuyên môn" + 5 options).
- Table (min-w 700px, horizontal scroll): "Tài khoản (Email) & Cán bộ" (name, amber pulse dot if pending, mono email) | "Phòng chuyên môn" (inline select, 5 options, change saves immediately) | "Vai trò phân quyền" (inline select: Chuyên viên / Lãnh đạo Phòng / Ban Giám đốc / Quản trị viên (Admin)) | "Trạng thái" ("Đã duyệt" green / "Chờ duyệt" amber) | "Thao tác" (pending: "Duyệt tài khoản"; active: "Khóa"). Empty: "Không tìm thấy tài khoản phù hợp".
- No "Mở khóa" action in this table for locked users: a locked user (`is_active=false`) shows as "Chờ duyệt" with "Duyệt tài khoản". Lock and pending are the same state (§2.2).

### 1.6 Tab `Cài đặt` `#mainTab-admin` (`index.html:558-861`)
1. Card "Bảng Điều Khiển Quản Trị" with shortcut buttons: "Quản lý 4 Phòng" (→ user management modal), "Sao lưu" (→ backups modal), "Nhật ký" (→ audit modal), "CSDL Khách & DN" (→ `tab-admin-guests`), "Quản trị Biểu Mẫu" (→ broken, B21), "Hội Trường Mẫu" (→ `tab-admin-halls`).
2. Four KPI cards: "Phòng ban chuyên môn" `#statDeptCount` static "04 Phòng" / "Chuẩn tổ chức SCE"; "Tài khoản Profile" `#statUserCount` "N Người" / "Đồng bộ từ sce_v2_profiles"; "Chỉ tiêu Khách mời (1a)" `#statGuestQuota` "≥ 130%" / "So với dự kiến tham gia"; "Chỉ tiêu Thẻ Đại biểu (2b)" `#statBadgeQuota` "≥ 120%" / "VIP dùng Thẻ xe & Biển tên".
3. Card "Tham số Định mức & Chế độ Báo cáo Sự kiện" ("Tự động áp dụng cho mọi sự kiện"):
   - "Đơn vị chủ quản (Cấp trên)" `#cfgParentAgency` default "SỞ TÀI CHÍNH HÀ NỘI".
   - "Đơn vị tổ chức sự kiện" `#cfgAgencyName` default "TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP HÀ NỘI (SCE)".
   - "Ngưỡng kích hoạt Báo cáo Hàng ngày (Mục 6)" `#cfgReportThreshold` number 1-30, default 10, suffix "ngày trước sự kiện".
   - "Thời gian cán bộ có mặt hiện trường (Phần II)" `#cfgFieldTime` 1-5, default 2, "tiếng trước khai mạc".
   - "Tỷ lệ danh sách khách mời tối thiểu (Nhóm 1a)" `#cfgGuestQuota` 100-200, default 130, "% khách dự kiến".
   - "Tỷ lệ in Thẻ đại biểu tối thiểu (Nhóm 2b)" `#cfgBadgeQuota` 100-200, default 120, "% khách dự kiến".
   - Button "Lưu Cấu Hình Tham Số".
4. Card "Danh Sách Phòng Ban Chuyên Môn" (static, chip "4 Phòng"): 1. Phòng Hành chính - Tổ chức "Hậu cần, xe VIP, tài liệu & con dấu" `HCTC`; 2. Phòng Phát triển doanh nghiệp "Mời DN, kết nối giao thương & gian hàng" `PTDN`; 3. Phòng Xúc tiến đầu tư "Chủ trì sự kiện đầu tư, đón tiếp VIP, MOU" `XTĐT`; 4. Phòng Tư vấn doanh nghiệp "Tọa đàm, hỗ trợ pháp lý & đối thoại" `TVDN`. Note: "**Ban Giám đốc:** Xem và chỉ đạo toàn bộ các sự kiện. Lãnh đạo phòng quản lý sự kiện nội bộ của phòng mình."
5. Card "Sao Lưu & Phục Hồi Dữ Liệu" / "Tự động sao lưu & lưu trữ an toàn": "Tạo Bản Sao Lưu" (→ `createNewBackup()`, undefined function, B23), "Chi Tiết" (→ backups modal). Static facts "Cơ chế lưu trữ: Supabase & Local JSON", "Bảo mật snapshot: RLS + Checksum bất biến", hint "Khuyến nghị tạo snapshot dự phòng trước mỗi đợt cập nhật dữ liệu sự kiện lớn."
6. Card "Nhật Ký Kiểm Toán (Audit Trail)" / "Ghi vết toàn bộ hành vi hệ thống": "Xem Toàn Bộ" (→ audit modal). Static facts "Tiêu chuẩn kiểm soát: Nghị định 30/2020 & RBAC", "Nhật ký tác nghiệp: Đăng nhập, Duyệt, Sửa biểu mẫu, Check-in", "Mọi thao tác của 4 phòng ban đều được ghi nhận thời gian thực kèm định danh cán bộ." (claims false, B16/B28).
7. Card "Cấu Hình Hòm Thư Google & Client ID Gửi Thư" (chip "Phân hệ 4 & Admin"), text "Admin cài đặt sẵn tên gợi nhớ, địa chỉ email, Google Client ID riêng và chọn email mặc định để chuyên viên chỉ việc chọn gửi thư." Buttons "Quản Lý Danh Sách" (→ `unitEmailManagerModal`), "Thêm Hòm Thư Google" (→ `unitEmailEditModal`). Grid `#adminUnitEmailsContainer` rendered by `renderAdminUnitEmailsSection()` (`index.html:18533-18561`): per mailbox a card with chip "⭐ Mặc định" or "Hòm thư Google", edit and delete icons, displayName, email (mono blue), clientId or "Chưa cài Client ID (Sandbox)", and "Đặt làm mặc định" for non-defaults. The mailbox CRUD logic and modals belong to the bulk-email module; core hosts this card and owns the `systemSettings.unitSenderEmails` storage.

### 1.7 System modals
All modals are `fixed inset-0 bg-slate-900/70|80 backdrop-blur` overlays toggled by adding/removing `hidden`. None close on Esc or backdrop click, none trap focus (B30).

**Profile & 2FA `#profileModal`** (`index.html:3004-3065`), title "Hồ Sơ & Xác Thực 2 Yếu Tố (2FA)".
- "Email đăng nhập" readonly (`currentUser.email`, fallback text `chuyenvien@sce.gov.vn`).
- "Họ và tên hiển thị" editable (profile.fullname → metadata fullname/full_name → "Chuyên viên SCE").
- "Phòng ban công tác" readonly (profile.department → metadata → "Phòng Xúc tiến đầu tư").
- "Đổi mật khẩu mới (Bỏ trống nếu không đổi)" placeholder "Tối thiểu 6 ký tự".
- 2FA box: "Xác thực 2 yếu tố (2FA / Google Authenticator)", status `#prof2faStatusText` "Trạng thái: Chưa bật" (never loaded from server), button "Cấu hình 2FA" toggles setup box: "1. Quét mã QR bằng ứng dụng **Google Authenticator** hoặc **Microsoft Authenticator**:", QR 140×140 of `totp.uri`, "Mã khóa bí mật: <secret>", "2. Nhập mã 6 số hiển thị trên điện thoại để kích hoạt:", input `000000` + "Kích hoạt". On success status becomes green "Đã kích hoạt bảo mật 2FA".
- Footer "Đóng", "Cập nhật hồ sơ".

**User management `#userMgmtModal`** (`index.html:3068-3122`), title "Quản Lý Phân Quyền Người Dùng" / "Đọc & ghi trực tiếp trên bảng hồ sơ `public.sce_tcsk_profiles`". Search "Tìm theo tên hoặc email...", dept filter "Tất cả phòng ban (4 phòng)" (4 options, no Ban Giám đốc), "Tải lại". Table "Họ và tên / Email" | "Phòng ban" (4-option select) | "Vai trò (Role)" (select labels "Chuyên viên (user)", "Lãnh đạo Phòng (dept_leader)", "Ban Giám đốc (leader)", "Quản trị viên (admin)") | "Trạng thái" | "Thao tác" (lock/unlock icon `fa-user-lock`/`fa-user-check`, title "Khóa tài khoản"/"Mở khóa"). "Đóng". This duplicates the Tài khoản tab (B24); the rewrite keeps one screen.

**Backups `#backupsModal`** (`index.html:3125-3162`), title "Sao Lưu Dữ Liệu & Phục Hồi Snapshot". Buttons "Tạo Snapshot Mới" (prompt), "Tải File JSON Về Máy". Table (latest 20) "Thời gian tạo" (vi-VN locale string, mono) | "Người tạo" (`created_by_email` or "Hệ thống") | "Ghi chú" ("Snapshot" default) | "Khôi phục" (amber button). Empty "Chưa có bản snapshot nào".

**Audit logs `#auditLogsModal`** (`index.html:3165-3194`), title "Nhật Ký Kiểm Toán Bất Biến (Audit Logs)" / "Ghi nhận mọi thao tác tác động dữ liệu hệ thống sự kiện". Table (latest 50) "Thời điểm" | "Người thực hiện" (`actor_email` or "System") | "Hành động" (indigo chip) | "Chi tiết tóm tắt". Empty "Chưa có nhật ký hoạt động nào". No paging, filter or export.

**Supabase config `#supabaseModal`** (`index.html:2950-3001`), unreachable (no caller of `openSupabaseModal`, B22). Title "Cấu hình Máy chủ Supabase & Khởi tạo SQL". Info "Dùng chung Project Supabase với /quanlydauthau: … tạo bộ bảng riêng biệt `public.sce_tcsk_*`. Dữ liệu và phân quyền của Quản lý đấu thầu được giữ nguyên 100%." Fields "Supabase Project URL", "Supabase Anon Public Key". Buttons "Kiểm Tra Kết Nối", "Copy Kịch Bản SQL Khởi Tạo (sce_tcsk_*)", "Lưu Cấu Hình" (writes localStorage, reloads). Guide "Hướng dẫn nhanh 30 giây trên Supabase" (3 steps). Rewrite: drop the runtime config UI; config comes from env vars. Keep the SQL as a migration file (§4.2).

**Auth modal `#authModal`** (`index.html:2869-2947`), unreachable duplicate of the login screen (tabs "Đăng nhập"/"Tạo tài khoản", "Email công vụ", unused 2FA code field "Mã xác thực 2FA (Google Authenticator)", text "Bảo mật Bcrypt + JWT", note "Tài khoản đầu tiên đăng ký trên hệ thống sẽ tự động được cấp quyền **Admin**."). Delete. Reuse its 2FA field idea for the real login MFA step (§3.3).

### 1.8 Core SweetAlert2 dialogs and toasts
| Trigger | Kind | Text |
|---|---|---|
| Sign out | confirm (question, red confirm) | "Đăng xuất?" / "Bạn có chắc chắn muốn đăng xuất khỏi hệ thống Sự kiện SCE?" / "Đăng xuất" · "Ở lại"; then toast info "Đã đăng xuất an toàn" |
| Forgot password | prompt email | "Quên mật khẩu?" / "Nhập email công vụ đã đăng ký để nhận liên kết đặt lại mật khẩu:" / "Gửi email đặt lại" · "Hủy"; success "Đã gửi email" / "Vui lòng kiểm tra hòm thư công vụ để đặt lại mật khẩu." |
| Login success | toast success | "Chào mừng <fullname or email>!" |
| Approve all | confirm (green) | "Phê duyệt N tài khoản?" / "Tất cả các tài khoản cán bộ đang chờ sẽ được kích hoạt quyền truy cập vào hệ thống." / "Phê duyệt ngay" · "Hủy"; loading "Đang phê duyệt tất cả..."; "Thành công" / "Đã phê duyệt kích hoạt N tài khoản cán bộ!" |
| Approve one | loading → success | "Đang phê duyệt..." → "Đã duyệt tài khoản!" / 'Tài khoản cán bộ "<name>" đã được kích hoạt thành công.' |
| Not admin | warning | "Không có quyền" / "Chỉ Quản trị viên (Admin) mới có quyền phê duyệt tài khoản!" |
| No pending | info | "Thông báo" / "Hiện không có tài khoản nào đang chờ duyệt." |
| Role/dept/lock change | toast | "Đã cập nhật vai trò" / "Đã chuyển phòng ban" / "Đã duyệt kích hoạt tài khoản" · "Đã khóa tài khoản" |
| Create account | validation / loading / result | "Thiếu thông tin" / "Vui lòng nhập đầy đủ Email, Mật khẩu và Họ tên cán bộ."; "Mật khẩu yếu" / "Mật khẩu phải từ 6 ký tự trở lên."; "Đang tạo tài khoản..."; "Thành công" / "Đã tạo tài khoản cán bộ: <name> (<email>)"; "Lỗi tạo tài khoản" |
| Settings no permission | error | "Không có quyền" / "Chỉ Ban Giám đốc hoặc Lãnh đạo mới được sửa tham số hệ thống." |
| Manual backup | prompt text | "Tạo Bản Snapshot Mới" / "Ghi chú bản sao lưu:" default "Sao lưu thủ công ngày <dd/mm/yyyy>"; "Đã lưu bản Snapshot an toàn lên Supabase." |
| Restore | confirm warning | "Khôi phục bản Snapshot?" / "Dữ liệu hiện tại sẽ được thay thế bằng dữ liệu tại thời điểm chụp snapshot này." / "Đồng ý khôi phục"; "Đã khôi phục" / "Dữ liệu sự kiện đã được phục hồi thành công." |
| Explicit save OK | toast | "Đã lưu lên Supabase thành công!" |
| Explicit save, table missing | warning + copy SQL | "Chưa Khởi Tạo Bảng Supabase Cloud" (`index.html:6853-6882`) |
| Explicit save, other error | warning | "Lỗi lưu dữ liệu đám mây" |
| Sync (logged out) | toast | "Đã nạp dữ liệu đám mây mới nhất" |
| Sync error | toast warning | "Lỗi đồng bộ: <msg>" |
| Undo / redo | toast info | "Đã hoàn tác (Ctrl+Z)" / "Đã làm lại (Ctrl+Y)" |
| Profile save | success / error | "Thành công" / "Hồ sơ tài khoản đã được cập nhật!"; "Mật khẩu mới phải từ 6 ký tự trở lên." |
| 2FA | error / success | "Mã không hợp lệ" / "Mã xác thực phải gồm 6 chữ số."; "Xác thực thất bại" / "Mã OTP không đúng hoặc đã hết hạn."; "Thành công" / "Đã kích hoạt Xác thực 2 lớp (2FA) bảo vệ tài khoản!" |
| Idle 30 min | info | "Phiên làm việc tạm dừng" / "Bạn không tương tác trong hơn 30 phút. Vui lòng đăng nhập lại để tiếp tục." |
| Install (iOS) | info | "Cài đặt App trên iPhone / iPad", 3 steps (Share → "Thêm vào MH chính" → "Thêm") |
| Install (other, no prompt) | info | "Cài đặt Ứng dụng", Chrome/Edge install icon or ⋮ → "Cài đặt ứng dụng" |

Toasts are always `position: 'top-end'`, no confirm button, timer 1500-2000 ms.

### 1.9 Modal ownership (all 43 modals in the file)
Core fully specifies the first block. The others belong to the listed module spec.

| Modal id | Line | Owner |
|---|---|---|
| authModal, supabaseModal, profileModal, userMgmtModal, backupsModal, auditLogsModal | 2869-3194 | **core** |
| eventWizardModal, stepEditModal, subTasksModal, linksModal, quickNoteModal, printPlanModal | 3349-3682 | events (M2) |
| adminTemplateModal | 5681 | templates (M3, admin) |
| crmGuestModal, crmBoothModal, assignSeatModal, printNameCardsModal, printBadgesModal, guestListPopupModal, confirmedGuestsPopupModal, namecardsAndBadgesPopupModal, banquetGuestsPopupModal | 3683-4311 | guests/booths (M4) |
| adminHallTemplatesModal, editHallTemplateModal, customizeZonesModal | 4312-4431 | halls admin |
| bulkEmailModal, bulkEmailPreviewModal, unitEmailManagerModal, unitEmailEditModal | 4438-4931 | bulk email (M4 sub-module); unit-email modals launched from Cài đặt |
| googleFormRsvpModal | 4935 | guests RSVP (M4) |
| liveQrScannerModal, liveWalkInModal, liveIncidentModal, vipCarPassModal, vipArrivalModal, liveDutyStaffModal | 5171-5474 | live (M5) |
| reportPreviewModal, pressReleaseModal, mediaClippingModal, biddingPackageModal | 5475-5680 | reports (M6) |
| masterGuestModal, masterGuestPickerModal, batchImportMasterModal | 5804-6030 | master guest DB |

---

## 2. Domain types

### 2.1 Reference data
```ts
type Role = 'admin' | 'leader' | 'dept_leader' | 'user';
// CHECK constraint: index.html:7654

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Quản trị viên (Admin)',   // short form 'Admin' in header badge (6301)
  leader: 'Ban Giám đốc',
  dept_leader: 'Lãnh đạo Phòng',
  user: 'Chuyên viên',
};
const ROLE_OPTION_LABEL: Record<Role, string> = { // create-account select, index.html:508-511
  user: 'Chuyên viên thực hiện',
  dept_leader: 'Lãnh đạo Phòng (Xem trong phòng)',
  leader: 'Ban Giám đốc (Xem toàn Trung tâm)',
  admin: 'Quản trị viên (Toàn quyền)',
};
const ROLE_CHIP: Record<Role, string> = { admin: 'ADMIN', leader: 'BGĐ', dept_leader: 'TRƯỞNG PHÒNG', user: 'CHUYÊN VIÊN' }; // 7125-7131

type DepartmentName =
  | 'Phòng Hành chính - Tổ chức'      // HCTC
  | 'Phòng Phát triển doanh nghiệp'   // PTDN
  | 'Phòng Xúc tiến đầu tư'           // XTĐT (default everywhere)
  | 'Phòng Tư vấn doanh nghiệp'       // TVDN
  | 'Ban Giám đốc';                   // only in admin-created accounts and the users tab
// Profile.department may also be '' (admin-email auto profile, index.html:6676, 6707).

interface Department { name: DepartmentName; code: 'HCTC'|'PTDN'|'XTĐT'|'TVDN'|'BGĐ'; duty: string; selfRegisterable: boolean }
// Display short form: name.replace('Phòng ', 'P. ') (index.html:6310).
```

### 2.2 Auth and profile (table `sce_tcsk_profiles`)
```ts
interface Profile {
  id: string;            // uuid = auth.users.id
  email: string;         // UNIQUE
  fullname: string;      // NOT NULL
  role: Role;            // default 'user'
  department: DepartmentName | '';
  is_active: boolean;    // default true. false = "Chờ duyệt" AND "Khóa" (same state)
  created_at: string;    // timestamptz; list ordered desc
  updated_at: string;    // client sets new Date().toISOString() on every update
}

interface AuthUserMetadata {   // supabase auth.users.raw_user_meta_data, client-written at signUp
  fullname?: string;
  full_name?: string;  // Google OAuth provides full_name
  department?: DepartmentName;
  role?: Role;         // client-asserted; must not be trusted (B2)
}
```
Rewrite: add `status: 'pending' | 'active' | 'locked'` instead of overloading `is_active` (Q2).

### 2.3 Persisted app blob (table `sce_tcsk_app_data`, single row `id = 1`)
```ts
interface AppDataRow {
  id: 1;                    // CHECK (id = 1)
  data: AppData;            // jsonb, whole application state
  updated_at: string;
  updated_by: string | null;      // uuid
  updated_by_email: string | null;
}

type EventId = string;      // Event.id

interface AppData {
  // core
  systemSettings: SystemSettings;            // core (+ bulk email writes unitSenderEmails, googleClientId)
  departments: DepartmentName[];             // core default; written once, never read (dead, B22)
  programs: Event[];                         // legacy name for events; read only as migration source (6758)
  // events (M2)
  events: Event[];
  // templates (M3)
  systemTemplates: SystemTemplate[];         // seeded from STANDARD_TEMPLATES (11112) when empty
  // guests / booths / seating / halls (M4 + halls admin)
  eventGuests: Record<EventId, Guest[]>;
  eventBooths: Record<EventId, Booth[]>;
  eventSeating: Record<EventId, SeatingMap>; // object keyed by seat/zone
  eventHallConfig: Record<EventId, { hallId: string; zones: Zone[] }>;
  hallTemplates: HallTemplate[];             // seeded from DEFAULT_HALL_TEMPLATES (12187)
  // master directory
  masterGuestDb: MasterGuest[];              // seeded from DEFAULT_MASTER_GUEST_DB (12312)
  // live (M5)
  eventDutyRoster: Record<EventId, DutyStaff[]>;
  eventIncidents: Record<EventId, Incident[]>;
  // reports (M6)
  eventMediaClippings: Record<EventId, MediaClipping[]>;
  eventBiddingPackages: Record<EventId, BiddingPackage[]>;
  dailyReports: Record<EventId, DailyReport[]>;
}
```
Element types (`Event`, `Guest`, `Booth`, …) are specified by their owning module specs. Core needs only `Event` id/name/department/eventDate for RBAC scoping and sample detection:
```ts
interface EventCoreFields {
  id: string; name: string;
  type: 'hoi_nghi' | 'hoi_cho' | string;
  eventDate: string;          // 'YYYY-MM-DD' (T0)
  department: DepartmentName; // chủ trì; basis for dept_leader scoping (intended)
  created_by: string;         // email or 'system'
  created_at: string; updated_at: string;
}
```

Top-level key registry (owner, first initializer, writers):

| Key | Shape | Owner | Initialized / seeded at | Written by (save path) |
|---|---|---|---|---|
| systemSettings | object | core | default 6065-6073; `ensureUnitSenderEmails` 18217-18227 | `saveSystemSettings` 6907; unit email CRUD 18444-18527 via `syncModule4Storage`; `saveGoogleClientIdSetting` 18804 |
| departments | string[] | core | 6059-6064 | never |
| programs | Event[] | legacy | cloud only | never |
| events | Event[] | M2 | `renderModule2` 9171-9180 (localStorage `sce_tcsk_local_events` → else `initDefaultSampleEvents` 9113-9166); `loadAppDataFromSupabase` 6757-6763 | `persistEventsData` 11087 (15 callers) |
| systemTemplates | array | M3 | `getSystemTemplates` 11125-11127 | 11949, 12010, 12040, 12089 (writes local `sce_tcsk_app_data` then save + audit insert) |
| eventGuests, eventBooths, eventSeating, eventHallConfig, hallTemplates | maps / array | M4, halls | `ensureStarterDataForEvent` 13774-13811 (seeds fake starter data per event) and 13684-13690 | `syncModule4Storage` 13759 (30 refs) |
| masterGuestDb | array | master DB | 12864 | `syncModule4Storage` / direct local write 12866 |
| eventDutyRoster, eventIncidents | maps | M5 | 20616-20617, seeds 20704-20747 | `syncModule5Storage` 20683 (9 refs) |
| eventMediaClippings, eventBiddingPackages, dailyReports | maps | M6 | 21803-21805, seeds 21895-21976 | `syncModule6Storage` 21871 (6 refs) |

### 2.4 System settings
```ts
interface SystemSettings {
  agencyName: string;              // default 'TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP HÀ NỘI (SCE)'
  parentAgency: string;            // default 'SỞ TÀI CHÍNH HÀ NỘI'
  dailyReportThresholdDays: number;// default 10, UI 1..30 ("ngày trước sự kiện")
  fieldPresenceHours: number;      // default 2, UI 1..5 ("tiếng trước khai mạc")
  guestQuotaPercent: number;       // default 130, UI 100..200
  badgeQuotaPercent: number;       // default 120, UI 100..200
  unitSenderEmails: UnitSenderEmail[]; // seeded with 3 defaults when empty (18192-18214)
  googleClientId?: string;         // global fallback OAuth client id (18804)
}

interface UnitSenderEmail {
  id: string;          // 'gmail_cfg_<n>' | 'gmail_cfg_<Date.now()>'
  displayName: string; // legacy alias `name` copied into displayName (18223)
  email: string;       // must contain '@'
  clientId: string;    // '' => bulk email "Sandbox" simulation mode
  isDefault: boolean;  // exactly one true (enforced on save/delete)
}
// Defaults: gmail_cfg_1 'Hòm thư Ban Tổ Chức Sự Kiện' hanoi.sce.event@gmail.com (default),
//           gmail_cfg_2 'Hòm thư Xúc Tiến Đầu Tư Hà Nội' xuctiendautu.hanoi@gmail.com,
//           gmail_cfg_3 'Hòm thư Hỗ Trợ Doanh Nghiệp' hotrodoanhnghiep.sce@gmail.com
```
Settings form parse rule: `parseInt(value) || default` (so 0 or blank falls back to the default). Strings trimmed. UI only populates fields whose stored value is truthy (6887-6898).

### 2.5 Backups and audit
```ts
interface BackupRow {             // sce_tcsk_backups
  id: number;                     // bigint identity
  data: AppData;                  // full snapshot
  note: string | null;            // default 'Bản sao lưu dữ liệu sự kiện'
  created_by: string | null;      // uuid
  created_by_email: string | null;
  created_at: string;
}
interface AuditLogRow {           // sce_tcsk_audit_logs
  id: number;
  actor_id: string | null;
  actor_email: string | null;
  action: string;                 // only value written today: 'CẬP NHẬT BIỂU MẪU CHUẨN' (11959)
  summary: string | null;
  created_at: string;
}
```

### 2.6 Merge-on-load (exact, as implemented)
1. Script parse: `appData` = defaults `{ programs: [], departments: [4 names], systemSettings: {defaults, unitSenderEmails: []} }` (6057-6074). `window.appData = appData`.
2. `DOMContentLoaded` (8225-8239): calls `initAuthSession()` without awaiting, then synchronously `resetIdleTimer()`, `renderModule2()`, `initModule3()`, `initModule4()`, `initModuleBooths()`, `initModule5()`, `initModule6()`, then registers the service worker.
   - `renderModule2()` (9171): if `events` missing/empty, parse localStorage `sce_tcsk_local_events`; if still empty, `initDefaultSampleEvents()` creates 2 fake events (T0 = today + 8 and + 22 workdays) and writes them to `sce_tcsk_local_events`.
   - Module inits may seed starter data for those events and write `sce_tcsk_app_data` locally (`syncModule4Storage(false)` etc.).
3. `initAuthSession()` (6441): `auth.getSession()`; if session, `fetchUserProfile` then `showAppScreen()`, else `showLoginScreen()`. Registers `onAuthStateChange`. Then always (logged in or not) `loadAppDataFromSupabase()` then `loadUserProfilesFromDb()`.
4. `loadAppDataFromSupabase()` (6735): `select('data').eq('id',1).maybeSingle()`.
   - Error with code `PGRST205` or message containing "schema cache" / `relation "public.sce_tcsk_app_data" does not exist` → `_supabaseTcskTableMissing = true`, render M2. Any other error → render M2 only (flag unchanged).
   - Row present → `Object.assign(appData, row.data)`: shallow; every top-level key in the cloud blob replaces the in-memory value wholesale (including all of `systemSettings`); keys absent from cloud keep in-memory values (defaults, local sample events, local seeds). Then if `events` missing/empty: `events = programs` when `programs` non-empty, else `initDefaultSampleEvents()`. Then `renderSystemSettingsUI()`, `renderModule2()`.
   - No row → render M2 only.
   - Finally `lastCommittedState = JSON.stringify(appData)`, undo/redo stacks cleared.
5. localStorage key `sce_tcsk_app_data` is never read back. Only events survive a reload without cloud (B10).

Intended merge for the rewrite: load cloud first, render nothing editable until loaded; deep-merge defaults only for missing keys (`{...DEFAULTS, ...cloud, systemSettings: {...DEFAULT_SETTINGS, ...cloud.systemSettings}}`); never seed sample or starter data into a real tenant (Q4).

---

## 3. Business rules and state machines

### 3.1 Auth session

| State | Event | Action | Next |
|---|---|---|---|
| Booting | page load, no SDK | badge 'Chưa có SDK', show login | LoggedOut |
| Booting | `getSession` → session | `fetchUserProfile`, show app, load data + profiles | LoggedIn |
| Booting | `getSession` → none | show login; data still loaded as anon | LoggedOut |
| Booting | `getSession` throws | show app if `currentUser` set else login; badge 'Ngoại tuyến' | LoggedIn/LoggedOut |
| LoggedOut | email+password submit (empty fields) | error "Vui lòng nhập đầy đủ Email và Mật khẩu" | LoggedOut |
| LoggedOut | `signInWithPassword` OK | `fetchUserProfile`, show app, toast "Chào mừng …" | LoggedIn |
| LoggedOut | `signInWithPassword` error | `#loginError` = server message or "Sai email hoặc mật khẩu" | LoggedOut |
| LoggedOut | Google button | `signInWithOAuth({provider:'google', redirectTo: origin+pathname})` → redirect; on return `detectSessionInUrl` fires SIGNED_IN | LoggedIn |
| LoggedOut | register submit | `signUp({email,password,options.data:{fullname,department,role:'user'}})`; on OK switch to login form, prefill email, "Đăng ký thành công! Bạn có thể đăng nhập ngay." | LoggedOut (or LoggedIn if confirmation disabled, via SIGNED_IN) |
| LoggedOut | register missing fields | "Vui lòng điền đầy đủ Họ tên, Email và Mật khẩu (tối thiểu 6 ký tự)" | LoggedOut |
| any | "Quên mật khẩu?" | prompt email → `resetPasswordForEmail(email)` | same |
| any | `onAuthStateChange` SIGNED_IN | `fetchUserProfile`, show app (data and profiles NOT reloaded) | LoggedIn |
| any | `onAuthStateChange` SIGNED_OUT | clear user/profile, show login (appData, undo stack, cachedProfiles kept) | LoggedOut |
| LoggedIn | sign-out confirm | `auth.signOut()`, clear user/profile, show login, toast | LoggedOut |
| LoggedIn | 30 min without click/mousemove/keypress/touchstart | Swal "Phiên làm việc tạm dừng", `auth.signOut()` | LoggedOut |

Session persistence: supabase-js `persistSession: true, autoRefreshToken: true, detectSessionInUrl: true` (6044-6050), stored by the SDK in localStorage (`sb-<ref>-auth-token`). No server-side session check.

`fetchUserProfile(userId, email)` (6649-6718):
1. `isAdminEmail` = email (lowercased) equals `blackrider232@gmail.com`, or equals `admin@sce.gov.vn`, or contains `admin@`.
2. Select profile by id.
   - Found: use it. If `isAdminEmail` and role ≠ admin: set role admin, is_active true locally and `update` the row.
   - Missing: insert `{id, email, fullname: metadata.fullname || metadata.full_name || email local part, role: isAdminEmail ? 'admin' : (metadata.role || 'user'), department: metadata.department || (isAdminEmail ? '' : 'Phòng Xúc tiến đầu tư'), is_active: true}`.
3. Errors are logged only. If `isAdminEmail` and still no profile, synthesize an in-memory admin profile (fullname fallback "Quản trị viên (Admin)").

Intended (rewrite): profile row is created by a DB trigger on `auth.users` insert with `role='user'`, `status='pending'`; client never chooses its role; admin is a DB role, never an email pattern.

### 3.2 Account approval

| Profile state | Who | Action | Result |
|---|---|---|---|
| is_active=false ("Chờ duyệt") | admin (client check) | "Duyệt tài khoản" | update is_active=true, reload list, success dialog |
| any pending | admin | "Duyệt tất cả" + confirm | `update … in('id', pendingIds)` |
| is_active=true | anyone who sees the table | "Khóa" | update is_active=false (toast "Đã khóa tài khoản") |
| any | anyone who sees the table | change role / department select | immediate update, toast |

As implemented `is_active` gates nothing: login, data reads and writes all ignore it (B3). Self sign-ups and Google logins get `is_active: true` on first profile insert (6687), so the pending queue only fills if the DB default or a trigger says otherwise.

Pending count UI (`updatePendingApprovalsUI`, 6325-6375): count = profiles with `is_active === false`. Header button only for admins with count>0; sidebar badge and tab banner for anyone who sees the tab.

Create account (admin tab): validate email+password+fullname, password ≥ 6; `auth.signUp` with metadata `{fullname, department, role}`; then `upsert` profile `{id, email, fullname, department, role, is_active: true}`; clear the three text inputs (dept and role selects keep their values); reload list.

### 3.3 Two-factor (TOTP)

As implemented:

| State | Event | Action |
|---|---|---|
| Profile modal open | "Cấu hình 2FA" (box hidden) | show box; `auth.mfa.enroll({factorType:'totp', issuer:'SCE Event Management'})`; render QR from `totp.uri`; show `totp.secret`; remember `factorId` |
| Box shown | "Cấu hình 2FA" again | hide box (enrolled factor left unverified) |
| Box shown | "Kích hoạt" with code length ≠ 6 | warning |
| Box shown | "Kích hoạt" | `auth.mfa.challengeAndVerify({factorId, code})`; OK → hide box, status green; error → "Mã OTP không đúng hoặc đã hết hạn." |
| Login | password OK | no AAL check, no challenge (2FA never enforced, B4) |

Intended:
- On profile open: `mfa.listFactors()`; status shows verified TOTP or "Chưa bật". Offer "Tắt 2FA" (`mfa.unenroll`) when verified (Q3).
- Enroll only when no verified factor; unenroll stale unverified factors first; use a `friendlyName`.
- After password or OAuth login, `mfa.getAuthenticatorAssuranceLevel()`; if `nextLevel === 'aal2'` and `currentLevel !== 'aal2'`, show the 6-digit step ("Mã xác thực 2FA (Google Authenticator)") and block the app until `challenge` + `verify` succeed.
- RLS on write policies requires `auth.jwt()->>'aal' = 'aal2'` for users with a verified factor.

### 3.4 RBAC matrix

Role resolution as implemented: `role = profile.role || user.role || 'user'`; forced to admin if `isAdminEmail` (§3.1). `isCurrentAdmin()` (11131, defined in templates module) returns true when there is no user AND no profile ("demo mode"). `canUserEditSettings()` (6920) returns true when there is no profile.

| Capability | admin | leader | dept_leader | user | Check location |
|---|---|---|---|---|---|
| See tabs events, templates, guests, booths, live, reports | ✓ | ✓ | ✓ | ✓ | none |
| Create / edit / delete any event | ✓ | ✓ | ✓ | ✓ | none (10361, 10500-10518) |
| See only own department's events | n/a | n/a | ✗ (not implemented) | ✗ | none |
| See sidebar "Cài đặt", "Tài khoản" | ✓ | ✓ | ✓ | hidden | 6388-6397 (UI only) |
| See sidebar Quản trị biểu mẫu / Hội trường / CSDL Khách & DN | ✓ | ✓ | ✓ | ✓ | never hidden |
| Navigate to any tab by `switchMainTab` | ✓ | ✓ | ✓ | ✓ | no guard |
| Save "Tham số Định mức" | ✓ | ✓ | ✗ | ✗ | 6922 (client) |
| Approve one / all accounts | ✓ | ✗ | ✗ | ✗ | 7168, 7211 (client) |
| Change role, department, lock, create account | ✓ | ✓ | ✓ | (✓ via console) | none |
| Header "Duyệt tài khoản (N)" | ✓ | ✗ | ✗ | ✗ | 6340 |
| Admin template edit / restore / delete; template admin buttons | ✓ | ✗ | ✗ | ✗ | 11817, 11847, 11908, 6401-6421 |
| Backups create / restore / export JSON; view audit | ✓ | ✓ | ✓ | (✓ via console) | none |
| Unit mailbox CRUD, Google Client ID | ✓ | ✓ | ✓ | ✓ (bulk email modal) | none |
| Read whole app blob | anyone incl. anon | | | | RLS anon SELECT (7699) |
| Write whole app blob | any authenticated | | | | RLS FOR ALL (7696) |

Intended matrix for the rewrite (from labels 508-511, 752, 2903 and module comments). Enforce in RLS / server actions, mirror in UI:

| Capability | admin | leader (Ban Giám đốc) | dept_leader (Lãnh đạo Phòng) | user (Chuyên viên) | pending/locked |
|---|---|---|---|---|---|
| Sign in to app | ✓ | ✓ | ✓ | ✓ | ✗ (screen "Tài khoản đang chờ phê duyệt" / "Tài khoản đã bị khóa") |
| View events | all | all | own department (Q1) | own department or assigned (Q1) | ✗ |
| Create/edit events, guests, booths, live ops, reports | all | all | own department | own department (Q1) | ✗ |
| Delete event | ✓ | ✓ | own department | ✗ (Q1) | ✗ |
| System settings | ✓ | ✓ | ✗ | ✗ | ✗ |
| Approve / lock accounts, change role/department, create accounts | ✓ | ✗ (Q5) | ✗ | ✗ | ✗ |
| View accounts list | ✓ | ✓ read-only | own department read-only | ✗ | ✗ |
| Template, hall, master-directory admin | ✓ | ✗ (Q6) | ✗ | ✗ | ✗ |
| Unit mailbox config | ✓ | ✗ | ✗ | ✗ | ✗ |
| Backups restore | ✓ | ✗ | ✗ | ✗ | ✗ |
| Backups create/export, view audit | ✓ | ✓ | ✗ | ✗ | ✗ |
| Profile edit (own name, password, 2FA) | ✓ | ✓ | ✓ | ✓ | ✗ |

### 3.5 Persistence pipeline (as implemented)

`saveAppDataToSupabase(note = 'Cập nhật hệ thống', isExplicit = false)` (6782-6851):
1. `recordUndoSnapshot(note)`.
2. Return if no client or no `currentUser`.
3. Return silently if `_supabaseTcskTableMissing && !isExplicit`.
4. `upsert({id: 1, data: appData, updated_at: now, updated_by: user.id, updated_by_email: user.email})`.
5. OK: clear missing flag; `createBackgroundBackup(note)` inserts the full blob into `sce_tcsk_backups`; toast if explicit.
6. Error: if missing-table pattern, set flag (+ guidance dialog if explicit); else console.warn (+ warning dialog if explicit). Implicit failures are invisible to the user.

Module wrappers:
- `persistEventsData(summary)` (M2, 11087): `recordUndoSnapshot`, write `sce_tcsk_local_events`, then `await saveAppDataToSupabase(summary)` if logged in.
- `syncModule4Storage(notifyCloud = true)` / `syncModule5Storage` / `syncModule6Storage`: write `sce_tcsk_app_data` + `sce_tcsk_local_events`, then if `notifyCloud && currentUser` call `saveAppDataToSupabase(<fixed note>)` without awaiting. Notes: 'Cập nhật dữ liệu Phân hệ 4 (Khách mời / Gian hàng)', '… Phân hệ 5 (Hiện trường T0 & Check-in)', '… Phân hệ 6 (Báo cáo T-10, Truyền thông & Đấu thầu)'.
- Template admin (M3) writes local `sce_tcsk_app_data`, awaits save, then inserts an audit row.

No debounce, no batching, no retry, no version check, no realtime subscription, no refetch on focus. Every save upserts the whole blob and inserts a whole-blob backup row.

Conflict behavior: last write wins on the whole document. Two users editing different events overwrite each other's work with their stale in-memory copy (B9).

`forceCloudSync()` (8086): logged in → explicit save (push local); logged out → reload from cloud. Never pulls when logged in.

Offline/table-missing mode: implicit saves skip the network; only events survive reload (B10).

### 3.6 Undo / redo

| Item | Rule |
|---|---|
| History | `undoStack`, `redoStack` of full `JSON.stringify(appData)` strings, `MAX_HISTORY = 30` each (oldest dropped) |
| Baseline | `lastCommittedState` set after cloud load (6772) |
| Record | `recordUndoSnapshot()` on each save: if current JSON ≠ `lastCommittedState`, push `lastCommittedState` to undo, clear redo, set `lastCommittedState` = current. Skipped while an undo/redo runs |
| Undo | push current to redo; pop undo → `appData` (and `window.appData`); write both local keys; re-render M2-M6 (`renderModule2..6`); save to cloud with note 'Hoàn tác (Ctrl+Z)'; toast |
| Redo | mirror of undo; note 'Làm lại (Ctrl+Y)' |
| Shortcuts | `keydown` (22694-22712): Ctrl/⌘+Z = undo; Ctrl/⌘+Y or Ctrl/⌘+Shift+Z = redo; ignored with Alt or when focus is in textarea, contenteditable, or text-like input |
| Buttons | disabled when stack empty; title shows count |
| Reset | stacks cleared only after a cloud load, not on sign-out |

Intended: per-user, per-session history of domain commands (not whole-blob copies), cleared on sign-out; undo of an action re-applies through the same permission and save path; history depth 30.

### 3.7 System settings save
- Permission: `canUserEditSettings()` (admin, leader; true when no profile).
- Builds a new `systemSettings` from the 6 inputs and replaces the old object (drops `unitSenderEmails`, `googleClientId`, B11). Save note 'Cập nhật tham số định mức sự kiện' (implicit, no success feedback). Re-renders the form and KPI cards.
- Intended: merge into existing settings; validate ranges (threshold 1-30, hours 1-5, quotas 100-200); show success toast; every consumer reads these values (B12).

### 3.8 Backups
- Auto: one row per successful save (note = save note).
- Manual: prompt note (default "Sao lưu thủ công ngày <vi-VN date>"); empty note cancels.
- List: latest 20 by `created_at desc`.
- Restore: confirm → fetch row → `appData = row.data` → save ('Khôi phục từ Snapshot #<id>') → re-render settings → close modal.
- Export: download `SCE_Event_Backup_<YYYY-MM-DD>.json` (pretty-printed `appData`, data: URI).
- Intended: auto backups at most once per N minutes or per day (Q8); manual snapshots flagged and never pruned; restore admin-only, re-renders every module, records an audit row; import JSON (Q8).

### 3.9 Navigation
- `switchMainTab(tabId)` accepts new ids (`tab-events`…) and legacy ids (`tab-module1..6`, `tab-settings`) per mapping (8015-8034); unknown ids fall back to `tabId.replace('tab-','')`.
- Hides all 11 sections, resets all nav button classes, shows the target section, applies the target's active color, updates the top bar from `FUNCTION_METADATA`, then calls the module render: events→`renderModule2`, templates→`renderModule3`, guests→`renderModule4`, booths→`renderModuleBooths`, live→`renderModule5`, reports→`renderModule6`, users→`loadUserProfilesFromDb`, admin-templates→`renderAdminTemplatesTable`, admin-halls→`renderAdminHallsTabUI`, admin-guests→`renderMasterGuestDbUI`. `admin` renders nothing (settings form is filled only on cloud load).
- No URL change, no history, no deep links, no guard. Rewrite: one route per tab (§7.1) with a permission guard; legacy ids map to routes.
- Sidebar mobile: `toggleSidebar(true|false|undefined)` toggles `-translate-x-full` and the backdrop. Desktop collapse: toggles `.collapsed`, persists `sce_sidebar_collapsed` ('1'/'0'), restored at script parse.

### 3.10 Dark mode, PWA
- Dark mode: class `dark` on `<html>`. Initial: localStorage `theme === 'dark'`, or no `theme` and `prefers-color-scheme: dark`. Toggle writes `theme` 'dark'/'light' and swaps `#darkModeIcon` moon ↔ sun. Rewrite: set the class before first paint (inline head script or `next-themes`).
- PWA install: capture `beforeinstallprompt` (preventDefault, store). "Cài đặt" button: if stored prompt → `prompt()`, clear on accepted. Else iOS (UA iPad/iPhone/iPod or MacIntel with touch) → iOS instructions; else generic instructions. On `appinstalled` hide both install buttons. Should also hide when `matchMedia('(display-mode: standalone)')` matches (B35).

### 3.11 Header identity rendering
- Name: profile.fullname → email local part → "Chuyên viên"; without profile: metadata fullname/full_name → local part.
- Role label map: admin 'Admin', leader 'Ban Giám đốc', dept_leader 'Lãnh đạo phòng', user 'Chuyên viên'.
- Department chip hidden for admin, leader, empty dept, or "Ban Giám đốc".

---

## 4. External side effects

### 4.1 Supabase calls (complete list across the whole file)
No `.rpc(`, `.storage`, `.channel(`, realtime or edge functions anywhere.

| Line | Table / API | Operation | Columns / filter |
|---|---|---|---|
| 6449 | auth | `getSession()` | |
| 6463 | auth | `onAuthStateChange` | handles SIGNED_IN, SIGNED_OUT |
| 6496 | auth | `signInWithOAuth({provider:'google', options.redirectTo})` | redirect = origin + pathname |
| 6545, 7295 | auth | `signInWithPassword({email, password})` | |
| 6599, 7321 | auth | `signUp({email, password, options.data:{fullname, department, role:'user'}})` | |
| 7036 | auth | `signUp(... data:{fullname, department, role})` (admin creates account) | |
| 7357, 8218 | auth | `signOut()` | |
| 7378 | auth | `resetPasswordForEmail(email)` | no redirectTo |
| 7399 | auth | `mfa.enroll({factorType:'totp', issuer:'SCE Event Management'})` | |
| 7431 | auth | `mfa.challengeAndVerify({factorId, code})` | |
| 7831 | auth | `updateUser({password})` | |
| 6656 | sce_tcsk_profiles | select * eq id maybeSingle | |
| 6669 | sce_tcsk_profiles | update {role:'admin', is_active:true, updated_at} eq id | admin-email promotion |
| 6680 | sce_tcsk_profiles | insert {id, email, fullname, role, department, is_active:true} select single | |
| 6939 | sce_tcsk_profiles | select * order created_at desc | |
| 7046 | sce_tcsk_profiles | upsert {id, email, fullname, department, role, is_active:true, updated_at} | |
| 7137 | sce_tcsk_profiles | update {role, updated_at} eq id | |
| 7152 | sce_tcsk_profiles | update {department, updated_at} eq id | |
| 7184 | sce_tcsk_profiles | update {is_active:true, updated_at} eq id | |
| 7240 | sce_tcsk_profiles | update {is_active:true, updated_at} in id[] | |
| 7263 | sce_tcsk_profiles | update {is_active, updated_at} eq id | |
| 7600 | sce_tcsk_profiles | select count head (connection test) | |
| 7821 | sce_tcsk_profiles | update {fullname, updated_at} eq id | |
| 6739 | sce_tcsk_app_data | select data eq id 1 maybeSingle | |
| 6800 | sce_tcsk_app_data | upsert {id:1, data, updated_at, updated_by, updated_by_email} | |
| 7451 | sce_tcsk_backups | insert {data, note, created_by, created_by_email} | |
| 7482 | sce_tcsk_backups | select * order created_at desc limit 20 | |
| 7523 | sce_tcsk_backups | select data eq id single | |
| 7552 | sce_tcsk_audit_logs | select * order created_at desc limit 50 | |
| 11956 | sce_tcsk_audit_logs | insert {actor_id, actor_email, action:'CẬP NHẬT BIỂU MẪU CHUẨN', summary} | templates module |

Error codes handled: `PGRST205` and message fragments "schema cache", `relation "public.<table>" does not exist`; `PGRST116` ignored in connection test.

### 4.2 Schema recovered from the in-app SQL (`index.html:7649-7705`)
`copySqlSchema()` first fetches `./database/supabase_tcsk_schema.sql` (relative to `code/`); that file is not in the repo (`git ls-files` shows only `code/index.html`, `code/manifest.json`, `code/sw.js`, icons, root `index.html`), so the inline fallback is the only schema source.

```sql
create table if not exists public.sce_tcsk_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  fullname text not null,
  role text not null default 'user' check (role in ('admin','leader','dept_leader','user')),
  department text not null default 'Phòng Xúc tiến đầu tư',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.sce_tcsk_app_data (
  id int primary key default 1 check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_by_email text
);
create table if not exists public.sce_tcsk_backups (
  id bigint generated by default as identity primary key,
  data jsonb not null,
  note text default 'Bản sao lưu dữ liệu sự kiện',
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now()
);
create table if not exists public.sce_tcsk_audit_logs (
  id bigint generated by default as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  summary text,
  created_at timestamptz not null default now()
);
-- RLS enabled on all four. Policies:
-- profiles:   SELECT to authenticated using (true)          (no INSERT/UPDATE policy)
-- app_data:   ALL to authenticated using (true) with check (true)
-- app_data:   SELECT to anon using (true)
-- backups:    ALL to authenticated using (true) with check (true)
-- audit_logs: ALL to authenticated using (true) with check (true)
```
Note: `department` is NOT NULL, but the client inserts `''` for admin emails. That works ('' is not null). The admin-email path relies on an UPDATE policy the fallback SQL lacks.
UI also mentions `sce_v2_profiles` (`index.html:617`) and a shared project with "/quanlydauthau" (`index.html:2962`). The deployed schema may differ (Q9).

### 4.3 Google Identity Services
- `<script src="https://accounts.google.com/gsi/client" async defer>` (52). Used only by bulk email: `google.accounts.oauth2.initTokenClient` (18670-18672). Client id resolution `getActiveGoogleClientId()` (18259): selected sender's `clientId` → `systemSettings.googleClientId` → localStorage `sce_google_client_id`.
- sessionStorage `sce_google_access_token`, `sce_google_user` (18590-18791).
- Login "Đăng nhập với Google" uses Supabase OAuth, not GSI.

### 4.4 Browser storage keys
| Key | Store | Writer | Reader | Content |
|---|---|---|---|---|
| `sce_tcsk_supabase_config` | local | 7631 | 6038 | `{url, key}` override |
| `sce_tcsk_app_data` | local | 6127, 6167, 11950, 12011, 12041, 12090, 12866, 13761, 20685, 21873 | none | full appData JSON |
| `sce_tcsk_local_events` | local | 6128, 6168, 9165, 11093, 13762, 20686, 21874 | 9173 | events array |
| `sce_sidebar_collapsed` | local | 6252 | 6259 | '1' / '0' |
| `theme` | local | 7747 | 7752 | 'dark' / 'light' |
| `sce_google_client_id` | local | 18805 | 18265, 18603, 18667 | OAuth client id |
| `sb-<project-ref>-auth-token` | local | supabase-js | supabase-js | session JWT |
| `sce_google_access_token`, `sce_google_user` | session | 18677, 18712 | 18590-18591 | Gmail OAuth token + user |

### 4.5 Timers and listeners
- Idle timer 30 min (`setTimeout`, reset on click/mousemove/keypress/touchstart on `window`), 8207-8222.
- Global `keydown` undo/redo, 22694.
- Global `click` closes `#userMenuContent` (element absent, dead), 7762.
- `beforeinstallprompt`, `appinstalled`, 8118-8129.
- Other modules: `setInterval` 17314, Google Form auto-sync `setInterval` 20580 (not core).

### 4.6 Service worker and manifest
`sw.js` (66 lines), registered as `./sw.js?v=4` (8237):
- `CACHE_NAME = 'sce-sukien-v5'`; precache `./`, `./index.html`, `./manifest.json`, `../icon/apple-touch-icon.png`, `../icon/app-icon-192.png`, `../icon/app-icon-512.png`, `../icon/logo-192.png`, `../icon/logo-512.png`.
- install: `skipWaiting()` + `cache.addAll`. activate: delete other caches, `clients.claim()`.
- fetch: bypass non-GET and URLs containing `supabase.co`, `/auth/v1/`, `/rest/v1/`, `/storage/v1/`. Else network-first; cache successful `type === 'basic'` 200 responses; on network failure `caches.match`.
- No update prompt to the user.

`manifest.json`: name "Quản trị Tổ chức Sự kiện - SCE", short_name "Sự kiện SCE", description "Hệ thống quản trị quy trình, hậu cần, biểu mẫu và điều hành sự kiện SCE", `start_url ./index.html`, `display standalone`, background `#ffffff`, theme `#1e3a8a`, icons apple-touch 180 (any), logo-192 and logo-512 (`any maskable`).

### 4.7 Hard-coded URLs, keys and identities (flag)
| Item | Line | Flag |
|---|---|---|
| Supabase URL `https://xqmeeticiwclsvckpqrd.supabase.co` | 6035 | config → env `NEXT_PUBLIC_SUPABASE_URL` |
| Supabase anon JWT (role anon, exp 2106) | 6036 | public by design, but combined with anon SELECT policy it exposes all data (B5). Move to env |
| Admin email `blackrider232@gmail.com` | 6278, 6333, 6387, 6650, 7168, 7211, 11140 | personal email as backdoor superadmin. Remove (B1) |
| Pattern `admin@`, `admin@sce.gov.vn` | same | remove |
| Wikimedia emblem fallback image | 120, 233 | bundle locally |
| Default sender Gmail addresses | 18192-18214 | seed data, not code |
| CDNs: cdn.tailwindcss.com, jsdelivr supabase-js@2 and sweetalert2@11 (unpinned), exceljs@4.4.0, cdnjs qrcodejs 1.0.0, font-awesome 6.5.1, Google Fonts, GSI | 23-52 | replace with npm deps |
| Email domains in placeholders `sce.hanoi.gov.vn`, `sce.gov.vn` | 195, 485, 2889 | cosmetic (Q10) |

---

## 5. Dependencies (what other modules need from core)

### 5.1 Provided by core (today's globals → rewrite API)
| Today | Used by | Rewrite |
|---|---|---|
| `appData` (lexical global, reassigned by undo 6124/6164 and restore 7529) and `window.appData` | every module (`events` 94 refs, `eventGuests` 108, …) | `useAppData()` store with typed slices and `mutate(slice, fn, note)` |
| `saveAppDataToSupabase(note, isExplicit)` | `persistEventsData` (M2), `syncModule4/5/6Storage`, template admin 11955-12093 | single `commit(note)` inside the store; modules never call Supabase directly |
| `recordUndoSnapshot(note)` | `persistEventsData` 11089 | internal to `commit` |
| `currentUser` (`id`, `email`, `user_metadata`) | M2 9107, 10330, 10454; M5 check-in staff 21039, 21275; bulk email 19114, 19287 (`currentUser.full_name`, does not exist) | `useSession()` → `{ userId, email }` |
| `currentProfile` (`fullname`, `department`, `role`) | M2 wizard defaults 10366, 10374; Excel export signatures 17295, 17342, 17728, 17767; bulk email 19115-19116, 19492-19493 | `useProfile()` |
| `supabaseClient` | M3 audit insert 11956; guarded checks 11096, 11953, 12013, 12043, 12092 | server-only client; audit via `logAudit(action, summary)` |
| `escapeHtml(str)` | 204 call sites | not needed with React; keep a `escapeHtml` util only for HTML export strings (Word/print templates) and fix falsy-zero (B26) |
| `switchMainTab(id)` | 23 refs (wizard, banners, shortcuts) | `router.push(routeFor(tabKey))` |
| `isCurrentAdmin()` (defined in M3, 11131, used by core 6401) | M3 template admin | `can(user, 'templates.admin')` in core |
| `canUserEditSettings()` | core only | `can(user, 'settings.edit')` |
| `getDepartmentHeadSignatureTitle(profile)` (17294, export) | Excel/print exports | move to shared `departments` util |
| SweetAlert2 `Swal.fire` (198 calls, 135 outside core; 46 toasts) | all | `toast()`, `confirm()`, `prompt()`, `alert()` primitives |
| `toggleSidebar(false)` after nav | sidebar markup | layout state |
| `localStorage` keys `sce_tcsk_app_data`, `sce_tcsk_local_events` | modules write them directly | removed; offline cache owned by the store (Q11) |

### 5.2 Core calls into modules today (inverted dependencies to remove)
`renderModule2..6`, `renderModuleBooths`, `initModule3..6`, `initModuleBooths`, `initDefaultSampleEvents` (M2 9113), `renderAdminTemplatesTable`, `renderAdminHallsTabUI`, `renderMasterGuestDbUI`, `renderAdminUnitEmailsSection` (bulk email 18533), `openDailyReportPopup` (M2 9281), `printAllEventsPlan` (M2 11034), `openCreateEventModal` (M2 10361), `scrollToAdminTemplates` (M3 11709), `scrollToMasterGuestDbSection` (12924), `openUnitEmailManagerModal` / `openUnitEmailEditModal` (18329, 18389). In the rewrite, the shell renders routes; modules subscribe to the store; header actions are slots each module registers.

### 5.3 Shared helpers currently in other modules that core should own
- Date: `isWeekend`, `addWorkdays`, `subtractWorkdays`, `addCalendarDays`, `subtractCalendarDays`, `calculateStepDeadline`, `getDaysDiff`, `getWorkdaysDiff`, `formatVNDate(dateStr, withDayOfWeek)` (8261-8380, M2; `formatVNDate` used 15×). Weekends only (Sat/Sun). No Vietnamese public holidays (Q12). Core date module must parse `'YYYY-MM-DD'` as local date (`T00:00:00`) like today.
- vi-VN timestamp display: `new Date(x).toLocaleString('vi-VN')` (7496, 7566), `toLocaleDateString('vi-VN')` (7467).
- Org identity: agency name, parent agency (hard-coded 19× e.g. 10931, 11112, 11867, 17384, 21737, 22234) must come from `systemSettings`.
- Thresholds: daily report 10 workdays (9198, 9823, 9855), quotas 1.3/1.2 (11385-11386, 22142, 22650) must come from `systemSettings`.

---

## 6. Bugs and logic flaws

Severity: Critical (security breach or data loss), High (wrong core behavior), Medium, Low.

**B1 Critical. Email-pattern admin backdoor.** `isAdminEmail` is true for `blackrider232@gmail.com`, `admin@sce.gov.vn`, or any email containing `admin@` (`index.html:6278-6280, 6333, 6387, 6650-6652, 7168, 7211, 11140-11142`). Anyone can register `xadmin@gmail.com` (or sign in with such a Google account) and `fetchUserProfile` writes `role: 'admin'` to the DB (6664-6671, 6677). Intended: admin is a DB-assigned role only.

**B2 Critical. Client-chosen role at sign-up.** New profile role = `user_metadata.role` (6677), and metadata is whatever the client sent to `signUp` (6606, 7328, 7040). A crafted `signUp({options:{data:{role:'admin'}}})` yields an admin. `renderUserBadge` also trusts metadata role (6292). Intended: DB trigger creates the profile with `role='user'`; metadata ignored for authz.

**B3 Critical. Approval and lock are cosmetic.** `is_active` is never checked at login or on data access (all reads of `is_active` are UI: 6327, 6976, 7087, 7218). New profiles are inserted with `is_active: true` (6687), so self-registered and Google users are active immediately. Intended: pending/locked users cannot sign in or read/write data; enforced by RLS.

**B4 Critical. 2FA is never enforced.** Login does not check AAL or challenge a factor (6545, 7295); the 2FA input `#signIn2faField` (2896) is never shown. Each "Cấu hình 2FA" click enrolls a new TOTP factor (7392-7405) and leaves unverified factors behind. Status is never loaded (`#prof2faStatusText` only set at 7438), so it always shows "Chưa bật". No way to disable. Intended: §3.3.

**B5 Critical. RLS exposes and opens everything.** Fallback policies (7692-7705): anon can SELECT the whole `sce_tcsk_app_data` blob (guest names, phones, emails) with the public anon key embedded at 6036; any authenticated user (open sign-up, Google) can update/delete app data, backups and audit logs (`FOR ALL … USING (true)`). "Nhật Ký Kiểm Toán Bất Biến" (3171) is mutable. Profiles have only a SELECT policy, so the client's inserts/updates (6669, 6680, 7046, 7137-7263, 7821) fail or affect 0 rows depending on the deployed schema; PostgREST returns no error for RLS-filtered updates, so the UI toasts success while nothing changes. Intended: per-role policies (§7.3), no anon access.

**B6 Critical. RBAC is client-side only and incomplete.** `updateUserRole`, `updateUserDepartment`, `toggleUserActiveStatus`, `createNewAccountFromTab` have no permission check (7134, 7149, 7258, 7020). leader and dept_leader see the Tài khoản tab (6388-6397) and can promote themselves to admin. `switchMainTab` has no guard (8013). Admin-templates/halls/guests sidebar items are never hidden (only `tabBtn-admin`/`tabBtn-users` are toggled, 6380-6397). Backups/restore/audit (7462-7578) and unit-mailbox config (18424-18531, 18801) have no checks. Intended: §3.4 intended matrix, enforced server-side.

**B7 High. Department scoping not implemented.** Labels promise "Lãnh đạo Phòng (Xem trong phòng)", "Ban Giám đốc (Xem toàn Trung tâm)" (509-510) and "Lãnh đạo phòng quản lý sự kiện nội bộ của phòng mình" (752). No code filters events by `department` for any role (only a user-chosen filter at 9705). Intended: scope per Q1.

**B8 High. Admin account creation hijacks the admin's session.** `createNewAccountFromTab` calls `auth.signUp` on the admin's own browser client (7036). With email confirmation off, supabase-js signs in as the new user, fires SIGNED_IN (6463), and the admin is silently switched. The following profile upsert (7046) runs as the new user. Intended: server action using the service-role `auth.admin.createUser` / `inviteUserByEmail`.

**B9 Critical. Save before or after a failed load overwrites cloud data.** Modules render and seed sample/starter data synchronously at `DOMContentLoaded` (8228-8233, 9171-9179, 13774-13811) while `initAuthSession` loads asynchronously (6476). Any save triggered before the load finishes upserts the sample blob over the real one. If the load fails with a non-"missing table" error (6744-6753, no flag set) or throws (6776), memory keeps sample data and the next save (6799-6807) replaces the cloud document. Backups exist (B16) but nobody is told. Intended: block writes until a successful load; never write after a failed load.

**B10 Critical. Whole-document last-write-wins.** Every save upserts the entire blob with no version check (6799-6807); no realtime or refetch. Two users working concurrently overwrite each other. `forceCloudSync` pushes the local copy instead of pulling (8091-8092). Module saves are fire-and-forget (13764, 20688, 21876), so overlapping upserts can land out of order. Intended: normalized tables or per-slice rows with `updated_at` optimistic concurrency, and refetch/realtime (§7.2).

**B11 High. localStorage fallback is write-only.** `sce_tcsk_app_data` is written 10× (6127, 6167, 11950, 12011, 12041, 12090, 12866, 13761, 20685, 21873) and never read; only `sce_tcsk_local_events` is read (9173). In offline or table-missing mode every non-event change is lost on reload, while the guidance dialog says "Dữ liệu an toàn 100%" (6861). PII stays in localStorage after sign-out (7357-7360). Intended: either a real offline cache scoped to the user and cleared on sign-out, or no offline writes (Q11).

**B12 High. Saving settings wipes unit mailboxes.** `saveSystemSettings` replaces `appData.systemSettings` with only the 6 form fields (6907-6914), dropping `unitSenderEmails` and `googleClientId`. `ensureUnitSenderEmails` then reseeds the 3 default mailboxes (18219-18220). Intended: merge.

**B13 High. Settings are never consumed.** `dailyReportThresholdDays`, `fieldPresenceHours`, `guestQuotaPercent`, `badgeQuotaPercent`, `agencyName`, `parentAgency` are referenced only in core (6066-6071, 6885-6913). Modules hard-code 10 days (9198, 9823, 9855), ×1.3 / ×1.2 (11385-11386, 22142, 22650) and the agency names (19 occurrences, e.g. 10931, 11112, 11867, 17384, 21737, 22234). The card says "Tự động áp dụng cho mọi sự kiện" (656). Intended: all consumers read settings.

**B14 High. "Demo mode" grants privileges when the profile fails to load.** `canUserEditSettings` returns true when `currentProfile` is null (6921); `isCurrentAdmin` returns true when no user and no profile (11134-11137). A profile insert/select failure (B5) leaves `currentProfile` null and unlocks settings. Intended: deny by default.

**B15 Medium. Implicit saves fail silently.** Implicit saves while `_supabaseTcskTableMissing` return without a network call or message (6794-6796); implicit errors only `console.warn` (6838). "Lưu Cấu Hình Tham Số" is implicit (6916), so a failed or skipped save gives no feedback. Intended: every user-initiated save reports success or failure.

**B16 Medium. Full backup on every edit.** `createBackgroundBackup` inserts the whole blob after every successful save (6817, 7448-7460). Storage grows without bound; the list shows only the last 20 (7485), so manual snapshots scroll out within 20 edits. Intended: throttled auto backups plus retained manual snapshots (Q8).

**B17 Medium. Restore breaks undo and leaves stale UI.** `restoreSnapshot` assigns `appData = data.data` but not `window.appData` (7529). `recordUndoSnapshot` reads `window.appData || appData` (6101), so it keeps snapshotting the pre-restore object until the next undo/redo. Only settings re-render (7531); module views stay stale. No permission check, no audit row. Intended: restore through the store, re-render everything, admin-only, audited.

**B18 Medium. Audit log is nearly empty.** The only writer is template admin (11956). Logins, approvals, role changes, restores, check-ins are not logged, contrary to 819-822. Intended: DB triggers or server actions write audit rows for every privileged action.

**B19 Medium. Undo/redo flaws.** 60 full JSON copies in memory (6081, 6105, 6120). Undo re-renders only modules 2-6 (6130-6134), not booths, admin tabs or settings. Local-only writes (`syncModule4Storage(false)`, 13810) are not snapshotted and fold into the next step. Undo pushes the old blob to the cloud, reverting other users' work (B10). Stacks survive sign-out and user switch (7357-7360). Intended: §3.6.

**B20 Low. "Ghi nhớ đăng nhập" does nothing.** `#rememberMe` (148) is never read; session is always persisted (6046). Intended: unchecked → session storage only (Q13), or remove the checkbox.

**B21 Medium. "Quản trị Biểu Mẫu" shortcut is broken.** `scrollToAdminTemplates` switches to `tab-admin` and scrolls to `#adminTemplatesSection` (11709-11714), but that element is inside `mainTab-admin-templates` (866, 907), which stays hidden. Intended: navigate to the admin-templates tab.

**B22 Low. Dead code and dead data.** `authModal` + `handleSignInSubmit`/`handleSignUpSubmit`/`switchAuthTab`/`openAuthModal` (2869-2947, 7285-7343, 7770-7786) never opened. `supabaseModal` + `openSupabaseModal`/`testSupabaseConnection`/`saveSupabaseConfig` (2950-3001, 7583-7635) never opened. `toggleUserDropdown` and the document click listener (7757-7768) target absent elements. `updateDbStatusBadge` (7724-7739, 12 calls) targets absent `#dbStatusDot`/`#dbStatusText`, so the online/offline state is never shown. `#topBarCollapseIcon` absent (6240, 6262). `showUpcomingModuleNotice` (8184) and `getRoleBadgeTitle` (6720) unused. `appData.departments` (6059) never read. `#syncText` "Đã đồng bộ" (400) never shown. Intended: delete; surface sync status in the header (§7.5).

**B23 Low. Undefined function.** "Tạo Bản Sao Lưu" calls `createNewBackup()` (773), which is not defined anywhere (only `createBackgroundBackup` and `handleCreateManualBackup` exist), so the button throws `ReferenceError`. Intended: call the manual-backup flow.

**B24 Medium. onAuthStateChange handling.** The callback is `async` and awaits a Supabase query (6463-6467); supabase-js v2 warns this can deadlock other auth calls. SIGNED_IN after an explicit login re-runs `fetchUserProfile` and `showAppScreen` (duplicate of 6548-6550). Signing in after page load reloads neither app data nor the profiles list (only the initial `initAuthSession` does, 6476-6477), so data loaded as anon (or empty) stays. Sign-out keeps `appData`, `cachedProfiles` and undo stacks in memory. Intended: one session store; on SIGNED_IN load data; on SIGNED_OUT clear all user data.

**B25 Medium. Password recovery incomplete.** `resetPasswordForEmail(email)` without `redirectTo` (7378); no `PASSWORD_RECOVERY` handler. The user lands signed in with no "set new password" screen. Intended: `/reset-password` route handling the recovery event.

**B26 Medium. Duplicate and divergent user management.** Tab table (6956-7018) vs modal (7067-7123): modal department select lacks "Ban Giám đốc" (7099-7104), so such users display as "Phòng Hành chính - Tổ chức" and a careless change moves them; modal filter lacks it too (3088-3093); modal lock toggle passes `!u.is_active` (7116) while the tab treats `undefined` as active (6976); role labels differ (7005-7008 vs 7108-7111). Intended: one users screen.

**B27 Low. Inconsistent role and department labels.** leader: "Ban Giám đốc" (6302), "BGĐ" (7128), "Lãnh đạo đơn vị" (19116); dept_leader: "Lãnh đạo phòng" (6303), "Lãnh đạo Phòng" (6724), "TRƯỞNG PHÒNG" (7129); admin: "Admin" (6301), "Quản trị viên (Admin)" (6722), "ADMIN" (7127). Department lists hard-coded in 7 places in different orders (187-190, 498-502, 530-534, 2929-2932, 3089-3092, 6996-7000, 7100-7103). Sign-up excludes "Ban Giám đốc" (intended). Intended: one `ROLES` and one `DEPARTMENTS` registry.

**B28 Low. `escapeHtml` bugs.** Returns '' for `0`/`false` (8203) so numeric zero renders blank; does not escape `'` while ids are interpolated into single-quoted `onclick` attributes (6982-6983, 7116, 18548-18558). Intended: React escaping; export util escapes all five characters and only treats null/undefined as empty.

**B29 Low. HTML injection via SweetAlert2.** Swal `title` and the positional second argument render HTML. User-controlled values go in unescaped: `Chào mừng ${fullname}` (6555), `Đã tạo tài khoản cán bộ: ${fullname} (${email})` (7061), `Chào mừng ${data.user.email}` (7299), server error messages (e.g. 7063, 7145, 7203), raw SQL in a textarea (7718). Self/admin XSS. Intended: text-only toasts and dialogs.

**B30 Medium. Accessibility.** Zoom disabled (`maximum-scale=1.0, user-scalable=no`, 5), violating WCAG 1.4.4. `select-none` on `<body>` (112) blocks copying names, emails, codes. Zero `aria-*` attributes in the file; modals lack `role="dialog"`, labelled titles, focus trap, Esc close, focus return. Icon-only header buttons rely on `title` (388-408). Labels are not bound to inputs (`<label>` without `for`, e.g. 131-132, 484-485). Intended: accessible primitives (§7.4).

**B31 Medium. Misleading security and storage claims.** "Bảo mật Bcrypt + JWT" (2903), "RLS + Checksum bất biến" (788, no checksum exists), "Nhật Ký Kiểm Toán Bất Biến" (3171), "Đồng bộ từ sce_v2_profiles" (617, real table `sce_tcsk_profiles`), "Nghị định 30/2020 & RBAC" (815), "Dữ liệu an toàn 100%" (6861). Intended: state only true facts.

**B32 Medium. Sample and starter data injected into real data.** If cloud `events` is empty, `initDefaultSampleEvents()` creates 2 fake events (6761, 9177-9178), and modules seed fake guests, booths, seating, rosters, incidents, clippings, bidding packages and daily reports per event (13794-13807, 20704-20747, 21895-21976). The next save persists them. Intended: empty states; an explicit "Tạo dữ liệu mẫu" action only in demo (Q4).

**B33 Low. Dark mode flash and icon drift.** Theme is applied by the end-of-body script (7752), so the page paints light first. Toggle sets icon `text-sm text-amber-400` / `text-sm` (7748) while markup starts as `text-xs text-indigo-200` (407). Intended: pre-paint theme; one icon style.

**B34 Low. Build/CDN hygiene.** Unpinned `supabase-js@2` (45) and `sweetalert2@11` (46); Tailwind Play CDN in production (27). Tailwind v4-only classes in a v3 runtime: `backdrop-blur-xs` (225), `shadow-xs` (7993), `py-0.2` (374); `hide-scrollbar` (251) undefined. Intended: npm-pinned deps, Tailwind build.

**B35 Low. PWA offline and update gaps.** Third-party CDN responses are not `type === 'basic'` (sw.js:56), so Tailwind, supabase-js, SweetAlert, fonts are never cached; offline launch renders an unstyled, non-functional page. Registration query `?v=4` vs cache `v5` (8237, sw.js:1) suggests manual versioning. No update notification. Install buttons stay visible in standalone mode (8118-8129). Intended: Next.js PWA with precached build assets, versioned by build id, "Có phiên bản mới" prompt.

**B36 Low. Register flow messaging.** No client-side length check (6584). Success text "Bạn có thể đăng nhập ngay" (6614) is wrong when email confirmation is on; when it is off, SIGNED_IN fires and opens the app while the UI shows the login form. Intended: messages by outcome (confirmation sent / pending approval / signed in).

**B37 Low. Profile modal edge cases.** Closing does not reset the 2FA setup box or QR (7810-7812). Fullname update is skipped silently when `currentProfile` is null (7819). Fullname is not trimmed-validated for empty. Password change gives no re-auth step. Intended: reset on open; validate; require current password or recent login for password change (Q3).

**B38 Low. Header pending UI vs permission.** leader/dept_leader see the pending badge, banner and "Duyệt" buttons (6351-6374, 6982) but approval rejects them with "Không có quyền" (7170). Intended: hide actions a role cannot perform.

**B39 Low. Settings form populates only truthy values** (6887-6898) and only after a cloud load (6764). With no cloud row, the form shows HTML defaults even if a user saved other values (which also were not persisted, B11/B15). Intended: always render from the store.

**B40 Low. Cross-module identity misuse.** `currentUser.full_name` (19287) does not exist (Supabase user has `user_metadata.full_name`), so the bulk-email contact always falls back to "Cán bộ Lễ tân SCE". Intended: `profile.fullname`.

**B41 Low. Hard-coded personal email in source.** `blackrider232@gmail.com` (6278 and 6 more) is personal data and a privileged identity in a public bundle. Intended: remove; seed the first admin via SQL (Q5).

**B42 Low. Idle timeout scope.** The 30-minute timer (8207-8222) runs on the login screen too and signs out every tab sharing the session; no warning before expiry; unsaved form input is lost. Intended: warn at 28 min with "Tiếp tục làm việc", then sign out and clear user data (Q13).

Total: 42 findings (B1-B42). B23 is the undefined `createNewBackup`.

---

## 7. Rewrite notes

### 7.1 Architecture slice (core)
- Next.js App Router, TypeScript strict, Tailwind (build), `@supabase/ssr` for cookie sessions.
- Routes (one per old tab; legacy ids redirect):
  - `/login`, `/register`, `/reset-password`, `/mfa` (AAL2 step), `/pending` (account awaiting approval / locked).
  - `(app)/layout.tsx`: shell (sidebar, top bar, toasts, confirm host), session + profile + permission guard.
  - `(app)/events`, `/templates`, `/guests`, `/booths`, `/live`, `/reports`, `/admin/settings` (Cài đặt), `/admin/users` (Tài khoản), `/admin/templates`, `/admin/halls`, `/admin/directory`.
  - `TAB_REGISTRY` (one table): `{ key, route, legacyIds[], label, title, subtitle, icon, accent, badge?, permission, section: 'main'|'admin' }`. Sidebar, top bar, guards and legacy redirects all read it.
- `middleware.ts`: refresh session; unauthenticated → `/login`; profile `status !== 'active'` → `/pending`; AAL1 with verified factor → `/mfa`; route permission from `TAB_REGISTRY`.
- Server actions (service role where needed): `createAccount`, `setRole`, `setDepartment`, `setStatus` (approve/lock/unlock), `restoreBackup`, `createBackup`. Each checks the caller's role server-side and writes an audit row.
- Data store (`lib/store`): load once after session; typed slices; `commit(slice, mutator, note)` = apply, push undo command, persist with optimistic concurrency, toast on failure, refetch on conflict.

### 7.2 Persistence model (foundation decision)
Recommended: split the blob into per-domain tables, at minimum `events`, `event_guests`, `event_booths`, `event_seating`, `event_hall_config`, `hall_templates`, `system_templates`, `master_guests`, `event_duty_roster`, `event_incidents`, `event_media_clippings`, `event_bidding_packages`, `daily_reports`, `system_settings` (single row), each with `event_id`, `department`, `updated_at`, `updated_by`. RLS scopes by department and role. This removes B9/B10/B19 at the root.
If the foundation keeps a document model for phase 1, use one row per top-level key (and per event for event-keyed maps): `(key text, event_id text null, data jsonb, version int, updated_at, updated_by)` with `update … where version = $old` and a conflict toast "Dữ liệu đã được người khác cập nhật. Đang tải lại…".
Migration: one script reads `sce_tcsk_app_data.data` (and `programs` → `events` when `events` empty) and writes the new tables; keeps the old row read-only as a backup.

### 7.3 RLS sketch
- Helper SQL functions: `current_role()`, `current_department()`, `is_active_user()`, from `profiles` by `auth.uid()`.
- profiles: select for active users (dept_leader: own dept; leader/admin: all); update own `fullname` only; role/department/status updates only via service-role server actions.
- Domain tables: select/insert/update by role and department per §3.4 intended; delete for admin, leader, own-dept dept_leader.
- backups: insert admin/leader; select admin/leader; no update/delete except service role.
- audit_logs: insert via trigger or service role; select admin/leader; no update/delete (truly append-only).
- No anon policies.
- Trigger on `auth.users` insert → profile `(role 'user', status 'pending', department from metadata if in the allowed list)`.

### 7.4 Shared primitives (build once in core)
- `Modal` (title, description, footer slots; `role="dialog"`, focus trap, Esc/backdrop close, return focus, sizes, z-layer stack for nested modals like unitEmailEdit z-60 over manager z-50).
- `ConfirmDialog` / `PromptDialog` (`confirm({title, text, confirmLabel, cancelLabel, tone: 'danger'|'primary'|'success'})`), `Toast` (`toast.success|info|warning|error(text)`, top-end, 2 s), `LoadingOverlay`. Text-only content (B29).
- `KpiCard` (label, value, icon, dot color, caption): Cài đặt cards, module KPI rows.
- `Tabs` / sub-tabs (modules 4-6 each reimplement sub-tab buttons, e.g. 13745-13753, 20675, 21862).
- `DataTable` (sticky header, empty state text, horizontal scroll min-width, search + select filter bar, row actions).
- `FormField` (label bound to input, hint, error, suffix like "ngày trước sự kiện"), `Select` fed by registries.
- `RoleBadge`, `StatusBadge` ("Đã duyệt"/"Chờ duyệt"/"Đã khóa"), `DepartmentChip`.
- `PermissionGuard` (`<Can permission="users.manage">`) and `can(profile, permission, resource?)`; one `PERMISSIONS` table derived from §3.4.
- Registries: `ROLES`, `DEPARTMENTS` (name, code, duty, selfRegisterable), `TAB_REGISTRY`.
- Date utils (§5.3) with tests for workday math and `'YYYY-MM-DD'` local parsing.
- `useSession`, `useProfile`, `useAppData`, `useUndo` (keyboard shortcut rules from §3.6), `useTheme` (pre-paint), `usePwaInstall`.
- `logAudit(action, summary)` server util.

### 7.5 Behavior to keep
- Exact Vietnamese labels in §1 and §1.8.
- Ctrl/⌘+Z, Ctrl/⌘+Y, Ctrl/⌘+Shift+Z with the text-input exclusion.
- Collapsible sidebar with persisted state; mobile off-canvas with backdrop; per-tab accent colors.
- Header undo/redo/print/sync/install/theme group; sync button becomes a status indicator ("Đã đồng bộ" / "Đang lưu…" / "Lỗi đồng bộ" / "Ngoại tuyến") replacing the dead `updateDbStatusBadge`.
- 30-minute idle sign-out.
- PWA install instructions for iOS and desktop.
- JSON export filename `SCE_Event_Backup_<YYYY-MM-DD>.json`.

### 7.6 Open product questions
- **Q1** Department scoping: may `user` see/edit other departments' events? Read-only? Are staff assigned per event (duty roster) granted access across departments? May dept_leader delete events?
- **Q2** Should "Khóa" (locked) and "Chờ duyệt" (pending) be distinct states with distinct UI and an "Mở khóa" action?
- **Q3** Is 2FA mandatory for admin/leader? Should users be able to disable it? Is re-authentication required to change password?
- **Q4** Should a fresh installation start empty, or offer an explicit demo-data button? Are any of today's sample/starter records in production data that must be cleaned during migration?
- **Q5** Who can create accounts and approve: admin only, or also leader? How is the first admin provisioned (SQL seed, env list)?
- **Q6** Should leader be able to administer templates, halls and the master directory?
- **Q7** Final name for the `live` tab: "Tổ chức sự kiện" (sidebar) or "Hiện trường" (header)?
- **Q8** Backup policy: auto-backup frequency, retention count/days, whether manual snapshots are kept forever, and whether JSON import/restore from file is needed.
- **Q9** What schema is actually deployed in project `xqmeeticiwclsvckpqrd` (missing `database/supabase_tcsk_schema.sql`; UI mentions `sce_v2_profiles` and sharing with "/quanlydauthau")? Which RLS policies exist today? Must the rewrite keep sharing that project?
- **Q10** Should sign-up be restricted to an email domain (placeholders suggest `@sce.hanoi.gov.vn`) or invite-only?
- **Q11** Is offline editing a requirement (field check-in at venues with poor network)? If yes, which slices, and what conflict policy?
- **Q12** Should workday math include Vietnamese public holidays (Tết, 30/4, 1/5, 2/9) and compensatory days? Who maintains the holiday list?
- **Q13** Should "Ghi nhớ đăng nhập" control session persistence? Is 30 minutes the required idle timeout, with a warning?
- **Q14** Is the "4 Phòng" department list fixed, or should admins manage departments (the dead `appData.departments` array and "Quản lý 4 Phòng" button suggest management was planned)?
- **Q15** Should the runtime Supabase config modal survive in any form (e.g. for a staging switch), or is env-only config acceptable?
