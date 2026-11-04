# Module 4c: Guest-list export, cross-links, Master Guest CRM, bulk email, Google Form RSVP

Source: `/Users/ngotuananh/ProjectCode/SEC/tochucsukien/code/index.html` (22,715 lines). All `L<n>` refs are lines in that file.

## 0. Scope and what the assigned range actually contains

The brief assumed the CRM sits after the cross-links. It does not. Actual layout:

| Range | Content | Owner |
|---|---|---|
| L1039-1136 | HTML tab `mainTab-admin-guests` (Master Directory) | 4c |
| L3683-3811 | `crmGuestModal` guest add/edit form. Hosts the CRM auto-suggest input `crmGuestName`, dropdown `crmGuestSuggestDropdown`, button "Tra cứu CSDL" | form = 4a, suggest hooks = 4c |
| L3812-4431 | `crmBoothModal`, `assignSeatModal`, `customizeZonesModal`, `adminHallTemplatesModal`, `editHallTemplateModal` (4b). `printNameCardsModal`, `printBadgesModal`, `guestListPopupModal` (has a 2nd `exportGuestListExcel()` button at L4059), `confirmedGuestsPopupModal`, `namecardsAndBadgesPopupModal`, `banquetGuestsPopupModal` (4a) | 4a / 4b |
| L4438-4809 | `bulkEmailModal`, `bulkEmailPreviewModal` | 4c (in JS range) |
| L4810-4934 | `unitEmailManagerModal`, `unitEmailEditModal` | 4c |
| L4935-5135 | `googleFormRsvpModal` | 4c |
| L5804-6030 | `masterGuestModal`, `masterGuestPickerModal`, `batchImportMasterModal` | 4c |
| L836-858 | Admin settings card "Cấu Hình Hòm Thư Google & Client ID Gửi Thư" + `adminUnitEmailsContainer` (inside `mainTab-admin`, module 1) | 4c renders it |
| L12308-13681 | CRM JS: seed `DEFAULT_MASTER_GUEST_DB`, CRUD, CSV export, live auto-suggest, picker, batch import | 4c |
| L13682-13800+ | `initModule4`, `populateCrmEventSelector`, `onCrmEventChange`, `switchCrmSubTab`, `syncModule4Storage`, `ensureStarterDataForEvent` | 4a (4c depends on them) |
| L17242-18006 | Guest-list export: label helpers, `loadExcelJsLibrary`, `generateStyledXlsx`, `exportStyledHtmlSpreadsheet`, `exportGuestListExcel` | 4c |
| L18008-18061 | `exportBoothsExcel` (CSV of booths) | lives here, functionally 4b |
| L18063-18101 | Cross-links `openModule4GuestList/Seating/Booths` | 4c |
| L18103-19870 | Section "8.E" Bulk email dispatcher via Gmail API (templates, sender mailboxes, GIS OAuth, recipients, mail merge, attachments, QR card PNG, MIME, test send, dispatch loop) | 4c by range. Architect: confirm no other unit also owns it |
| L19872-20599 | Section "8.F" Google Form RSVP sync (config, Sheet CSV fetch, CSV parser, column detection, matching, auto-add, responses table, simulation, CSV export, 5-min timer) | 4c by range. Same caveat |
| L20603+ | Module 5 | not 4c |

There is **no CSV/XLSX file import** anywhere in the app (only `type="file"` inputs are image uploads at L3968, L4023 and email attachments at L4692). "Import" in this unit means (a) batch copy from Master DB into an event, (b) fetching a Google Sheet as CSV.

---

## 1. Purpose and screens

### 1.1 Admin tab "Quản trị CSDL khách & doanh nghiệp" (`mainTab-admin-guests`, L1039-1136)

Purpose: shared, cross-event directory of contacts (VIP leaders, departments, enterprises, international guests, press). Used to auto-suggest and batch-fill event guest lists.

Entry points:
- Sidebar button `tabBtn-admin-guests` (L326), label "CSDL Khách & DN", tooltip "Quản trị CSDL khách & doanh nghiệp dùng chung (Master Directory)". Calls `switchMainTab('tab-admin-guests')` then `toggleSidebar(false)`.
- Admin settings button "CSDL Khách & DN" (L580) calls `scrollToMasterGuestDbSection()` (L12924), which just calls `switchMainTab('tab-admin-guests')`.
- `switchMainTab` (L8011) maps `tab-admin-guests` to `admin-guests`, active sidebar color `bg-emerald-700`, calls `renderMasterGuestDbUI()` (L8080). Top bar meta (L7974): title "Cơ Sở Dữ Liệu Khách Mời & Doanh Nghiệp", shortTitle "CSDL Master", subtitle "CSDL danh bạ dùng chung 5 nhóm đối tượng chuẩn hóa phục vụ tra cứu và tự động gợi ý."

Layout, top to bottom:
1. Header card. Icon `fa-address-book` emerald tile. Title "Cơ Sở Dữ Liệu Khách Mời & Doanh Nghiệp (Master Directory)", pill "Toàn Hệ Thống". Description: "CSDL dùng chung chuẩn hóa các đối tượng đầu mối: VIP Lãnh đạo TP, Khối Sở ngành, Doanh nghiệp & HTX, Tổ chức Quốc tế và Cơ quan Báo chí. Khi lập danh sách tại mỗi sự kiện sẽ tự động đối chiếu và gợi ý."
2. Actions (right):
   - "Thêm Đối Tượng Mới" (primary emerald, `fa-plus-circle`) → `openCreateMasterGuestModal()`.
   - "Xuất Excel" (secondary, label hidden < sm, tooltip "Xuất toàn bộ CSDL ra file Excel") → `exportMasterGuestDbExcel()`. Produces **CSV**, not xlsx.
   - "Khôi Phục Mẫu" (secondary, `fa-rotate-left` amber, tooltip "Khôi phục danh bạ mẫu chuẩn SCE (38 đối tượng thực tế)") → `resetDefaultMasterGuestDb()`.
3. Group filter pills (horizontal scroll), each with count badge `masterBadgeCount-<g>`:
   `all` "Tất cả", `VIP` "⭐ Đại biểu VIP", `SoNganh` "🏛️ Khối Sở ngành", `DoanhNghiep` "💼 Doanh nghiệp & HTX", `QuocTe` "🌐 Khách Quốc tế", `BaoChi` "📰 Báo chí, Truyền hình". Active pill: emerald bg, white text, bold, badge `bg-white/20`. Inactive: slate.
4. Search input `masterGuestSearchInput`, placeholder "Tìm kiếm nhanh theo họ tên, chức danh, cơ quan, điện thoại, email...", `oninput` re-renders table (no debounce).
5. Table (max-h 500px, sticky header). Columns: "STT" | "Nhóm" | "Họ và Tên & Chức Danh" | "Cơ Quan / Doanh Nghiệp & Địa Chỉ" | "Liên Hệ" | "Nghi Thức / Tiệc VIP" | "Thao Tác".
   Row cells (L13010-13048): index+1 (of filtered list); group badge; bold name + title line; org + optional address with `fa-location-dot`; optional phone (mono, `fa-phone`) + optional email (truncate 150px); banquet badge "Tiệc VIP" (`fa-wine-glass`, amber) or "-" plus notes (italic, truncate 160px, `title` = full notes); actions: edit (`fa-edit`, title "Chỉnh sửa đối tượng CSDL") → `openEditMasterGuestModal(id)`, delete (`fa-trash-alt`, title "Xóa khỏi CSDL Master") → `deleteMasterGuest(id)`.
   Empty state (colspan 7): `fa-folder-open` + "Không tìm thấy đối tượng nào phù hợp trong CSDL Master."

Group badge (`getMasterGuestGroupBadge`, L12893): VIP amber `fa-star` "VIP"; SoNganh blue `fa-landmark` "Sở ngành"; DoanhNghiep emerald `fa-briefcase` "Doanh nghiệp"; QuocTe purple `fa-globe` "Quốc tế"; BaoChi rose `fa-newspaper` "Báo chí"; other slate "Khác".
Group long name (`getMasterGuestGroupName`, L12910): VIP "Đại biểu VIP"; SoNganh "Khối Sở ban ngành & Quận huyện"; DoanhNghiep "Doanh nghiệp & HTX"; QuocTe "Khách Quốc tế / Ngoại giao"; BaoChi "Báo chí, Truyền hình"; else "Khác".

### 1.2 Modal `masterGuestModal` (L5804-5899)

Title `masterGuestModalTitle`: create "Thêm Đối Tượng CSDL Master", edit "Cập Nhật Hồ Sơ CSDL Master". Subtitle "Hồ sơ dùng chung tự động gợi ý cho toàn hệ thống". Close X.
Form `masterGuestForm` (submit → `saveMasterGuest`). Two-column grid rows:
- "Họ và Tên Đại Biểu / Đầu Mối *" `masterGuestName` (required, placeholder "Ví dụ: Trần Sỹ Thanh") | "Nhóm Đối Tượng *" `masterGuestGroup` select: VIP "⭐ Đại biểu VIP (Lãnh đạo TP, Bộ ngành)", SoNganh "🏛️ Khối Sở ban ngành & Quận huyện", DoanhNghiep "💼 Doanh nghiệp & HTX", QuocTe "🌐 Khách Quốc tế / Ngoại giao", BaoChi "📰 Báo chí, Truyền hình".
- "Chức Vụ / Chức Danh" `masterGuestTitle` | "Cơ Quan / Doanh Nghiệp *" `masterGuestOrganization` (required).
- "Số Điện Thoại Liên Hệ" `masterGuestPhone` (text, placeholder "09xx.xxx.xxx hoặc 024.xxxx.xxxx") | "Hộp Thư Điện Tử (Email)" `masterGuestEmail` (type=email).
- "Địa Chỉ Trụ Sở / Cơ Quan" `masterGuestAddress` (placeholder "Địa chỉ chuyển phát giấy mời") | "Mã Số Thuế / Ngành Nghề" `masterGuestTaxCode`.
- Toggle row: "Mặc định tham dự Tiệc Chiêu Đãi & Xếp chỗ VIP" / "Tự động tích chọn có tiệc chiêu đãi khi đưa vào sự kiện" checkbox `masterGuestHasBanquet`. Create default: **checked**.
- "Ghi Chú Nghi Thức & Lễ Tân Đón Tiếp" textarea `masterGuestNotes` rows 2.
- Footer: "Hủy", submit "Lưu Đối Tượng".

### 1.3 Live auto-suggest in guest form (4a's `crmGuestModal`, hooks L3700-3711)

- Label row: "Họ và Tên Đại Biểu *" + link button "Tra cứu CSDL" (title "Tra cứu nhanh toàn bộ CSDL Khách mời & Doanh nghiệp") → `openMasterGuestPickerModal()`.
- Input `crmGuestName` `autocomplete=off`, placeholder "Gõ tên để tự động đối chiếu & gợi ý từ CSDL...", `oninput` → `handleCrmGuestNameSuggest(value)`, `onfocus` → `handleCrmGuestNameFocus(value)` (suggest only if non-blank).
- Dropdown `crmGuestSuggestDropdown` (absolute, under input):
  - Empty query: hidden, cleared.
  - No match: "Chưa có trong CSDL Master" / "Bạn có thể tiếp tục nhập mới hoặc bấm **Tra cứu CSDL**".
  - Matches: header "Gợi ý đối chiếu từ CSDL Master (N)" + "Xem tất cả" (opens picker). Up to 8 rows: group badge, bold name, "title - organization", optional phone (mono), right chip "Chọn". Row click → `selectMasterGuestForCrm(id)`.
- Global `document` click listener (L13322): hides dropdown when click is outside dropdown and not on the input.
- `selectMasterGuestForCrm` (L13332) fills `crmGuestName`, `crmGuestGroup` (default VIP), `crmGuestTitle`, `crmGuestOrganization`, `crmGuestPhone`, `crmGuestEmail`; `crmGuestNotes` only when master notes non-empty; `crmGuestHasBanquet` when defined. Hides dropdown. Toast "✓ Đã nạp thông tin từ CSDL: {name} ({organization})" 2s. Does not copy address, taxCode. Does not store a master link on the guest.

### 1.4 Modal `masterGuestPickerModal` (L5903-5960)

Title "Tra Cứu & Chọn Từ CSDL Master", subtitle "Chọn 1 đối tượng để tự động điền nhanh toàn bộ thông tin".
- Search `pickerSearchInput` placeholder "Gõ tên đại biểu, chức danh, cơ quan, số điện thoại...".
- Pills `pickerFilterBtn-<g>`: "Tất cả", "⭐ VIP", "🏛️ Sở ngành", "💼 Doanh nghiệp", "🌐 Quốc tế", "📰 Báo chí" (no counts).
- Table: "Nhóm" | "Họ và Tên & Chức Danh" | "Cơ Quan / Doanh Nghiệp" (+address) | "Liên Hệ" (phone, email) | "Chọn" (button "Chọn" → `selectMasterGuestFromPicker(id)` = select + close).
- Empty (colspan 5): "Không tìm thấy đối tượng nào."
- Footer `pickerCountLabel` "Hiển thị {filtered} / {total} đối tượng", button "Đóng".
- Opening resets group to `all` and search to empty.

### 1.5 Modal `batchImportMasterModal` (L5963-6028)

Entry: Module 4 toolbar button "Nhập từ CSDL Master" (short label "CSDL Master", L1556, title "Chọn hàng loạt đại biểu và doanh nghiệp từ CSDL Master vào sự kiện").
Guard: no `module4State.selectedEventId` → warning "Chưa chọn sự kiện" / "Vui lòng chọn sự kiện trước khi nhập khách mời."
Title "Nhập Hàng Loạt Từ CSDL Master Vào Sự Kiện", subtitle "Tích chọn các đại biểu hoặc doanh nghiệp để nạp đồng loạt vào sự kiện hiện tại".
- Search `batchImportSearchInput` "Lọc theo họ tên, cơ quan, chức vụ...". Pills `batchFilterBtn-<g>` same labels as picker.
- Table: header checkbox `batchSelectAllCheckbox` (selects/deselects all **currently filtered** rows) | "Nhóm" | "Họ và Tên & Chức Danh" | "Cơ Quan / Doanh Nghiệp" | "Liên Hệ" | "Trạng Thái". Status chip: "Đã có trong SK" (amber, row dimmed) or "Chưa thêm" (emerald). Already-added rows remain selectable.
- Empty (colspan 6): "Không tìm thấy đối tượng nào."
- Footer: "Đã chọn: **N** đại biểu" (`batchSelectedCount`, counts the whole selection set, not just visible), "Hủy", "Nhập Đại Biểu Đã Chọn".
- Opening resets group, clears selection set, clears search, unchecks header box. Selection persists across filter/search changes within the session.
- Execute with empty selection: warning "Chưa chọn đối tượng" / "Vui lòng tích chọn ít nhất 1 đại biểu hoặc doanh nghiệp để nhập."
- Success: modal "Nhập thành công!" html "Đã nạp **{added}** đại biểu mới và cập nhật **{updated}** đại biểu vào sự kiện." Then re-renders 4a's `renderCrmGuestsTable`, `updateCrmKpiCards`, `renderPopupGuestsTable`.

### 1.6 Guest-list Excel export (button "Xuất Excel" in Module 4 toolbar L1587, and in `guestListPopupModal` L4059)

Flow `exportGuestListExcel()` (L17947):
1. `evId = module4State.selectedEventId`; event = `appData.events.find(id)` or fallback `{ name: 'SuKien_SCE' }`; guests = `appData.eventGuests[evId] || []` (all guests, insertion order, no filter/sort).
2. Empty → info "Danh sách trống" / "Chưa có đại biểu nào trong sự kiện này để xuất file."
3. Loading modal "Đang tạo bảng Excel..." / "Hệ thống đang tổng hợp dữ liệu, tạo định dạng bảng biểu, màu sắc và thống kê đại biểu...", outside-click disabled.
4. `loadExcelJsLibrary()`; if ExcelJS present → `generateStyledXlsx`; success toast "Đã xuất file Excel (.xlsx) chuẩn đẹp thành công!" 3s.
5. On ExcelJS absence or throw → `exportStyledHtmlSpreadsheet` fallback; toast "Đã xuất bảng tính Excel (.xls) đẹp mắt thành công!".

#### 1.6.1 XLSX layout (`generateStyledXlsx`, L17336-17745)

Workbook: creator "Trung tâm Xúc tiến đầu tư và Hỗ trợ doanh nghiệp Hà Nội"; lastModifiedBy `currentProfile.fullname` or "Cán bộ Lễ tân SCE"; created/modified now.
Sheet "Danh Sách Khách Mời": frozen panes `ySplit: 8` (top-left A9), tab color `FF1E3A8A`, page A4 (`paperSize 9`) landscape, fitToPage width 1 height 0, gridlines on, margins L/R 0.4, T/B 0.6, header/footer 0.3.
All fonts Arial.

Columns (key, width): A stt 7, B name 28, C title 24, D org 34, E group 20, F phone 16, G email 30, H sendMethod 17, I inviteStatus 18, J rsvp 20, K substitute 24, L banquet 16, M seat 16, N notes 28.

Header block ("state-level" Vietnamese administrative layout: agency block left, national motto right):

| Row | Height | Merge | Value | Style |
|---|---|---|---|---|
| 1 | 20 | A1:E1 | "SỞ TÀI CHÍNH HÀ NỘI" | 10 bold `FF1E3A8A`, center |
| 1 | | J1:N1 | "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" | 10 bold `FF0F172A`, center |
| 2 | 20 | A2:E2 | "TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP HÀ NỘI" | 9.5 bold `FF0F766E`, center |
| 2 | | J2:N2 | "Độc lập - Tự do - Hạnh phúc" | 10 bold italic underline `FF0F172A`, center |
| 3 | 10 | none | blank | |
| 4 | 34 | A4:N4 | "BẢNG DANH SÁCH ĐẠI BIỂU & KHÁCH MỜI THAM DỰ SỰ KIỆN" | 15 bold `FF1E3A8A`, fill `FFEBF4FF`, border top/bottom medium `FF93C5FD`, left/right thin same |
| 5 | 24 | A5:N5 | `Sự kiện: {EVENT NAME UPPERCASE}   \|   Ngày tổ chức: {eventDate or 'Theo thông báo'}   \|   Địa điểm: {location or 'Hội trường Thành phố'}` (3 spaces around each `\|`) | 10.5 bold italic `FF334155`, fill `FFF8FAFC`, bottom thin `FFE2E8F0` |
| 6 | 24 | A6:N6 | `📊 THỐNG KÊ: Tổng số {n} đại biểu  •  VIP: {vip}  •  Sở ngành: {sn}  •  Doanh nghiệp: {dn}  •  Báo chí: {bc}  •  Đã xác nhận (RSVP): {conf}/{n} ({pct}%)  •  Dự tiệc: {banq}  •  Đã xếp chỗ: {seated}` (2 spaces around `•`) | 9.5 bold `FF1E293B`, fill `FFF1F5F9`, bottom thin `FFCBD5E1` |
| 7 | 8 | none | blank | |
| 8 | 30 | none | column headers | 10 bold white, fill `FF1E3A8A`, center, wrap; border top/bottom medium `FF1E3A8A`, left/right thin `FF60A5FA` |

Event-name fallback: `(name || 'Sự kiện SCE').toUpperCase()`. `pct = round(conf / n * 100)`, 0 if n = 0. `seated` counts `seatCode || assignedSeat` truthy. Stats count VIP, SoNganh, DoanhNghiep, BaoChi only (QuocTe omitted).

Row 8 headers, in order (A..N): "STT", "Họ và Tên Đại Biểu", "Chức Danh", "Cơ Quan / Doanh Nghiệp", "Nhóm Khách Mời", "Số Điện Thoại", "Địa Chỉ Email", "Hình Thức Gửi Thư", "Trạng Thái Giấy Mời", "Xác Nhận RSVP", "Người Đi Thay (nếu có)", "Dự Tiệc Chiêu Đãi", "Vị Trí Ghế Ngồi", "Ghi Chú Đón Tiếp".
AutoFilter `A8:N8`.

Data rows from row 9 (`9 + index`), height 25. Zebra: index odd → `FFF8FAFC`, even → `FFFFFFFF` (applied only to cells with no explicit fill). All 14 cells get thin border `FFCBD5E1`; cells with no font get Arial 9.5.

| Col | Value | Alignment | Conditional style |
|---|---|---|---|
| A | index+1 (number) | center | |
| B | name | left | 10.5 bold `FF0F172A` |
| C | title | left | |
| D | organization | left | |
| E | `getGuestGroupName(group)` | center | VIP fill `FFFEF3C7` font 9.5 bold `FF92400E`; SoNganh `FFEDE9FE` bold `FF5B21B6`; DoanhNghiep `FFE0F2FE` `FF0369A1`; BaoChi `FFDCFCE7` `FF166534`; others zebra |
| F | `String(phone)`, `numFmt '@'` (text, keeps leading 0) | center | |
| G | email | left | 9.5 `FF2563EB` |
| H | `getGuestSendMethodName(sendMethod)` | center | `direct`: fill `FFFEF3C7` bold `FF92400E`; `ems`: fill `FFF1F5F9` `FF334155`; else font `FF2563EB` |
| I | `getGuestInviteStatusName(inviteStatus)` | center | `received`: `FFDCFCE7` bold `FF15803D`; `sent`: `FFE0F2FE` `FF0369A1`; else `FFFEF9C3` `FF854D0E` |
| J | `getRsvpBadgeText(rsvpStatus)` | center | confirmed `FFDCFCE7` bold `FF15803D`; declined `FFFEE2E2` bold `FFB91C1C`; substituted `FFEDE9FE` bold `FF6D28D9`; else `FFFEF9C3` `FF854D0E` |
| K | substituteName | left | 9.5 italic |
| L | hasBanquet ? "✓ Có dự tiệc" : "Không" | center | yes: fill `FFCCFBF1` bold `FF0F766E`; no: `FF94A3B8` |
| M | `seatCode \|\| assignedSeat \|\| '-'` | center | set: 10 bold `FF1E3A8A`; unset: 9.5 `FF94A3B8` |
| N | notes | left | 9 italic `FF64748B` |

Label tables (translate raw codes; tolerant of legacy Vietnamese free text):

| Helper | Input → Output |
|---|---|
| `getGuestGroupName` L17245 | VIP "⭐ Đại biểu VIP"; SoNganh "🏛️ Sở ban ngành"; DoanhNghiep "🏢 Doanh nghiệp"; QuocTe "🌐 Khách quốc tế"; BaoChi "📰 Báo chí truyền thông"; BanToChuc "🎯 Ban tổ chức"; else raw value or "Khách mời" |
| `getRsvpBadgeText` L17257 | confirmed "✓ Đã xác nhận"; declined "✕ Báo vắng"; substituted "⇄ Người đi thay"; else "⏳ Chờ phản hồi" |
| `getGuestSendMethodName` L17264 | empty → "Thư điện tử (Email)". Lowercased/trimmed: `direct`, `tận tay`, contains `truc tiep`/`trực tiếp` → "Đưa tận tay (VIP)"; `ems`, contains `buu dien`/`bưu điện`/`chuyen phat`/`chuyển phát` → "Bưu điện bảo đảm (EMS)"; `email`, contains `mail`/`dien tu`/`điện tử` → "Thư điện tử (Email)"; else raw |
| `getGuestInviteStatusName` L17279 | empty → "Đã phát hành". `received` or contains `nhận`/`nhan` → "Đã nhận được thư"; `sent` or contains `phát hành`/`phat hanh`/`đã gửi`/`da gui` → "Đã phát hành"; `pending` or contains `chưa`/`chua` → "Chưa gửi"; else raw. Order matters: "chưa nhận" hits the `nhận` branch first |

Footer / signature block. `F = 9 + n + 1` (one blank row after data):

| Row | Merge | Value | Style |
|---|---|---|---|
| F (h 20) | J:N | `Hà Nội, ngày {DD} tháng {MM} năm {YYYY} (Xuất lúc {HH:mm})` (local time) | 9.5 italic `FF475569` center |
| F+1 (h 22) | A:D | "NGƯỜI LẬP BIỂU" | 10.5 bold `FF0F172A` center |
| F+1 | F:I | `getDepartmentHeadSignatureTitle()` | same |
| F+1 | K:N | "LÃNH ĐẠO TRUNG TÂM PHÊ DUYỆT" | same |
| F+2 (h 18) | A:D, F:I | "(Ký, ghi rõ họ tên)" | 9 italic `FF64748B` |
| F+2 | K:N | "(Ký, đóng dấu và ghi rõ họ tên)" | same |
| F+3..F+5 | none | blank, h 16 each (signature space) | |
| F+6 (h 22) | A:D | `currentProfile.fullname` or "Cán bộ Lễ tân SCE" | 10 bold `FF0F172A` |

`getDepartmentHeadSignatureTitle(profile = currentProfile)` (L17294): no department → "TRƯỞNG PHÒNG PHỤ TRÁCH"; department starting (case-insensitive) with "phòng " → "TRƯỞNG " + UPPER(dept); else "TRƯỞNG PHÒNG " + UPPER(dept). Example "Phòng Xúc tiến đầu tư" → "TRƯỞNG PHÒNG XÚC TIẾN ĐẦU TƯ".

Filename: `DS_KhachMoi_{safeName}_{YYYYMMDD}.xlsx`, `safeName = (event.name || 'SuKien_SCE')` with chars outside `[a-zA-Z0-9À-ỹ]` replaced by `_`, cut to 40 chars. Download via Blob + anchor appended to body, URL revoked after 1s. MIME `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

#### 1.6.2 HTML spreadsheet fallback (`exportStyledHtmlSpreadsheet`, L17748-17944)

Same content as xlsx rendered as an Excel-flavoured HTML table (`xmlns:x` office namespaces, `<x:ExcelWorksheet>` named "Danh sách khách mời", frozen pane split at row 8, gridlines). CSS: body Segoe UI/Arial 10pt; `th` bg `#1e3a8a` white bold 10pt; `td` border 0.5pt `#cbd5e1`, 9.5pt; zebra `#f8fafc`. Phone cell `mso-number-format:'\@'`.
Differences from xlsx: row 1/2 use `colspan 5 | 4 empty | 5`; signature row uses `colspan 4 | 5 | 5` (xlsx uses A:D, F:I, K:N); signature gap is one 45px row; no autofilter. Values are interpolated **without escaping**.
Filename `DS_KhachMoi_{safeName}_{YYYYMMDD}.xls`, Blob `'﻿' + html`, type `application/vnd.ms-excel;charset=utf-8;`.

`loadExcelJsLibrary` (L17305): resolves true if `ExcelJS` global exists (it is loaded statically at L48 `exceljs@4.4.0`); else if a script tag exists polls every 100ms up to 25 times; else injects `https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js` and also resolves after a 3s timeout. Never rejects.

### 1.7 Master DB CSV export (`exportMasterGuestDbExcel`, L13216)

Empty list → info "Không có dữ liệu" / "CSDL Master hiện đang trống." (cannot actually happen, see B38).
Headers: "STT", "Mã Định Danh", "Nhóm Đối Tượng", "Họ Và Tên", "Chức Danh", "Cơ Quan / Doanh Nghiệp", "Số Điện Thoại", "Email", "Địa Chỉ", "Mã Số Thuế / Ngành", "Tiệc VIP", "Ghi Chú Lễ Tân".
Row: idx+1, id, `getMasterGuestGroupName(group)`, name, title, organization, phone, email, address, taxCode, "Có"/"Không", notes. Every field double-quoted with `"` doubled. UTF-8 BOM, CRLF. Filename `CSDL_KhachMoi_DoanhNghiep_SCE_{YYYY-MM-DD}.csv` (UTC date from `toISOString`).

### 1.8 Booths CSV export (`exportBoothsExcel`, L18008; buttons L1942, L2076; functional owner 4b)

Event: `moduleBoothsState.selectedEventId || module4State.selectedEventId`; fallback `{ name: 'HoiCho_SCE' }`. Empty → "Danh sách trống" / "Chưa có gian hàng nào để xuất file."
Headers: "Mã gian", "Doanh nghiệp / HTX tham gia", "Sản phẩm trưng bày chính", "Quy cách / Diện tích", "Mức hỗ trợ kinh phí (%)", "Trạng thái gian hàng", "Người đại diện & Hotline", "Cán bộ SCE trực hỗ trợ" (header cells unquoted).
Row: code, company, products, size, `{subsidyPercent||0}%`, raw `status`, contact, staff. Filename `DS_GianHang_{safeName}_{Date.now()}.csv`. Toast "Đã xuất file Excel danh sách gian hàng".

### 1.9 Cross-module navigation (L18063-18101)

| Function | Behavior |
|---|---|
| `openModule4GuestList(eventId?)` | `switchMainTab('tab-module4')`; if eventId: set `module4State.selectedEventId`, set `#crmEventSelector.value`, `ensureStarterDataForEvent(eventId)`; `switchCrmSubTab('subtab-guests')`; `renderModule4()` |
| `openModule4Seating(eventId?)` | same, sub-tab `subtab-seating` |
| `openModule4Booths(eventId?)` | `switchMainTab('tab-booths')`; if eventId: set `moduleBoothsState.selectedEventId`, `#boothEventSelector.value`, `ensureStarterDataForEvent`; `renderModuleBooths()` |

No caller exists anywhere in the file (grep of `openModule4` finds only the definitions). Modules 2 and 3 do not link into module 4 today. Intended: an event card/detail in modules 2/3 offers "Danh sách khách mời", "Sơ đồ chỗ ngồi", "Gian hàng" links that open module 4 pre-scoped to that event.

### 1.10 Bulk email dispatcher (`bulkEmailModal`, L4438-4772; JS L18103-19870)

Entry: Module 4 toolbar "Gửi Email Khách Mời" (L1567). Guard: no event → "Chưa chọn sự kiện" / "Vui lòng chọn một sự kiện để phát hành thư điện tử cho khách mời."
Header: "Trung Tâm Phát Hành Thư Điện Tử", pill "Google Mail Dispatcher", subtitle "Gửi giấy mời, thông báo và tài liệu hội nghị hàng loạt tới đại biểu qua tài khoản Google của cán bộ".

Sender bar:
- "Gửi từ Hòm Thư:" select `bulkEmailSenderSelect`: one option per unit mailbox `✉️ {displayName} ({email})` + ` [OAuth]` if clientId + ` ⭐ [Mặc định]` if default; last option `personal`: "👤 Tài khoản cá nhân: {googleEmail}" when signed in, else "👤 Tài khoản Google cá nhân (Đăng nhập Google OAuth)".
- Badge `bulkEmailSenderBadge`: live token → green "Google API Sẵn Sàng"; sender has clientId → blue "Đã cài Client ID"; else amber "Sandbox Thử Nghiệm".
- Button "Quản lý Hòm Thư Đơn Vị" (title "...(Dành cho Admin)") → `openUnitEmailManagerModal()`. Not role-gated.
- Auth area `bulkEmailGoogleStatusContainer`: signed in → avatar, name, "Đã kết nối", "From: {email}", button "Đăng xuất / Đổi tài khoản". Signed out → "Chưa kết nối hòm thư Google", "Chế độ Thử nghiệm", button "Đăng nhập với Google".
- Button "Client ID" toggles `googleClientIdConfigBox`: label "Google OAuth 2.0 Client ID (từ Google Cloud Console)", input `googleClientIdInput`, "Lưu Client ID". Hint: "Nếu chưa cấu hình Client ID, hệ thống sẽ tự động kích hoạt Chế độ Thử nghiệm (Simulation Sandbox)...".

Left column "Đối Tượng Nhận Thư", counter `bulkEmailSelectedCount` "Đã chọn: N người nhận".
- Mode tabs: "Đại biểu sự kiện" (badge `bulkGuestsCountBadge` "{selected}/{all}") | "Tự nhập Email" (badge `bulkManualCountBadge`).
- Guests panel: pills (`data-filter`) "Tất cả", "⭐ VIP", "🏛️ Sở ngành", "💼 Doanh nghiệp", "⏳ Chưa phản hồi" (`rsvp_pending`: no status or pending), "✅ Đã xác nhận" (`rsvp_confirmed`). No QuocTe/BaoChi pills. Search `bulkEmailSearchInput` "Tìm theo tên, cơ quan, email..." (case-insensitive, not accent-insensitive). "Chọn hết" checkbox (filtered rows with valid email).
- Guest row: checkbox (disabled when no `@` in email), name, status chip "Đã gửi" / "Lỗi gửi" from `emailStatus`, "title - organization", email or "Chưa có email". Empty: "Không tìm thấy đại biểu phù hợp bộ lọc."
- Manual panel: textarea `manualRecipientEmailInput` "Gõ 1 email hoặc nhiều email (cách nhau bởi dấu phẩy, chấm phẩy hoặc xuống dòng)...", inputs "Họ tên (tùy chọn)", "Cơ quan / Đơn vị (tùy chọn)", buttons "Dùng email của tôi để thử nghiệm", "Thêm Người Nhận". Bar: "Chọn tất cả" (initially checked), "Xóa danh sách tự nhập" (confirm "Xóa danh sách email tự nhập?" / "Toàn bộ các email tự nhập ngoài danh sách sẽ bị xóa khỏi phiên gửi này."). Manual row: checkbox, name, chip, email, tag "Tự nhập" + org, remove button. Empty: "Chưa có địa chỉ email tự nhập" + "Gõ email vào ô phía trên rồi bấm "Thêm Người Nhận", hoặc dán danh sách nhiều email cùng lúc."

Right column:
- "Mẫu Thư Định Sẵn:" select `bulkEmailTemplateSelector`: `invitation` "1. Giấy mời tham dự Hội nghị / Tọa đàm (Trang trọng)", `banquet` "2. Thư mời dự Tiệc chiêu đãi VIP", `seating_qr` "3. Thông báo Sơ đồ chỗ ngồi & Thẻ QR Check-in", `rsvp_reminder` "4. Thư đôn đốc & Nhắc lịch xác nhận tham dự", `thank_you` "5. Thư cảm ơn & Gửi tài liệu kỷ yếu (T + 3)", `custom` "-- Soạn thảo mẫu tùy chỉnh --". Changing it overwrites subject and body with no confirmation.
- "Tiêu Đề Thư (Subject):" `bulkEmailSubject`.
- Merge-tag buttons inserting at the caret: `{danh_xung}`, `{ho_ten}`, `{chuc_vu}`, `{co_quan}`, `{ten_su_kien}`, `{thoi_gian}`, `{dia_diem}`, `{so_ghe}`, `{can_bo_lien_he}`, `{sdt_lien_he}`, `{link_google_form}`, `{email_don_vi}`, `{ten_don_vi_gui}`.
- "Nội Dung Thư (Hỗ trợ định dạng HTML / Thư điện tử công vụ):" textarea `bulkEmailBody` (raw HTML).
- "File Đính Kèm (Tối đa 25MB)": file picker multiple; chips "{name} ({KB}KB)" with remove; empty "Chưa có file nào được đính kèm."
- Checkbox `bulkEmailAttachQrCard` (default checked): "🎟️ Tự động tạo & đính kèm Thẻ Check-in có mã QR cá nhân hóa riêng của từng đại biểu."
- Buttons: "Xem trước thư", "Gửi thử đến tôi", hidden "Tạm dừng"/"Tiếp tục", hidden "Hủy", "BẮT ĐẦU GỬI HÀNG LOẠT".
- Progress box (hidden until run): status text, percent, bar. Log console `bulkEmailLogConsole` (hidden until first log): lines `[HH:MM:SS] msg`, colors SUCCESS emerald, ERROR red, INFO sky.
- Footer: "Tỷ lệ gửi thành công cao nhất với Gmail API chính chủ • Điều tốc 1.2s/thư chống spam.", "Đóng". Closing while dispatching asks "Tiến trình gửi thư đang chạy!" / "Bạn có chắc chắn muốn hủy tiến trình gửi thư và đóng cửa sổ?" ("Dừng & Đóng" / "Tiếp tục gửi").

Templates (`BULK_EMAIL_TEMPLATES`, L18109-18190). Subjects verbatim:
- invitation: `[Giấy Mời] Tham dự {ten_su_kien} - Kính gửi {danh_xung} {ho_ten}`
- banquet: `[Thư Mời Tiệc Chiêu Đãi] {ten_su_kien} - Kính gửi {danh_xung} {ho_ten}`
- seating_qr: `[Thẻ Check-in & Chỗ Ngồi] {ten_su_kien} - Đại biểu: {ho_ten}`
- rsvp_reminder: `[Nhắc Lịch & Đôn Đốc RSVP] Tham dự {ten_su_kien} - Kính gửi {danh_xung} {ho_ten}`
- thank_you: `[Thư Cảm Ơn] Tham dự {ten_su_kien} - Trung tâm SCE Hà Nội`
- custom: `[Thông Báo] {ten_su_kien} - Kính gửi {danh_xung} {ho_ten}`
Bodies are HTML paragraphs in formal Vietnamese; copy them verbatim from L18112-18189 into a template registry file (they are content, not logic).

Preview modal `bulkEmailPreviewModal` (L4774-4808): "Xem Trước Thư Gửi Đi Thực Tế", fields "Người gửi:", "Người nhận:", "Tiêu đề:", "Đính kèm:" ("Không có file đính kèm" when none), rendered HTML body, buttons "Gửi Thử Nội Dung Này Đến Tôi", "Đóng xem trước".

### 1.11 Unit sender mailboxes (admin)

- Admin card (L836-858, inside `mainTab-admin`): "Cấu Hình Hòm Thư Google & Client ID Gửi Thư", tag "Phân hệ 4 & Admin", text "Admin cài đặt sẵn tên gợi nhớ, địa chỉ email, Google Client ID riêng và chọn email mặc định để chuyên viên chỉ việc chọn gửi thư.", buttons "Quản Lý Danh Sách", "Thêm Hòm Thư Google". Grid `adminUnitEmailsContainer` (1/2/4 cols): card per mailbox: chip "⭐ Mặc định" or "Hòm thư Google", edit/delete icons, displayName, email, clientId or "Chưa cài Client ID (Sandbox)", button "Đặt làm mặc định" when not default.
- `unitEmailManagerModal` (L4810-4872): "Cấu Hình Danh Sách Email Google & Client ID" tag "Dành cho Admin"; "{n} hòm thư đã được cấu hình trong hệ thống."; "Thêm Hòm Thư Google"; table "STT | Tên Hòm Thư | Địa Chỉ Email | Google OAuth 2.0 Client ID | Mặc Định | Thao Tác" (default chip "Mặc định" or link "Đặt mặc định"; client cell or "Chưa cài (Dùng Sandbox)"); empty "Chưa có hòm thư Google nào. Bấm "Thêm Hòm Thư Google" để thiết lập."; footer "Mọi thay đổi sẽ tự động đồng bộ ngay vào danh sách chọn gửi của chuyên viên."
- `unitEmailEditModal` (z-60, L4874-4932): title create "Thêm Hòm Thư Google & Client ID Mới", edit "Chỉnh Sửa Hòm Thư Google & Client ID". Fields "Tên gợi nhớ / Tên hòm thư (Tên hiển thị người gửi) *", "Địa chỉ Email Google *" (type email), "Google OAuth 2.0 Client ID (Cài sẵn riêng cho email này):", checkbox "⭐ Đặt làm hòm thư mặc định ưu tiên" (pre-checked on create only when list empty). Buttons "Hủy", "Lưu Cấu Hình Hòm Thư". Toasts "Đã cập nhật hòm thư Google" / "Đã thêm hòm thư Google mới". Delete confirm "Xóa hòm thư này?"; last mailbox: "Không thể xóa" / "Hệ thống cần tối thiểu 1 hòm thư Google để phục vụ chuyên viên gửi email."

### 1.12 Google Form RSVP (`googleFormRsvpModal`, L4935-5135; JS L19872-20599)

Entry: Module 4 toolbar "Google Form RSVP" (L1562); KPI card button "Đồng bộ Form" (L1624) → `triggerGoogleFormSyncNow()`.
Header "Google Form RSVP & Đồng Bộ Phản Hồi", pill "Tự Động 100%". Status bar: "Trạng thái:" `gfConnectionStatusBadge` ("Đã kết nối Sheet phản hồi" green / "Chỉ có link Form (Chưa gắn Sheet)" amber / "Chưa thiết lập liên kết" slate), `gfLastSyncTimeText` "Lần kiểm tra cuối: {time vi-VN} ({date vi-VN})" or "Lần kiểm tra cuối: Chưa đồng bộ", button "ĐỒNG BỘ NGAY".
Tabs: "1. Cấu Hình Liên Kết Form & Tự Động" | "2. Danh Sách Phản Hồi Từ Form ({count})".
Tab 1:
- "1. Đường Liên Kết Google Form (Dành cho khách mời điền xác nhận)" `gfFormUrlInput` (type url), "Sao chép link" (clipboard; toast "Đã sao chép liên kết!"), "Mở thử" (new tab). Empty → "Chưa có link".
- "2. Đường Liên Kết Google Sheet Lưu Phản Hồi (Responses Sheet)" `gfSheetUrlInput`; help list (2 steps: link Form responses to Sheets; share Sheet as "Bất kỳ ai có đường liên kết đều có thể xem (Viewer)").
- "3. Tùy Chọn Tự Động Hóa Quá Trình Đồng Bộ": `gfAutoSyncIntervalCheckbox` "Tự động kiểm tra mỗi 5 phút"; `gfAutoAddNewGuestsCheckbox` (default checked) "Tự nạp khách mới từ Form".
- Footer: "Nạp phản hồi giả lập mẫu (Sandbox Demo)", "Lưu Cấu Hình & Đồng Bộ Ngay".
Tab 2: KPIs "Tổng số phản hồi", "Xác nhận tham dự", "Báo vắng / Từ chối", "Đăng ký ăn tiệc"; search `gfResponsesSearchInput` "Tìm theo tên, email, cơ quan..."; "Xuất Excel" (CSV); table "Thời gian | Họ và tên | Cơ quan / Đơn vị | Email & SĐT | Xác nhận RSVP | Ăn tiệc | Khớp khách mời" (RSVP chip "Tham dự"/"Từ chối"/"Chưa rõ"; banquet "Có"/"Không"; match chip = matchedGuestName or "Chưa khớp"). Empty (colspan 7): "Chưa có dữ liệu phản hồi nào. Hãy bấm "Đồng Bộ Ngay" hoặc "Nạp phản hồi giả lập"."
Footer: "Tự động đối soát thông minh theo Email, SĐT và Họ tên • Cập nhật tức thì vào sơ đồ hội trường.", "Đóng".
Sync result modal "Đồng bộ Google Form hoàn tất!" listing total, confirmed, declined, banquet, and new guests ("khách đăng ký mới đã được tự động nạp vào danh sách!"); confirm "Xem danh sách" switches to tab 2. Missing Sheet URL → opens modal + info "Chưa gắn link Google Sheet". Errors → "Không thể kết nối Google Sheet" with the share-permission checklist and the error message.

---

## 2. Domain types

All app state lives in one JSON blob `appData`, persisted to `localStorage['sce_tcsk_app_data']` and upserted whole into Supabase table `sce_tcsk_app_data` (row `id = 1`, columns `data jsonb`, `updated_at`, `updated_by`, `updated_by_email`) by `saveAppDataToSupabase` (L6782). The rewrite's foundation decides normalized tables; suggested table names are given per type.

```ts
type GuestGroup = 'VIP' | 'SoNganh' | 'DoanhNghiep' | 'QuocTe' | 'BaoChi';
type ExportGroup = GuestGroup | 'BanToChuc';            // export label table only

// appData.masterGuestDb[]  → suggest table master_contacts
interface MasterContact {
  id: string;               // seed "mdb_<grp>_NN"; new "mdb_<vip|sn|dn|qt|bc>_<Date.now()>"
  name: string;             // required
  group: GuestGroup;        // required
  title: string;
  organization: string;     // required
  phone: string;            // free text, dotted format e.g. "0913.210.001"
  email: string;
  address: string;
  taxCode?: string;         // "Mã số thuế / Ngành nghề"; absent on seeds
  notes: string;            // reception protocol notes
  hasBanquet: boolean;      // default banquet flag when copied into an event
  isDefaultVip: boolean;    // written, never read (dead)
  updatedAt?: string;       // ISO; absent on seeds
}

// appData.eventGuests[eventId][]  (owned by 4a; fields this unit reads or writes)
type SendMethod = 'direct' | 'ems' | 'email';            // legacy free text tolerated by export
type InviteStatus = 'sent' | 'received' | 'pending';
type RsvpStatus = 'confirmed' | 'substituted' | 'declined' | 'pending';
interface EventGuest {
  id: string;               // 'gst_<ts>_<rand4>' | 'GF-<ts36>-<rand4>' | 'GF-SIM-01'
  name: string; group: GuestGroup; title: string; organization: string;
  phone: string; email: string;
  sendMethod: SendMethod; inviteStatus: InviteStatus; rsvpStatus: RsvpStatus;
  substituteName: string; hasBanquet: boolean;
  seatCode: string;          // canonical seat field (105 refs)
  assignedSeat?: string;     // legacy; read by export, mail merge, QR card
  notes: string;
  // written by bulk email
  emailStatus?: 'idle' | 'sent' | 'error'; emailSentAt?: string; emailError?: string;
  // written by Google Form sync
  rsvpSource?: 'google_form'; rsvpRespondedAt?: string; // raw sheet timestamp or ISO
  // read by mail merge, never written anywhere
  honorific?: string; danhXung?: string; qrCode?: string;
}

// appData.events[] (owned by module 2; fields this unit reads/writes)
interface EventRef {
  id: string; name: string; title?: string /*legacy*/; eventDate?: string /*YYYY-MM-DD*/;
  eventTime?: string; date?: string /*legacy*/; location?: string;
  // written by 4c Google Form config/sync
  googleFormUrl?: string; googleSheetUrl?: string;
  autoSyncGoogleForm?: boolean; autoAddNewGuestsFromForm?: boolean; // undefined = true
  lastFormSyncTime?: string; formResponsesCount?: number;
}

// appData.systemSettings.unitSenderEmails[]  → suggest table sender_mailboxes
interface SenderMailbox {
  id: string;               // 'gmail_cfg_<n|ts>'
  displayName: string; email: string;
  clientId: string;         // Google OAuth client id; '' = sandbox
  isDefault: boolean;       // exactly one true (enforced loosely)
  name?: string;            // legacy alias of displayName
}
// appData.systemSettings.googleClientId: string  (global fallback client id)
// appData.systemSettings.agencyName / parentAgency exist (L6066-6067) but export hard-codes names

// in-memory only (bulkEmailState, L18563)
interface ManualRecipient {
  id: string;               // 'manual_<ts>_<rand6>'
  name: string; email: string; title: string /*'Đại biểu'*/;
  organization: string /*'Khách mời tự nhập'*/; group: 'DoanhNghiep';
  isManual: true; emailStatus: 'idle' | 'sent' | 'error';
}
interface Attachment { name: string; size: number; type: string; base64: string; }
interface GoogleUser { name: string; email: string; picture: string; accessToken: string; }

// in-memory only, single global (googleFormCachedResponses, L19878)
interface FormResponse {
  timestamp: string; name: string; org: string; title: string; email: string; phone: string;
  rsvpRaw: string; banquetRaw: string; substitute: string; notes: string;
  rsvpStatus: 'confirmed' | 'declined' | 'pending'; hasBanquet: boolean;
  matchedGuestName: string; // "{guest.name} ({Email|SĐT|Họ tên})" | "Khách đăng ký mới (Đã nạp)" | ''
}

// export row (14 cols) — derived, not persisted
interface GuestExportRow {
  stt: number; name: string; title: string; org: string; groupLabel: string;
  phone: string /*text*/; email: string; sendMethodLabel: string; inviteStatusLabel: string;
  rsvpLabel: string; substitute: string; banquetLabel: '✓ Có dự tiệc' | 'Không';
  seat: string /*'-' when empty*/; notes: string;
}
// master CSV row (12 cols): stt, id, groupName, name, title, organization, phone, email, address, taxCode, 'Có'|'Không', notes
// batch import has no file row shape: input is a Set<MasterContact['id']>
```

Seed `DEFAULT_MASTER_GUEST_DB` (L12312-12855): **41** records (VIP 8, SoNganh 10, DoanhNghiep 10, QuocTe 6, BaoChi 7); 24 have `hasBanquet: true`; `isDefaultVip: true` on all 8 VIP plus `mdb_qt_05`. Seed contains real-looking names, titles and phone numbers of Hanoi officials (see open question Q1). Move to a seed JSON file.

Seed `DEFAULT_CONFIGURED_GOOGLE_EMAILS` (L18192-18213): `gmail_cfg_1` "Hòm thư Ban Tổ Chức Sự Kiện" hanoi.sce.event@gmail.com (default), `gmail_cfg_2` "Hòm thư Xúc Tiến Đầu Tư Hà Nội" xuctiendautu.hanoi@gmail.com, `gmail_cfg_3` "Hòm thư Hỗ Trợ Doanh Nghiệp" hotrodoanhnghiep.sce@gmail.com; all `clientId ''`.

---

## 3. Business rules and state machines

### 3.1 Text normalization (`removeVietnameseTones`, L12873)

Maps each accented vowel family (à á ạ ả ã â ầ ấ ậ ẩ ẫ ă ằ ắ ặ ẳ ẵ → a, etc.), đ/Đ → d/D, then lowercases and trims. Does not collapse inner whitespace, does not strip punctuation. Rewrite: `s.normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/đ/gi,'d').toLowerCase().replace(/\s+/g,' ').trim()`, computed once per record (memoized index), not per keystroke.

### 3.2 Search and match rules

| Surface | Fields (accent-insensitive substring) | Extra | Limit / order |
|---|---|---|---|
| Admin table L12977 | name, organization, title | phone, email: lowercase substring of **raw** query | all, DB order |
| Picker L13393 | name, organization, title | phone raw | all |
| Auto-suggest L13257 | name, organization, title | none | first 8 in DB order (no ranking) |
| Batch import L13497 | name, organization, title | none | all |
| Bulk email L18830 | name, organization, email (lowercase, **not** accent-insensitive) | group/RSVP filter | all |
| GF responses L20348 | name, email, org (lowercase) | | all |

Auto-suggest ranking: none. Intended (rewrite): rank exact-prefix on name > word-prefix on name > substring on name > org/title match; tiebreak VIP first then alphabetical; debounce 150ms; keyboard ArrowUp/Down/Enter/Escape; ARIA combobox.

### 3.3 Dedupe keys

| Operation | Key | Behavior on hit |
|---|---|---|
| Master create (`saveMasterGuest`) | none | always appends |
| Batch import "already added" chip + upsert (L13531, L13628) | `norm(name) === norm(name) && norm(org) === norm(org)` | updates existing guest |
| GF response → guest (L20112) | 1) email exact (lowercase, trim) when contains `@`; 2) phone digits ≥ 8: equal or guest phone ends with last 8 digits of response phone; 3) `norm(name)` equality | first match wins, updates guest |
| Manual recipient add (L19050) | lowercase email | skip duplicate |

### 3.4 Batch import upsert (L13610-13680)

| Case | Writes |
|---|---|
| Existing guest (key hit) | `group = master.group \|\| g.group`; `title = master.title \|\| g.title`; `phone`, `email` same pattern; `hasBanquet = master.hasBanquet` if defined; `notes = master.notes` only when guest notes empty. `updatedCount++` |
| New | `{ id: 'gst_'+ts+'_'+rand4, name, group (default VIP), title, organization, phone, email, sendMethod:'direct', inviteStatus:'sent', rsvpStatus:'confirmed', substituteName:'', hasBanquet:!!master.hasBanquet, seatCode:'', notes }`. `addedCount++` |
Then `syncModule4Storage(true)`, close, re-render 4a views, result modal. Intended defaults (see B32): `inviteStatus:'pending'`, `rsvpStatus:'pending'`, `sendMethod` by group (VIP → direct, else email).

### 3.5 Master DB lifecycle

| Action | Precondition | Effect |
|---|---|---|
| Ensure (any render) | list missing/empty | reseed 41 records, write localStorage directly (no cloud sync) |
| Create | name & organization non-empty after trim (else "Thiếu thông tin" / "Vui lòng nhập họ tên đại biểu/đầu mối và tên cơ quan, doanh nghiệp.") | push with `isDefaultVip = group==='VIP'`, `updatedAt` |
| Edit | record found | overwrite 10 fields + `updatedAt` (not `isDefaultVip`, not id) |
| Delete | confirm "Xóa đối tượng khỏi CSDL?" / "Bạn có chắc muốn xóa "{name}" ({organization}) khỏi CSDL Master không? Thao tác này không ảnh hưởng đến các sự kiện đã tạo trước đó." ("Đồng ý xóa"/"Hủy") | filter out; toast "Đã xóa đối tượng khỏi CSDL Master" |
| Reset | confirm "Khôi phục danh bạ mẫu chuẩn?" ("Khôi phục ngay"/"Hủy") | replace whole list with seed; "Thành công" |
Every mutation: `syncModule4Storage(true)` → localStorage + whole-blob Supabase upsert; success toast "Đã lưu đối tượng vào CSDL Master thành công!" (create/edit).

### 3.6 Mail merge (`applyMailMergeTags`, L19259)

Replace each tag globally (`split/join`) in subject and body:

| Tag | Current source | Fallback | Intended source |
|---|---|---|---|
| `{danh_xung}` | `guest.honorific \|\| guest.danhXung`, else rule below | | same |
| `{ho_ten}` | name | "Quý Đại biểu" | |
| `{chuc_vu}` | title | "Đại biểu" | |
| `{co_quan}` | organization | "Cơ quan/Đơn vị" | |
| `{ten_su_kien}` | `event.title \|\| event.name` | "Hội nghị & Tọa đàm xúc tiến đầu tư SCE" | `event.name` |
| `{thoi_gian}` | `event.date + " (Khai mạc: 08:30)"` | "08:30 ngày 15/11/2026" | `eventTime` + `formatVNDate(eventDate)` |
| `{dia_diem}` | location | "Trung tâm Hội nghị Quốc gia NCC (Hà Nội)" | location, fallback "Theo thông báo" |
| `{so_ghe}` | `guest.assignedSeat` | "Khu vực Đại biểu Danh dự" | `seatCode` (+ zone label from 4b) |
| `{can_bo_lien_he}` | `currentUser.full_name` | "Cán bộ Lễ tân SCE" | `currentProfile.fullname` |
| `{sdt_lien_he}` | hard-coded "024.3825.8888 / 0912.345.678" | | profile phone or configurable event hotline |
| `{ma_qr_checkin}` | `guest.qrCode \|\| 'SCE-'+id` | | `SCE-CHK:{eventId}:{guestId}` |
| `{email_don_vi}` | active sender email | | |
| `{ten_don_vi_gui}` | active sender displayName | | |
| `{link_google_form}` | **not mapped** (button exists) | literal tag sent | `event.googleFormUrl` |

Honorific rule: "Đồng chí" if group VIP or SoNganh, or lowercased title contains any of: "chủ tịch", "bí thư", "trưởng", "giám đốc", "thứ trưởng", "bộ trưởng", "chuyên viên", "cán bộ", "viên chức"; else "Quý Ông/Bà". Values are inserted raw into HTML (must be HTML-escaped; subject must not be).

### 3.7 Bulk email state machine

```
Idle --open modal--> Composing
  (on open: restore token from sessionStorage; init GIS token client for active client id;
   select ALL event guests whose email contains '@' + all manual recipients; template=invitation)
Composing --Start (≥1 recipient) + confirm--> Dispatching
Dispatching --Pause--> Paused (loop polls every 400ms)
Paused --Resume--> Dispatching
Dispatching|Paused --Cancel / close-confirm--> Cancelled (loop breaks before next item)
Dispatching --last item--> Done
Done|Cancelled --> Composing (start button visible again)
```
Per recipient: update progress `round((i+1)/N*100)%`, text "Đang gửi ({i+1}/{N}): {name}..."; build subject/body by merge; attachments = shared files + optional QR card PNG; live → Gmail send; sandbox → no network; mark `emailStatus`, `emailSentAt` / `emailError`; log; re-render both lists and 4a guest table; sleep 1200ms. End: "Hoàn tất: {ok} thành công, {fail} lỗi.", persist, call nonexistent `recordAuditLog`, summary modal "Hoàn tất phát hành thư!".
Live mode = `googleUser.accessToken` truthy. Sandbox otherwise.

Confirm dialog: "Xác nhận phát hành thư hàng loạt?" / "Bạn đang chuẩn bị gửi email tới **N đại biểu**. Phương thức gửi: **{mode}**. Mỗi thư sẽ được giãn cách 1.2 giây để đảm bảo tỷ lệ vào Inbox cao nhất và chống Spam." ("Xác nhận Bắt đầu" / "Kiểm tra lại").

Preview / test target (`getPreviewTargetGuest`, L19463), first match wins:
1. selected recipient whose email equals the test email;
2. if manual tab active: first selected manual recipient;
3. if guests tab active: first selected guest with valid email;
4. first of all selected;
5. synthetic officer `{ id:'TEST-OFFICER', name: googleUser.name || profile.fullname || email local part || 'Cán bộ phát hành thư', title: 'Quản trị viên'|'Chuyên viên', organization: 'Trung tâm Xúc tiến đầu tư và Hỗ trợ doanh nghiệp Hà Nội', email: test email || google email || 'canbo@hanoi.gov.vn', group:'SoNganh', assignedSeat:'Khu vực Lễ tân Ban Tổ Chức' }`.
Test send: target = Google email, else `window.prompt`. Subject prefixed "[THỬ NGHIỆM] ". Sandbox sleeps 1200ms then "Mô phỏng gửi thử thành công (Sandbox)".

Sender resolution (`getActiveBulkEmailSender`, L18229): `personal` → signed-in Google user (clientId = global) or placeholder "canbo.canhan@gmail.com"; else mailbox by id; else default mailbox; else first. Client id resolution (`getActiveGoogleClientId`): sender.clientId → `systemSettings.googleClientId` → `localStorage.sce_google_client_id`.
Sign-in without client id: reveal config box + info "Chưa cài đặt Client ID". With: `requestAccessToken({ prompt: 'consent', hint: sender.email })`. Scopes: `gmail.send`, `userinfo.profile`, `userinfo.email`.

Manual add (`addManualRecipient`, L19027): extract all emails with `/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g`; none → "Email không hợp lệ"; for each new lowercased email: name = custom name, else text before `<email>` in `Name <email>` syntax, else local part; auto-select; toast "Đã thêm {n} địa chỉ email nhận thư". "Dùng email của tôi" fills Google or Supabase user email, profile name, role title ("Quản trị viên"/"Lãnh đạo đơn vị"/"Chuyên viên"), org = center name, then adds.

Mailbox rules: displayName required ("Thiếu tên hòm thư"); email must contain `@` ("Email không hợp lệ"); setting default clears others; first mailbox forced default; cannot delete last; deleting default promotes index 0; deleting the selected sender reselects index 0.

### 3.8 Google Form sync

Sheet URL → CSV URL (`extractGoogleSheetCsvUrl`, L20018): already contains `tqx=out:csv` or `format=csv` → as is; `/spreadsheets/d/{id}` → `https://docs.google.com/spreadsheets/d/{id}/gviz/tq?tqx=out:csv`; bare id (≥20 chars of `[A-Za-z0-9-_]`) → same; else raw string. `gid` ignored (first sheet).

CSV parser (`parseCsvToRows`, L20035): RFC-4180-ish; `""` escape inside quotes; comma separator; CR, LF, CRLF row breaks outside quotes; every cell trimmed; rows where all cells are empty dropped.

Column detection (`detectGoogleFormColumns`, L20074), per header lowercased, first matching branch, later headers overwrite earlier ones except `name`:

| Order | Test (substring) | Column |
|---|---|---|
| 1 | "thời gian", "timestamp" | timestamp |
| 2 | "họ", "tên", "name" → if also "thay"/"substitute"/"đại diện" → substitute, else name (first only) | name / substitute |
| 3 | "email", "thư" | email |
| 4 | "thoại", "sđt", "phone", "mobile" | phone |
| 5 | "cơ quan", "đơn vị", "doanh nghiệp", "tổ chức", "công ty" | org |
| 6 | "chức vụ", "vị trí", "title" | title |
| 7 | "xác nhận", "tham dự", "rsvp", "tham gia" | rsvp |
| 8 | "tiệc", "banquet", "chiêu đãi" | banquet |
| 9 | "thay thế", "đi thay" | substitute |
| 10 | "ghi chú", "ý kiến", "note" | notes |
Neither name nor email found → error "Không nhận diện được cột Họ tên hoặc Email trong Google Sheet."

RSVP parse (`parseRsvpStatusText`): empty → pending; contains any of "không", "bận", "từ chối", "vắng", "no", "declined" → declined; else any of "có", "tham dự", "đồng ý", "xác nhận", "chắc chắn", "yes", "attend" → confirmed; else pending. Banquet parse: contains "có", "yes", "tham gia", "đồng ý", "dự tiệc" → true.

Per response row (skip when both name and email empty):

| Match | Writes |
|---|---|
| Guest matched | `rsvpStatus`, `hasBanquet` (always overwritten), `rsvpSource='google_form'`, `rsvpRespondedAt = timestamp \|\| now`, `substituteName` if provided, `phone`/`email` only if guest's is empty |
| No match, auto-add on (`!== false`), name present | push guest `{ id:'GF-'+ts36+'-'+rand4, name, title || 'Đại biểu', organization || 'Đăng ký trực tuyến', email, phone, group: org contains "sở" or "ubnd" → SoNganh else DoanhNghiep, sendMethod:'email', inviteStatus:'sent', rsvpStatus, hasBanquet, substituteName, notes: (notes+' \| ' if any) + 'Nạp tự động qua Google Form', rsvpSource, rsvpRespondedAt }` |
| No match, auto-add off | response kept in table as "Chưa khớp" |
Then cache responses globally, set `lastFormSyncTime`, `formResponsesCount`, persist, re-render.

Auto-sync timer (L20573): on page load (+2s) and on config save, `setInterval` 300,000ms; each tick syncs only `module4State.selectedEventId` when that event has `autoSyncGoogleForm && googleSheetUrl`, silently.

Simulation (`simulateSampleGoogleFormResponses`, L20425): replaces cache with 4 fixed responses built from the first 3 guests (or placeholders) plus "Hoàng Quốc Việt"; mutates guests[0..2] (confirmed+banquet / declined+substitute "Đ/c Phạm Văn Phó phòng" / confirmed+banquet); adds guest `GF-SIM-01` if no guest named "Hoàng Quốc Việt"; persists to cloud; "Đã nạp 4 phản hồi giả lập mẫu!".

### 3.9 QR check-in card PNG (`generateGuestQrCheckinBase64`, L19381)

Canvas 300×360: white bg, top band 60px `#1e3a8a`; header "THẺ ĐẠI BIỂU - CHECK-IN GIỜ G" (bold 12px, y 26) and "TRUNG TÂM SCE HÀ NỘI" (10px, y 45) in white; QR 150×150 at (75,75) of text `SCE-CHECKIN:{guestId}:{guestName}:{eventId}` (qrcodejs, level M); name bold 13px y 255; organization 11px y 275; "Số ghế: {assignedSeat}" bold 12px blue y 300 when set; "Mã: {id}" 10px y 330. Filename `The_CheckIn_{name with [^a-zA-Z0-9] → _}.png`. Returns null when QRCode lib missing or on error.

---

## 4. External side effects

| Kind | Detail | Ref |
|---|---|---|
| localStorage | `sce_tcsk_app_data` (whole appData), `sce_tcsk_local_events` (events), via `syncModule4Storage` (L13759). `ensureMasterGuestDb` writes `sce_tcsk_app_data` directly | L12866 |
| localStorage | `sce_google_client_id` (global OAuth client id) | L18805, L18262 |
| sessionStorage | `sce_google_access_token`, `sce_google_user` (JSON `{name,email,picture,accessToken}`) | L18590, L18681, L18709 |
| Supabase | `saveAppDataToSupabase(note)` → upsert `sce_tcsk_app_data` `{id:1, data, updated_at, updated_by, updated_by_email}` when `currentUser`; note "Cập nhật dữ liệu Phân hệ 4 (Khách mời / Gian hàng)". Whole-blob last-write-wins | L13763, L6782 |
| Google Identity Services | `google.accounts.oauth2.initTokenClient` (script L52) | L18664 |
| HTTP | `GET https://www.googleapis.com/oauth2/v3/userinfo` (Bearer) | L18699 |
| HTTP | `POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send` body `{raw}` (base64url RFC 2822) | L19657, L19782 |
| HTTP | `GET` Google Sheet gviz CSV (unauthenticated, public sheet) | L20218 |
| MIME | multipart/mixed; From display name RFC 2047 B-encoded (if `"name" <addr>` form); Subject B-encoded; HTML part base64; attachments base64 with B-encoded `name`/`filename`; CRLF; whole string base64url without padding | L19544-19592 |
| File read | `FileReader.readAsDataURL` for attachments; skip files > 25MB with "File quá lớn" | L19314-19349 |
| File export | xlsx (ExcelJS), xls (HTML), CSV ×3 (master, booths, GF responses) via Blob + `<a download>` | §1.6-1.8, L20543 |
| Clipboard | `navigator.clipboard.writeText(formUrl)` | L19970 |
| window.open | Google Form URL `_blank` | L19986 |
| Timers | GF auto-sync `setInterval` 300s (L20575), boot `setTimeout` 2s (L20593); dispatch sleeps 1200ms/400ms; QR draw `setTimeout` 80ms; ExcelJS poll 100ms×25, 3s | |
| Global listener | `document` click hides suggest dropdown | L13322 |
| CDN libs | ExcelJS 4.4.0 (L48), qrcodejs 1.0.0 (L50), SweetAlert2 11 (L46), GSI client (L52) | |

---

## 5. Dependencies

### 5.1 This unit calls (provided elsewhere)

| Symbol | Owner | Use |
|---|---|---|
| `appData` (`events`, `eventGuests`, `eventBooths`, `masterGuestDb`, `systemSettings`) | foundation | state |
| `module4State.selectedEventId`, `.activeSubTab` (L12175) | 4a | current event |
| `moduleBoothsState.selectedEventId` (L16758) | 4b | booths export, cross-link |
| `syncModule4Storage` (L13759) | 4a | persist |
| `saveAppDataToSupabase` (L6782) | foundation | cloud |
| `switchMainTab` (L8011), `toggleSidebar` | foundation shell | navigation |
| `renderModule4`, `switchCrmSubTab` (L13736), `ensureStarterDataForEvent` (L13774), `renderCrmGuestsTable`, `updateCrmKpiCards`, `renderPopupGuestsTable` | 4a | re-render after writes |
| `renderModuleBooths` | 4b | cross-link |
| `escapeHtml` (L8202, escapes `& < > "` only) | foundation | |
| `formatVNDate` (L8368) | foundation | (should be used by export/merge) |
| `currentUser`, `currentProfile` (L6055-6056; `fullname`, `department`, `role`) | foundation auth | signature, sender name |
| `Swal` | lib | all dialogs/toasts |
| `ExcelJS`, `QRCode`, `google.accounts.oauth2` | libs | |
| `recordAuditLog` | **does not exist** (only real audit APIs: `loadAuditLogsList` L7548, `openAuditLogsModal` L7855) | |
| DOM ids in 4a's `crmGuestModal`: `crmGuestName`, `crmGuestGroup`, `crmGuestTitle`, `crmGuestOrganization`, `crmGuestPhone`, `crmGuestEmail`, `crmGuestNotes`, `crmGuestHasBanquet`, `crmGuestSuggestDropdown` | 4a | suggest fill |

### 5.2 Others call into this unit

| Caller | Symbol |
|---|---|
| Sidebar L326, admin L580 | `switchMainTab('tab-admin-guests')`, `scrollToMasterGuestDbSection` |
| `switchMainTab` L8080 | `renderMasterGuestDbUI` |
| `initModule4` L13683 (4a) | `ensureMasterGuestDb` |
| 4a guest form | `handleCrmGuestNameSuggest`, `handleCrmGuestNameFocus`, `openMasterGuestPickerModal` |
| Module 4 toolbar L1556-1587, popup L4059 | `openBatchImportFromMasterDbModal`, `openGoogleFormRsvpModal`, `openBulkEmailModal`, `exportGuestListExcel` |
| KPI card L1624, GF modal L4971 | `triggerGoogleFormSyncNow` |
| Booths tab L1942, L2076 | `exportBoothsExcel` |
| Admin settings L844-857, L6886 | `openUnitEmailManagerModal`, `openUnitEmailEditModal`, `renderAdminUnitEmailsSection` |
| Module 5 scanner `processScannedCode` L21170 | consumes QR payloads (expects `SCE-CHK:{eventId}:{guestId}`) |
| `removeVietnameseTones` | used only inside this unit (L12985-13633, L20134) but generic: move to shared lib |
| Modules 2 and 3 | should call cross-links; currently none do |

---

## 6. Bugs and logic flaws

Severity: Critical / High / Medium / Low.

### Security

| # | Sev | Where | What is wrong | Intended |
|---|---|---|---|---|
| B1 | Critical | L20407-20413, L20402 | GF responses table injects `r.timestamp`, `r.name`, `r.org`, `r.email`, `r.phone`, `matchedGuestName` raw into `innerHTML`. Any anonymous Google Form respondent gets script execution in staff sessions (holding Gmail tokens and Supabase session). | Render as text (React escapes by default). |
| B2 | High | L18891-18896 | Bulk email recipient list renders `g.name`, `g.title`, `g.organization`, `g.email` raw. Guests auto-added from GF (B1 source) make this a stored XSS. | Text rendering. |
| B3 | High | L19259-19311, L19534 | Mail merge inserts guest/event values unescaped into HTML body; preview sets `innerHTML = previewBody` (XSS in app) and outgoing official mail carries attacker HTML. | HTML-escape merge values for body; sanitize template HTML (DOMPurify) for preview. |
| B4 | High | L19605 | `logBulkEmailConsole` uses `innerHTML` with guest names, emails and API error messages. | Text nodes. |
| B5 | Medium | L20290, L18934-18945, L19549-19560 | Recipient email validated only by `includes('@')`; GF responses set guest email raw; `To:` header built from it. CR/LF in a form-supplied email enables MIME header injection (e.g. `Bcc:`). From regex breaks when displayName contains `"`. | Validate RFC 5322 address at boundary; reject CR/LF; encode headers properly. |
| B6 | High | L13238-13241, L18031-18038, L20550-20562 | CSV formula injection in all 3 CSV exports (values starting `=`,`+`,`-`,`@` execute in Excel). GF CSV data comes from the public. | Prefix such cells with `'`, or export xlsx with string cells. |
| B7 | Medium | L17804-17817, L17883-17892 | HTML `.xls` fallback interpolates every value (and event name/location) unescaped: broken file or HTML injection when a name contains `<` or `&`. | Escape, or drop the fallback (ExcelJS is bundled). |
| B8 | High | L326, L6380-6397 | Admin tab `tabBtn-admin-guests` is never hidden by role (only `tabBtn-admin`, `tabBtn-users` are); any user can add/edit/delete/reset the shared master DB. | Admin (and maybe leader) only, enforced server-side (RLS). |
| B9 | High | L4486, L18329, L18424-18531 | "Quản lý Hòm Thư Đơn Vị" ("Dành cho Admin") and Client ID config are reachable by every user from the bulk email modal; anyone can repoint OAuth Client IDs. | Role gate + server enforcement. |
| B10 | Low | L18728-18735 | Google profile name/email/picture rendered raw. | Text / `next/image`. |
| B11 | Low | L19366 | Attachment filename rendered raw. | Text. |
| B12 | Low | L13038-13041, L13443, L13540, L18366-18372 | Ids interpolated into `onclick="fn('${id}')"`; `escapeHtml` (L8202) does not escape `'`. Ids are cloud-synced data. | Event handlers with closures. |
| B13 | Medium | L18590-18599, L18681 | OAuth access token kept in sessionStorage and restored blindly. | Memory only, with expiry. |

### Wrong data

| # | Sev | Where | What is wrong | Intended |
|---|---|---|---|---|
| B14 | High | L19384 vs L21177 | Emailed QR encodes `SCE-CHECKIN:{guestId}:{name}:{eventId}`; module 5 scanner only parses `SCE-CHK:` and otherwise matches the whole string against id/phone/name. Emailed check-in cards never scan. | One shared encoder/decoder `SCE-CHK:{eventId}:{guestId}`. |
| B15 | High | L19284 vs L10443-10444 | `{thoi_gian}` reads `event.date`; events store `eventDate`/`eventTime`. Every invitation states the hard-coded "08:30 ngày 15/11/2026". | `eventTime` + `formatVNDate(eventDate)`. |
| B16 | High | L19286, L19433 | `{so_ghe}` and QR card seat read `assignedSeat`; seats are stored in `seatCode` (L13660 and 4a). Always "Khu vực Đại biểu Danh dự", seat line never drawn. | `seatCode`. |
| B17 | Medium | L19287-19288, L19285 | `{can_bo_lien_he}` reads `currentUser.full_name` (auth user has no such field; profile has `fullname`) → always "Cán bộ Lễ tân SCE". `{sdt_lien_he}` hard-coded fake numbers. `{dia_diem}` fallback is a fictitious venue "NCC". | Profile name/phone; configurable hotline; neutral fallback. |
| B18 | Medium | L4669, L19291-19305 | `{link_google_form}` button exists but no mapping: literal tag goes out. `{ma_qr_checkin}` is mapped (to an unscannable `SCE-{id}`) but has no button. | Map to `event.googleFormUrl`; drop or fix QR tag. |
| B19 | High | L19801-19805, L19835 | Sandbox mode marks guests `emailStatus:'sent'` with timestamp and syncs to cloud. Simulated sends become permanent "Đã gửi" records. | Sandbox never mutates persisted data. |
| B20 | High | L20495-20531 | "Nạp phản hồi giả lập mẫu" overwrites RSVP/banquet/substitute of the first 3 real guests and inserts a fake guest, then syncs to cloud. No confirmation. | Remove from production, or keep demo data in memory only. |
| B21 | High | L20274-20275 | Sync always overwrites `rsvpStatus` and `hasBanquet`: if the Sheet has no RSVP column every matched guest becomes `pending`; no banquet column → `hasBanquet=false`. With auto-sync every 5 min, staff edits are wiped repeatedly. | Only write fields whose column exists and whose parsed value is definite; respect a newer manual edit (compare timestamps). |
| B22 | Medium | L20091, L20102-20103 | Column detection: "tên" matches "Tên cơ quan / đơn vị" (org taken as name if it comes first); a header like "Bạn có tham dự tiệc chiêu đãi?" hits the RSVP branch (checked before banquet) and replaces the RSVP column. | Score-based header mapping with explicit priorities, plus a manual column-mapping UI. |
| B23 | Medium | L20149 | RSVP parse: substring "no" matches "Hanoi", "not", "notes"; "không" checked first so "Có, không ăn tiệc" → declined; "substituted" never produced although a substitute column is read. | Normalized whole-option matching against the Form's choice labels; substitute present → `substituted`. |
| B24 | Medium | L20124-20137 | Phone match accepts any guest whose phone ends with the response's last 8 digits; name-only match merges namesakes. Wrong guest updated. | Exact normalized phone (VN +84/0 handling); name match only with org agreement; ambiguous → "Chưa khớp" for review. |
| B25 | High | L13655-13656 | Batch import creates guests as `inviteStatus:'sent'`, `rsvpStatus:'confirmed'` with no invitation sent or reply. Inflates RSVP KPIs and the export's confirmed count. | `pending` / `pending`. |
| B26 | Medium | L13638-13643 | Re-importing an existing guest overwrites event-specific group/title/phone/email/hasBanquet with master values, silently. | Skip existing by default; optional "update contact fields" choice; never touch event-specific fields. |
| B27 | Medium | L13531-13535, L13628-13634 | Dedupe key = normalized name + org equality only; inner whitespace not collapsed; "UBND TP Hà Nội" ≠ "Ủy ban nhân dân thành phố Hà Nội"; email/phone ignored. Duplicates slip through. | Store `masterId` on guests; match by masterId, then email, then phone, then name+org. |
| B28 | Medium | L13093-13149 | Master create has no duplicate check. | Warn on email/phone/name+org collision. |
| B29 | Medium | L12862-12871 | `ensureMasterGuestDb` reseeds whenever the list is empty: deleting the last record resurrects 41 seed records on next render; the reseed writes localStorage only (cloud diverges). | Seed once (migration) with an explicit "seeded" flag. |
| B30 | Medium | L19878, L20315 | `googleFormCachedResponses` is one global, not keyed by event: after switching events the responses tab, KPIs, badge count and CSV export show the previous event's responses. | Per-event cache (or persisted responses table). |
| B31 | Medium | L20578-20587 | Auto-sync only syncs the currently selected event; other events with auto-sync enabled never sync. Timer starts 2s after load even when signed out. | Server-side scheduled sync per event, or loop over all enabled events while signed in. |
| B32 | Low | L20238 | `guests = appData.eventGuests[evId] \|\| []`: if the event has no guest array yet, auto-added guests are pushed to a temp array and lost. | Create the array. |
| B33 | Medium | L19839 | `recordAuditLog` does not exist anywhere: bulk sends are never audited. Also uses `eventData.title` (empty). | Real audit write with event name. |
| B34 | Medium | L17431, L17750 | Export shows raw `eventDate` (ISO `YYYY-MM-DD`) and omits `eventTime`. | `formatVNDate`, include time. |
| B35 | Low | L17441-17452, L17539-17551 | Stats row omits QuốcTế; group column has no QuocTe/BanToChuc fill. | Count and style all groups. |
| B36 | Low | L17378-17391, L6066-6067 | Agency names hard-coded although `systemSettings.agencyName/parentAgency` exist. | Read settings. |
| B37 | Medium | L18036, L18046 | Booths CSV exports raw status codes (`available`, `reviewing`, `confirmed`); crashes with `TypeError` when the found event has no `name` (legacy `title` events; see L13719). | Translate labels; null-safe name. |
| B38 | Low | L1067, L13199, L13211 | Copy says 38 seed records; seed has 41. | Derive from data. |
| B39 | Low | L1063-1066, L13216 | "Xuất Excel" downloads a CSV. | Real xlsx via shared exporter. |
| B40 | Low | L19062 | Display-name extraction builds a RegExp from the raw email (`+`, `.` are metacharacters). | Escape or parse `Name <addr>` with a tokenizer. |
| B41 | Low | L19030, L19038 | JS reads `manualRecipientTitleInput`, which does not exist in HTML; title always "Đại biểu". | Add field or drop. |
| B42 | Low | L20277 | `rsvpRespondedAt` stores the sheet's locale timestamp string; elsewhere ISO. | Parse to ISO. |
| B43 | Low | L20018-20033 | CSV URL ignores `gid`; multi-tab sheets read the first tab. | Keep `gid`. |

### Race conditions, reliability, performance

| # | Sev | Where | What is wrong | Intended |
|---|---|---|---|---|
| B44 | Medium | L19438-19450 | QR card waits a fixed 80ms then draws the `<img>` qrcodejs created; if it has not decoded yet the QR is blank. | Generate QR to canvas/data URL synchronously (e.g. `qrcode` package `toDataURL`) and await image load. |
| B45 | Medium | L18590-18599, L19782-19795 | No token-expiry handling: after ~1h every send fails 401 while UI shows "Đã kết nối"; loop keeps going 1.2s per failure; no 429/5xx backoff. | Track `expires_in`; on 401 pause and re-auth; exponential backoff on 429. |
| B46 | Medium | L18320-18327, L19771-19773 | Switching sender keeps the old token; `From:` claims the selected unit mailbox while Gmail sends as the signed-in account (rewritten or rejected). | Bind token to sender; show actual From; require re-auth on switch. |
| B47 | Medium | L19320, L19587 | Per-file 25MB check only; total and base64 overhead ignored (Gmail API message cap); whole MIME (with attachments) re-encoded via `btoa(unescape(encodeURIComponent()))` per recipient: heavy memory/CPU for N × large files. | Check total ≤ ~18MB raw; encode attachments once; build bytes with `TextEncoder`. |
| B48 | Medium | L19817-19819 | Each recipient re-renders both recipient lists and 4a's full guest table: O(N²) DOM work. | Update one row (React state). |
| B49 | Low | L19810-19815, L19850-19870 | Pause button label/class not reset after finish or cancel; cancelling while paused leaves "Tiếp tục". Progress box never reset. | Derive UI from the state machine. |
| B50 | Low | L13257-13312, L12977 | Suggest/search recompute accent-stripping (14 regex passes) for every record on every keystroke, no debounce. Fine at 41 rows, poor at thousands. | Precomputed normalized index + debounce. |
| B51 | Low | L13251, L20565-20567 | Master CSV revokes the object URL synchronously after `click()` (can cancel download in Firefox); anchor not attached. GF CSV never revokes. | Shared `downloadBlob` util. |
| B52 | Low | L17305-17333 | `loadExcelJsLibrary` is redundant (ExcelJS loaded at L48); 3s timeout may resolve before `onload`. | Import ExcelJS as a module (dynamic `import()`). |
| B53 | Medium | L6782-6800 | Every CRM/email/GF write upserts the entire appData blob as row 1: concurrent staff edits overwrite each other (last write wins); bulk email persists only at end. Foundation concern, worst here because GF auto-sync writes every 5 min. | Row-level tables; per-record writes. |

### Dead code, duplication, UX, a11y

| # | Sev | Where | What is wrong | Intended |
|---|---|---|---|---|
| B54 | Low | L18067-18101 | Cross-links never called. When called they render module 4 twice and the first render uses the stale event (state set after `switchMainTab`). | Routes `/events/[id]/guests` etc. linked from modules 2/3. |
| B55 | Low | L13144 | `isDefaultVip` written, never read, not updated on edit. | Delete. |
| B56 | Low | L18575 | Initial `selectedSenderEmailId: 'unit_mail_1'` matches no seed id; fallback `'gmail_cfg_1'` (L18276, L18509) may not exist after deletions. | Resolve from data. |
| B57 | Low | L18215, L18259-18265, L18801-18806 | Client id stored in 3 places (per-sender, `systemSettings.googleClientId`, localStorage); `DEFAULT_UNIT_SENDER_EMAILS` alias unused. | One source. |
| B58 | Low | L12958-12975, L13378-13391, L13482-13495, L18813-18823 | Four copies of pill-filter class toggling; three copies of the master filter predicate (L12985, L13508, L13583). | One `FilterPills` component and one `filterContacts()` function. |
| B59 | Low | §3.2 | Inconsistent search fields across surfaces (picker skips email, suggest/batch skip phone, bulk email not accent-insensitive). | One search function everywhere. |
| B60 | Low | L17245 vs L12910, L4555-4561 | Three naming schemes per group ("🏢 Doanh nghiệp" in export, "💼 Doanh nghiệp & HTX" in UI, "Khối Sở ban ngành & Quận huyện" vs "🏛️ Sở ban ngành"); bulk email pills lack QuocTe/BaoChi. | Single group registry `{code, label, shortLabel, icon, color}`. |
| B61 | Medium | L13257-13330, L18889, L19159 | Suggest dropdown: no keyboard navigation, no ARIA combobox/listbox, click-only rows; recipient rows are clickable `div`s; modals lack focus trap, Escape close, `aria-modal`. | Accessible Combobox / Dialog primitives. |
| B62 | Low | L13008, L13550 | Classes `dark:hover:bg-slate-750` and `py-0.2` (L1078-1098) do not exist in Tailwind; no hover in dark mode, badge padding ignored. | Valid tokens. |
| B63 | Low | L19612 | Test send asks for an email with `window.prompt`. | Inline field. |
| B64 | Low | L18608-18613 | Opening the dispatcher pre-selects every guest with an email; one click on Start mails the whole list. | Default to none or to the filter; see Q6. |
| B65 | Low | L18008-18061 | `exportBoothsExcel` lives in the guest-export section; header cells unquoted, `code`/`status` not quote-escaped. | Move to 4b with shared CSV/xlsx util. |
| B66 | Low | L17748-17944 | HTML fallback duplicates the xlsx layout with different column spans; the two drift apart. | Delete fallback. |
| B67 | Low | L13062 | New master record defaults "Tiệc VIP" to checked for every group. | Default by group (VIP on, else off); see Q4. |

Bug count: 67.

---

## 7. Rewrite notes

### 7.1 Feature breakdown (suggested slices)

1. `lib/text/normalize.ts`: accent strip, whitespace collapse; `lib/contacts/search.ts`: shared filter + ranking (§3.2).
2. `lib/groups.ts`: group registry (labels, short labels, icons, colors, export fills).
3. `lib/guest-labels.ts`: sendMethod / inviteStatus / rsvp label tables (§1.6.1) used by UI and export.
4. Master Directory admin page `/admin/contacts`: table, pills with counts, search, create/edit dialog, delete confirm, reseed (admin-only), CSV/xlsx export.
5. `ContactCombobox` for the 4a guest form (auto-suggest) + `ContactPickerDialog`; on select, store `masterId` on the guest.
6. Batch import dialog: selection set across filters, "already in event" status, upsert policy (§3.4 intended).
7. Guest-list export: one `buildGuestWorkbook(event, guests, profile, settings)` pure function (ExcelJS), golden-file tested against §1.6.1; no HTML fallback.
8. `lib/export/csv.ts` with formula-escape + `downloadBlob`.
9. Cross-links: Next.js routes `/events/[eventId]/guests`, `/events/[eventId]/seating`, `/events/[eventId]/booths`; modules 2/3 render `Link`s.
10. Sender mailboxes admin (`/admin/settings` section) + role gate.
11. Bulk email: composer (templates registry, merge-tag inserter, sanitized preview), recipients (guests/manual), dispatcher as a reducer-driven state machine (§3.7), Gmail client (token lifecycle, backoff), MIME builder (unit tested), QR card generator shared with module 5's QR codec. Consider moving sending server-side (route handler) so tokens never sit in storage.
12. Google Form RSVP: config per event, fetch+parse (pure, tested on fixture CSVs), column mapping UI with auto-detect suggestions, matcher with review queue for ambiguous rows, per-event persisted responses, scheduled sync (server cron or client loop over all enabled events). Remove simulation from production.

### 7.2 Shared UI primitives observed

Modal/Dialog (header icon tile + title + subtitle + close; footer Cancel/Primary), ConfirmDialog, Toast (top-end, 1.5-3s), Loading dialog, FilterPills with count badges, SearchInput with icon, DataTable (sticky header, max-height scroll, empty state with icon), GroupBadge, StatusChip (RSVP, banquet, email status, "Đã có trong SK"), Combobox dropdown, Tabs (underline and segmented variants), Checkbox list with select-all, ProgressBar, LogConsole, FileChip list, Toggle row (label + description + checkbox), copy-to-clipboard button. Color language: emerald = Master DB, amber = module 4, red = email, indigo = Google Form.

### 7.3 Open product questions

- Q1. Seed data uses real officials' names, titles and phone/email patterns. Ship it, replace with neutral samples, or import the real directory once?
- Q2. Who may edit the Master Directory and sender mailboxes: admin only, or admin + leader?
- Q3. Should creating/editing a guest in an event offer "save to Master Directory" (today it never writes back)? Should master edits propagate to linked event guests?
- Q4. Default banquet flag for new master contacts: by group, or always on (current)?
- Q5. Guest-list export: export all guests (current) or the filtered/sorted view? Include address/taxCode? Should signature names (department head, director) come from settings?
- Q6. Bulk email: default recipient selection (all with email today)? Should a successful send set `inviteStatus` to `sent` and `sendMethod` to `email`? Keep a sandbox mode at all?
- Q7. Should Gmail sending move server-side (service account / domain-wide delegation, or stored refresh tokens) instead of per-officer browser OAuth?
- Q8. Google Form: keep the "auto-add new guests" behavior? Should form answers ever override a manual staff edit?
- Q9. Are bulk email and Google Form RSVP owned by this unit, or by another spec (4a or a communications unit)? Range-wise they are here.
- Q10. Real CSV/XLSX file import of guest lists does not exist today. Is it wanted (the brief mentions "import formats")?

Undetermined: whether the gviz CSV endpoint is CORS-readable from the browser for every public sheet was not verified at runtime.
