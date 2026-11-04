# M4a. Khách mời (guest side of tab `mainTab-guests`)

Source: `code/index.html` (22,715 lines). All `L<n>` refs are `index.html:<n>`.
Scope: guest list and RSVP, KPI cards and pop-ups, guest CRUD, master-DB picker and batch import (event side only), Google Form RSVP sync, Gmail bulk email dispatcher, unit sender accounts, VIP table-tent and delegate badge printing, KPI quota.
Not in scope (interface only): seating, halls, zones (4b); booths, Excel export, admin master-guest CRM (4c); check-in (M5); reports (M6).

Source map (where the code actually lives; the email and form code is outside the assigned 12172-15732 range):

| Area | HTML | JS |
|---|---|---|
| Tab shell, KPI, sub-tabs, guest table, print studio | L1538-1820 | L12172-12182, L13682-13770, L14362-14868 |
| Seating sub-tab (4b) | L1822-1905 | L15733+ |
| Guest modal, print modals, KPI popups | L3682-3809, L3928-4305 | L14708-14867, L15058-15731 |
| Booth/seat/hall modals (4b/4c) | L3811-3926, L4307-4429 | not this unit |
| Bulk email, preview, unit sender modals | L4436-4930 | L18104-19870 |
| Admin "Cấu Hình Hòm Thư" card (admin tab) | L828-858 | L18533-18561 |
| Google Form RSVP modal | L4932-5165 | L19873-20596 |
| Master picker, batch import modals | L5900-6029 | L13254-13679 |
| Master DB seed + admin CRUD (4c) | L5804-5899 | L12308-13253 |
| Starter data | | L13771-14360 |

---

## 1. Purpose and screens

Purpose. Staff (chuyên viên) of SCE maintain, per event, the list of invited delegates (đại biểu), track invitation delivery and RSVP, collect RSVPs from a public Google Form, send personalised invitations through Gmail, and print VIP table tents and QR delegate badges. Everything is keyed by the event chosen in the tab's event selector.

### 1.1 Header card (L1541-1676)

Toolbar row (wraps on narrow screens):

| Control | Label (exact) | Action |
|---|---|---|
| Event select `crmEventSelector` | prefix "Sự kiện:" (hidden < sm). Options `"{name} ({dd/mm/yyyy})"` from `formatVNDate(eventDate\|\|date)`; empty list shows "(Chưa có sự kiện nào)" | `onCrmEventChange` sets `selectedEventId`, runs starter seeding (see B10), re-renders |
| Button emerald | "Nhập từ CSDL Master" (md+) / "CSDL Master" | open Batch Import modal (1.8.3) |
| Button violet gradient | "Google Form RSVP" | open Google Form modal (1.8.10) |
| Button red gradient | "Gửi Email Khách Mời" | open Bulk Email modal (1.8.6) |
| Button amber gradient | "Thêm Khách Mời" | open Guest modal in create mode |
| Button blue | "In Biển Tên VIP" | open VIP namecard print modal (all) |
| Button indigo | "In Thẻ Đại Biểu" | open badge print modal (all) |
| Button slate | "Xuất Excel" (xl+, icon only below) | `exportGuestListExcel()` (4c) |

KPI grid: 2 cols, 4 cols at lg. Each card is a clickable div that opens a pop-up.

| # | Title | Primary | Secondary / note | Click |
|---|---|---|---|---|
| 1 | "Khách Mời" + badge `crmQuotaBadge` | `crmTotalInvited` = guests.length; "/ Dự kiến {target}" | progress bar; `crmQuotaText`; footer "Bấm xem danh sách đại biểu" | `openGuestListPopup('all')` |
| 2 | "Xác Nhận Tham Dự (RSVP)" + inline button "Đồng bộ Form" (stopPropagation, runs form sync) | `crmRsvpConfirmed` = confirmed+substituted; "đại biểu chốt tham gia" | `crmRsvpBreakdown` "Vắng: {d} • Người thay: {s} • Chờ phản hồi: {p}"; footer "Bấm xem khách đã xác nhận" | `openConfirmedGuestsPopup()` |
| 3 | "Biển Tên & Thẻ" | `crmVipNamecardsCount` = count group VIP; "Biển VIP • {n} thẻ in" (n = count group≠VIP) | "Sẵn sàng in ấn theo mẫu chuẩn"; footer "Bấm xem danh sách in biển & thẻ" | `openNamecardsAndBadgesPopup()` |
| 4 | "Tiệc & Xếp Chỗ" | banquet count; "suất tiệc đăng ký" | "Ghế đã xếp: {Object.keys(seating).length} vị trí"; footer "Bấm xem danh sách ăn tiệc" | `openBanquetGuestsPopup()` |

Card 1 states (L14443-14467): total ≥ target → badge emerald "Đủ số lượng ({p}%)", bar emerald, text "Đã đủ số lượng mời (Dự kiến: {t} • Vượt +{surplus})". Else badge amber "Cần mời thêm {missing} khách", bar amber, text "Cần mời thêm {missing} khách (Mục tiêu dự kiến: {t} đại biểu)".

### 1.2 Sub-tab bar (L1679-1694)

Pill buttons, active = `bg-amber-500 text-white`:
1. "1. Danh Sách Khách Mời & RSVP" + badge `subTabBadgeGuests` = guests.length.
2. "2. Biển Tên VIP Chữ A & Thẻ QR" + badge "{vip} Biển VIP • {badges} Thẻ".
3. "3. Sơ Đồ Chỗ Ngồi Hội Trường" (4b; no badge).

Sub-tab choice lives only in memory (`module4State.activeSubTab`), default guests.

### 1.3 Sub-tab 1. Danh sách khách mời & RSVP (L1699-1771)

Filter bar:
- Search `crmGuestSearchInput`, placeholder "Tìm kiếm họ tên đại biểu, chức danh, cơ quan, số điện thoại...". Matches lowercase substring on name, title, organization, phone, email (no diacritic folding).
- Group select: all "Tất cả nhóm khách", VIP "⭐ Đại biểu VIP", SoNganh "🏛️ Khối Sở ban ngành", DoanhNghiep "💼 Doanh nghiệp & HTX", QuocTe "🌐 Khách Quốc tế / Ngoại giao", BaoChi "📰 Báo chí, Truyền hình".
- RSVP select: all "Tất cả trạng thái RSVP", confirmed "✓ Đã xác nhận tham dự", declined "✗ Báo vắng", substituted "⇄ Cử người đi thay", pending "⏳ Chưa liên hệ / Chờ trả lời" (filter matches `rsvpStatus === value` exactly, so guests with empty status never match "pending" here, unlike the popup).
- Button "Nạp Mẫu Chuẩn" (bolt icon) → `quickPopulateStarterGuests` (1.9).

Table columns: STT | Họ và Tên Đại Biểu | Chức Danh & Cơ Quan Công Tác | Nhóm | Giấy Mời | Xác Nhận (RSVP) | Tiệc | Ghế Ngồi | Thao Tác.

Row content (L14577-14634):
- Name cell: star icon if VIP; name; if `substituteName` → "Người thay: {substituteName}" (amber italic); phone and email with icons.
- Title cell: `title || 'Đại biểu'`, organization, notes with info icon.
- Group badge (table 2.6).
- Giấy Mời: send-method text + invite-status text (table 2.6).
- RSVP: inline select bound to `quickToggleRsvp(id, value)`; options "✓ Tham dự", "⇄ Người thay", "✗ Báo vắng", "⏳ Chờ trả lời"; colour class by status.
- Tiệc: "Có" amber chip with utensils icon, else "Không".
- Ghế: seat code button → `openAssignSeatModal(seatCode)` (4b), else link "Chưa xếp" → `openAssignSeatModalForGuest(id)` (4b).
- Actions: edit (pen) → edit modal; delete (trash) → confirm dialog.

Empty state (shown whenever the filtered list is empty, including "no match"): icon, "Chưa có khách mời trong danh sách", "Bấm \"Thêm Khách Mời\" hoặc \"Nạp Mẫu Chuẩn\" để tự động tạo danh sách khách mời chuẩn theo kế hoạch sự kiện.", buttons "Thêm Khách Mới", "Nạp Mẫu Chuẩn".

### 1.4 Sub-tab 2. Print studio (L1776-1820)

Section A "Biển Tên Để Bàn Chữ A (Đại Biểu VIP)", subtitle "Quy chuẩn kích thước 10cm x 28cm (gấp đôi A4), in 2 mặt đối xứng cho khách mời VIP.", button "In Toàn Bộ Biển Tên VIP". Grid 1/2/3 cols of preview cards for VIP set = `group==='VIP' || seatCode startsWith 'A-'`:
- header "BIỂN TÊN CHỮ A (10x28cm)", chip "Ghế: {seat}" or "VIP";
- mini fold preview: back face rotated 180° (title or "ĐẠI BIỂU", name upper), dashed fold label "--- Vạch Gấp Giữa 10cm x 28cm ---", front face (title, name, organization);
- actions "In biển này" (single print), "Sửa" (edit modal).
- Empty: "Chưa có Đại biểu VIP" + "Các đại biểu thuộc nhóm VIP hoặc xếp chỗ tại Hàng ghế A sẽ tự động được tạo Biển tên để bàn chữ A tiêu chuẩn 10cm x 28cm."

Section B "Thẻ Đại Biểu Tham Dự (Kèm Mã QR Check-in)", subtitle "Khổ chuẩn 9cm x 13cm, tích hợp mã QR riêng biệt cho từng đại biểu phục vụ Check-in tức thì tại bàn Lễ tân.", button "In Hàng Loạt Thẻ Đại Biểu". Grid 2/3/4 cols for set `group !== 'VIP'`:
- header band navy "SCE EVENT 2026" + event name;
- title, NAME (upper), organization, group badge;
- QR 64px of `SCE-CHK:{eventId}:{guestId}`, caption `CHK-{last 6 chars of id, upper}`;
- footer "Ghế: {seat}" or "Khu vực chung", button "In thẻ".
- Empty: "Chưa có thẻ đại biểu" + "Các đại biểu thuộc khối Sở ngành, Doanh nghiệp, Quốc tế và Báo chí sẽ được tạo thẻ kèm mã QR phục vụ Check-in tức thì."

### 1.5 Sub-tab 3 (4b)

Interface only: renders via `renderSeatingChart()`; reads `appData.eventSeating[eventId]`, `eventHallConfig[eventId]`, guest `seatCode`, `group`, `rsvpStatus`.

### 1.6 Modals in DOM order

#### 1.6.1 Guest modal `crmGuestModal` (L3683-3809), max-w-lg

Title "Thêm Khách Mời Mới" (create) / "Cập Nhật Hồ Sơ Đại Biểu" (edit); subtitle "Cập nhật hồ sơ đại biểu tham dự sự kiện".

| Field | Label | Control | Required | Create default | Edit fallback |
|---|---|---|---|---|---|
| name | "Họ và Tên Đại Biểu *" + link "Tra cứu CSDL" (opens picker) | text, placeholder "Gõ tên để tự động đối chiếu & gợi ý từ CSDL...", autocomplete off | yes | "" | "" |
| group | "Nhóm Khách Mời *" | select: "⭐ Đại biểu VIP (Lãnh đạo TP, Bộ ngành)", "🏛️ Khối Sở ban ngành", "💼 Doanh nghiệp & HTX", "🌐 Khách Quốc tế / Ngoại giao", "📰 Báo chí, Truyền hình" | yes | VIP | DoanhNghiep |
| title | "Chức Danh / Chức Vụ" | text, "Ví dụ: Phó Chủ tịch / Tổng Giám đốc" | no | "" | "" |
| organization | "Cơ Quan / Đơn Vị Công Tác *" | text, "Ví dụ: UBND TP Hà Nội / Công ty ABC" | yes | "" | "" |
| phone | "Số Điện Thoại" | text, "0912.xxx.xxx" | no | "" | "" |
| email | "Email" | type=email, "daibieu@domain.vn" | no | "" | "" |
| sendMethod | "Hình Thức Gửi Thư" | direct "Đưa tận tay (VIP)", ems "Bưu điện bảo đảm (EMS)", email "Thư điện tử (Email)" | | direct | direct |
| inviteStatus | "Trạng Thái Giấy Mời" | sent "Đã phát hành", received "Đã nhận được thư", pending "Chưa gửi" | | sent | sent |
| rsvpStatus | "Xác Nhận (RSVP)" | confirmed "✓ Tham dự chính thức", substituted "⇄ Cử người đi thay", declined "✗ Báo vắng", pending "⏳ Chưa phản hồi" | | confirmed | confirmed |
| substituteName | "Họ Tên Người Đi Thay (nếu có)" | text, "Ghi rõ họ tên & chức vụ người thay" | no | "" | "" |
| hasBanquet | "Đăng ký dự Tiệc chiêu đãi" | checkbox | | checked | value |
| notes | "Ghi Chú Đón Tiếp" | text, "Lưu ý đón tại phòng VIP, xếp cạnh đại diện..." | no | "" | "" |

Footer "Hủy", "Lưu Khách Mời". Validation after trim: name and organization non-empty, else alert "Thiếu thông tin" / "Vui lòng nhập họ tên đại biểu và cơ quan công tác.". Success toast "Đã lưu đại biểu vào danh sách".

Name auto-suggest dropdown `crmGuestSuggestDropdown` (L13257-13361): on input (and on focus when non-empty) search master DB by tone-folded substring on name, organization, title; max 8.
- No match: "Chưa có trong CSDL Master" / "Bạn có thể tiếp tục nhập mới hoặc bấm **Tra cứu CSDL**".
- Matches: header "Gợi ý đối chiếu từ CSDL Master ({n})" + "Xem tất cả" (opens picker); rows group badge, name, "{title} - {organization}", phone, "Chọn".
- Select fills name, group (fallback VIP), title, organization, phone, email; notes only if master has notes; hasBanquet only if defined. Toast "✓ Đã nạp thông tin từ CSDL: {name} ({organization})".
- Document-level click outside closes it.

#### 1.6.2 Master picker `masterGuestPickerModal` (L5903-5958)

Title "Tra Cứu & Chọn Từ CSDL Master", subtitle "Chọn 1 đối tượng để tự động điền nhanh toàn bộ thông tin". Search "Gõ tên đại biểu, chức danh, cơ quan, số điện thoại..." (tone-folded name/org/title + raw phone). Group pills Tất cả, ⭐ VIP, 🏛️ Sở ngành, 💼 Doanh nghiệp, 🌐 Quốc tế, 📰 Báo chí (active emerald). Columns Nhóm | Họ và Tên & Chức Danh | Cơ Quan / Doanh Nghiệp | Liên Hệ | Chọn. Footer "Hiển thị {f} / {total} đối tượng", "Đóng". Empty row "Không tìm thấy đối tượng nào.". Choose = same as suggest select, then close.

#### 1.6.3 Batch import `batchImportMasterModal` (L5963-6029)

Guard: no event → "Chưa chọn sự kiện" / "Vui lòng chọn sự kiện trước khi nhập khách mời.". Opening resets group 'all', selection, search, select-all.
Title "Nhập Hàng Loạt Từ CSDL Master Vào Sự Kiện", subtitle "Tích chọn các đại biểu hoặc doanh nghiệp để nạp đồng loạt vào sự kiện hiện tại". Search "Lọc theo họ tên, cơ quan, chức vụ..." (tone-folded). Same group pills. Columns: [select-all] | Nhóm | Họ và Tên & Chức Danh | Cơ Quan / Doanh Nghiệp | Liên Hệ | Trạng Thái. Status chip "Đã có trong SK" (amber, row tinted) or "Chưa thêm". Select-all toggles only rows in the current filter. Footer "Đã chọn: {n} đại biểu", "Hủy", "Nhập Đại Biểu Đã Chọn".
Execute: none selected → "Chưa chọn đối tượng" / "Vui lòng tích chọn ít nhất 1 đại biểu hoặc doanh nghiệp để nhập.". Result dialog "Nhập thành công!" / "Đã nạp **{added}** đại biểu mới và cập nhật **{updated}** đại biểu vào sự kiện." Rules in 3.4.

#### 1.6.4 VIP namecard print `printNameCardsModal` (L3929-3981), max-w-5xl

Header "Xem Trước Bản In Biển Tên Chữ A Để Bàn (VIP)", subtitle "Khổ chuẩn gấp đôi A4 (10cm x 28cm), in 2 mặt đối xứng cho khách mời VIP", buttons "In Ngay" (`window.print()`), close.
Theme bar "Chọn Mẫu Background Biển Tên:" select:
`red_gold` "🏛️ 1. Đỏ Đô & Vàng Gold Hoàng Gia (Mặc định)", `imperial_gold` "👑 2. Hoàng Gia Vàng Champagne", `dong_son` "☀️ 3. Hoa Văn Trống Đồng Đông Sơn", `diplomatic_blue` "🌐 4. Xanh Dương Ngoại Giao Quốc Tế", `classic_white` "📄 5. Trắng Tối Giản Viền Đỏ Chuẩn Công Vụ", `custom` "🖼️ 6. Tùy Chỉnh (Tải Ảnh Nền Từ Máy)".
Upload label "Tải ảnh nền riêng" (image/*). Status "Đang dùng ảnh riêng" + "(Xóa)".
Content: one block per VIP guest (all, or one when opened with a guest id). Block = outer container (theme background) > inner bordered panel containing: face 1 rotated 180° (line "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", italic "Độc lập - Tự do - Hạnh phúc", TITLE or "ĐẠI BIỂU", NAME 2xl-3xl black, organization) ; fold guide "[ VẠCH GẤP ĐÔI SỐNG LƯNG TẠO BIỂN CHỮ A - KHỔ CHUẨN 10cm x 28cm ]" ; face 2 identical not rotated. `page-break-after: always` per block. Empty "Không có biển tên VIP nào để in."

#### 1.6.5 Badge print `printBadgesModal` (L3984-4036)

Header "Xem Trước Bản In Thẻ Đại Biểu (4 Thẻ/Trang A4 Kèm QR)", subtitle "Khổ chuẩn 9cm x 13cm có vạch cắt, phục vụ Check-in tự động tại sự kiện", "In Ngay", close.
Theme select "Chọn Mẫu Background Thẻ:": `navy_sce` "🌊 1. Xanh Navy SCE & Vàng Gold (Mặc định)", `red_prestige` "🏛️ 2. Đỏ Cờ Sang Trọng Sự Kiện Cấp Cao", `modern_emerald` "🌿 3. Xanh Ngọc Lục Bảo (Đổi Mới & Đầu Tư)", `dark_gold` "✨ 4. VIP Đẳng Cấp Gold & Nền Tối", `clean_white` "📄 5. Trắng Thanh Lịch Tiêu Chuẩn", `custom` "🖼️ 6. Tùy Chỉnh (Tải Ảnh Nền Từ Máy)". Upload "Tải ảnh nền thẻ".
Content: guests group≠VIP chunked 4 per page. Page header "MẪU THẺ ĐẠI BIỂU TIÊU CHUẨN (9cm x 13cm CÓ VẠCH CẮT)" and "TRANG {i}/{n}". 2×2 grid of cards: dashed cut border; header band "TRUNG TÂM XÚC TIẾN ĐẦU TƯ SCE" + event name (fallback "HỘI NGHỊ XÚC TIẾN ĐẦU TƯ SCE"); body title, NAME, organization, group badge; footer "VỊ TRÍ: {seat}" or "KHU VỰC ĐẠI BIỂU", "ID: {last6 upper}", QR 56px `SCE-CHK:{eventId}:{guestId}`. Empty "Không có thẻ đại biểu nào để in."

#### 1.6.6 Popup 1 `guestListPopupModal` (L4043-4118)

Title "Danh Sách Khách Mời & Đại Biểu" + badge "{n} đại biểu"; subtitle "Sự kiện: {event name}". Buttons "Xuất Excel" (4c), "Thêm Khách" (open create, close popup), close. Search "Tìm theo tên đại biểu, chức danh, đơn vị, điện thoại..." (name/org/title/phone). Group select (short labels "Tất cả nhóm", "⭐ VIP", "🏛️ Sở ngành", "💼 Doanh nghiệp", "🌐 Quốc tế", "📰 Báo chí"), initialised to the `filter` argument. RSVP select "Tất cả RSVP", "✓ Đã xác nhận", "✗ Báo vắng", "⇄ Người đi thay", "⏳ Chờ phản hồi" (pending matches empty status too). Columns STT | Họ và Tên Đại Biểu (+phone) | Chức Danh & Cơ Quan | Nhóm | RSVP | Tiệc | Ghế Ngồi. RSVP badge "✓ Tham dự" / "✗ Báo vắng" / "⇄ Người đi thay" / "Chờ phản hồi". Tiệc "✓ Ăn tiệc" / "Không". Seat or "Chưa xếp". Footer "Hiển thị {f}/{n} đại biểu", "Đóng". Empty "Không tìm thấy đại biểu nào phù hợp."

#### 1.6.7 Popup 2 `confirmedGuestsPopupModal` (L4121-4169)

Title "Khách Mời Đã Xác Nhận Tham Dự (RSVP)" + "{n} đại biểu" (confirmed ∪ substituted); subtitle "Danh sách chốt đại biểu chính thức & người được ủy quyền đi thay". Search "Tìm kiếm đại biểu đã xác nhận..." (name/org/substituteName). Columns STT | Họ và Tên Đại Biểu (+group badge) | Chức Vụ & Đơn Vị | Người Đi Thay (nếu có) | Ghế Ngồi | Tiệc | Điện Thoại. Substitute shown only when status substituted and name set, else "-". Seat or amber "Chưa xếp". Footer "Tổng cộng {n} đại biểu chốt tham gia". Empty "Chưa có đại biểu nào xác nhận tham dự."

#### 1.6.8 Popup 3 `namecardsAndBadgesPopupModal` (L4172-4254)

Title "Chi Tiết Biển Tên VIP & Thẻ Đại Biểu Cần In", subtitle "Xem trước danh sách các biển tên chữ A và thẻ đeo có mã QR check-in". Inner tabs "Biển Tên VIP Chữ A ({n})" (blue active) and "Thẻ Đại Biểu QR ({m})" (indigo active); tab resets are NOT done on reopen (state stays on DOM).
- VIP tab: caption "Danh sách đại biểu VIP cần in Biển tên chữ A để bàn (10cm x 28cm):", button "In Toàn Bộ Biển Tên VIP". Columns STT | Đại Biểu VIP (upper) | Chức Vụ & Đơn Vị | Vị Trí Ghế (seat or "Hàng VIP") | In Riêng ("In biển"). Empty "Không có biển tên VIP nào."
- Badges tab: caption "Danh sách đại biểu cần in Thẻ đeo có mã QR Check-in (Khổ 9cm x 13cm):", button "In Hàng Loạt Thẻ Đại Biểu". Columns STT | Họ và Tên Đại Biểu | Đơn Vị Công Tác | Nhóm | Mã Check-in (`CHK-{last6}`) | In Riêng ("In thẻ"). Empty "Không có thẻ đại biểu nào để in."

#### 1.6.9 Popup 4 `banquetGuestsPopupModal` (L4257-4305)

Title "Danh Sách Đại Biểu Đăng Ký Ăn Tiệc Chiêu Đãi" + "{n} suất"; subtitle "Phục vụ hậu cần tiệc chiêu đãi, bố trí bàn tiệc và suất ăn chuyên biệt". Search "Tìm kiếm đại biểu ăn tiệc..." (name/org). Columns STT | Họ và Tên Đại Biểu | Chức Vụ & Đơn Vị | Nhóm | Ghế Hội Trường (seat or "Hội trường") | Bàn Tiệc / Phục Vụ ("🍷 Bàn VIP Chủ Tọa" if VIP else "🍽️ Bàn Tiệc Khách Mời") | Yêu Cầu Đặc Biệt (`dietaryNotes || notes || 'Tiêu chuẩn SCE'`). Footer "Tổng cộng {n} suất tiệc chiêu đãi đã đăng ký". Empty "Không có đại biểu nào đăng ký ăn tiệc."

#### 1.6.10 Bulk email `bulkEmailModal` (L4438-4769), max-w-6xl

Header: "Trung Tâm Phát Hành Thư Điện Tử" + chip "Google Mail Dispatcher"; subtitle "Gửi giấy mời, thông báo và tài liệu hội nghị hàng loạt tới đại biểu qua tài khoản Google của cán bộ".
Guard: no event → "Chưa chọn sự kiện" / "Vui lòng chọn một sự kiện để phát hành thư điện tử cho khách mời."

Sender bar:
- "Gửi từ Hòm Thư:" select `bulkEmailSenderSelect`. Options: each unit account "✉️ {displayName} ({email})" + " [OAuth]" if clientId + " ⭐ [Mặc định]" if default; last option `personal` "👤 Tài khoản cá nhân: {googleEmail}" or "👤 Tài khoản Google cá nhân (Đăng nhập Google OAuth)".
- Sender badge: signed in → "Google API Sẵn Sàng" (emerald); sender has clientId → "Đã cài Client ID" (blue); else "Sandbox Thử Nghiệm" (amber). Static HTML default "Hòm thư đơn vị đã duyệt" is overwritten.
- Button "Quản lý Hòm Thư Đơn Vị" (opens 1.6.12; visible to every user, see B07).
- Auth area: signed in → avatar, name, chip "Đã kết nối", "From: {email}", link "Đăng xuất / Đổi tài khoản". Signed out → "Chưa kết nối hòm thư Google" + chip "Chế độ Thử nghiệm" + button "Đăng nhập với Google".
- Cog "Client ID" toggles panel: label "Google OAuth 2.0 Client ID (từ Google Cloud Console)", placeholder "Ví dụ: 123456789-abcdef.apps.googleusercontent.com", button "Lưu Client ID", hint "💡 Nếu chưa cấu hình Client ID, hệ thống sẽ tự động kích hoạt Chế độ Thử nghiệm (Simulation Sandbox) giúp cán bộ mô phỏng toàn bộ tiến trình gửi thư, kiểm tra nội dung và xem trước log thực tế." Save → "Đã lưu cấu hình" / "Google Client ID đã được lưu an toàn vào hệ thống."

Left column (lg 5/12): "Đối Tượng Nhận Thư", counter "Đã chọn: {n} người nhận". Segmented tabs "Đại biểu sự kiện" (badge "{selectedGuests}/{allGuests}") and "Tự nhập Email" (badge "{selectedManual}/{manual}").
- Guests panel: filter pills Tất cả, ⭐ VIP, 🏛️ Sở ngành, 💼 Doanh nghiệp, ⏳ Chưa phản hồi (`!rsvp || pending`), ✅ Đã xác nhận (`confirmed` only); search "Tìm theo tên, cơ quan, email..." (name/org/email); checkbox "Chọn hết" (filtered rows with email). List rows: checkbox (disabled when no `@`), name (amber if VIP), status "Đã gửi" / "Lỗi gửi", "{title} - {organization}", email or red "Chưa có email". Empty "Không tìm thấy đại biểu phù hợp bộ lọc."
- Manual panel: textarea "Địa chỉ Email người nhận:" placeholder "Gõ 1 email hoặc nhiều email (cách nhau bởi dấu phẩy, chấm phẩy hoặc xuống dòng)..."; inputs "Họ tên (tùy chọn)", "Cơ quan / Đơn vị (tùy chọn)"; link "Dùng email của tôi để thử nghiệm"; button "Thêm Người Nhận"; checkbox "Chọn tất cả" (default checked); link "Xóa danh sách tự nhập" (confirm "Xóa danh sách email tự nhập?" / "Toàn bộ các email tự nhập ngoài danh sách sẽ bị xóa khỏi phiên gửi này."). Rows: checkbox, name, email, chip "Tự nhập" + organization, delete icon. Empty "Chưa có địa chỉ email tự nhập" / "Gõ email vào ô phía trên rồi bấm \"Thêm Người Nhận\", hoặc dán danh sách nhiều email cùng lúc."

Right column (lg 7/12):
- "Mẫu Thư Định Sẵn:" select: invitation "1. Giấy mời tham dự Hội nghị / Tọa đàm (Trang trọng)", banquet "2. Thư mời dự Tiệc chiêu đãi VIP", seating_qr "3. Thông báo Sơ đồ chỗ ngồi & Thẻ QR Check-in", rsvp_reminder "4. Thư đôn đốc & Nhắc lịch xác nhận tham dự", thank_you "5. Thư cảm ơn & Gửi tài liệu kỷ yếu (T + 3)", custom "-- Soạn thảo mẫu tùy chỉnh --". Changing template overwrites subject and body without confirmation.
- "Tiêu Đề Thư (Subject):" input.
- "Chèn biến cá nhân hóa (Bấm để chèn vào vị trí con trỏ):" chips `{danh_xung} {ho_ten} {chuc_vu} {co_quan} {ten_su_kien} {thoi_gian} {dia_diem} {so_ghe} {can_bo_lien_he} {sdt_lien_he} {link_google_form} {email_don_vi} {ten_don_vi_gui}`. Inserts at the body textarea caret (never into subject).
- "Nội Dung Thư (Hỗ trợ định dạng HTML / Thư điện tử công vụ):" textarea (raw HTML, monospace, 7 rows).
- Attachments box "File Đính Kèm (Tối đa 25MB)", "Chọn file từ máy tính" (multiple), chips "{name} ({KB}KB)" with remove; empty "Chưa có file nào được đính kèm."; checkbox (default checked) "🎟️ Tự động tạo & đính kèm Thẻ Check-in có mã QR cá nhân hóa riêng của từng đại biểu."
- Dispatch panel (dark): "Xem trước thư", "Gửi thử đến tôi", hidden "Tạm dừng"/"Tiếp tục", hidden "Hủy", "BẮT ĐẦU GỬI HÀNG LOẠT"; progress "Đang gửi ({i}/{n}): {name}..." with %, final "Hoàn tất: {ok} thành công, {fail} lỗi."; log console (time-stamped lines, colours SUCCESS emerald, ERROR red, INFO sky).
Footer "Tỷ lệ gửi thành công cao nhất với Gmail API chính chủ • Điều tốc 1.2s/thư chống spam.", "Đóng" (if dispatching: confirm "Tiến trình gửi thư đang chạy!" / "Bạn có chắc chắn muốn hủy tiến trình gửi thư và đóng cửa sổ?" "Dừng & Đóng" / "Tiếp tục gửi").

#### 1.6.11 Email preview `bulkEmailPreviewModal` (L4774-4805)

"Xem Trước Thư Gửi Đi Thực Tế". Rows Người gửi `"{displayName}" <{email}>`, Người nhận `{name} <{email|chua_co_email@domain.vn}>`, Tiêu đề, Đính kèm (file names + generated QR file name, or "Không có file đính kèm"); body rendered as HTML. Buttons "Gửi Thử Nội Dung Này Đến Tôi", "Đóng xem trước".

#### 1.6.12 Unit sender manager `unitEmailManagerModal` (L4810-4869) and editor `unitEmailEditModal` (L4874-4930, z-60)

Manager: "Cấu Hình Danh Sách Email Google & Client ID" + chip "Dành cho Admin"; subtitle "Admin thiết lập tên gợi nhớ, địa chỉ email, Client ID riêng và chọn email mặc định. Chuyên viên chỉ việc chọn gửi."; "💡 {n} hòm thư đã được cấu hình trong hệ thống."; button "Thêm Hòm Thư Google". Columns STT | Tên Hòm Thư | Địa Chỉ Email | Google OAuth 2.0 Client ID (or "Chưa cài (Dùng Sandbox)") | Mặc Định ("Mặc định" chip or link "Đặt mặc định") | Thao Tác (edit, delete). Empty "Chưa có hòm thư Google nào. Bấm \"Thêm Hòm Thư Google\" để thiết lập.". Footer note "Mọi thay đổi sẽ tự động đồng bộ ngay vào danh sách chọn gửi của chuyên viên."
Editor title "Thêm Hòm Thư Google & Client ID Mới" / "Chỉnh Sửa Hòm Thư Google & Client ID". Fields: "Tên gợi nhớ / Tên hòm thư (Tên hiển thị người gửi) *" (hint "Tên này sẽ hiển thị trong danh sách chọn của chuyên viên và tiêu đề thư gửi đi."), "Địa chỉ Email Google *" (type email), "Google OAuth 2.0 Client ID (Cài sẵn riêng cho email này):" (hint "...Nếu để trống, hệ thống sẽ chạy ở Chế độ Thử nghiệm Sandbox."), checkbox "⭐ Đặt làm hòm thư mặc định ưu tiên" (default checked only when list empty). Buttons "Hủy", "Lưu Cấu Hình Hòm Thư". Same CRUD is also reachable from the admin tab card "Cấu Hình Hòm Thư Google & Client ID Gửi Thư" (chip "Phân hệ 4 & Admin", buttons "Quản Lý Danh Sách", "Thêm Hòm Thư Google", compact cards "⭐ Mặc định"/"Hòm thư Google", "Đặt làm mặc định") at L828-858.

#### 1.6.13 Google Form RSVP `googleFormRsvpModal` (L4935-5165), max-w-4xl

Header "Google Form RSVP & Đồng Bộ Phản Hồi" + chip "Tự Động 100%"; subtitle "Mời và thu thập xác nhận tham dự qua Google Form, tự động cập nhật danh sách đại biểu thời gian thực". Guards: no event → "Chưa chọn sự kiện" / "Vui lòng chọn một sự kiện để cấu hình liên kết Google Form."
Status bar: pulsing dot, "Trạng thái:" one of "Đã kết nối Sheet phản hồi" (sheet set), "Chỉ có link Form (Chưa gắn Sheet)", "Chưa thiết lập liên kết"; "Lần kiểm tra cuối: {time vi-VN} ({date vi-VN})" or "Lần kiểm tra cuối: Chưa đồng bộ"; button "ĐỒNG BỘ NGAY".
Tabs (underline): "1. Cấu Hình Liên Kết Form & Tự Động", "2. Danh Sách Phản Hồi Từ Form ({n})".
Tab 1:
- Block "1. Đường Liên Kết Google Form (Dành cho khách mời điền xác nhận)" (tag "Public Form URL"), help "Đường link này sẽ được tự động gắn vào các email phát hành, tin nhắn hoặc quét mã QR để khách mời mở trên điện thoại/máy tính xác nhận tham dự." Input url placeholder "Ví dụ: https://forms.gle/abcXYZ123 hoặc https://docs.google.com/forms/d/e/.../viewform". Buttons "Sao chép link" (toast "Đã sao chép liên kết!"; empty → "Chưa có link" / "Vui lòng dán link Google Form trước khi sao chép."), "Mở thử" (new tab; empty → "...trước khi mở.").
- Block "2. Đường Liên Kết Google Sheet Lưu Phản Hồi (Responses Sheet)" (tag "Sheet Responses CSV"), help "Hệ thống sẽ định kỳ đọc bảng dữ liệu này để tự động cập nhật trạng thái của đại biểu (Tham dự, Không tham dự, Người đi thay, Ăn tiệc)." Input text. Guide box "Hướng dẫn kết nối Google Sheet trong 30 giây:" 1) Form → "Câu trả lời (Responses)" → "Liên kết với Trang tính (Sheets)"; 2) Sheet → "Chia sẻ (Share)" → "Bất kỳ ai có đường liên kết đều có thể xem (Viewer)" → paste.
- Block "3. Tùy Chọn Tự Động Hóa Quá Trình Đồng Bộ": checkbox "Tự động kiểm tra mỗi 5 phút" ("Hệ thống tự động chạy ngầm kiểm tra phản hồi mới khi bạn đang mở phần mềm.", default from event, false); checkbox "Tự nạp khách mới từ Form" ("Tự động thêm vào danh sách khách mời nếu người đăng ký chưa có trong danh sách gốc.", default true unless event says false).
- Footer link "Nạp phản hồi giả lập mẫu (Sandbox Demo)"; button "Lưu Cấu Hình & Đồng Bộ Ngay" (always saves then syncs; the "save only" path with toast "Đã lưu cấu hình" exists in code but no button calls it).
Tab 2: KPI tiles "Tổng số phản hồi", "Xác nhận tham dự", "Báo vắng / Từ chối", "Đăng ký ăn tiệc"; search "Tìm theo tên, email, cơ quan..."; button "Xuất Excel" (CSV); table Thời gian | Họ và tên | Cơ quan / Đơn vị | Email & SĐT | Xác nhận RSVP ("Tham dự"/"Từ chối"/"Chưa rõ") | Ăn tiệc ("Có"/"Không") | Khớp khách mời (`"{guestName} ({Email|SĐT|Họ tên})"`, "Khách đăng ký mới (Đã nạp)" or "Chưa khớp"). Empty "Chưa có dữ liệu phản hồi nào. Hãy bấm \"Đồng Bộ Ngay\" hoặc \"Nạp phản hồi giả lập\"."
Footer "Tự động đối soát thông minh theo Email, SĐT và Họ tên • Cập nhật tức thì vào sơ đồ hội trường.", "Đóng".

### 1.7 Dialogs and toasts (SweetAlert2 today)

Toasts are top-end, no confirm button, 1.5-2.5 s.

| Trigger | Kind | Text |
|---|---|---|
| Delete guest | confirm (red) | "Xóa đại biểu {name}?" / "Hành động này sẽ xóa khách mời và giải phóng chỗ ngồi liên quan." "Đồng ý xóa"/"Hủy"; toast "Đã xóa khách mời khỏi danh sách" |
| RSVP inline change | toast | "Đã cập nhật RSVP: {name}" |
| Nạp Mẫu Chuẩn | confirm (amber) | "Nạp Danh Sách Khách & Gian Hàng Mẫu?" list: "22 Đại biểu mẫu (VIP Lãnh đạo TP Hà Nội, Sở ngành, JETRO, Doanh nghiệp)", "Tự động xếp chỗ Hội trường Khu A (VIP), Khu B (Sở ngành), Khu C (Doanh nghiệp)", "16 Gian hàng hội chợ OCOP tiêu chuẩn kèm chính sách hỗ trợ kinh phí 50% - 100%"; "Đồng ý nạp mẫu"; toast "Đã nạp đầy đủ danh sách khách mời & gian hàng chuẩn". No event → "Chưa chọn sự kiện" / "Vui lòng chọn sự kiện trước khi nạp dữ liệu mẫu." |
| Google sign-in without client id | info | "Chưa cài đặt Client ID" / "Hòm thư \"{displayName}\" ({email}) chưa được Admin cài sẵn Google OAuth Client ID. Admin có thể bấm nút \"Quản lý Hòm Thư Đơn Vị\"... hoặc ... Chế độ Thử nghiệm (Simulation Sandbox)." "Đã hiểu"; also reveals Client ID panel |
| GIS not loaded | error | "Lỗi Google Identity Services" / "Thư viện Google chưa sẵn sàng hoặc bị chặn. Vui lòng thử lại sau vài giây." |
| Token received | success 2 s | "Kết nối Google Mail thành công!" / "Đã xác thực tài khoản: {email}" |
| Add manual empty | info | "Chưa nhập email" / "Vui lòng nhập ít nhất 1 địa chỉ email người nhận." |
| Add manual no match | warning | "Email không hợp lệ" / "Không tìm thấy địa chỉ email hợp lệ. Vui lòng kiểm tra lại định dạng." |
| Add manual ok | toast | "Đã thêm {n} địa chỉ email nhận thư" |
| "Dùng email của tôi" without email | info | "Chưa có thông tin email" / "Vui lòng đăng nhập Google Mail hoặc nhập địa chỉ email vào ô trên." |
| File > 25 MB | warning | "File quá lớn" / "File \"{name}\" vượt quá giới hạn 25MB của Gmail." |
| Test send | loading → success/error | "Đang gửi thư thử nghiệm..." / "Gửi tới: {email}"; "Đã gửi thử nghiệm!" / "Thư thử nghiệm đã được gửi thành công đến hòm thư: {email}"; "Lỗi gửi thư" / {message}; sandbox "Mô phỏng gửi thử thành công (Sandbox)" / "(Chế độ Thử nghiệm) Thư đã được định dạng chuẩn MIME và sẵn sàng gửi tới: {email}" "Tuyệt vời"; invalid → "Email không hợp lệ" / "Vui lòng cung cấp email nhận thư thử nghiệm hợp lệ." |
| Start dispatch empty | warning | "Chưa chọn người nhận" / "Vui lòng tích chọn ít nhất 1 đại biểu hoặc thêm email tự nhập có địa chỉ email hợp lệ." |
| Start dispatch | confirm | "Xác nhận phát hành thư hàng loạt?" / "Bạn đang chuẩn bị gửi email tới **{n} đại biểu**. Phương thức gửi: **{Hòm thư Google của bạn ({email}) \| Chế độ Thử nghiệm (Simulation Sandbox)}**. Mỗi thư sẽ được giãn cách 1.2 giây để đảm bảo tỷ lệ vào Inbox cao nhất và chống Spam." "Xác nhận Bắt đầu"/"Kiểm tra lại" |
| Dispatch done | success/warning | "Hoàn tất phát hành thư!" / "Đã phát hành thành công: {ok} thư" + "Lỗi: {fail} thư (xem nhật ký phía dưới)" or "Tất cả các thư đều được xử lý chính xác." |
| Unit sender validation | warning | "Thiếu tên hòm thư" / "Vui lòng nhập tên gợi nhớ / tên hiển thị của hòm thư."; "Email không hợp lệ" / "Vui lòng nhập địa chỉ email Google chính xác." |
| Unit sender save | toast | "Đã cập nhật hòm thư Google" / "Đã thêm hòm thư Google mới" |
| Unit sender delete last | warning | "Không thể xóa" / "Hệ thống cần tối thiểu 1 hòm thư Google để phục vụ chuyên viên gửi email." |
| Unit sender delete | confirm | "Xóa hòm thư này?" / "Bạn có chắc chắn muốn xóa hòm thư: **{displayName}** ({email})?"; "Đã xóa" / "Hòm thư Google đã được xóa thành công." |
| Form sync without sheet | info (opens modal first) | "Chưa gắn link Google Sheet" / "Vui lòng dán link Google Sheet lưu phản hồi của Form và bật quyền \"Bất kỳ ai có đường liên kết đều có thể xem\" để hệ thống tự động đọc câu trả lời." |
| Form sync loading | loading | "Đang đồng bộ Google Form..." / "Hệ thống đang tải và phân tích phản hồi từ Google Sheet." |
| Form sync ok | success | "Đồng bộ Google Form hoàn tất!" / "Đã đọc và xử lý **{n} phản hồi**: {c} đại biểu xác nhận tham dự. {d} đại biểu báo vắng / từ chối. {b} đại biểu đăng ký tiệc chiêu đãi. [{new} khách đăng ký mới đã được tự động nạp vào danh sách!]" "Xem danh sách" → tab 2 |
| Sheet empty | info | "Google Sheet trống" / "Chưa có câu trả lời nào được ghi nhận trên Google Sheet." |
| Sheet error | error | "Không thể kết nối Google Sheet" / "Vui lòng kiểm tra lại: 1. Google Sheet đã được mở quyền: \"Bất kỳ ai có đường liên kết đều có quyền xem (Viewer)\". 2. Đường link Google Sheet đã đúng định dạng." + error |
| Simulate | success | "Đã nạp 4 phản hồi giả lập mẫu!" / "Hệ thống đã tự động đối soát và cập nhật trực tiếp vào danh sách khách mời của sự kiện." |
| Export responses empty | info | "Chưa có dữ liệu" / "Chưa có phản hồi nào để xuất ra file." |

---

## 2. Domain types

### 2.1 Enums and labels

```ts
type GuestGroup = 'VIP' | 'SoNganh' | 'DoanhNghiep' | 'QuocTe' | 'BaoChi';
type SendMethod = 'direct' | 'ems' | 'email';
type InviteStatus = 'pending' | 'sent' | 'received';
type RsvpStatus = 'pending' | 'confirmed' | 'substituted' | 'declined';
type EmailDeliveryStatus = 'idle' | 'sent' | 'error';
type EmailTemplateKey = 'invitation' | 'banquet' | 'seating_qr' | 'rsvp_reminder' | 'thank_you' | 'custom';
type VipCardTheme = 'red_gold' | 'imperial_gold' | 'dong_son' | 'diplomatic_blue' | 'classic_white' | 'custom';
type BadgeTheme = 'navy_sce' | 'red_prestige' | 'modern_emerald' | 'dark_gold' | 'clean_white' | 'custom';
```

Labels in use today. They are inconsistent (B44). The rewrite should define one table per enum.

| Enum | Value | Table badge (L14637) | Form option | Other surfaces |
|---|---|---|---|---|
| group | VIP | "⭐ VIP" amber | "⭐ Đại biểu VIP (Lãnh đạo TP, Bộ ngành)" | master name "Đại biểu VIP" |
| group | SoNganh | "🏛️ Sở ngành" blue | "🏛️ Khối Sở ban ngành" | "Khối Sở ban ngành & Quận huyện" |
| group | DoanhNghiep | "💼 Doanh nghiệp" emerald | "💼 Doanh nghiệp & HTX" | |
| group | QuocTe | "🌐 Quốc tế" purple | "🌐 Khách Quốc tế / Ngoại giao" | |
| group | BaoChi | "📰 Báo chí" rose | "📰 Báo chí, Truyền hình" | |
| group | other | "Đại biểu" slate | | |
| sendMethod | direct | "Tận tay" amber | "Đưa tận tay (VIP)" | default text "Trực tiếp" for unknown |
| sendMethod | ems | "EMS Bưu điện" blue | "Bưu điện bảo đảm (EMS)" | |
| sendMethod | email | "Thư điện tử" indigo | "Thư điện tử (Email)" | |
| invite | received | "✓ Đã nhận" emerald | "Đã nhận được thư" | |
| invite | sent | "Đã phát hành" blue | "Đã phát hành" | |
| invite | pending/other | "Chưa gửi" slate | "Chưa gửi" | |
| rsvp | confirmed | "✓ Tham dự" | "✓ Tham dự chính thức" | filter "✓ Đã xác nhận tham dự"; form table "Tham dự" |
| rsvp | substituted | "⇄ Người thay" | "⇄ Cử người đi thay" | popup "⇄ Người đi thay" |
| rsvp | declined | "✗ Báo vắng" | "✗ Báo vắng" | form table "Từ chối" |
| rsvp | pending/empty | "⏳ Chờ trả lời" | "⏳ Chưa phản hồi" | filter "⏳ Chưa liên hệ / Chờ trả lời"; popup "Chờ phản hồi"; form table "Chưa rõ" |

RSVP select colours (L14671): confirmed emerald-50/800/300, substituted amber, declined rose, other slate.

### 2.2 Entities

```ts
/** appData.eventGuests[eventId][] . Persisted in the single appData JSON (2.4). */
interface EventGuest {
  id: string;            // 'gst_{Date.now()}_{4 base36}' (manual/import), 'GF-{base36 ts}-{4}' (form), 'GF-SIM-01' (demo),
                         // fixed 'gst_vip_01'.. (starter), 'gst_walkin_{ts}' (M5)
  name: string;          // required
  group: GuestGroup;
  title: string;         // chức danh, '' allowed; display fallback 'Đại biểu'
  organization: string;  // required
  phone: string;         // free text, e.g. '0913.210.001'
  email: string;         // '' allowed; "valid" today = includes('@')
  sendMethod: SendMethod;
  inviteStatus: InviteStatus;
  rsvpStatus: RsvpStatus; // may be missing on legacy rows -> treated as pending
  substituteName: string; // name+title of the person attending instead
  hasBanquet: boolean;
  seatCode: string;       // '' or '{zonePrefix}{NN}' e.g. 'A-04'; mirrored in eventSeating (4b)
  notes: string;          // "Ghi chú đón tiếp"
  // written by bulk email (L19797-19811)
  emailStatus?: EmailDeliveryStatus;
  emailSentAt?: string;   // ISO
  emailError?: string;
  // written by Google Form sync (L20276-20277)
  rsvpSource?: 'google_form';
  rsvpRespondedAt?: string; // raw sheet timestamp text, or ISO when absent
  // written by M5 check-in (read here only via QR payload)
  isCheckedIn?: boolean; checkInTime?: string; hasGiftPackage?: boolean; checkInStaff?: string;
  // read but never written anywhere (dead; drop in rewrite)
  banquet?: boolean | 'confirmed'; dietaryNotes?: string; assignedSeat?: string;
  qrCode?: string; honorific?: string; danhXung?: string;
}

/** appData.masterGuestDb[] (owned by 4c). Read here for suggest/picker/import. */
interface MasterGuest {
  id: string;            // 'mdb_{vip|sn|dn|qt|bc}_{nn|ts}'
  name: string; group: GuestGroup; title: string; organization: string;
  phone: string; email: string; address: string; notes: string;
  hasBanquet: boolean; isDefaultVip: boolean;
  taxCode?: string; updatedAt?: string;
}

/** appData.events[] fields this module reads/writes (event owned by M2). */
interface EventRecordGuestFields {
  id: string; name: string; title?: string;        // title read by email merge, never written
  eventDate: string; eventTime?: string; date?: string; // 'date' read by merge, never written
  location?: string;
  targetGuests?: number;                             // written by M2 (L9101, L10452), IGNORED here
  expectedDelegates?: number;                        // read here (L14428), never written
  // written by this module (L20001-20004, L20316-20317)
  googleFormUrl?: string;
  googleSheetUrl?: string;
  autoSyncGoogleForm?: boolean;          // default false
  autoAddNewGuestsFromForm?: boolean;    // default true (undefined => true)
  lastFormSyncTime?: string;             // ISO
  formResponsesCount?: number;
}

/** appData.systemSettings.unitSenderEmails[] */
interface UnitSenderEmail {
  id: string;            // 'gmail_cfg_{n|ts}'
  displayName: string;   // legacy rows may carry 'name' instead; copied into displayName on read
  email: string;
  clientId: string;      // Google OAuth web client id, '' => sandbox
  isDefault: boolean;    // exactly one true (by convention, not enforced on edit of a non-default)
}

interface SystemSettingsUsedHere {
  unitSenderEmails: UnitSenderEmail[];
  googleClientId?: string;      // global fallback client id
  agencyName: string; parentAgency: string;    // NOT used by this module (hardcoded strings instead, B47)
  guestQuotaPercent: number;    // 130, configured in admin, unused here
  badgeQuotaPercent: number;    // 120, unused here
}

interface EmailTemplate { name: string; subject: string; body: string /* HTML with {tags} */ }

interface ManualRecipient {      // memory only (bulkEmailState), lost on reload
  id: string;                    // 'manual_{ts}_{6 base36}'
  name: string; email: string;   // email lowercased
  title: string;                 // 'Đại biểu' (title input missing in HTML)
  organization: string;          // default 'Khách mời tự nhập'
  group: 'DoanhNghiep'; isManual: true; emailStatus: EmailDeliveryStatus;
}

interface GoogleSession {        // sessionStorage 'sce_google_user' (+ token key)
  name: string; email: string; picture: string; accessToken: string;
}

interface GoogleFormResponse {   // memory only (global, not per event)
  timestamp: string; name: string; org: string; title: string; email: string; phone: string;
  rsvpRaw: string; banquetRaw: string; substitute: string; notes: string;
  rsvpStatus: RsvpStatus;        // only pending|confirmed|declined produced
  hasBanquet: boolean;
  matchedGuestName: string;      // '' | '{name} ({Email|SĐT|Họ tên})' | 'Khách đăng ký mới (Đã nạp)'
}

interface FormColumnMap { timestamp: number; name: number; org: number; title: number; phone: number;
  email: number; rsvp: number; banquet: number; substitute: number; notes: number } // -1 = absent

/** 4b interface, read/written here */
type SeatingMap = Record<string /*seatCode*/, string /*guestId*/>; // appData.eventSeating[eventId]
```

UI state (memory only):

```ts
interface Module4State { selectedEventId: string | null; activeSubTab: 'subtab-guests'|'subtab-namecards'|'subtab-seating';
  filterGroup: GuestGroup|'all'; filterRsvp: RsvpStatus|'all'; searchKeyword: string; selectedSeatCode: string|null }
interface BulkEmailState { selectedRecipientIds: Set<string> /* guest ids and manual ids mixed */;
  manualRecipients: ManualRecipient[]; activeRecipientTab: 'guests'|'manual';
  currentFilter: 'all'|'VIP'|'SoNganh'|'DoanhNghiep'|'rsvp_pending'|'rsvp_confirmed'; searchQuery: string;
  attachedFiles: { name: string; size: number; type: string; base64: string }[];
  isDispatching: boolean; isPaused: boolean; isCancelled: boolean;
  googleUser: GoogleSession | null; tokenClient: unknown; selectedSenderEmailId: string /* id | 'personal' */ }
// print themes: currentVipCardBgTheme, customVipCardBgDataUrl, currentBadgeBgTheme, customBadgeBgDataUrl (memory)
```

### 2.3 Seed data

Default unit senders (L18192-18214):

| id | displayName | email | clientId | isDefault |
|---|---|---|---|---|
| gmail_cfg_1 | Hòm thư Ban Tổ Chức Sự Kiện | hanoi.sce.event@gmail.com | '' | true |
| gmail_cfg_2 | Hòm thư Xúc Tiến Đầu Tư Hà Nội | xuctiendautu.hanoi@gmail.com | '' | false |
| gmail_cfg_3 | Hòm thư Hỗ Trợ Doanh Nghiệp | hotrodoanhnghiep.sce@gmail.com | '' | false |

Seeded whenever the list is empty or missing (L18217-18227).

Starter guests (`generateStarterGuestsList`, L13814-14168), 22 rows. Columns: id, name, group, title, organization, phone, email, sendMethod, invite, rsvp, substitute, banquet, seat. Notes omitted here; they are free text.

| id | name | grp | title | organization | phone | email | send | inv | rsvp | substitute | bq | seat |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| gst_vip_01 | Trần Sỹ Thanh | VIP | Ủy viên BCH Trung ương Đảng, Phó Bí thư Thành ủy, Chủ tịch | Ủy ban nhân dân thành phố Hà Nội | 0913.210.001 | ubnd@hanoi.gov.vn | direct | received | confirmed | | Y | A-04 |
| gst_vip_02 | Nguyễn Trọng Đông | VIP | Ủy viên Ban Thường vụ Thành ủy, Phó Chủ tịch Thường trực | Ủy ban nhân dân thành phố Hà Nội | 0913.220.002 | dongnt@hanoi.gov.vn | direct | received | confirmed | | Y | A-05 |
| gst_vip_03 | Hà Minh Hải | VIP | Thành ủy viên, Phó Chủ tịch | Ủy ban nhân dân thành phố Hà Nội | 0913.230.003 | haihm@hanoi.gov.vn | direct | received | confirmed | | Y | A-06 |
| gst_vip_04 | Ito Naoki | VIP | Đại sứ đặc mệnh toàn quyền | Đại sứ quán Nhật Bản tại Việt Nam | 024.3846.3000 | embassy@ha.mofa.go.jp | direct | received | confirmed | | Y | A-03 |
| gst_vip_05 | Takeo Nakajima | VIP | Trưởng Đại diện | Tổ chức Xúc tiến Thương mại Nhật Bản (JETRO Hà Nội) | 024.3825.4499 | nakajima@jetro.go.jp | direct | received | confirmed | | Y | A-07 |
| gst_sn_01 | Nguyễn Xuân Sáng | SoNganh | Phó Giám đốc | Sở Tài chính thành phố Hà Nội | 0912.345.678 | sangnx_sotc@hanoi.gov.vn | ems | received | confirmed | | Y | B-01 |
| gst_sn_02 | Lê Anh Quân | SoNganh | Giám đốc | Sở Kế hoạch và Đầu tư thành phố Hà Nội | 0903.456.789 | quanla_sokhdt@hanoi.gov.vn | ems | received | confirmed | | Y | B-02 |
| gst_sn_03 | Đào Thu Hà | SoNganh | Phó Trưởng Ban | Ban Quản lý các Khu Công nghiệp và Chế xuất Hà Nội | 0983.112.233 | hadt_bqlkcn@hanoi.gov.vn | ems | received | substituted | Vũ Hải Đăng - Chánh Văn phòng BQL KCN | N | B-03 |
| gst_sn_04 | Phạm Đình Toàn | SoNganh | Trưởng phòng Kinh tế Đối ngoại | Sở Ngoại vụ thành phố Hà Nội | 0912.889.900 | toanpd_sonv@hanoi.gov.vn | ems | received | declined | | N | |
| gst_sn_05 | Nguyễn Hoàng Long | SoNganh | Giám đốc | Trung tâm Hỗ trợ Doanh nghiệp Hà Nội (SCE) | 0904.118.899 | longnh_sce@hanoi.gov.vn | direct | received | confirmed | | Y | B-06 |
| gst_dn_01 | Trương Gia Bình | DoanhNghiep | Chủ tịch Hội đồng Quản trị | Tập đoàn FPT | 0903.221.100 | binhtg@fpt.com.vn | direct | received | confirmed | | Y | C-01 |
| gst_dn_02 | Nguyễn Trung Chính | DoanhNghiep | Chủ tịch HĐQT / Chủ tịch điều hành | Tập đoàn Công nghệ CMC | 0903.445.566 | chinhnt@cmc.com.vn | direct | received | confirmed | | Y | C-02 |
| gst_dn_03 | Nguyễn Thị Nga | DoanhNghiep | Chủ tịch | Tập đoàn BRG | 0913.556.677 | ngant@brggroup.vn | direct | received | substituted | Lê Tuấn Anh - Phó Tổng Giám đốc Tập đoàn BRG | Y | C-03 |
| gst_dn_04 | Phan Thanh Bình | DoanhNghiep | Tổng Giám đốc | Công ty Cổ phần Công nghệ Savis | 0988.667.788 | binhpt@savis.vn | email | received | confirmed | | N | C-04 |
| gst_dn_05 | Mạc Quốc Anh | DoanhNghiep | Phó Chủ tịch kiêm Tổng Thư ký | Hiệp hội Doanh nghiệp nhỏ và vừa thành phố Hà Nội (Hanoisme) | 0904.333.444 | anhquocmac@hanoisme.vn | direct | received | confirmed | | Y | C-05 |
| gst_qt_01 | Kinoshita Tadahiro | QuocTe | Tổng Giám đốc | Tập đoàn Sojitz Việt Nam | 024.3934.5678 | kinoshita.tadahiro@sojitz.com | email | received | confirmed | | Y | B-04 |
| gst_qt_02 | Trần Thị Thu Phương | QuocTe | Giám đốc Đối ngoại | Tập đoàn Sumitomo Hà Nội | 0912.778.899 | phuong.tran@sumitomocorp.com | email | received | confirmed | | Y | B-05 |
| gst_qt_03 | Hong Sun | QuocTe | Cố vấn Cao cấp | Hiệp hội Doanh nghiệp Hàn Quốc tại Việt Nam (KOCHAM) | 0903.444.555 | hongsun@kocham.vn | email | sent | pending | | N | |
| gst_bc_01 | Phóng viên Ban Thời sự | BaoChi | Phóng viên ghi hình | Đài Phát thanh và Truyền hình Hà Nội (Hanoitv) | 0988.223.344 | thoisu@hanoitv.vn | email | received | confirmed | | N | C-11 |
| gst_bc_02 | Phóng viên Ban Kinh tế | BaoChi | Phóng viên chuyên trách | Báo Hà Nội Mới | 0912.665.544 | kinhte@hanoimoi.com.vn | email | received | confirmed | | N | C-12 |
| gst_bc_03 | Phóng viên Ban Kinh tế - Đô thị | BaoChi | Phóng viên truyền hình | Báo Kinh tế & Đô thị | 0904.556.677 | bandoc@ktdt.com.vn | email | received | confirmed | | N | C-13 |
| gst_bc_04 | Phóng viên Ban Thời sự | BaoChi | Phóng viên ghi hình | Báo Nhân Dân | 0913.778.899 | kinhte@nhandan.vn | email | sent | pending | | N | |

Starter seating = `{[seatCode]: guestId}` for rows with a seat (L14352). Starter booths (16 rows) belong to 4c. These rows use real officials' names and contacts; see open question Q1.

### 2.4 Persistence

| Data | Location |
|---|---|
| `appData` (events, eventGuests, eventSeating, eventHallConfig, hallTemplates, masterGuestDb, systemSettings, ...) | `localStorage['sce_tcsk_app_data']` (whole JSON) on every `syncModule4Storage`; also `localStorage['sce_tcsk_local_events']` = events |
| Same `appData` | Supabase `public.sce_tcsk_app_data` upsert `{id: 1, data: appData, updated_at, updated_by, updated_by_email}` when `notifyCloud && currentUser` (L6797-6806), followed by `createBackgroundBackup` (table `sce_tcsk_backups`) and an undo snapshot |
| Global OAuth client id | `appData.systemSettings.googleClientId` and `localStorage['sce_google_client_id']` |
| Gmail access token | `sessionStorage['sce_google_access_token']`; profile + token copy `sessionStorage['sce_google_user']` |
| Manual recipients, attachments, selection, form response cache, print themes, custom backgrounds | memory only |

`syncModule4Storage(false)` (starter seeding) writes local only.

---

## 3. Business rules and state machines

### 3.1 RSVP

| From | To | Trigger | Side effects today | Intended |
|---|---|---|---|---|
| any | any | inline select (`quickToggleRsvp`) | if →declined and seatCode: delete seat map entry, clear seatCode; save; re-render; toast | same, plus banquet should not count for declined (Q10) |
| any | any | guest modal save | none (seat kept even if declined, B18) | same rule as inline |
| any | pending/confirmed/declined | Google Form sync on matched guest | overwrites status every sync; no seat release; never sets substituted (B15-B18) | apply only newer responses; map substitute → substituted; release seat on declined |
| none | confirmed | create via modal (default), batch import (forced), walk-in (M5) | | default should be pending (B40, Q4) |
| none | parsed | form auto-add | | |

Counting (L14470-14480, L15161):

| Metric | Rule |
|---|---|
| Đã xác nhận (card 2, popup 2) | confirmed + substituted |
| Vắng | declined |
| Người thay | substituted |
| Chờ phản hồi | pending or empty status |
| Banquet (card 4, popup 4) | `hasBanquet` (plus dead `banquet===true\|'confirmed'`), regardless of RSVP (B39) |
| Ghế đã xếp | number of keys in eventSeating[event] |

### 3.2 Invitation status

`pending` ("Chưa gửi") → `sent` ("Đã phát hành") → `received` ("Đã nhận"). Changed only by the guest modal. No automatic transition from email dispatch (B33). Form auto-add and batch import set `sent`; walk-in sets `received`.

### 3.3 Email delivery status (per recipient)

| From | To | Trigger |
|---|---|---|
| unset/idle | sent | live send HTTP 2xx, OR sandbox loop (always, B12) |
| any | error | exception (non-2xx with `error.message`, network, missing token) ; `emailError` = message |
| sent/error | sent/error | re-send overwrites; never reset |

Guest rows persist it; manual rows keep it in memory.

### 3.4 Batch import from master (L13610-13679)

For each selected master id: match an existing event guest where `fold(name)===fold(master.name) && fold(org)===fold(master.organization)` (fold = `removeVietnameseTones`, lowercase, trim).

| Match | Effect |
|---|---|
| found | group/title/phone/email ← master value if truthy; hasBanquet ← master if defined; notes ← master only if guest notes empty; counted "updated" |
| none | new guest `{id:'gst_{ts}_{rand4}', name, group\|\|'VIP', title, organization, phone, email, sendMethod:'direct', inviteStatus:'sent', rsvpStatus:'confirmed', substituteName:'', hasBanquet:!!m.hasBanquet, seatCode:'', notes}`; counted "added" |

Rows already in the event show "Đã có trong SK" but stay selectable.

### 3.5 Dedupe rules (all differ, B41)

| Path | Key |
|---|---|
| Guest modal create | none |
| Batch import | folded name + folded organization |
| Google Form match | 1) email lowercase/trim equal; 2) digits-only phone, length ≥ 8, equal or guest phone endsWith last 8 digits; 3) folded full name equal. First guest found wins |
| Manual email recipients | lowercase email within manual list only |
| Simulated form | exact name 'Hoàng Quốc Việt' |

### 3.6 KPI quota math (L14427-14509)

```
target   = event.expectedDelegates || 100        // field never written => 100 (B23); event has targetGuests
total    = guests.length
percent  = target > 0 ? round(total / target * 100) : 0
reached  = total >= target
badge    = reached ? `Đủ số lượng (${percent}%)` : `Cần mời thêm ${target-total} khách`
bar      = min(100, percent) %, emerald if reached else amber
text     = reached ? `Đã đủ số lượng mời (Dự kiến: ${target} • Vượt +${total-target})`
                   : `Cần mời thêm ${target-total} khách (Mục tiêu dự kiến: ${target} đại biểu)`
vipCards = count(group==='VIP');  badges = count(group!=='VIP')
```

`systemSettings.guestQuotaPercent` (130) and `badgeQuotaPercent` (120) are configured in admin (L6891-6913) but not used. Code comments say the ≥130 % / ≥120 % rules were removed. M6 reports still use `ceil(target*1.3)` hardcoded (L22142). Decision needed (Q2).

### 3.7 Print set selection

| Output | Set |
|---|---|
| VIP namecards (sub-tab, popup, print) | `group==='VIP' \|\| seatCode.startsWith('A-')` |
| Delegate badges | `group !== 'VIP'` |
| Single print | the set filtered to that id (a guest outside the set prints nothing) |
| Badge pagination | chunks of 4 per A4 portrait page, 2×2 |

### 3.8 Mail merge (L19259-19311)

Tags are replaced by plain `split/join` on subject and body, raw (no HTML escaping, B03).

| Tag | Value today | Fallback | Correct source |
|---|---|---|---|
| `{danh_xung}` | `guest.honorific \|\| guest.danhXung` else rule below | | rule below |
| `{ho_ten}` | name | "Quý Đại biểu" | |
| `{chuc_vu}` | title | "Đại biểu" | |
| `{co_quan}` | organization | "Cơ quan/Đơn vị" | |
| `{ten_su_kien}` | `event.title \|\| event.name` | "Hội nghị & Tọa đàm xúc tiến đầu tư SCE" | event.name |
| `{thoi_gian}` | `` `${event.date} (Khai mạc: 08:30)` `` | "08:30 ngày 15/11/2026" | event.eventDate + eventTime (B24) |
| `{dia_diem}` | event.location | "Trung tâm Hội nghị Quốc gia NCC (Hà Nội)" | |
| `{so_ghe}` | guest.assignedSeat | "Khu vực Đại biểu Danh dự" | guest.seatCode (B24) |
| `{can_bo_lien_he}` | currentUser.full_name | "Cán bộ Lễ tân SCE" | profile.fullname (B24) |
| `{sdt_lien_he}` | constant "024.3825.8888 / 0912.345.678" | | configurable (Q) |
| `{ma_qr_checkin}` | guest.qrCode \|\| `SCE-{id}` | | no chip (B26) |
| `{email_don_vi}` | active sender email | | |
| `{ten_don_vi_gui}` | active sender displayName | | |
| `{link_google_form}` | not replaced (B25) | | event.googleFormUrl |

Danh xưng rule: "Đồng chí" if group ∈ {VIP, SoNganh} or lowercased title contains any of "chủ tịch", "bí thư", "trưởng", "giám đốc", "thứ trưởng", "bộ trưởng", "chuyên viên", "cán bộ", "viên chức"; else "Quý Ông/Bà".

Templates (L18109-18190), subjects exact:

| key | name | subject |
|---|---|---|
| invitation | Giấy mời tham dự Hội nghị / Tọa đàm (Trang trọng) | `[Giấy Mời] Tham dự {ten_su_kien} - Kính gửi {danh_xung} {ho_ten}` |
| banquet | Thư mời dự Tiệc chiêu đãi VIP | `[Thư Mời Tiệc Chiêu Đãi] {ten_su_kien} - Kính gửi {danh_xung} {ho_ten}` |
| seating_qr | Thông báo Sơ đồ phân khu chỗ ngồi & Thẻ QR Check-in | `[Thẻ Check-in & Chỗ Ngồi] {ten_su_kien} - Đại biểu: {ho_ten}` |
| rsvp_reminder | Thư đôn đốc & Nhắc lịch xác nhận tham dự | `[Nhắc Lịch & Đôn Đốc RSVP] Tham dự {ten_su_kien} - Kính gửi {danh_xung} {ho_ten}` |
| thank_you | Thư cảm ơn & Gửi link tài liệu kỷ yếu (T + 3) | `[Thư Cảm Ơn] Tham dự {ten_su_kien} - Trung tâm SCE Hà Nội` |
| custom | Mẫu tùy chỉnh | `[Thông Báo] {ten_su_kien} - Kính gửi {danh_xung} {ho_ten}` |

Bodies verbatim (HTML):

invitation
```html
<p>Kính gửi: <strong>{danh_xung} {ho_ten}</strong></p>
<p>Chức vụ: <strong>{chuc_vu}</strong> - Đơn vị: <strong>{co_quan}</strong></p>
<br>
<p>Trung tâm Xúc tiến Đầu tư và Hỗ trợ Doanh nghiệp Hà Nội (SCE) trực thuộc Sở Tài chính Hà Nội trân trọng kính mời {danh_xung} tới tham dự chương trình:</p>
<h3 style="color: #1e3a8a; margin: 12px 0; font-size: 15px;">{ten_su_kien}</h3>
<p>⏰ <strong>Thời gian khai mạc:</strong> {thoi_gian}</p>
<p>📍 <strong>Địa điểm tổ chức:</strong> {dia_diem}</p>
<p>🪑 <strong>Vị trí danh dự:</strong> <span style="color: #2563eb; font-weight: bold;">{so_ghe}</span></p>
<br>
<p>Sự hiện diện của {danh_xung} là niềm vinh hạnh lớn đối với Ban Tổ chức và đóng góp quan trọng vào thành công của sự kiện.</p>
<p>Kính đề nghị {danh_xung} phản hồi xác nhận tham dự hoặc liên hệ cán bộ đón tiếp: <strong>{can_bo_lien_he}</strong> (Điện thoại/Zalo: <strong>{sdt_lien_he}</strong>).</p>
<br>
<p><em>(Giấy mời chính thức và Thẻ đại biểu có mã QR Check-in được đính kèm thư này)</em></p>
<br>
<p>Trân trọng cảm ơn!</p>
<p><strong>BAN TỔ CHỨC SỰ KIỆN - TRUNG TÂM SCE HÀ NỘI</strong></p>
```
banquet
```html
<p>Kính gửi: <strong>{danh_xung} {ho_ten}</strong> ({chuc_vu} - {co_quan})</p>
<br>
<p>Nhân dịp tổ chức chương trình <strong>{ten_su_kien}</strong>, Ban Tổ chức Trung tâm SCE trân trọng kính mời {danh_xung} tới tham dự buổi <strong>Tiệc Chiêu Đãi Giao Lưu Thân Mật</strong> cùng Lãnh đạo Thành phố và các đại biểu khách quý.</p>
<p>⏰ <strong>Thời gian:</strong> Sau phiên bế mạc chương trình ({thoi_gian})</p>
<p>📍 <strong>Địa điểm:</strong> Sảnh Tiệc VIP - {dia_diem}</p>
<p>🍷 <strong>Bàn tiệc danh dự:</strong> Khu vực Bàn Tiệc VIP Trung tâm</p>
<br>
<p>Rất hân hạnh được đón tiếp {danh_xung}!</p>
<p>Cán bộ phụ trách lễ tân tiệc: <strong>{can_bo_lien_he}</strong> ({sdt_lien_he})</p>
```
seating_qr
```html
<p>Kính gửi: <strong>{danh_xung} {ho_ten}</strong></p>
<p>Cơ quan công tác: <strong>{co_quan}</strong></p>
<br>
<p>Ban Tổ chức xin gửi tới {danh_xung} thông tin chỗ ngồi và Thẻ Check-in điện tử phục vụ công tác đón tiếp tại sự kiện <strong>{ten_su_kien}</strong>:</p>
<div style="background: #f8fafc; border-left: 4px solid #2563eb; padding: 12px; margin: 12px 0;">
  <p>📍 <strong>Địa điểm:</strong> {dia_diem}</p>
  <p>⏰ <strong>Thời gian đón tiếp:</strong> {thoi_gian}</p>
  <p>🪑 <strong>Vị trí phân khu & Chỗ ngồi:</strong> <span style="color: #2563eb; font-weight: bold;">{so_ghe}</span></p>
</div>
<p>Đại biểu vui lòng xuất trình Thẻ có mã QR đính kèm thư này tại Bàn Lễ tân để được quét mã check-in tự động nhận tài liệu và huy hiệu đại biểu.</p>
<p>Hotline hỗ trợ dẫn chỗ: <strong>{can_bo_lien_he}</strong> ({sdt_lien_he})</p>
```
rsvp_reminder
```html
<p>Kính gửi: <strong>{danh_xung} {ho_ten}</strong> ({chuc_vu} - {co_quan})</p>
<br>
<p>Ban Tổ chức chương trình <strong>{ten_su_kien}</strong> xin phép được nhắc lịch và kính đề nghị {danh_xung} phản hồi xác nhận khả năng tham dự sự kiện (hoặc cử đại diện tham dự thay thế).</p>
<p>Sự kiện sẽ chính thức khai mạc vào lúc <strong>{thoi_gian}</strong> tại <strong>{dia_diem}</strong>.</p>
<p>Để Ban Tổ chức kịp thời hoàn tất công tác in biển tên để bàn chữ A, sắp xếp chỗ ngồi trang trọng và chuẩn bị tiệc chiêu đãi, kính mong {danh_xung} hồi đáp qua email này hoặc tin nhắn tới cán bộ phụ trách: <strong>{can_bo_lien_he}</strong> - Hotline: <strong>{sdt_lien_he}</strong>.</p>
<br>
<p>Trân trọng cảm ơn sự phối hợp của {danh_xung}!</p>
```
thank_you
```html
<p>Kính gửi: <strong>{danh_xung} {ho_ten}</strong></p>
<p>Đơn vị: <strong>{co_quan}</strong></p>
<br>
<p>Chương trình <strong>{ten_su_kien}</strong> diễn ra tại {dia_diem} đã thành công tốt đẹp. Ban Tổ chức Trung tâm Xúc tiến Đầu tư và Hỗ trợ Doanh nghiệp Hà Nội (SCE) xin trân trọng gửi lời cảm ơn sâu sắc nhất tới {danh_xung} đã dành thời gian quý báu tham dự và đóng góp tích cực cho sự kiện.</p>
<p>Ban Tổ chức xin gửi tới {danh_xung} kỷ yếu tóm tắt, hình ảnh hội nghị và tài liệu tham luận đã được số hóa đính kèm theo thư này.</p>
<p>Kính chúc {danh_xung} sức khỏe, hạnh phúc và thành công. Rất mong tiếp tục nhận được sự đồng hành của {danh_xung} trong các chương trình tiếp theo của Thành phố!</p>
<br>
<p>Trân trọng kính thư!</p>
<p><strong>GIÁM ĐỐC TRUNG TÂM SCE HÀ NỘI</strong></p>
```
custom
```html
<p>Kính gửi: <strong>{danh_xung} {ho_ten}</strong></p>
<p>Đơn vị: <strong>{co_quan}</strong></p>
<br>
<p>Nội dung thông báo gửi đại biểu...</p>
```

### 3.9 Sender resolution and Google auth

| Rule | Detail |
|---|---|
| Active sender | `selectedSenderEmailId==='personal'` → `{email: googleUser.email \|\| 'canbo.canhan@gmail.com', displayName: googleUser.name \|\| 'Cán bộ cá nhân' \| 'Cán bộ cá nhân (Chưa đăng nhập Google)', clientId: systemSettings.googleClientId \| ''}`; else the unit account with that id; else default; else first; else seed #1 |
| Initial selection | default account on first populate (in-memory initial 'unit_mail_1' never matches) |
| Client id | sender.clientId (trimmed) → systemSettings.googleClientId → localStorage 'sce_google_client_id' → '' |
| Live mode | `googleUser.accessToken` present (restored from sessionStorage on modal open, not validated) |
| Sandbox | otherwise; every "send" is simulated |
| Default unit flag | saving with isDefault clears the others; new record is default if list empty; deleting default promotes index 0; cannot delete last |

### 3.10 Recipient selection

| Rule | Detail |
|---|---|
| On modal open | clear selection; select every event guest with `email.includes('@')` (any RSVP) ; re-select all manual recipients (kept from earlier opens) ; filter 'all'; template 'invitation' applied |
| Guest without '@' | checkbox disabled; cannot be selected |
| Select all (guests) | only rows in current filter with '@' |
| Selected for send | guests in Set with '@' then manual in Set with '@', in list order |
| Manual add | regex `/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g` over the textarea; each lowercased; skip if already in manual list; name = name input, else text before `<email>` (`Name <email>` pattern), else local part; org = input \|\| 'Khách mời tự nhập'; title 'Đại biểu'; auto-selected |
| "Dùng email của tôi" | email = googleUser.email \|\| currentUser.email; name = googleUser.name \|\| profile.fullname \|\| 'Cán bộ phát hành thư'; org fixed 'Trung tâm Xúc tiến đầu tư và Hỗ trợ doanh nghiệp Hà Nội'; then add |
| Preview/test target | 1) selected recipient whose email equals the test address; 2) in manual tab, first selected manual; 3) in guests tab, first selected guest with '@'; 4) first selected overall; 5) synthetic officer `{id:'TEST-OFFICER', name, title 'Quản trị viên'\|'Chuyên viên', org 'Trung tâm Xúc tiến đầu tư và Hỗ trợ doanh nghiệp Hà Nội', email test\|googleUser\|'canbo@hanoi.gov.vn', group 'SoNganh', assignedSeat 'Khu vực Lễ tân Ban Tổ Chức'}` |
| Test address | googleUser.email, else browser `prompt('Nhập địa chỉ email của bạn để nhận thư thử nghiệm:')`; must include '@' ; subject prefixed `[THỬ NGHIỆM] ` |

### 3.11 Dispatch loop (L19692-19848)

```
idle --start(confirm)--> running
running --pause--> paused --resume--> running      (pause polled every 400 ms)
running|paused --cancel / close-modal-confirm--> stopping --(loop top check)--> done
running --last recipient--> done
```
Per recipient i: update progress (`(i+1)/n`), merge subject/body, attachments = user files + (if checkbox) generated QR card, send (live) or simulate, set emailStatus, log, re-render lists and guest table, then sleep 1200 ms (also after the last one). On done: restore buttons, status text, save appData (cloud), call `recordAuditLog` if defined (it is not, B27), summary dialog. No retry, no backoff, no token refresh, no daily-quota guard (B28).

### 3.12 Google Form sync (L20165-20345)

1. Require event.googleSheetUrl. CSV URL: keep as-is if it contains `tqx=out:csv` or `format=csv`; else spreadsheet id from `/spreadsheets/d/{id}` → `https://docs.google.com/spreadsheets/d/{id}/gviz/tq?tqx=out:csv`; a bare id of ≥20 chars `[A-Za-z0-9-_]` is accepted; else the raw text.
2. `fetch` (no auth). Non-2xx → error. Parse CSV (RFC-4180-ish: `""` escape, quotes toggle, `,` split, CR/LF row end outside quotes, cells trimmed, empty rows dropped).
3. Fewer than 2 rows → "Google Sheet trống" (not silent) and stop.
4. Column detection on lowercased header, first matching branch wins, in this order:

| Order | Test (substring) | Column |
|---|---|---|
| 1 | "thời gian", "timestamp" | timestamp |
| 2 | "họ", "tên", "name" → if also "thay"/"substitute"/"đại diện" then substitute else name (first only) | name / substitute |
| 3 | "email", "thư" | email |
| 4 | "thoại", "sđt", "phone", "mobile" | phone |
| 5 | "cơ quan", "đơn vị", "doanh nghiệp", "tổ chức", "công ty" | org |
| 6 | "chức vụ", "vị trí", "title" | title |
| 7 | "xác nhận", "tham dự", "rsvp", "tham gia" | rsvp |
| 8 | "tiệc", "banquet", "chiêu đãi" | banquet |
| 9 | "thay thế", "đi thay" | substitute |
| 10 | "ghi chú", "ý kiến", "note" | notes |

   No name and no email column → error "Không nhận diện được cột Họ tên hoặc Email trong Google Sheet."
5. For each data row with name or email: rsvp = parse(rsvpRaw): empty → pending; contains any of "không","bận","từ chối","vắng","no","declined" → declined; else any of "có","tham dự","đồng ý","xác nhận","chắc chắn","yes","attend" → confirmed; else pending. banquet = contains any of "có","yes","tham gia","đồng ý","dự tiệc".
6. Match (3.5). Matched → set rsvpStatus, hasBanquet, rsvpSource 'google_form', rsvpRespondedAt (timestamp text or now ISO); substituteName if provided; phone/email only if guest's is empty. Unmatched with name and `autoAddNewGuestsFromForm !== false` → push new guest `{id 'GF-…', name, title\|\|'Đại biểu', organization org\|\|'Đăng ký trực tuyến', email, phone, group: org contains 'sở' or 'ubnd' → SoNganh else DoanhNghiep, sendMethod 'email', inviteStatus 'sent', rsvpStatus, hasBanquet, substituteName, notes '{notes} | Nạp tự động qua Google Form', rsvpSource, rsvpRespondedAt}` (no seatCode field).
7. Cache all parsed rows in the global response cache; set event.lastFormSyncTime, formResponsesCount; save to cloud; re-render guest table and responses table. Return counts (confirmed/declined/banquet are counts over sheet rows, not guests).

Auto-sync: one global `setInterval` of 300,000 ms started 2 s after page load and re-armed on config save; each tick syncs only `module4State.selectedEventId` if that event has autoSync on and a sheet url; silent errors.

### 3.13 Rate limiting and limits

| Limit | Value |
|---|---|
| Spacing between messages | fixed 1200 ms (also after last) |
| Pause poll | 400 ms |
| Attachment per file | ≤ 25 × 1024 × 1024 bytes raw; no total cap |
| Suggest results | 8 |
| Form auto-sync | 5 min |
| Retries | none |

---

## 4. External side effects

### 4.1 Supabase

Only through `saveAppDataToSupabase(note)` (foundation, L6782). This module calls `syncModule4Storage(true)` with note "Cập nhật dữ liệu Phân hệ 4 (Khách mời / Gian hàng)" after every mutation: guest create/edit/delete, RSVP toggle, batch import, starter load, unit sender CRUD, client id save, dispatch end, form config save, every form sync (manual and auto), simulation. Each call upserts the whole appData row and writes a backup and an undo snapshot. No direct Supabase queries, no realtime, no RLS-aware split.

### 4.2 Google Identity Services and Gmail

| Item | Value |
|---|---|
| Script | `https://accounts.google.com/gsi/client` (async defer) |
| Client | `google.accounts.oauth2.initTokenClient({client_id, scope, callback})` (implicit token flow), recreated on modal open, sender change, client-id save, sign-in |
| Scopes | `https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email` |
| Request | `tokenClient.requestAccessToken({prompt:'consent', hint: sender.email})` |
| Callback | store token in sessionStorage, GET `https://www.googleapis.com/oauth2/v3/userinfo` with `Authorization: Bearer`, store `{name\|\|'Cán bộ SCE', email, picture, accessToken}` |
| Send | POST `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`, headers `Authorization: Bearer {token}`, `Content-Type: application/json`, body `{"raw": base64url(MIME)}`; error text = `error.message` or `HTTP {status}` |
| Sign-out | remove both sessionStorage keys; no token revoke |
| Expiry | not tracked |

MIME (`buildMimeMessage`, L19544-19591), joined with CRLF:
```
From: =?UTF-8?B?{b64(displayName)}?= <{email}>      (when from matches `"name" <email>`, else whole string encoded)
To: {to}                                          (raw, unencoded)
Subject: =?UTF-8?B?{b64(subject)}?=
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="==_SCE_MIME_{hex ts}_{6 hex}"

--{b}
Content-Type: text/html; charset=UTF-8
Content-Transfer-Encoding: base64

{b64(utf8 html)}                                  (single line, not wrapped at 76)

--{b}                                             (per attachment)
Content-Type: {type}; name="=?UTF-8?B?{b64(name)}?="
Content-Disposition: attachment; filename="=?UTF-8?B?{b64(name)}?="
Content-Transfer-Encoding: base64

{file base64 from FileReader data URL}

--{b}--
```
Whole string → `btoa(unescape(encodeURIComponent(s)))` → `+`→`-`, `/`→`_`, strip `=`.

QR check-in PNG attachment (`generateGuestQrCheckinBase64`, L19381-19460): 300×360 canvas, white; header band `#1e3a8a` 0-60 px with "THẺ ĐẠI BIỂU - CHECK-IN GIỜ G" (bold 12px, y 26) and "TRUNG TÂM SCE HÀ NỘI" (10px, y 45); QR 150×150 at (75,75) from qrcodejs into a hidden div, drawn after a 80 ms timeout; name bold 13px y 255; organization 11px y 275; "Số ghế: {assignedSeat}" if set (y 300); "Mã: {id}" y 330. Payload `SCE-CHECKIN:{guestId}:{name}:{eventId}` (B13). File name `The_CheckIn_{name with non [A-Za-z0-9] → _}.png`. Returns null when QRCode is missing.

### 4.3 Google Sheets

Unauthenticated GET of the gviz CSV endpoint (3.12). Requires "Anyone with the link can view". Form URL is only stored, copied (`navigator.clipboard.writeText`) and opened (`window.open(url,'_blank')`, no `noopener`).

### 4.4 QR generation

Library `qrcodejs 1.0.0` (cdnjs). `new QRCode(el, {text, width, height, colorDark:'#1e293b', colorLight:'#ffffff', correctLevel: M})`. Grid 64 px, print 56 px, email 150 px. Fallback when library missing or throws: a static decorative SVG that is not a real code (B35).

Payloads:

| Surface | Payload |
|---|---|
| Badge preview/print | `SCE-CHK:{eventId}:{guestId}` (eventId undefined when event missing) |
| Email PNG | `SCE-CHECKIN:{guestId}:{name}:{eventId}` |
| Printed text | `CHK-{last6(id).toUpperCase()}`, `ID: {last6}`, `Mã: {id}` |
| M5 scanner accepts | contains `SCE-CHK:` → `split(':')[2]` as guest id (eventId ignored); else id equal (ci), `id.endsWith(code.toUpperCase())`, phone equal, or name equal (ci) (L21171-21201) |

### 4.5 Printing

`window.print()` on the whole document. Only `print:hidden` Tailwind classes on the two modal header and theme bars (L3931, L3949, L3986, L4004). No `@media print`, no `@page`, classes `page-a4-landscape`/`page-a4-portrait` are undefined (B37). `page-break-after: always` inline per block. Colours rely on `print-color-adjust: exact` in inline styles.

Theme tokens (exact):

VIP namecard (`containerStyle` / `innerBorder` / header colour / name colour):

| theme | container background | inner border + bg | header | name |
|---|---|---|---|---|
| red_gold | `linear-gradient(135deg,#fffaf0 0%,#fef3c7 40%,#fff7ed 100%)` | `5px double #b45309`, `rgba(255,255,255,.94)` | #991b1b | #09090b |
| imperial_gold | `linear-gradient(135deg,#fffbeb 0%,#fef3c7 50%,#fde68a 100%)` | `4px double #b45309`, `rgba(255,255,255,.85)`, inset shadow `0 0 20px rgba(245,158,11,.15)` | #92400e | #451a03 |
| dong_son | `#fffdf9` + repeated SVG 240×240: circles r46 `#d97706` sw1.2, r36 `#b45309` dashed 3,2, r20 `#92400e`, all opacity .12; 8-point star polygon `50,15 53,40 75,50 53,60 50,85 47,60 25,50 47,40` `#b45309` opacity .08 | `4px double #92400e`, `rgba(255,255,255,.90)` | #9a3412 | #292524 |
| diplomatic_blue | `linear-gradient(135deg,#f8fafc 0%,#e0e7ff 50%,#f8fafc 100%)` | `4px double #1e3a8a`, `rgba(255,255,255,.92)` | #1e3a8a | #0f172a |
| classic_white | `#ffffff` | `4px double #dc2626`, `#fff` | #b91c1c | #000000 |
| custom (image set) | `#fff url(dataURL) center/cover no-repeat` | `3px double #d97706`, `rgba(255,255,255,.92)` | #991b1b | #0f172a |

Badge (`cardStyle` / header band / body):

| theme | card | header band | body |
|---|---|---|---|
| navy_sce | `linear-gradient(180deg,#fff 0%,#eff6ff 100%)`, `2px dashed #3b82f6` | `linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%)`, white | white, radius 8, pad 4 |
| red_prestige | `…#fff → #fef2f2`, `2px dashed #ef4444` | `#7f1d1d → #b91c1c`, white | same |
| modern_emerald | `…#fff → #ecfdf5`, `2px dashed #10b981` | `#064e3b → #059669`, white | same |
| dark_gold | `…#fff → #fefce8`, `2px dashed #f59e0b` | `#18181b → #27272a`, text #fef08a, bottom `2px solid #f59e0b` | same |
| clean_white | `#fff`, `2px dashed #94a3b8` | `#334155`, white | same |
| custom | `#fff url(dataURL) center/cover`, `2px dashed #64748b` | `rgba(15,23,42,.90)`, white | `rgba(255,255,255,.92)` |

Header line text in badge band is amber-300 "TRUNG TÂM XÚC TIẾN ĐẦU TƯ SCE".

Theme behaviour: selecting a theme re-opens (re-renders) the print modal. Selecting `custom` without an image triggers the hidden file input and returns. Upload reads as data URL, sets `custom`, shows status, re-renders. "(Xóa)" resets to the default theme. Nothing persisted.

### 4.6 Browser storage keys

`sce_tcsk_app_data`, `sce_tcsk_local_events`, `sce_google_client_id` (localStorage); `sce_google_access_token`, `sce_google_user` (sessionStorage).

### 4.7 Timers and listeners

| Timer | Where |
|---|---|
| Form auto-sync `setInterval` 300 s | L20580, armed at load +2 s (L20593) and on config save |
| Dispatch spacing 1200 ms, pause poll 400 ms | L19821, L19747 |
| QR PNG draw delay 80 ms | L19417 |
| Sandbox test send delay 1200 ms | L19680 |
| Global `document` click to close suggest dropdown | L13322 |

### 4.8 File I/O

Attachments: `FileReader.readAsDataURL`, keep base64 part. Print backgrounds: data URL in memory. Response export: CSV download `Phan_Hoi_Google_Form_{YYYY-MM-DD}.csv`, UTF-8 BOM, header `Dấu thời gian,Họ và tên,Cơ quan / Đơn vị,Chức vụ,Email,Số điện thoại,Xác nhận tham dự,Ăn tiệc,Người đi thay,Trạng thái đối soát`, RSVP text Tham dự/Từ chối/Chưa rõ, banquet Có/Không.

---

## 5. Dependencies

### 5.1 In (this module uses)

| Symbol | Owner | Use |
|---|---|---|
| `appData` (`events`, `eventGuests`, `eventSeating`, `eventHallConfig`, `hallTemplates`, `masterGuestDb`, `systemSettings`) | foundation | state |
| `currentUser` (Supabase user), `currentProfile` (`fullname`, `role`) | foundation/auth | merge tags, "my email", save gate |
| `saveAppDataToSupabase` | foundation L6782 | persistence |
| `escapeHtml` (escapes `& < > "`, not `'`) | foundation L8202 | rendering |
| `formatVNDate` | foundation L8368 | event selector |
| `switchMainTab` | shell L8013 | deep links |
| `Swal` | CDN | all dialogs |
| `QRCode` | CDN | QR |
| `google.accounts.oauth2` | GSI | OAuth |
| `removeVietnameseTones` | defined here L12873, also used by 4c and M5-style matching | tone folding |
| `ensureMasterGuestDb`, `DEFAULT_MASTER_GUEST_DB`, `getMasterGuestGroupBadge` | 4c (admin CRM) | suggest/picker/import |
| `DEFAULT_HALL_TEMPLATES`, `populateSeatingHallSelector`, `renderSeatingChart`, `getEventHallConfig`, `openAssignSeatModal`, `openAssignSeatModalForGuest` | 4b | init, sub-tab 3, seat cells |
| `generateStarterBoothsList`, `exportGuestListExcel` | 4c | starter load, export buttons |

### 5.2 Out (others use this module)

| Symbol / data | Used by |
|---|---|
| `module4State.selectedEventId` | 4b seating functions (L15761-16728), booths (L16988-17209), Excel export (L17948, L18009), M5 init default event (L20623), QR card payload |
| `renderModule4()` | undo/redo (L6132, L6172), `switchMainTab` (L8073), 4b (L16395, L16440, L16714, L16743), booths (L17196, L17228) |
| `initModule4()` | DOMContentLoaded (L8230) |
| `syncModule4Storage()` | 4b (L15807-16907), booths (L17193, L17226), 4c master CRUD (L13151-13209) |
| `ensureStarterDataForEvent()` | `openModule4Booths` (L18097) |
| `openModule4GuestList/Seating/Booths` | defined L18067-18100; no caller found for the first two (dead) |
| `appData.eventGuests[eventId]` | M5 check-in, walk-in, gifts (L20777-21279), M6 reports (L22138, L22222, L22644), Excel export (L17336+), 4b seating |
| Guest fields `rsvpStatus`, `group`, `hasBanquet`, `seatCode`, `substituteName` | M5, M6, 4b, export |
| `renderAdminUnitEmailsSection()`, `openUnitEmailManagerModal`, `openUnitEmailEditModal` | admin settings render (L6886), admin tab card (L844-851) |
| QR payload `SCE-CHK:{eventId}:{guestId}` | M5 `processScannedCode` |

Contract the rewrite must freeze for 4b/4c/M5/M6: `EventGuest` shape (2.2), seat dual-write (`guest.seatCode` and `eventSeating[event][seatCode]=guestId`), the canonical QR payload, and a `GuestRepository` (list/get/upsert/delete per event) instead of shared mutable `appData`.

---

## 6. Bugs and logic flaws

Severity: Critical, High, Medium, Low. "Inferred" means read from code, not executed.

### Security

| # | Sev | Where | What is wrong | Intended |
|---|---|---|---|---|
| B01 | Critical | L20402-20412 | Form responses table renders `timestamp`, `name`, `org`, `email`, `phone`, `matchedGuestName` from a public Google Sheet via `innerHTML` unescaped. Anyone who can submit the public form runs script in staff sessions | Render as text |
| B02 | Critical | L18891-18896, L20284-20301, L18677, L18712 | Bulk email recipient list renders guest `name`, `title`, `organization`, `email` unescaped. Form auto-add stores attacker text as a guest and saves it to Supabase, so it becomes stored XSS for every staff member who opens the email modal, where the Gmail access token sits in sessionStorage (token theft, mail sent as the unit) | Escape; keep tokens out of JS-readable storage |
| B03 | High | L19307-19309, L19534 | Merge tags substitute raw guest data into the HTML body. Sent mail from an official account carries injected markup or links, and the preview pane executes it via `innerHTML` | HTML-escape tag values; sanitise the template; preview in sandboxed iframe |
| B04 | High | L19558, L18619, L18941, L20046-20064 | `To: ${to}` is written raw. The only email check is `includes('@')`, and CSV quoted cells may contain CR/LF, so a form submitter can inject headers (for example `Bcc:`) | Validate addresses strictly (RFC 5322 subset, no CR/LF), encode display names |
| B05 | Medium | L19605 (callers L18326, L19800, L19806, L19812) | Log console uses `innerHTML` with guest names, sender names and error messages | textContent |
| B06 | Low | L18728-18735, L19366, L18285 | Google profile picture/name/email and attachment file names rendered unescaped | Escape |
| B07 | Medium | L4486, L4497, L18329, L18424, L18483, L18801 | Sender-account management and global Client ID editing are open to every user from the email modal. Only the admin tab itself is gated (L6387-6391). All checks are client-side | Admin-only UI and server-side authorisation (RLS or API) |
| B08 | Medium | L18590-18599, L18677, L18710-18712, L18789-18794 | Access token stored twice in sessionStorage, restored without expiry check (UI shows "Đã kết nối" with a dead token), never revoked on sign-out | Short-lived token in memory or server-side send; revoke on sign-out; track `expires_in` |
| B09 | Low | L8202-8205, L14605-14627, L18888, L13297, L13038 | `escapeHtml` does not escape `'`; ids are interpolated raw into `onclick='…'`. Ids are internal today, so not exploitable yet | Event handlers in components, no string handlers |

### Data integrity and logic

| # | Sev | Where | What is wrong | Intended |
|---|---|---|---|---|
| B10 | Critical | L13794-13797 (callers L13701, L13732, L18073, L18085, L18097) | Any event whose guest list is empty is silently filled with 22 sample guests (real officials' names, phones, emails), 16 booths and seats. This happens on app start, event switch and deep links. Deleting the last guest refills on the next switch, and the next save pushes it to the cloud | Never seed implicitly; demo data only behind an explicit action in a demo environment |
| B11 | High | L14389-14391, L14368-14385 | "Nạp Mẫu Chuẩn" replaces the event's guests, booths and seating outright. The dialog says "nạp" and never warns that existing data is lost | Disallow on non-empty events or warn plus require typed confirmation; better remove from production |
| B12 | High | L19801-19807, L19835, L19678-19688 | Sandbox mode (not signed in) marks every recipient `emailStatus='sent'` with a timestamp and saves to the cloud. Guests appear emailed when nothing was sent | Dry run must not mutate state; label clearly |
| B13 | High | L19384 vs L21175-21183 | Emailed QR cards encode `SCE-CHECKIN:{guestId}:{name}:{eventId}`. The scanner only parses `SCE-CHK:` and its fallbacks cannot match this string, so emailed cards never check in | One canonical payload `SCE-CHK:{eventId}:{guestId}` everywhere |
| B14 | High | L20494-20531, L5079 | "Nạp phản hồi giả lập mẫu (Sandbox Demo)" overwrites RSVP, banquet and substitute of the first three real guests, adds a fake guest, and saves to the cloud | Remove from production or operate on a throwaway copy |
| B15 | High | L20147, L20159, L20274-20275 | When the sheet has no RSVP or banquet column, every matched guest is reset to `pending`/no banquet. Every sync (every 5 min with auto-sync) re-applies the whole sheet and overwrites staff edits made since | Apply only fields present; apply a response only if newer than the guest's last applied response; never overwrite manual edits silently |
| B16 | Medium | L20091, L20102-20103 | Header classification is first-match. A banquet question containing "tham dự"/"tham gia" (for example "Anh/chị có tham dự tiệc chiêu đãi?") becomes the RSVP column. "Tên cơ quan" before "Họ tên" becomes the name column | Explicit column mapping UI with auto-guess, saved per event |
| B17 | Medium | L20146-20156, L20278 | RSVP parsing by substring: "no" matches English words; "Có, nhưng không dự tiệc" → declined; a filled substitute never yields `substituted` | Map the form's fixed choice values; substitute present → substituted |
| B18 | Medium | L14687-14693 vs L14793, L20274; L5157 | Only the inline select frees the seat on "declined". The modal and the form sync keep the seat, although the modal footer promises an instant hall update | One RSVP transition function with the side effect |
| B19 | Medium | L20133-20139, L20127 | Name-only match updates the first guest with the same folded name (homonyms are common). Phone match by last 8 digits | Require email or phone, or a confirm step for name-only matches |
| B20 | Medium | L20024-20026 | The sheet `gid` is dropped, so gviz reads the first tab, which may not be the responses tab | Keep `gid` (`&gid=`) or let the user pick the tab |
| B21 | Medium | L19878, L20315, L19959 | The response cache is global, not per event. After an event switch the modal shows the previous event's responses and count | Cache per event, or reload on open |
| B22 | Medium | L20573-20596, L20319, L6782-6786, L6817 | Auto-sync runs from page load for whichever event is selected, regardless of tab or login. Every tick upserts the entire appData, writes a backup, and pushes an undo snapshot even when nothing changed. Other events never auto-sync | Server-side scheduled sync per event, write only on change |
| B23 | High | L14428, L9101, L10452 | KPI target reads `event.expectedDelegates`, which nothing writes. Events store `targetGuests`, so the target is always 100 | Use `targetGuests` (and decide quota %, Q2) |
| B24 | Medium | L19283-19288, L19433 | Merge tags read non-existent fields. `{thoi_gian}` uses `event.date` (events have `eventDate`/`eventTime`), so every mail says "08:30 ngày 15/11/2026". `{so_ghe}` uses `assignedSeat` (guests have `seatCode`). `{can_bo_lien_he}` uses `currentUser.full_name` (it lives in `user_metadata`/profile). `{sdt_lien_he}` is a hardcoded phone. `{ten_su_kien}` tries `title` first | Read the real fields; contact name/phone configurable per event |
| B25 | Medium | L4669, L19291-19305, L5005 | `{link_google_form}` chip exists and the form modal promises the link is auto-attached, but the tag is never substituted, so recipients get the literal text | Substitute `event.googleFormUrl`; warn when unset |
| B26 | Low | L19264, L19289, L19302 | `honorific`/`danhXung`/`qrCode` are never written; `{ma_qr_checkin}` has no chip | Drop or add to the model |
| B27 | Medium | L19838-19840 | `recordAuditLog` is not defined anywhere, so bulk sends are never audited; the message also uses `eventData.title` (empty) | Write an audit entry (who, sender, event, counts) |
| B28 | Medium | L19783-19813, L19821, L19701 | No retry or backoff for 429/5xx, no handling of 401 token expiry (implicit tokens last about 1 h), no Gmail daily-quota guard. `isLive` is computed once; signing out mid-run throws on `googleUser.accessToken` for every remaining recipient. Waits 1.2 s after the last message | Server-side queue with retry and backoff, token refresh, quota awareness |
| B29 | Medium | L19773-19774, L18675-18687, L18781 | `From` is set to the selected unit address, but the mail goes through `users/me` of whatever account consented. There is no check that the signed-in account equals the sender; Gmail rewrites or rejects non-alias From | Verify `googleUser.email === sender.email` (or a verified send-as alias) before sending |
| B30 | Medium | L19320, L19766, L19587 | 25 MB is checked per raw file; no total cap; base64 adds about 33 %, so a 20 MB file already exceeds Gmail's 25 MB message cap. All files are re-encoded in memory for each recipient | Enforce a total encoded-size cap; use the upload endpoint or Drive links |
| B31 | Low | L19057, L19062 | Manual recipients are deduped only within the manual list (the same address can get two mails). The name-extraction RegExp is built from the unescaped email (`.`, `+` are metacharacters) | Dedupe across all selected recipients by normalised email; escape the regex |
| B32 | Low | L18618-18622 | Opening the modal pre-selects every guest with an email, including declined guests | Default by template (for example reminders only to pending) |
| B33 | Medium | L19797-19798, L14600-14603 | A successful email does not update `inviteStatus`/`sendMethod`, and `emailStatus` is not shown in the guest table, so the "Giấy Mời" column does not reflect sent invitations | Set invite sent (Q4) and show delivery status |
| B34 | Medium (inferred) | L19417-19420 | The QR image is drawn after a fixed 80 ms; qrcodejs's `<img>` may not be decoded yet, giving a blank QR in the attachment | Generate QR as data URL synchronously (or await image load) |
| B35 | Medium | L15013-15050 | When QRCode is missing or throws, a decorative fake QR SVG is printed that looks real but cannot be scanned | Show an explicit error; bundle the QR library |
| B36 | Medium | L14973, L15314, L15699 vs L21184 | Printed codes `CHK-XXXXXX` / `ID: XXXXXX` cannot be typed into the scanner: it never strips `CHK-` and compares `id.endsWith(code.toUpperCase())` against lowercase ids | Short code stored on the guest, case-insensitive lookup |
| B37 | High (inferred) | L3941, L3996, L3930, L3977, L3985, L4032, L15519, L15683 | `window.print()` prints the whole app; there is no print stylesheet or `@page`; the content sits in a `max-h-[96vh] overflow-y-auto` box inside a fixed overlay, so multi-page batches print only the visible part. The claimed physical sizes (10×28 cm table tent, 9×13 cm badge) are not encoded: blocks are px-sized (max-width 900 px, min-height 460 px; badge min-height 280 px) | Dedicated print route with `@page` sizes and mm/cm units |
| B38 | Medium | L14878, L15269, L15507 vs L14483, L14508; L14942 | VIP namecard set is `VIP OR seat starts 'A-'` but KPI card 3 and the sub-tab badge count `group==='VIP'` only, so counts disagree with what prints. A non-VIP in row A gets a namecard and a badge. The `'A-'` prefix is hardcoded while zones are configurable (4b) | One selector, VIP from group (or a zone flag), used by KPI and print |
| B39 | Medium | L14491, L15129, L15226, L15330, L15358 | Banquet counts include declined guests. Legacy `g.banquet` checks are dead, and L15358 uses a different predicate from L14491 | Banquet = hasBanquet AND attending |
| B40 | Medium | L14718-14721, L13655-13656 | New guests default to RSVP `confirmed`, invite `sent`, banquet checked; batch import forces `confirmed`/`sent`. KPIs report confirmations nobody gave | Default pending/pending/false (Q4) |
| B41 | Low | L14798-14817, L13631-13642, L20112-20143 | Three different dedupe rules; manual create allows duplicates; batch import overwrites group/title/phone/email silently and keeps no link to the master id | Single identity rule plus `masterId` link |
| B42 | Low | L13817-14152, L13647, L14801 | Starter guest ids are fixed and shared across events; generated ids use `Date.now()` + 4 base36 chars | UUIDs |
| B43 | Low | L1670 vs L14501, L14492; L1602, L1606, L1650; L6070-6071, L22142 | Card 4 note "VIP đã bố trí chỗ" is replaced by "Ghế đã xếp" counting all seat-map keys (stale keys included). Element ids still say 130/120. Quota settings unused here while reports hardcode 1.3 | Count seated guests from guest records; one quota source |
| B44 | Low | 2.1 table; L1634 vs L14479 | RSVP labels differ across six surfaces ("Chưa liên hệ" in HTML, "Chờ phản hồi" in JS; "Báo vắng" vs "Từ chối") | One label map |
| B45 | Low | L14548-14556, L15106-15112, L18850-18854 | Main search is case-insensitive but not tone-insensitive (master search is); popup search ignores email; email search ignores title/phone; RSVP "pending" filter on the main table misses empty status but the popup includes it | One search/filter function |
| B46 | Low | L14412, L14758 | With no events, `renderModule4` returns early and leaves stale KPIs; saving a guest with no event fails silently | Empty state "Chưa có sự kiện" and disabled actions |
| B47 | Low | L14958, L15685, L15657, L19117, L19498, L18116 | Organisation and year strings hardcoded ("SCE EVENT 2026", "TRUNG TÂM XÚC TIẾN ĐẦU TƯ SCE", centre name) instead of `systemSettings.agencyName` | Read agency settings |
| B48 | Low | L12177, L18575, L18215, L19030-19031, L15393, L18067-18089, L20012-20014, L20574, L20592 | Dead code: `'subtab-booths'` comment, initial sender id `'unit_mail_1'`, `DEFAULT_UNIT_SENDER_EMAILS` alias, missing `manualRecipientTitleInput`, `dietaryNotes`, uncalled `openModule4GuestList/Seating`, unreachable "save only" branch of `saveGoogleFormRsvpConfig`, Node `process` guards, pervasive `typeof fn === 'function'` guards | Delete |
| B49 | Low | L20551-20563, L20568 | Response export does not escape quotes (broken rows, CSV formula injection from form text), is labelled "Xuất Excel" but writes CSV, never revokes the object URL | Proper CSV/XLSX writer with escaping and `=+-@` neutralisation |
| B50 | Low | L1597, L1618, L1641, L1659; L3695, L3944, L3999, L4066, L4136, L4184, L4272, L4455, L4781, L4826, L4881, L4952, L5915, L5975 | KPI cards are clickable `div`s with no role, tabindex or key handling; icon-only close buttons have no `aria-label`; modals have no focus trap, no Esc, no `aria-modal`; RSVP state conveyed by colour in selects | Accessible dialog and button primitives |
| B51 | Low | L1738-1755, L4095-4110, L4529, L4624 | 9-column and 7-column tables only scroll horizontally on phones (the comment promises a "Mobile Stack" that does not exist); bulk email columns have fixed `h-[400px]`/`h-[520px]` on mobile | Card list layout under md |
| B52 | Low | L15411-15415, L15567-15571, L15404, L15454, L15610 | Choosing "Tùy chỉnh" without an image opens the file picker; cancelling leaves the selector on "custom" while rendering the default theme. Custom images are memory-only and the data URL is inlined into every card | Separate upload action; store image once (asset) and reference it |
| B53 | Low | L13199, L13211 (4c) | Master DB reset says "38 đối tượng" but seeds 41 | Attributed to 4c |
| B54 | Medium | L6797-6806 | Every save upserts the entire app JSON in one row (`id: 1`); two staff editing guests concurrently lose each other's RSVP updates (last write wins). Foundation issue with direct impact here | Per-entity tables (guests per event) with row-level updates |
| B55 | Low | L21269 vs L3783, L13939 | M5 walk-in writes `substituteName: 'Đi thay cho: X'` (the absent person), inverting this module's meaning (the attending substitute) | Separate fields `substituteName` and `substitutesForGuestId` |
| B56 | Low | L19612 | Test send falls back to blocking `window.prompt` | Inline input |
| B57 | Low | L14851-14853 | Delete removes `eventSeating[guest.seatCode]` without checking it still points to this guest; seat state is duplicated in two places | Single source of truth for seat assignment (4b contract) |
| B58 | Low (inferred) | L20026 | gviz CSV infers column types; numeric-looking phone columns can lose leading zeros or blank text cells, so new guests get malformed phones. Not run | Use `export?format=csv&gid=` or Sheets API |
| B59 | Low | L14389-14391 vs L14376 | Dialog promises "Tự động xếp chỗ Hội trường Khu A/B/C" but seats are copied from fixed codes that may not exist in the event's configured hall | Validate seats against hall config (4b) |

Bug count: 59 (B01-B59).

---

## 7. Rewrite notes

### 7.1 Feature breakdown (build order)

1. Guest domain package. Types (2.2), label maps (2.1), `rsvpTransition()` with seat release, `isAttending`, `isBanquet`, `vipSelector`, identity/dedupe (one rule), search/filter (tone-folded). Pure, unit-tested.
2. Guest repository. Per-event CRUD behind an API (Supabase table `event_guests` with RLS). No implicit seeding.
3. Guests page. Event selector, KPI cards, sub-tab nav (URL state, for example `/events/[id]/guests?tab=list`), guest table with inline RSVP, filters, empty states.
4. Guest form dialog. Validation (zod), master suggest and picker, `masterId` link.
5. Batch import dialog.
6. KPI popups (four list dialogs on one list primitive).
7. Print studio. Preview grids plus a dedicated print route (`/print/namecards`, `/print/badges`) with `@page` sizes, cm units, theme tokens (4.5), server-generated QR (SVG via a maintained library).
8. Google Form integration. Config per event, column-mapping step, server-side fetch and sync job (cron or Edge Function), idempotent application keyed by response timestamp + row hash, responses table.
9. Email dispatch. Templates and merge (escaped), recipient picker, preview in sandboxed iframe, test send, server-side queue (Edge Function or Route Handler) with Gmail send, retries, backoff, audit log, delivery status per guest and per campaign.
10. Sender accounts admin (admin-only).

### 7.2 Shared UI primitives seen

Modal shell (icon tile + title + subtitle + close; footer with secondary/primary), confirm dialog, toast (top-end), KPI stat card with progress bar, group/RSVP/invite/send-method badges, segmented tabs (pill and underline variants), filter pills, search input with icon, select, checkbox list with select-all, data table with sticky header and empty row, empty-state block (icon + heading + text + actions), file picker chip list, progress bar, log console, theme picker, QR code.

### 7.3 Architecture notes

- Gmail. The OAuth client id is public. The token today is browser-only. A server-side sender (offline refresh token per unit account, stored encrypted) fixes B08, B28, B29 and survives page reloads; the trade-off is a Google verification of the `gmail.send` scope for the unit accounts. If kept client-side, hold the token in memory, check `expires_in`, re-request on 401, and verify the account equals the sender.
- QR payload. Freeze `SCE-CHK:{eventId}:{guestId}` and a short human code stored on the guest. Shared with M5.
- Seat assignment. Agree with 4b on one source of truth (guest.seatCode or a seat table), not both.
- Starter data. Move the 22 rows (2.3) into a dev-only fixture script.

### 7.4 Open product questions

| # | Question |
|---|---|
| Q1 | Keep sample data at all? It contains real officials' names and contacts. Recommendation: dev fixture only |
| Q2 | KPI target: `targetGuests` at 100 %, or `targetGuests × guestQuotaPercent` (130 %)? Badges at `badgeQuotaPercent` (120 %)? Reports currently use 130 % |
| Q3 | Keep "Sandbox" mode? Recommendation: a dry-run preview that never changes guest state |
| Q4 | Defaults for a new or imported guest: RSVP pending? invite pending? banquet off? Should a successful email set invite `sent` and send method `email`? |
| Q5 | Should Google Form responses override a status staff edited by hand? Which wins, latest timestamp or manual lock? |
| Q6 | Who may manage unit sender accounts and Client IDs (admin only, or leaders too)? |
| Q7 | VIP definition for name cards: group VIP only, or any guest seated in a VIP zone (zone flag from 4b)? |
| Q8 | Should the table tent carry the national motto "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM / Độc lập - Tự do - Hạnh phúc"? It is unusual on a name card |
| Q9 | Contact person and hotline in emails: per event, per sender, or per user profile? |
| Q10 | Should declined guests release seats and drop banquet everywhere, including form sync? |
| Q11 | Should manual recipients and email campaigns be persisted (campaign history, per-recipient log)? |
| Q12 | Should a filled substitute name in the form set RSVP to `substituted`? |
| Q13 | Required: email format and phone format validation rules (Vietnamese numbers with dots)? |
| Q14 | Print custom backgrounds: persist per event (storage bucket) or session only? |
