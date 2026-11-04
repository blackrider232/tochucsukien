# Module 6 spec. Báo cáo & Tổng kết (`mainTab-reports`)

Source: `code/index.html`. HTML tab 2480-2858, modals 5471-5676, JS 21790-22691. All line refs are `index.html:<line>`.

Range notes. Lines 2860-3197 in the brief's tab range are core system modals (auth 2869, Supabase config 2950, profile/2FA 3004, user mgmt 3068, backups 3125, audit logs 3165). Lines 5678-6030 in the modal range are the admin template editor (`adminTemplateModal`, module 3) and master guest modals (`masterGuestModal`, `masterGuestPickerModal`, `batchImportMasterModal`, module 4). Lines 22693-22712 are the global Ctrl+Z/Ctrl+Y listener (core). None of these belong to M6 and they are not specified here.

Sidebar entry: button `tabBtn-reports` (288), label "Báo cáo & Tổng kết", title attr same, icon `fa-chart-line text-rose-300`. Active color rose-600 (8058). Navigation: `switchMainTab('tab-reports')`, legacy alias `tab-module6` (8025-8026).

Top bar (`FUNCTION_METADATA['reports']`, 7919-7928): title "Báo Cáo & Tổng Kết Sự Kiện", shortTitle "Báo cáo", icon `fa-chart-line text-rose-300`, subtitle "Xuất báo cáo tự động trình UBND Thành phố, Ban Giám đốc và tổng hợp kết quả truyền thông.", badge pill (landmark icon) "Trình UBND TP".

---

## 1. Purpose and screens

Purpose: per-event reporting hub for the center's secretariat. It covers 5 things. (a) KPI roll-up for the selected event. (b) The mandatory daily progress report ("Báo cáo hàng ngày") sent to the City People's Committee (UBND TP) when the event is ≤ 10 working days away (T-10), with A4 print preview and Word export in Decree 30/2020/NĐ-CP format. (c) Three official report templates for UBND TP and the Department of Finance (Sở Tài chính). (d) Media coverage log (press clippings) and press-release drafting. (e) Bidding packages linked to the event, with budget savings. (f) An executive BI dashboard for leadership.

In the old code every number below is either computed from data, computed from a phantom field, or hard-coded. Each item is marked **[computed]**, **[phantom]** (reads a field nothing writes) or **[hardcoded]**.

### 1.1 Header card (always visible above sub-tabs)

Title row: icon `fa-chart-line` rose, text "Tổng Hợp Báo Cáo" (2486-2487).

Toolbar (right, `flex-nowrap`, 2491-2514):
- Event select `reportEventSelector`, prefix icon `fa-calendar-check`, label "Sự kiện:" (hidden < sm). Options = `appData.events` by `name` (escaped). Empty state: single option "(Chưa có sự kiện)" with value "". Change → `onReportEventChange` (21840): set selected id, seed starter data (BUG-01), re-render.
- Primary button (rose→red gradient, icon `fa-file-contract`) "Xuất Báo Cáo Hàng Ngày" → opens A4 preview modal with default countdown (1.3.3).
- Button blue, icon `fa-newspaper`, label "Thêm Tin Bài" (hidden < sm), title "Thêm bài viết / tin truyền hình báo chí" → clipping modal.
- Button indigo, icon `fa-file-invoice-dollar`, label "Liên Kết Gói Thầu" (hidden < sm), title "Liên kết gói thầu từ phân hệ Đấu thầu" → bidding modal.

KPI grid (2 cols, 4 at lg, 2518-2573). Each card: small label, big number, sub-line.

| # | Label (exact) | Big number | Secondary | Sub-line |
|---|---|---|---|---|
| 1 | "Báo Cáo Hàng Ngày" + badge `reportDailyStatusBadge` "Đang kích hoạt" (rose, always, **[hardcoded]**) | `countdownLabel` = last element of `dailyReports[evId]`'s `countdownLabel`, fallback "T-8" (22041-22044) **[hardcoded via seed]** | "ngày làm việc" | "Báo cáo hàng ngày bắt buộc gửi UBND TP" (static) |
| 2 | "Tiến Độ Hoàn Thành" (icon bars-progress blue) | `{percent}%` = round(completed/total×100), 0 if total=0 **[computed]** | "/ {totalSteps} bước"; progress bar width = percent | "Xong: {completed} • Chậm: {overdue} • Đang làm: {total − completed}" (overdue **[phantom]**, BUG-05) |
| 3 | "Độ Phủ Truyền Thông" (bullhorn amber) | `clippings.length` **[computed]** | "tin bài & phóng sự" | "Hanoitv, Báo Hà Nội Mới, TTXVN..." (`reportMediaChannelsText`, never written, **[hardcoded]**) |
| 4 | "Gói Thầu /quanlydauthau" (coins emerald) | `bidding.length` **[computed]** | "gói thầu • {savingsRate}% TK" | "Dự toán: {totalBudget/1e6 toFixed(1)} tr • Trúng: {totalWinning/1e6 toFixed(1)} tr" (static initial HTML differs: "Dự toán: 0 đ • Trúng thầu: 0 đ") |

### 1.2 Sub-tab bar (2577-2602)

Pill buttons, horizontally scrollable. Active: `bg-rose-600 text-white font-bold`. Inactive: slate text, hover bg. Only the active panel is visible. Old code renders only the active panel's content on switch (`renderActiveReportSubTab`, 22115).

| id | Icon | Label (exact) | Badge |
|---|---|---|---|
| `subtab-daily` (default) | clock-rotate-left | "1. Báo Cáo Hàng Ngày" | `subTabBadgeDaily` = same countdownLabel as KPI 1 |
| `subtab-ubnd` | file-signature blue | "2. Báo Cáo UBND TP & Sở Tài Chính" | static "3 Mẫu" |
| `subtab-media` | newspaper amber | "3. Quản Trị Truyền Thông & TCBC" | `subTabBadgeMedia` = clippings count |
| `subtab-bidding` | link indigo | "4. Liên Thông Gói Thầu & Ngân Sách" | `subTabBadgeBidding` = packages count |
| `subtab-bi` | chart-pie emerald | "5. Bảng Điều Khiển Tổng Hợp (Executive BI)" | none |

### 1.3 Sub-tab 1. Báo cáo hàng ngày (2607-2678)

#### 1.3.1 Alert banner
Gradient rose/red/amber card. Bell icon tile. Heading "Báo Cáo Tiến Độ Hàng Ngày Đang Kích Hoạt" + pill `reportDailyCountdownBadge` "T-8 NGÀY" (never updated by JS, BUG-04). Body: "Tổ thư ký sự kiện có trách nhiệm tổng hợp tiến độ và phát hành báo cáo hàng ngày trước 16h30 để gửi Lãnh đạo Trung tâm và UBND Thành phố."
Buttons: "Xem Bản In Báo Cáo A4" (rose, icon file-lines) → A4 preview modal. "Xuất Word NĐ 30" (blue, icon file-word, label hidden < sm, title "Xuất file Word (DOC) chuẩn thể thức Nghị định 30") → Word export (1.3.4).

The banner always shows, even when the event is more than 10 working days away or already past (BUG-03).

#### 1.3.2 Summary card
Heading (icon file-lines rose) "Bản Tóm Tắt Tình Hình Triển Khai Đến Ngày Hôm Nay". Subheading "Dữ liệu được cập nhật tức thì từ 5 phân hệ trước đó". Right: `reportGeneratedTimeText` "Cập nhật lúc: 08:30" (never updated, BUG-11).

Three highlight tiles `reportDailyQuickHighlights` (1 col, 3 at md, 22146-22176):

| Tile | Heading | Big line | Sub-line |
|---|---|---|---|
| 1 | "1. Tình Hình Khách Mời & RSVP" | "{guests.length} thư mời" + green "({round(guests.length / target × 100)}% / ≥130%)" | "Đã chốt tham dự: **{confirmed}** đại biểu • Khách VIP: **{vipCount}** Lãnh đạo" |
| 2 | "2. Hội Trường & Gian Hàng OCOP" | "{booths with status confirmed}/{booths.length \|\| 16} gian hàng chốt" | "Sơ đồ chỗ ngồi Khu A (VIP), Khu B và Khu C đã xếp đạt **100%** vị trí." **[hardcoded]** |
| 3 | "3. Điểm Nghẽn Cần Chỉ Đạo Hôm Nay" | rose bold "Đôn đốc thẩm định hồ sơ vệ sinh ATTP 02 gian hàng OCOP còn lại" **[hardcoded]** | italic "Tổ Hội chợ phối hợp cùng Sở Nông nghiệp hoàn thành trước 17h00." **[hardcoded]** |

`target` = `event.expectedDelegates || 100` **[phantom]**, BUG-02. `confirmed` = guests with `rsvpStatus ∈ {confirmed, substituted}`. `vipCount` = guests with `group === 'VIP'` (any RSVP state).

#### 1.3.3 History table
Section label "Lịch Sử Các Bản Báo Cáo Hàng Ngày Đã Phát Hành". Columns: "Mốc" (center), "Ngày Phát Hành", "Tiến Độ Chung" (center), "Điểm Nghẽn / Đề Xuất Trọng Tâm", "Người Ký / Ban Hành", "Thao Tác" (right).
Row: rose mono chip `countdownLabel`; mono `date` (raw ISO); blue bold `{progressPercent}%`; bold `keyHighlight` + optional rose italic line (warning icon) `urgentNotice`; `signatory`; button "Xem A4" (eye icon) → `openGenerateDailyReportModal(countdownLabel)`.
Order: array order (seed is oldest first). Empty state (colspan 6): "Chưa có lịch sử báo cáo hàng ngày."
There is no UI that creates a history entry (BUG-12). Only the seed writes `dailyReports`.

#### 1.3.4 A4 preview modal `reportPreviewModal` (5475-5497, JS 22215-22319)

Modal header (`print:hidden`): icon file-contract rose, title "Báo Cáo Hằng Ngày Tiến Độ Sự Kiện", subtitle "Mẫu chuẩn hành chính theo Nghị định số 30/2020/NĐ-CP của Chính phủ". Buttons: "In Báo Cáo" (print icon) → `window.print()`; close X → hide. Body `reportPreviewContentArea`: grey scroll area holding one white A4 sheet (`page-a4`, max-w 800px, serif 13px, `page-break-after: always`).

Input: `countdown = customCountdown || 'T-8'`. Event fallback if not found: name "HỘI NGHỊ XÚC TIẾN ĐẦU TƯ SCE 2026".

Document structure (exact wording; `{}` = substituted):

1. Header, two columns, bottom border 2px:
   - Left (5/12, centered): "SỞ TÀI CHÍNH HÀ NỘI" (bold uppercase); "TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP HÀ NỘI" (extra-bold uppercase, rose-800); "Số: &nbsp;×5/BC-SCE-VP" (blank number).
   - Right (7/12, centered): "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" (bold uppercase); "Độc lập - Tự do - Hạnh phúc" (bold italic); "Hà Nội, ngày {d} tháng {m} năm {yyyy}" (italic, today, no zero padding).
2. Title block (centered): "BÁO CÁO TIẾN ĐỘ HẰNG NGÀY CÔNG TÁC CHUẨN BỊ TỔ CHỨC SỰ KIỆN" (black, uppercase, lg); `{event.name}` (escaped, uppercase, rose-800); "(Mốc thời gian: **Còn {countdown with 'T-' removed} ngày làm việc** trước ngày khai mạc)".
3. Recipients (italic xs): "**Kính gửi:**" / "- Đồng chí Chủ tịch và các Phó Chủ tịch UBND thành phố Hà Nội;" / "- Lãnh đạo Sở Tài chính thành phố Hà Nội;" / "- Ban Giám đốc Trung tâm Xúc tiến Đầu tư và Hỗ trợ Doanh nghiệp Hà Nội (SCE)."
4. Body, justified, four sections:
   - "I. TÌNH HÌNH TIẾN ĐỘ THỰC HIỆN CÁC NHÓM CÔNG VIỆC TRỌNG YẾU". Text: "Thực hiện Kế hoạch số 48/KH-UBND của Ủy ban nhân dân Thành phố và phân công của Ban Tổ chức, tính đến ngày hôm nay ({today vi-VN}), công tác chuẩn bị đã đạt **86%** khối lượng theo kế hoạch. Đã hoàn tất 100% việc khảo sát địa điểm, thống nhất kịch bản điều hành chi tiết và thẩm định phương án an ninh trật tự, phòng cháy chữa cháy với Công an Thành phố." (86%, plan number and all claims **[hardcoded]**.)
   - "II. CÔNG TÁC MỜI ĐẠI BIỂU (ĐỊNH MỨC $\ge 130\%$) VÀ XÁC NHẬN THAM DỰ (RSVP)" (literal LaTeX in output, BUG-17). Three lines:
     - "- **Số lượng giấy mời đã phát hành:** {guests.length} thư mời chính thức (đạt **{round(guests.length/target×100)}%** mục tiêu, vượt định mức tối thiểu 130% theo quy định)."
     - "- **Đại biểu đã xác nhận tham dự (RSVP):** {confirmed} đại biểu (trong đó có Lãnh đạo Thành ủy, Thường trực HĐND, UBND TP, Đại sứ quán Nhật Bản và Tổ chức JETRO)."
     - "- **Biển tên để bàn chữ A & Thẻ đại biểu:** Đã hoàn tất in ấn 12 biển tên chữ A (10cm x 28cm) cho hàng ghế VIP và {count guests with group ≠ VIP} thẻ đeo có mã QR check-in tự động."
   - "III. TIẾN ĐỘ THỰC HIỆN CÁC GÓI THẦU & QUYẾT TOÁN KINH PHÍ (/QUANLYDAUTHAU)". Text: "Toàn bộ 03 gói thầu dịch vụ phục vụ sự kiện đã hoàn thành lựa chọn nhà thầu theo đúng Luật Đấu thầu số 22/2023/QH15. Tổng dự toán phê duyệt là **465.000.000 VNĐ**, tổng giá trị trúng thầu là **449.500.000 VNĐ**, tỷ lệ tiết kiệm ngân sách đạt **3.33%**. Hiện các đơn vị trúng thầu đang triển khai thi công dàn dựng sân khấu và cabin dịch tại hiện trường." (All numbers **[hardcoded]**, equal to the seed packages' totals. `bidding` is read at 22223 and never used. BUG-14.)
   - "IV. KIẾN NGHỊ VÀ NHIỆM VỤ TRỌNG TÂM NGÀY TIẾP THEO ({countdown === 'T-8' ? 'T-7' : 'Ngày mai'})". Text: "1. Kính trình Lãnh đạo UBND Thành phố phê duyệt Kịch bản chi tiết điều hành phiên Tọa đàm B2B chiều ngày diễn ra sự kiện." / "2. Giao Phòng Hành chính - Tổ chức và Phòng Xúc tiến Đầu tư tổ chức buổi Tổng duyệt âm thanh, ánh sáng và kiểm tra bục phát biểu Lãnh đạo vào lúc 14h00 ngày mai tại sảnh chính khách sạn." **[hardcoded]**
5. Footer, two columns:
   - Left: "**Nơi nhận:**" / "- Như trên;" / "- Lưu: VT, Tổ Thư ký."
   - Right (centered): "GIÁM ĐỐC TRUNG TÂM SCE" (bold uppercase); "(Ký, ghi rõ họ tên và đóng dấu)" (italic); "Nguyễn Hoàng Long" (serif lg bold rose-800) **[hardcoded]**.

#### 1.3.5 Word export `exportDailyReportWord` (22326-22372). HTML-as-.doc trick, no library.

1. If the preview area is empty, call `openGenerateDailyReportModal()` (which also opens the modal). Otherwise reuse whatever the preview area currently holds (BUG-15).
2. Wrap `reportPreviewContentArea.innerHTML` in an MS Office HTML document: `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>`, `<meta charset='utf-8'>`, `<title>Báo Cáo Tiến Độ Hằng Ngày SCE</title>`, CSS: `@page { size: A4 portrait; margin: 20mm 15mm 20mm 30mm; }`, `body { font-family: 'Times New Roman', serif; font-size: 13pt; line-height: 1.6; color: #000; }`, `table { border-collapse: collapse; width: 100%; }`, `td, th { padding: 4px; }`.
3. `Blob(['﻿' + html], {type: 'application/msword;charset=utf-8;'})`. Download via a temporary `<a download>`.
4. Filename: `BaoCao_T10_{event.name with every char not [a-zA-Z0-9] → '_', first 30 chars}_{Date.now()}.doc` (BUG-16).
5. Toast success "Đã xuất file Word Báo cáo hàng ngày" (top-end, 2500 ms).

The Tailwind classes in the copied markup carry no styles in Word, so the two-column header and footer collapse into stacked blocks (BUG-16).

Module 3 uses the same trick (`exportCurrentTemplateDocx`, blob at 11503) under a "Tải Word (.docx)" label. Both should share one exporter.

### 1.4 Sub-tab 2. Báo cáo UBND TP & Sở Tài chính (2683-2749)

Heading (landmark icon blue) "3 Mẫu Báo Cáo Trọng Yếu Gửi UBND Thành Phố & Sở Tài Chính". Sub "Soạn thảo và xuất file theo chuẩn thể thức văn bản hành chính Nghị định 30/2020/NĐ-CP." Three cards (1 col, 3 at md). Static, no JS render.

| Card | Color | Pill | Title | Description | "Mở Soạn Thảo (P3)" (pen-nib) | "In Báo Cáo" |
|---|---|---|---|---|---|---|
| 1 | blue | "Trước Sự Kiện" | "Báo Cáo Kế Hoạch Chuẩn Bị & Tiến Độ Triển Khai" | "Báo cáo Lãnh đạo UBND TP về công tác mời đại biểu, thuê địa điểm, kịch bản chương trình và phương án an ninh." | `openFormNotice('form_kh_ubnd', 'Báo cáo Kế hoạch Chuẩn bị')` | `quickPrintOfficialReport('plan')` → preview with countdown "T-15 (Kế hoạch chuẩn bị)" |
| 2 | emerald | "Ngay Sau Sự Kiện (Sau 2 giờ)" | "Báo Cáo Nhanh Kết Quả Tổ Chức Sự Kiện" | "Báo cáo nhanh gửi trong ngày: Số đại biểu thực tế có mặt, Lãnh đạo tham dự, các MOU ký kết, tình hình an ninh trật tự." | `openFormNotice('form_baocao_ubnd_ketqua', 'Báo cáo Nhanh Kết quả')` | `('quick')` → "T0+2h (Báo cáo nhanh kết quả)" |
| 3 | purple | "Hậu Cần (Sau 3 ngày)" | "Báo Cáo Tổng Kết & Đánh Giá Hiệu Quả Xúc Tiến" | "Đánh giá toàn diện chỉ số KPI, hiệu quả kết nối giao thương B2B, phản hồi của DN và hồ sơ nghiệm thu thanh quyết toán kinh phí." | `openFormNotice('form_baocao_stc_quyettoan', 'Báo cáo Tổng kết & Quyết toán')` | `('summary')` (any other value) → "T0+3d (Báo cáo tổng kết & quyết toán)" |

`openFormNotice` (11655) switches to the templates tab (M3), selects that template id, scrolls to `smartEditorCanvas`, and shows a toast "Đã mở biểu mẫu: {stepName}". It does not pass the M6 event id, so M3 opens on its own selected event (BUG-20). All three "In Báo Cáo" buttons render the daily report template with a nonsense countdown line (BUG-18).

### 1.5 Sub-tab 3. Truyền thông & TCBC (2754-2781)

Heading (bullhorn amber) "Quản Trị Điểm Tin Truyền Thông & Thông Cáo Báo Chí (Press Release)". Sub "Theo dõi độ phủ truyền thông, danh sách cơ quan thông tấn báo chí và phóng sự truyền hình." Buttons: "Soạn Thông Cáo Báo Chí" (amber, file-pen) → press-release modal. "Thêm Tin Bài" (blue, plus) → clipping modal.

Clipping grid `reportMediaClippingsGrid` (1/2/3 cols at md/lg). Card (22400-22422):
- Top row: blue bold outlet with newspaper icon; right mono `date` (raw ISO).
- Title (bold).
- "Phóng viên: **{author || 'Tổ TT'}** • Thể loại: {type}".
- Footer: if `url`, link "Xem bài viết" (external icon, `target=_blank`), else italic grey "Báo in". Trash icon button → delete immediately, no confirm (BUG-27).
Order: array order. New items are `unshift`ed (newest first); seed is oldest first.
Empty state (col-span-full): "Chưa có tin bài truyền thông nào được ghi nhận."

#### Clipping modal `mediaClippingModal` (5553-5605)
Title "Thêm Tin Bài / Phóng Sự Truyền Thông". Fields:

| id | Label | Control | Default on open |
|---|---|---|---|
| clippingOutlet | "Cơ Quan Báo Chí / Kênh Truyền Hình *" | text, required, placeholder "Ví dụ: Báo Hà Nội Mới / Hanoitv / TTXVN..." | "" |
| clippingTitle | "Tiêu Đề Bài Viết / Phóng Sự *" | text, required, placeholder "Nhập tiêu đề tin bài" | "" |
| clippingDate | "Ngày Đăng / Phát Sóng" | date | today, from `toISOString` (UTC, BUG-31) |
| clippingType | "Loại Hình" | select: `Báo điện tử` "Báo điện tử"; `Truyền hình` "Truyền hình (Video)"; `Báo in` "Báo in (Trang nhất)"; `Cổng TTĐT` "Cổng TTĐT TP" | `Báo điện tử` |
| clippingUrl | "Đường Dẫn Bài Viết (URL Link)" | `type=url`, placeholder "https://hanoimoi.com.vn/..." | "" |

Buttons "Hủy", "Lưu Tin Bài". Save (22440): trims. If outlet or title is empty → Swal warning "Thiếu thông tin" / "Vui lòng nhập tên cơ quan báo chí và tiêu đề bài viết.". New record `{id: 'media_'+Date.now(), outlet, title, date: date || today, type, url, author: 'Phóng viên thường trú'}` is unshifted, then persist, close, re-render, toast "Đã lưu bài viết truyền thông" (2000 ms). There is no edit (BUG-28).

#### Press-release modal `pressReleaseModal` (5500-5550, JS 22491-22516)
Header: bullhorn tile, title "Thông Cáo Báo Chí Sự Kiện", sub "Phát hành tới các cơ quan thông tấn báo chí truyền thông".

| id | Label | Control | Prefill on open |
|---|---|---|---|
| prTitle | "Tiêu Đề Thông Cáo Báo Chí *" | text required, bold | `THÔNG CÁO BÁO CHÍ: {event.name.toUpperCase()}` (fallback name "HỘI NGHỊ XÚC TIẾN ĐẦU TƯ SCE") |
| prTiming | "Thời Điểm Phát Hành" | select: `before` "Trước sự kiện (Thông báo lịch trình & mục đích)"; `after` "Sau sự kiện (Thông báo kết quả & thỏa thuận)" | `before` |
| prContact | "Người Đầu Mối Báo Chí (Media Contact)" | text; HTML default "Đ/c Nguyễn Văn Cường - 0913.xxx.xxx - cuongnv@sce.hanoi.gov.vn" | not reset on open |
| prContent | "Nội Dung Chi Tiết Thông Cáo *" | textarea rows 6, serif, required | template below |

Content template (22498): "Nhằm đẩy mạnh thu hút nguồn vốn đầu tư trực tiếp nước ngoài (FDI) chất lượng cao và kết nối giao thương giữa các doanh nghiệp Thủ đô với các tập đoàn công nghệ hàng đầu, Trung tâm Xúc tiến Đầu tư và Hỗ trợ Doanh nghiệp Hà Nội (SCE) tổ chức {event.name}.\n\nThời gian: Dự kiến ngày diễn ra tại Hà Nội.\nQuy mô: Hơn 200 đại biểu chính thức gồm Lãnh đạo UBND Thành phố, các Sở ban ngành, các tổ chức quốc tế và hiệp hội doanh nghiệp.\nTrân trọng kính mời các cơ quan thông tấn báo chí tham dự và đưa tin."

Buttons "Hủy", "Lưu & Phát Hành TCBC". Submit only closes the modal and shows the success dialog "Đã Phát Hành Thông Cáo Báo Chí!" / "Nội dung thông cáo báo chí đã được lưu và sẵn sàng gửi tới danh sách các phóng viên chuyên trách." / button "Đã hiểu". Nothing is saved or sent (BUG-23).

### 1.6 Sub-tab 4. Liên thông gói thầu & ngân sách (2786-2824)

Heading (link icon indigo) "Liên Thông Dữ Liệu Gói Thầu Tổ Chức Sự Kiện (/quanlydauthau)". Sub "Giám sát dự toán, giá trúng thầu, nhà thầu thực hiện và tỷ lệ tiết kiệm ngân sách nhà nước." Button "Liên Kết Gói Thầu Mới" (plus-circle) → bidding modal.

Table columns: "Mã Gói Thầu", "Tên Gói Thầu Phục Vụ Sự Kiện", "Phòng Phụ Trách", "Dự Toán (VNĐ)" (right), "Giá Trúng Thầu (VNĐ)" (right), "Tiết Kiệm" (center), "Nhà Thầu Thực Hiện", "Tiến Độ HĐ" (center), "Thao Tác" (right).
Row: mono indigo `code`; bold `name`; `dept`; `budget.toLocaleString('vi-VN') + ' đ'`; emerald `winningPrice` formatted the same way; emerald chip `{rate}%` where rate = budget>0 ? (max(0, budget−win)/budget×100).toFixed(1) : 0; `contractor || 'Chưa chọn'`; indigo chip `status`; trash → delete, no confirm.
Empty state (colspan 9): "Chưa có gói thầu nào được liên kết từ hệ thống Đấu thầu." No total row.

#### Bidding modal `biddingPackageModal` (5608-5676)
Title "Liên Kết Gói Thầu Phục Vụ Sự Kiện". Sub "Đồng bộ từ hệ thống Quản lý Đấu thầu SCE". This is false: it is manual entry (section 4.2).

| id | Label | Control | Default on open |
|---|---|---|---|
| biddingCode | "Mã Gói Thầu *" | text required, mono uppercase, placeholder "Ví dụ: TB-2026-001" | `TB-{yyyy}-00{count+1}` (BUG-33) |
| biddingDept | "Phòng Ban Phụ Trách" | select: Phòng Hành chính - Tổ chức / Phòng Phát triển doanh nghiệp / Phòng Xúc tiến đầu tư / Phòng Tư vấn doanh nghiệp | Phòng Hành chính - Tổ chức |
| biddingName | "Tên Gói Thầu *" | text required, placeholder "Ví dụ: Thuê địa điểm tổ chức hội nghị và tiệc chiêu đãi..." | "" |
| biddingBudget | "Dự Toán Phê Duyệt (VNĐ) *" | text required, placeholder "220.000.000" | "100.000.000" |
| biddingWinningPrice | "Giá Trúng Thầu (VNĐ) *" | text required, placeholder "215.000.000" | "96.000.000" |
| biddingContractor | "Nhà Thầu Trúng Thầu / Thực Hiện" | text, placeholder "Tên đơn vị trúng thầu" | "" |
| biddingStatus | "Tiến Độ Hợp Đồng" | select: "Đang thực hiện hợp đồng" / "Đã nghiệm thu thanh lý" / "Đang thẩm định hồ sơ" | "Đang thực hiện hợp đồng" |

Buttons "Hủy", "Lưu Gói Thầu". Save (22579): code is trimmed and uppercased. Money values are parsed by stripping every non-digit, then `Number(...) || 0`. If code or name is empty → warning "Thiếu thông tin" / "Vui lòng nhập mã và tên gói thầu.". Record `{id: 'bid_'+Date.now(), code, dept, name, budget, winningPrice, contractor: contractor || 'Đang thương thảo', status}` is pushed (appended), then persist, close, re-render, toast "Đã liên kết gói thầu {code}" (2000 ms). There is no edit.

### 1.7 Sub-tab 5. Executive BI (2829-2856, JS 22636-22691)

Heading (chart-pie emerald) "Bảng Chỉ Số Đánh Giá Hiệu Quả Sự Kiện (Executive BI Dashboard)". Sub "Tổng hợp 5 chỉ số cốt lõi phục vụ Lãnh đạo Trung tâm SCE và UBND Thành phố Hà Nội chỉ đạo điều hành."

No chart library is loaded (no Chart.js, ApexCharts or ECharts in the file). "Charts" are Tailwind div bars.

KPI tiles `reportBiRadarCards` (1/2/5 cols at md/lg). Each tile is centered: icon, uppercase label, big value, italic desc.

| Label | Value | Desc | Color/icon | Source |
|---|---|---|---|---|
| "Tiến độ Tổng thể" | "86%" | "Hoàn thành theo kế hoạch" | blue / bars-progress | **[hardcoded]** |
| "Định mức Mời (130%)" | `{guestPercent}%` | `{guests.length}/{quota130} thư mời` | emerald / users | quota130 = ceil(target×1.3); guestPercent = min(100, round(guests/quota130×100)) **[phantom target]** |
| "Tiết kiệm Ngân sách" | "3.3%" | "Qua đấu thầu công khai" | indigo / coins | **[hardcoded]** |
| "Độ phủ Truyền thông" | `{clippings.length} bài` | "Báo chí & Truyền hình" | amber / bullhorn | computed |
| "Gian hàng OCOP" | `{booths confirmed} gian` | "Chính sách hỗ trợ 50-100%" | purple / store | computed (desc static) |

Group progress panel: heading "Phân Bổ Tiến Độ Theo 4 Nhóm Công Việc Trọng Yếu". One row per `event.groups[]` (all groups; templates create 7, BUG-38): `name` left, `{done}/{total} ({p}%)` mono blue right, bar `h-2` blue width p%. done = steps with `completed`; p = total>0 ? round(done/total×100) : 0. No empty state. If the event has no `groups`, the previous event's bars stay on screen (BUG-39).

---

## 2. Domain types

Persistence for every M6-owned type: inside the single `appData` blob. Cloud: Supabase table `sce_tcsk_app_data`, row `id = 1`, column `data` (plus `updated_at`, `updated_by`, `updated_by_email`), upserted by core `saveAppDataToSupabase` (6782). Local mirror: `localStorage['sce_tcsk_app_data']` = full blob, `localStorage['sce_tcsk_local_events']` = `appData.events` (21873-21874). Keys are per event id inside three top-level maps. The rewrite must keep these keys and value shapes for data compatibility.

```ts
type EventId = string;            // 'evt_<ms>'

// ---- Owned by M6 (stored in appData) ----
interface Module6Slice {
  eventMediaClippings: Record<EventId, MediaClipping[]>;
  eventBiddingPackages: Record<EventId, BiddingPackage[]>;
  dailyReports: Record<EventId, DailyReportEntry[]>;
}

interface MediaClipping {
  id: string;                     // 'media_<ms>' or seed 'media_01'..'media_04'
  outlet: string;                 // required
  title: string;                  // required
  date: string;                   // 'YYYY-MM-DD'
  type: MediaType | string;       // free string in legacy data (seed has 'Báo in & Điện tử')
  url: string;                    // '' when none; must be http(s) (BUG-25)
  author?: string;                // never user-entered; save writes 'Phóng viên thường trú'
}
type MediaType = 'Báo điện tử' | 'Truyền hình' | 'Báo in' | 'Cổng TTĐT';

interface BiddingPackage {
  id: string;                     // 'bid_<ms>' or seed 'bid_01'..'bid_03'
  code: string;                   // uppercase, e.g. 'TB-2026-001'
  name: string;
  dept: Department;
  budget: number;                 // VND integer (dự toán)
  winningPrice: number;           // VND integer (giá trúng thầu)
  contractor: string;             // 'Đang thương thảo' when blank on save
  status: BiddingStatus | string; // seed has 'Đang nghiệm thu thanh lý' (not an option)
}
type BiddingStatus = 'Đang thực hiện hợp đồng' | 'Đã nghiệm thu thanh lý' | 'Đang thẩm định hồ sơ';
type Department =
  | 'Phòng Hành chính - Tổ chức' | 'Phòng Phát triển doanh nghiệp'
  | 'Phòng Xúc tiến đầu tư' | 'Phòng Tư vấn doanh nghiệp';

interface DailyReportEntry {      // only the seed writes these
  id: string;                     // 'rpt_t10' etc.
  countdownLabel: string;         // 'T-10'
  date: string;                   // 'YYYY-MM-DD'
  progressPercent: number;        // 0-100
  keyHighlight: string;
  signatory: string;
  urgentNotice?: string;
}

// ---- Not persisted ----
interface PressReleaseDraft {     // form only; discarded on submit (BUG-23)
  title: string; timing: 'before' | 'after'; contact: string; content: string;
}
interface Module6UiState {        // in memory, lost on reload
  selectedEventId: EventId | null;
  activeSubTab: 'subtab-daily' | 'subtab-ubnd' | 'subtab-media' | 'subtab-bidding' | 'subtab-bi';
  dailyReportTargetDate: null;    // declared, never read (dead)
}

// ---- Read from other modules (exact fields M6 touches) ----
interface EventRead {             // appData.events[] (M2)
  id: EventId; name: string;
  groups?: { name: string; steps?: { completed?: boolean; isOverdue?: boolean /* never written */ }[] }[];
  expectedDelegates?: number;     // read at 22141/22226/22649, never written anywhere
  // Fields M6 SHOULD read but does not: eventDate 'YYYY-MM-DD', targetGuests number (default 150),
  // steps[].calculatedDeadline 'YYYY-MM-DD', location, department, budget (string '350.000.000').
}
interface GuestRead {             // appData.eventGuests[evId][] (M4a)
  rsvpStatus: 'pending' | 'confirmed' | 'declined' | 'substituted';
  group: 'VIP' | 'SoNganh' | 'DoanhNghiep' | 'QuocTe' | 'BaoChi';
  // inviteStatus ('sent' | 'received' | …) exists but M6 ignores it
}
interface BoothRead {             // appData.eventBooths[evId][] (M4b)
  status: 'available' | 'reviewing' | 'confirmed';
}
```

Rewrite recommendation (no product change): keep the legacy Vietnamese label strings as stored values for compat. Parse them at the boundary into a typed enum with a label map. Unknown legacy values display as-is.

---

## 3. Business rules and state machines

### 3.1 Event selection

| Trigger | Rule (old) | Line |
|---|---|---|
| App start `initModule6` | ensure 3 maps exist; selected = `module4State.selectedEventId` if set, else `events[0].id`; seed starter data for it | 21802-21822 |
| Tab open `renderModule6` | if no events → return (screen keeps the static HTML defaults, BUG-09); if no selection → `events[0]`; KPI uses `find(selected) \|\| events[0]`, but sub-tabs use the raw `selectedEventId` | 22016-22032 |
| Select change | set id, seed, render | 21840 |
| Deep link from M2 popup | `switchMainTab('tab-reports')`, after 150 ms set select value, `onReportEventChange()`, `openGenerateDailyReportModal()` (no countdown → "T-8") | 9378 |

Intended: one `selectedEventId`, validated against existing events (fallback to the first event). KPI and every sub-tab use the same resolved event. Whether M6 shares the event selection with other modules is an open question (7.3).

### 3.2 T-10 daily report mode

Rule as stated in the UI (2620, 3218): an event is in daily-report mode when it is 0..10 working days before T0. Reports are due before 16h30 each day to center leadership and UBND TP.

| Concern | Old M6 behavior | Correct source (exists elsewhere) |
|---|---|---|
| Countdown N | last history entry label, else "T-8" | `getWorkdaysDiff(event.eventDate)` (8345): working days Mon-Fri between today 00:00 and T0, signed; 0 = today; holidays ignored |
| Mode active | always "Đang kích hoạt" | active iff `0 ≤ N ≤ 10` (M2 uses this at 9198 and 9294) |
| Label | `T-{N}`; T0 day = "Hôm nay diễn ra" (M2 popup 9318) | |
| Preview countdown | arg or "T-8" | computed `T-{N}` |
| "Next day" label in section IV | `'T-8' → 'T-7'`, else "Ngày mai" | `T-{N-1}`; at N = 0, "Ngày mai" |

Proposed states (the old code has none; confirm in 7.3):

| State | Condition | Banner | KPI badge |
|---|---|---|---|
| not_yet | N > 10 | "Chưa đến mốc báo cáo hàng ngày (còn N ngày làm việc)" | grey |
| active | 0 < N ≤ 10 | current banner, "T-N NGÀY" | rose "Đang kích hoạt" |
| event_day | N = 0 | "Hôm nay diễn ra" | emerald |
| past | N < 0 | post-event reports (quick T0+2h, summary T0+3d) | slate |

### 3.3 Aggregates (exact formulas as in old code)

| Metric | Formula | Fields read | Where | Correct version |
|---|---|---|---|---|
| totalSteps | Σ groups[].steps.length | events[].groups[].steps | 22057-22070 | same |
| completedSteps | count `steps[].completed` truthy | steps[].completed | same | same |
| overdueSteps | count `!completed && isOverdue` | steps[].isOverdue (never written) | 22066 | `!completed && calculatedDeadline && getDaysDiff(calculatedDeadline) < 0` (M2 rule, 9209) |
| "Đang làm" | total − completed | | 22082 | total − completed − overdue, or rename "Chưa xong" |
| completion % | total>0 ? round(completed/total×100) : 0 | | 22072 | same |
| totalBudget | Σ Number(budget) \|\| 0 | packages[].budget | 22092-22097 | same |
| totalWinning | Σ Number(winningPrice) \|\| 0 | packages[].winningPrice | same | same |
| savings | max(0, totalBudget − totalWinning) | | 22099 | signed; show overrun in red when negative (BUG-35) |
| savingsRate (KPI) | budget>0 ? (savings/budget×100).toFixed(2) : 0 | | 22100 | one formatter, 2 decimals, everywhere |
| savingsRate (row) | budget>0 ? (max(0,b−w)/b×100).toFixed(1) : 0 | | 22537 | same formatter |
| savingsRate (BI) | "3.3%" literal | none | 22657 | KPI savingsRate |
| "tr" display | (x/1e6).toFixed(1) + " tr" | | 22111 | |
| target | `expectedDelegates \|\| 100` | phantom | 22141, 22226, 22649 | `event.targetGuests` (default 150, written by the M2 wizard at 10419/10449) |
| invited % (daily, Word) | round(guests.length/target×100) | eventGuests[evId].length | 22150, 22278 | define "thư mời" (7.3); compare to the 130% quota |
| quota130 | ceil(target×1.3) | | 22142 (unused), 22650 | M3 uses round(targetGuests×1.3) at 11385. Pick one rounding (ceil) and share it |
| invite quota % (BI) | min(100, round(guests/quota130×100)) | | 22651 | same basis as the daily tile |
| confirmed | rsvpStatus ∈ {confirmed, substituted} | guests[].rsvpStatus | 22143, 22227 | same |
| vipCount | group === 'VIP' | guests[].group | 22144 | same (or VIP and not declined, 7.3) |
| badges (Word) | count group ≠ 'VIP' | | 22280 | exclude declined |
| booths confirmed | status === 'confirmed' | eventBooths[evId][].status | 22160, 22659 | same |
| booths denominator | `booths.length \|\| 16` | | 22160 | booths.length; 0 → "Chưa có gian hàng" |
| BI overall % | "86%" literal | | 22655 | completion % |
| group bar | done/total per group | groups[].steps[].completed | 22673-22689 | same |

### 3.4 Budget link-up rules

| Rule | Old | Intended |
|---|---|---|
| Money parsing | strip all non-digits | parse VN format: `.` thousands, `,` decimal (reject decimals for VND), non-negative integer |
| Required | code, name (budget and win have `required` but "0" passes) | budget > 0; win ≥ 0; warn when win > budget |
| Code default | `TB-{yyyy}-00{n+1}` | `TB-{yyyy}-{pad3(n+1)}`, unique per event |
| Code uniqueness | none | unique within the event (case-insensitive) |
| Contractor blank | stored 'Đang thương thảo'; display fallback 'Chưa chọn' | store '' and display "Chưa chọn" |
| Delete | immediate | confirm dialog |
| Edit | none | edit in the same modal |

### 3.5 Starter data (seed) rules

`ensureStarterDataForModule6(eventId)` (21886-22011). It runs on init and on every event change. For each of the 3 maps: if the event's list is missing **or empty**, it writes the fixed fake list, then persists to localStorage only (`notifyCloud=false`).

Seed contents (exact):

Clippings:

| id | outlet | title | date | type | url | author |
|---|---|---|---|---|---|---|
| media_01 | Báo Hà Nội Mới | Hà Nội đẩy mạnh thu hút làn sóng đầu tư công nghệ cao từ các tập đoàn Nhật Bản | 2026-10-24 | Báo in & Điện tử | https://hanoimoi.com.vn/ha-noi-day-manh-thu-hut-dau-tu-nhat-ban-2026 | Phóng viên Thu Hằng |
| media_02 | Đài Phát thanh và Truyền hình Hà Nội (Hanoitv) | Phóng sự: Công tác chuẩn bị Hội nghị Xúc tiến Đầu tư và Giao thương Hà Nội - Tokyo 2026 | 2026-10-25 | Truyền hình | https://hanoitv.vn/ban-tin-thoi-su-chuan-bi-hoi-nghi-xuc-tien-tokyo | Ban Thời sự Hanoitv |
| media_03 | VietnamPlus - Thông tấn xã Việt Nam (TTXVN) | Kỳ vọng đột phá thương mại và chuyển giao công nghệ bán dẫn tại Diễn đàn Hà Nội - Tokyo | 2026-10-26 | Báo điện tử | https://vietnamplus.vn/dien-dan-xuc-tien-ha-noi-tokyo-2026 | TTXVN |
| media_04 | Báo Kinh tế & Đô thị | Hỗ trợ tối đa cho các doanh nghiệp Thủ đô kết nối chuỗi cung ứng toàn cầu | 2026-10-27 | Báo điện tử | https://ktdt.com.vn/ho-tro-doanh-nghiep-thu-do-ket-noi-chuoi-cung-ung | Minh Quang |

Bidding packages:

| id | code | name | dept | budget | winningPrice | contractor | status |
|---|---|---|---|---|---|---|---|
| bid_01 | TB-2026-001 | Thuê địa điểm tổ chức hội nghị, phòng khánh tiết VIP và tiệc chiêu đãi | Phòng Hành chính - Tổ chức | 220000000 | 215000000 | Khách sạn Lotte Hotel Hanoi | Đang thực hiện hợp đồng |
| bid_02 | TB-2026-002 | Dịch vụ dàn dựng sân khấu, backdrop LED P2.5, âm thanh ánh sáng và cabin dịch song ngữ | Phòng Xúc tiến đầu tư | 160000000 | 152500000 | Công ty Cổ phần Truyền thông & Sự kiện Thủ Đô | Đang thực hiện hợp đồng |
| bid_03 | TB-2026-003 | Thiết kế, in ấn cẩm nang xúc tiến đa ngữ, biển tên chữ A, thẻ đại biểu và quà tặng đối ngoại | Phòng Phát triển doanh nghiệp | 85000000 | 82000000 | Công ty TNHH In & Quà tặng Mỹ thuật Hà Nội | Đang nghiệm thu thanh lý |

Daily reports (signatory for all three: "Nguyễn Hoàng Long (Giám đốc SCE)"):

| id | label | date | % | keyHighlight | urgentNotice |
|---|---|---|---|---|---|
| rpt_t10 | T-10 | 2026-10-21 | 70 | Kích hoạt Chế độ Báo cáo Khẩn cấp T<=10. Đã phát hành 100% giấy mời đại biểu. | Chờ phản hồi chính thức từ Đại sứ quán Nhật Bản. |
| rpt_t9 | T-9 | 2026-10-22 | 78 | Đại sứ quán Nhật Bản xác nhận tham dự. Tỷ lệ đại biểu RSVP đạt 82%. | Hoàn thiện duyệt thiết kế backdrop sân khấu và biển tên chữ A. |
| rpt_t8 | T-8 | 2026-10-23 | 86 | Ký kết hợp đồng địa điểm và âm thanh. Đạt định mức mời 135% (vượt mốc 130%). | Đôn đốc thẩm định sản phẩm OCOP cho các gian hàng Dãy B. |

Intended: seed only for the built-in demo events created by `initDefaultSampleEvents` (9113), once, at event creation. Never seed on view, and never re-seed a list the user emptied (BUG-01). Product decision in 7.3.

### 3.6 Persistence rule (`syncModule6Storage`, 21871)

| Step | Condition |
|---|---|
| write `sce_tcsk_app_data` and `sce_tcsk_local_events` to localStorage | always (errors only `console.warn`) |
| `saveAppDataToSupabase('Cập nhật dữ liệu Phân hệ 6 (Báo cáo T-10, Truyền thông & Đấu thầu)')` | `notifyCloud && currentUser`. That function also records the undo snapshot (6784), so a logged-out edit is neither undoable nor synced (BUG-41) |

Cloud write is fire-and-forget (the promise is not awaited), and the UI shows success before the write completes.

---

## 4. External side effects

| Kind | Detail | Line |
|---|---|---|
| Supabase | No direct calls. All writes go through core `saveAppDataToSupabase` → `upsert` into `sce_tcsk_app_data` {id:1, data, updated_at, updated_by, updated_by_email}, then `createBackgroundBackup(note)` (backup table `sce_tcsk_backups`) | 21875, 6782-6818 |
| /QUANLYDAUTHAU | **No integration exists.** No URL, fetch, RPC, table read or postMessage. The only link is that both apps share one Supabase project, with separate `sce_tcsk_*` tables (2962-2963). "Đồng bộ từ hệ thống Quản lý Đấu thầu SCE" (5617) and "Liên thông" are labels only. Packages are typed by hand | 5617, 2792 |
| Word export | HTML wrapped as MS Word HTML, `.doc`, MIME `application/msword;charset=utf-8;`, UTF-8 BOM, no library | 22326-22372 |
| Printing | `window.print()` on the whole app page. There is no `@media print` CSS in the file; only the Tailwind `print:hidden` variant on the modal header (5477) | 5486 |
| localStorage | `sce_tcsk_app_data` (full blob), `sce_tcsk_local_events` (events array) | 21873-21874 |
| Charts | none; Tailwind div bars | 22671-22690 |
| Dialogs | SweetAlert2 (`Swal.fire`) toasts top-end 2000/2500 ms; modal dialogs for validation and the press release | 22364, 22454, 22473, 22510, 22595, 22615 |
| Timers | none in M6. Caller's `setTimeout(…,150)` in the M2 deep link (9378) | |
| Navigation out | `openFormNotice(templateId, label)` → M3 templates tab | 2705, 2722, 2739, 11655 |
| External links | clipping `url` opened with `target=_blank`, no `rel` | 22419 |

---

## 5. Dependencies

In (what M6 calls or reads):

| Symbol | Owner | Use |
|---|---|---|
| `appData.events[]` .id .name .groups[].name .groups[].steps[].completed (.isOverdue, .expectedDelegates phantom) | M2 | selector, KPI 2, BI bars, report title |
| `appData.eventGuests[evId][]` .rsvpStatus .group | M4a | invite/RSVP figures |
| `appData.eventBooths[evId][]` .status | M4b | booth figures |
| `module4State.selectedEventId` | M4 | initial selection |
| `escapeHtml` (8202) | core | escapes & < > " only (not `'`) |
| `saveAppDataToSupabase`, `currentUser`, `recordUndoSnapshot` | core | persistence, undo |
| `openFormNotice` (11655), template ids `form_kh_ubnd`, `form_baocao_ubnd_ketqua`, `form_baocao_stc_quyettoan` | M3 | "Mở Soạn Thảo (P3)" |
| `Swal` (sweetalert2@11 CDN, 46) | lib | dialogs |
| Should use but doesn't: `getWorkdaysDiff` (8345), `getDaysDiff` (8335), `formatVNDate` (8368), `isWeekend` (8261); M3 templates `form_baocao_tiendo_hangngay`, `form_thongcao_baochi`, `form_baocao_truyenthong` (STANDARD_TEMPLATES 11112) | core / M3 | countdown, overdue, date display; daily report and press release duplicate M3 templates |

Out (who calls M6):

| Caller | Call | Line |
|---|---|---|
| boot `DOMContentLoaded` | `initModule6()` (runs before the async cloud load finishes) | 8233 |
| `switchMainTab` | `renderModule6()` when target = reports | 8076 |
| undo / redo | `renderModule6()` | 6134, 6174 |
| M2 daily-report popup | select value, `onReportEventChange()`, `openGenerateDailyReportModal()` | 9378 |
| inline HTML handlers | every onclick in 2480-2858 and 5471-5676 | |

Not called after: the cloud load (6756, which replaces data and renders only M2) or snapshot restore (7529). M6 shows stale data until the tab is re-opened.

---

## 6. Bugs and logic flaws

Severity: **H** = wrong data, data loss or security; **M** = misleading output or broken feature; **L** = polish.

### Data and aggregate correctness
- **BUG-01 (H)** Seeding on view writes fake press clippings, fake bidding packages (465M VND) and fake signed daily reports into **any** real event whose list is empty. It runs on init and every event switch (21886-22006, 21820, 21844). The data is then uploaded with the next cloud save from any module. Deleting the last item re-seeds it on the next switch, so a list can never be empty. Intended: no seeding of real events (3.5).
- **BUG-02 (H)** Guest target reads `event.expectedDelegates`, which nothing writes, so it is always 100 (22141, 22226, 22649; also 14428 in M4b and 20833 in M5). The real field is `targetGuests` (default 150, 10449/9102). All invite %, quota and badge numbers are wrong.
- **BUG-03 (H)** T-10 countdown is never computed from `eventDate`. It shows the last seed label (always "T-8") or the literal 'T-8' (22041-22044, 22225). The status badge is always "Đang kích hoạt" (22050), and the banner is always shown. `getWorkdaysDiff` exists (8345) and M2 uses it (9196). Intended: 3.2.
- **BUG-04 (M)** Banner pill `reportDailyCountdownBadge` "T-8 NGÀY" is never updated by JS (2617; no writer).
- **BUG-05 (H)** "Chậm" counts `s.isOverdue`, a field never stored (22066; `isOverdue` is only a local variable at 10083), so it is always 0. Use the deadline rule (9209).
- **BUG-06 (M)** "Đang làm" = total − completed (22082) double-counts overdue steps and counts not-started steps as in progress.
- **BUG-07 (H)** The Word/print report hard-codes progress "86%" (22271), plan "Kế hoạch số 48/KH-UBND", "03 gói thầu", totals 465.000.000 / 449.500.000 and "3.33%" (22287), "12 biển tên chữ A" (22280), JETRO/Embassy attendance and the section IV tasks (22294-22295). This is an official document sent to UBND TP with invented figures. Intended: computed from data; free-text parts entered by the user (7.3).
- **BUG-08 (H)** The report claims "vượt định mức tối thiểu 130% theo quy định" whatever the actual percentage (22278). The percentage is guests/target, not compared to 130%. Intended: state achieved vs. required, and word the sentence by outcome.
- **BUG-09 (M)** With zero events `renderModule6` returns early (22019). The KPI cards keep static fake defaults ("T-8", "Hanoitv…", "Cập nhật lúc: 08:30"), sub-tabs never render, and the buttons still open modals. Saving a clipping or package with `selectedEventId` null silently returns (22443, 22582) after the user filled the form. Intended: full-page empty state "Chưa có sự kiện" with buttons disabled.
- **BUG-10 (M)** Stale selection: if `selectedEventId` points to a deleted event, KPI cards use `events[0]` (22025) while sub-tabs, the preview and saves use the dead id (22135, 22219, 22442). The selector value mismatches.
- **BUG-11 (L)** `reportGeneratedTimeText` "Cập nhật lúc: 08:30" and `reportMediaChannelsText` are static and never written (2647, 2558).
- **BUG-12 (M)** Daily report history is read-only seed data. No action issues or saves a report, despite "Lịch Sử Các Bản Báo Cáo Hàng Ngày Đã Phát Hành" (2657). Intended: "Phát hành báo cáo" saves a `DailyReportEntry` snapshot (7.3).
- **BUG-13 (M)** "Xem A4" on a history row passes only the label (22206) and renders **today's** live data, today's date and the hard-coded signatory. It ignores the row's date, %, highlights and signatory. Intended: render the stored snapshot.
- **BUG-14 (M)** `bidding` is loaded in the preview and never used (22223). `quota130` is computed and unused (22142).
- **BUG-15 (M)** The Word export copies whatever the preview area last held (22332-22336). After "In Báo Cáo" on an official report, or "Xem A4" on a history row, "Xuất Word NĐ 30" exports that document, not today's daily report. When the area is empty it also pops the modal open as a side effect. Intended: build the document from data, independent of the DOM.
- **BUG-16 (M)** Word output: Tailwind classes carry no CSS in Word, so the NĐ30 two-column header and signature block collapse into stacked blocks and the colors and sizes are lost (22337-22352). The filename regex strips every Vietnamese letter (22359), e.g. "Hội nghị" → "H_i_ngh_". It says ".doc", and Word warns about the format mismatch. Intended: real .docx built with a library (e.g. `docx`), table-based header, NĐ30 margins, ASCII-folded filename (bỏ dấu).
- **BUG-17 (M)** Literal LaTeX `$\ge 130\%$` is printed in the section II heading (22276).
- **BUG-18 (M)** All three official report "In Báo Cáo" buttons render the daily progress report (22374-22382). The countdown becomes "Còn 15 (Kế hoạch chuẩn bị) ngày làm việc" or "Còn T0+2h (Báo cáo nhanh kết quả) ngày làm việc" (the `replace("T-","")` at 22254). Intended: each prints its own template (M3 `form_kh_ubnd` / `form_baocao_ubnd_ketqua` / `form_baocao_stc_quyettoan`) filled with event data.
- **BUG-19 (L)** NĐ30 form details: the document number is blank "Số: /BC-SCE-VP" (22236); the date is not zero-padded per NĐ30 for day < 10 / month < 3 (22241); tiêu ngữ is rendered italic (22240), but NĐ30 requires upright bold with an underline. The signer is fixed to "GIÁM ĐỐC TRUNG TÂM SCE / Nguyễn Hoàng Long" (22308-22311), while commit 6463fbf moved the Excel signer to the department head. Intended: signer configurable (7.3).
- **BUG-20 (M)** "Mở Soạn Thảo (P3)" calls `openFormNotice` without the event id (2705, 2722, 2739; the signature at 11655 accepts `eventId`). M3 opens on a different event than the one selected in M6.
- **BUG-21 (M)** The M2 deep link (9378) opens the preview without a countdown, so it says "T-8" even though the popup just computed the real N for that event. It also relies on a 150 ms timeout and DOM mutation. Intended: route `/reports?event=<id>&preview=daily`.
- **BUG-22 (L)** Booth denominator `booths.length || 16` shows "0/16" for an event without booths (22160). The seating "100%" (22163) and the whole "Điểm Nghẽn" tile (22170-22173) are hard-coded.

### Press and media
- **BUG-23 (H)** The press release is never saved, sent or exported. `savePressRelease` only closes the modal and tells the user it was saved and is ready to send (22507-22516). `prTiming` and `prContact` are never read. Intended: persist per event and export (.docx), or reuse M3 `form_thongcao_baochi` (7.3).
- **BUG-24 (L)** Press-release prefill is fake. The contact default is a made-up person and phone (5532). "Thời gian: Dự kiến ngày diễn ra tại Hà Nội." ignores `eventDate`/`location`, and "Hơn 200 đại biểu" ignores `targetGuests` (22498). The contact field is not reset between events.
- **BUG-25 (H)** Stored XSS through clipping URL: `href="${c.url}"` is unescaped (22419). `type=url` accepts `javascript:alert(document.cookie)`, and a `"` breaks out of the attribute in imported or cloud data. Intended: allow only `http:`/`https:`, render through React, and add `rel="noopener noreferrer"`.
- **BUG-26 (M)** Unescaped interpolation in innerHTML: `c.type` (22414), `c.date` (22406), `b.code` (22541, free text; uppercasing does not stop HTML injection), `r.countdownLabel`/`r.date`/`r.progressPercent` (22194-22198), option `value="${e.id}"` (21833). Ids and labels are interpolated into inline `onclick='…'` JS strings (22206, 22420, 22556), and `escapeHtml` does not escape `'` (8204). The data comes from the shared cloud blob, so one user can inject into another user's session. Intended: React text rendering only; no inline handlers.
- **BUG-27 (M)** Delete of a clipping (22483) and of a bidding package (22625) is immediate, with no confirmation and no toast. Undo works only when logged in (BUG-41).
- **BUG-28 (M)** Clippings and packages cannot be edited (no edit handler; the modal comment at 5552 says "Thêm / Sửa"). Author is never asked and is forced to "Phóng viên thường trú" (22465). The card shows "Báo in" for any clipping without a URL, even type "Truyền hình" (22419).
- **BUG-29 (L)** Clipping and bidding lists are rendered in array order, with mixed insertion (unshift for clippings 22468, push for packages 22610). There is no sort by date/code.
- **BUG-30 (L)** Seed values outside the option sets: clipping type "Báo in & Điện tử" (21902), status "Đang nghiệm thu thanh lý" (21968, option is "Đã nghiệm thu thanh lý").
- **BUG-31 (L)** Default clipping date uses `toISOString()` (UTC) (22429, 22462). Between 00:00 and 07:00 Vietnam time it gives yesterday's date.

### Bidding and budget
- **BUG-32 (H)** "Liên thông /quanlydauthau" is not implemented. There is no data exchange. The modal subtitle "Đồng bộ từ hệ thống Quản lý Đấu thầu SCE" (5617) misleads users into thinking the figures are authoritative. Intended: either a real read of the bidding app's tables in the shared Supabase project, or relabel as manual entry (7.3).
- **BUG-33 (L)** Default code `TB-{yyyy}-00{n+1}` gives "TB-2026-0010" from the 10th package on. It also collides after deletions (22564). No uniqueness check.
- **BUG-34 (M)** Money parsing strips all non-digits (22589-22590). "1.500.000,50" becomes 150000050, and "-5" becomes 5. "0" passes the required check. There is no check that winning ≤ budget.
- **BUG-35 (M)** Savings clamps at 0 (22099, 22536), so a cost overrun shows as "0% TK" and disappears from totals. The rate shows 2 decimals in the KPI (22100), 1 in the table (22537) and a hard-coded "3.3%" in BI (22657). The KPI returns the number `0` vs. string `"0.00"` depending on the branch.
- **BUG-36 (L)** Contractor blank is stored as "Đang thương thảo" (22606) while display falls back to "Chưa chọn" (22551). Two empty-state words for one state.
- **BUG-37 (L)** KPI 4 initial HTML "Dự toán: 0 đ • Trúng thầu: 0 đ" (2571) vs. JS "Dự toán: X tr • Trúng: Y tr" (22111). Inconsistent units and wording.

### Executive BI
- **BUG-38 (M)** BI hard-codes "Tiến độ Tổng thể 86%" and "Tiết kiệm Ngân sách 3.3%" (22655, 22657). The heading says "4 Nhóm Công Việc Trọng Yếu" (2849), but every event group is rendered (templates create 7, 9108). The tiles are named "Radar" (2841) but are plain cards.
- **BUG-39 (L)** If the event has no `groups`, `reportBiGroupsProgressBar` is not cleared and shows the previous event's bars (22672). No empty state.
- **BUG-40 (M)** Two formulas for one KPI: the daily tile shows guests/target (22150), BI shows guests/ceil(1.3·target) capped at 100 (22651), M3 uses round(1.3·targetGuests) (11385). The same screen shows contradictory "định mức mời" numbers.

### Persistence and lifecycle
- **BUG-41 (M)** Edits made while logged out are saved to localStorage only, with no undo snapshot, because `recordUndoSnapshot` lives inside `saveAppDataToSupabase`, which is skipped when `!currentUser` (21875, 6784). The cloud save is not awaited, and the success toast shows before it.
- **BUG-42 (M)** After the cloud load (6756) or a snapshot restore (7529), M6 is not re-rendered or re-validated. A restored blob without `eventMediaClippings`/`eventBiddingPackages` makes `saveMediaClipping`/`saveBiddingPackage` throw a TypeError on `appData.eventMediaClippings[evId]` (22445, 22584), and `openCreateBiddingPackageModal` throws at 22564. `initModule6` (the only guard) runs once at boot.
- **BUG-43 (L)** Dead state: `module6State.dailyReportTargetDate` (21796) is never read. `currentEvent` in `renderModule6` is resolved and then not shared with the sub-tab renderers, which re-resolve it.

### UI, a11y, responsive
- **BUG-44 (M)** Printing: `window.print()` prints the whole app page under a fixed overlay. There is no `@media print` rule, and the preview body is a scroll container capped at 95vh (5476, 5493), so a multi-page report is clipped to the visible area. Intended: print stylesheet that prints only the A4 sheet, or a print route.
- **BUG-45 (M)** Modals have no Esc-to-close, no focus trap, no `role="dialog"`/`aria-modal`, and no backdrop-click close (5475, 5500, 5553, 5608). Icon-only close buttons (5489, 5512, 5564, 5620) and trash buttons (22420, 22556) have no `aria-label`. Sub-tab buttons have no `role="tab"`/`aria-selected` (2578-2601).
- **BUG-46 (L)** Header toolbar is `flex-nowrap` inside a non-wrapping `justify-between` row (2484, 2491). At 360px the select (max-w 200px) plus 3 buttons overflow the card. The KPI grid is fixed at 2 columns on phones with xl numbers.
- **BUG-47 (L)** Invalid Tailwind class `py-0.2` (2523, 2581, 2591, 2596) has no effect. The sub-tab active style replaces `className` wholesale (21858, 21863). Child icons keep their fixed colors (blue, amber, indigo, emerald), so the active tab shows a colored icon on rose with low contrast.
- **BUG-48 (L)** Dates are displayed raw ISO "2026-10-24" in the history table and clipping cards (22196, 22406), while the rest of the app uses dd/mm/yyyy (`formatVNDate`).

---

## 7. Rewrite notes

### 7.1 Feature breakdown (suggested `src/features/reports/`)
1. `selectors.ts`: pure functions over typed slices: `stepStats(event)`, `inviteStats(event, guests)`, `boothStats(booths)`, `biddingTotals(packages)`, `t10State(eventDate, today)`. These are the only place for the formulas in 3.3. Unit test them against the tables above.
2. `ReportsPage` with an event picker (shared component) and URL state `?event=&tab=`. Five sub-tab routes or panels.
3. `KpiStrip` (4 cards) and `SubTabBar`.
4. `DailyReport`: banner (T-10 state), highlight tiles, history table, "Phát hành báo cáo" (new, 7.3).
5. `OfficialReportDocument`: one NĐ30 document model (header, title, recipients, sections, nơi nhận, signer) rendered to (a) the A4 HTML preview and (b) `.docx`. Shared with M3's exporter.
6. `OfficialReportsPanel`: 3 cards linking to M3 with `eventId`.
7. `MediaPanel`: clipping CRUD (add, edit, delete with confirm), press-release editor (persisted).
8. `BiddingPanel`: package CRUD, money input, totals row.
9. `ExecutiveBi`: 5 KPI tiles, group progress bars.
10. `seed.ts`: demo-only seed (if kept).

### 7.2 Shared UI primitives seen (owned by foundation)
Event selector with icon/label prefix; KPI stat card (label, big value, secondary, progress bar, sub-line); pill sub-tab bar with count badge; colored status chip; data table with empty-state row; card grid with empty state; modal shell (icon tile, title, subtitle, close, footer Hủy/primary); form field (label, required star, input/select/textarea); money input (VND); date input; confirm dialog; toast; horizontal progress bar; A4 document preview frame; file download helper; .docx builder for NĐ30 documents (shared with M3 and M4c).

### 7.3 Open product questions
1. Starter data: keep the M6 seed only for demo events, drop it entirely, or keep it behind a "Nạp dữ liệu mẫu" button?
2. Daily report issuance: should "Phát hành" save an immutable snapshot (date, T-N, %, highlights, blockers, signer) to history? Who signs (Giám đốc SCE vs. trưởng phòng per commit 6463fbf)? Is the "Số: …/BC-SCE-VP" number entered by hand?
3. Free-text parts of the report (section I narrative, the plan number "Kế hoạch số …/KH-UBND", section IV tasks, "Điểm nghẽn hôm nay"): user-entered per day, or generated from overdue and near-deadline steps (as the M2 popup does at 9322-9336)?
4. "Thư mời đã phát hành": all guests, or guests with `inviteStatus` sent/received, excluding declined? Should VIP and badge counts exclude declined guests?
5. Quota rounding: ceil or round for 130% / 120% (M6 uses ceil, M3 uses round)?
6. Should M6's event selection be global (shared with M2-M5) or per tab?
7. /quanlydauthau: real read from the bidding app's tables in the shared Supabase project (which table and keys?), or manual entry with honest labels? Should package totals be checked against the event `budget` (M2 string "350.000.000")?
8. Press release: persist and export as .docx, merge into M3 `form_thongcao_baochi`, or remove?
9. Official report "In Báo Cáo": print the M3 templates filled with event data, or keep a separate M6 renderer?
10. T-10 holiday calendar: count Vietnamese public holidays as non-working days (today only weekends are skipped, 8261)?
11. Should the T-10 report be blocked or warned after 16h30 if not issued (the deadline in the banner text)?
