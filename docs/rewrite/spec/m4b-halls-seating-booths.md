# Module 4b spec. Hội trường mẫu, Sơ đồ chỗ ngồi, Gian hàng Hội chợ

Source: `/Users/ngotuananh/ProjectCode/SEC/tochucsukien/code/index.html` (branch dev, 6463fbf). All `NNNN` refs are lines in that file.

Scope:
- Hall template catalog: admin tab `mainTab-admin-halls` (978-1034), modals `adminHallTemplatesModal` (4312-4344) and `editHallTemplateModal` (4347-4399).
- Per-event zone customization: modal `customizeZonesModal` (4402-4429).
- Seating chart: sub-tab 3 of the guest module, `crmSubTabContent-seating` (1825-1907). The HTML is outside the assigned ranges but is owned here. Modal `assignSeatModal` (3896-3926).
- Fair booths: main tab `mainTab-booths` (1912-2144), modal `crmBoothModal` (3812-3893), CSV export `exportBoothsExcel` (18008-18056).
- JS: 15733-17241, seeds in 12187-12304 (`DEFAULT_HALL_TEMPLATES`) and 14171-14359 (`generateStarterBoothsList`, `generateStarterSeatingMap`), init/sync in 13681-13811.

Other units own these modals in 3679-4431: `crmGuestModal` (3683, M4a), `printNameCardsModal` (3929), `printBadgesModal` (3984), and the four KPI popups `guestListPopupModal`, `confirmedGuestsPopupModal`, `namecardsAndBadgesPopupModal`, `banquetGuestsPopupModal` (4043-4305). Those go to M4a and M4c, and this spec does not cover them.

---

## 1. Purpose and screens

Purpose:
- **Hall templates.** Admins keep a catalog of reusable hall layouts. A hall is an ordered list of zones, and each zone has a seat prefix, a seat count, a color and a target guest group.
- **Seating.** Each event copies one template's zones, may customize them, and maps seats to guests by hand or by random auto-assignment.
- **Booths (Phụ lục III).** Each event, normally a fair (`event.type === 'hoi_cho'`), keeps a list of 3m x 3m booths. Each booth records the company, products, subsidy policy, status, contact and the SCE duty officer.

### 1.1 Admin tab "Quản trị Hội trường" (`mainTab-admin-halls`)

How to reach it:
- Sidebar button "Quản trị Hội trường" (320) under "Hệ thống & Quản trị".
- Settings page button "Hội Trường Mẫu" (588).
- Router key `tab-admin-halls` maps to `admin-halls` (8032) and calls `renderAdminHallsTabUI()` (8079).
- Top bar title "Quản Trị Hội Trường Tổ Chức Sự Kiện", subtitle "Quản lý danh mục hội trường mẫu, thiết lập phân khu và ma trận vị trí chỗ ngồi." (7963-7971).
- There is no role check (BUG-16).

Header card:
- Title "Quản Trị Danh Mục Hội Trường Mẫu & Sơ Đồ Phân Khu".
- Buttons: "Thêm Hội Trường Mới" opens `openEditHallTemplateModal(null)`. "Khôi Phục Mặc Định" opens `resetDefaultHallTemplates()`.

Three KPI tiles:

| Label | Value | Sub-line |
|---|---|---|
| "Hội trường mẫu chuẩn hóa" | `#statHallsCount` = `{n} Hội Trường` (computed) | static "NCC, UBND TP Hà Nội, KS Quốc tế" (BUG-15) |
| "Tổng sức chứa thiết kế" | `#statHallsSeats` = `{sum totalSeats} Ghế`, from `toLocaleString()` | "Sức chứa phục vụ đại biểu" |
| "Phân khu chuẩn hóa" | static "5 Phân Khu" (BUG-15) | static "VIP 1, VIP 2, Đại biểu, Khách, DN" |

List `#adminHallsDedicatedList` has one card per template, in array order (15881-15952):
- Index badge `idx+1`.
- Name, then a pill `{totalSeats} ghế`.
- Location, or "Chưa cập nhật địa điểm".
- Buttons "Chỉnh Sửa" and "Xóa".
- Italic description, or "Chưa có mô tả chi tiết.".
- Section "Cấu trúc các phân khu chỗ ngồi ({k} khu):" with a 2/3/4/5-column grid of zone chips. Each chip shows a color dot (reads `z.color`, BUG-14), the zone name, "Tiền tố: {prefix}" and "{seatCount} ghế".
- Empty state: none. The list can never be empty, because a missing or empty `hallTemplates` reseeds the defaults.

### 1.2 Modal "Quản Trị Kho Hội Trường Mẫu" (`adminHallTemplatesModal`)

- Opened from the seating toolbar button "Mẫu Hội Trường" (1857) through `openHallTemplatesModal()` (15822).
- Subtitle "Admin tạo và chỉnh sửa các sơ đồ hội trường mẫu (NCC, Tầng 3 UBND...)".
- Header buttons: "Thêm Hội Trường" and close.
- List `#adminHallTemplatesList` (15833-15878) is a second renderer of the same catalog. Each row has an index, name, `{totalSeats} ghế`, location, description, zone chips "{name}: {seatCount} ghế ({prefix})", and buttons "Sửa" / "Xóa".
- Footer: "Khôi phục mẫu mặc định ban hành" and "Đóng".
- Rewrite: one `HallTemplateList` component used in both places, or drop the modal and link to the admin route.

### 1.3 Modal "Thêm / Chỉnh Sửa Hội Trường Mẫu" (`editHallTemplateModal`)

Title:
- Create: "Thêm Hội Trường Mẫu Mới" (15977). The static HTML says "Tạo Hội Trường Mẫu Mới" (4352).
- Edit: "Chỉnh Sửa Hội Trường Mẫu: {name}".

Fields:
- "Tên Hội Trường Mẫu *" (required, placeholder "Ví dụ: Trung tâm Hội nghị Quốc gia (Phòng Đa năng)").
- "Địa Chỉ / Vị Trí Địa Lý".
- "Mô Tả & Quy Chuẩn Hội Trường" (textarea, 2 rows).

Section "Thiết Kế Phân Khu & Số Ghế", button "Thêm Khu Vực". Each zone row (15998-16027) has:
- Index.
- Name input (placeholder "Tên khu (vd: Khu A: VIP)").
- Prefix input (placeholder "Mã (vd: A-)").
- Seat count number input (min 1, max 500, HTML only).
- Color select: red "🔴 Đỏ VIP", blue "🔵 Xanh Dương", emerald "🟢 Xanh Lục", purple "🟣 Tím", slate "⚪ Xám Đá".
- Group select: VIP "⭐ VIP", SoNganh "🏛️ Sở ngành", QuocTe "🌐 Quốc tế", DoanhNghiep "💼 Doanh nghiệp", BaoChi "📰 Báo chí", all "👥 Tất cả".
- Trash button "Xóa khu này".
- `badgeText` has no input. It is kept from the template or defaulted.

Rows bind live to the module-level array `editingHallTemplateZones` (15955) through `oninput`.

New-template default zones (15980-15984):
- `zone_A` "Khu A: Đại biểu VIP", prefix `A-`, 12 seats, red, VIP, badge "Biển tên để bàn chữ A".
- `zone_B` "Khu B: Lãnh đạo Sở ngành & Quận/Huyện", prefix `B-`, 24 seats, blue, SoNganh, badge "Thẻ đại biểu".
- `zone_C` "Khu C: Doanh nghiệp, Hiệp hội & Báo chí", prefix `C-`, 30 seats, slate, DoanhNghiep, badge "Thẻ đại biểu".

"Thêm Khu Vực" (16030):
- Letter = `['A'..'H'][zones.length]`, else `K{n+1}`.
- New zone: `{id:'zone_'+L, name:'Khu L: Đại biểu', prefix:'L-', seatCount:18, colorScheme:'slate', assignedGroup:'all', badgeText:'Thẻ đại biểu'}`. This can create a duplicate id and prefix (BUG-04).

Remove zone: blocked at 1 zone with Swal "Lưu ý" / "Hội trường phải có ít nhất 1 phân khu.".

Footer: "Hủy", then "Lưu Hội Trường" (submit).

Save (16055-16098):
- `totalSeats = Σ parseInt(seatCount)`.
- New id = `hall_${Date.now()}`.
- Replace by id or push.
- Sync, close, re-render both lists and the seating selector.
- Toast "Đã lưu hội trường mẫu: {name}".
- Editing a template does NOT change events that already copied its zones.

Delete (16100-16133):
- Blocked when only 1 template is left: "Không thể xóa" / "Hệ thống cần duy trì ít nhất 1 hội trường mẫu.".
- Confirm title `Xóa hội trường "{name}"?`, text "Hội trường mẫu này sẽ bị xóa khỏi danh sách chọn của hệ thống.", buttons "Đồng ý xóa" / "Hủy".
- Toast "Đã xóa hội trường mẫu: {name}".
- Events referencing the template are not checked (BUG-12).

Reset defaults (16135-16155):
- Confirm "Khôi phục hội trường mẫu?", text "...về mặc định ban hành (NCC, Hội trường tầng 3 UBND Thành phố, Tầng 2 SCE).", button "Khôi phục ngay".
- Replaces the whole catalog with deep copies of the defaults, so custom templates are lost.
- Then shows Swal "Thành công".

### 1.4 Seating sub-tab "3. Sơ Đồ Chỗ Ngồi Hội Trường" (guest module, `subtab-seating`)

- The event comes from the guest module selector `crmEventSelector` (`module4State.selectedEventId`). The sub-tab is reached by `switchCrmSubTab('subtab-seating')` (1690) or by `openModule4Seating(eventId)` (18079) from M2/M3.
- `renderActiveCrmSubTab` calls `renderSeatingChart()` (14518).

Header (1828-1878):
- Title "Sơ Đồ Phân Khu Chỗ Ngồi Hội Trường Tương Tác".
- Meta line `#seatingHallMetaInfo`: hall name • location • badge "Tổng {template.totalSeats} ghế ({zones.length} khu)" (16469-16482). The placeholder before any render is "Chọn mẫu hội trường và phân khu đại biểu chốt tham gia.".

Toolbar:
1. "Hội trường:" select `#seatingHallSelector`, with options "🏛️ {name} ({totalSeats} chỗ)". It calls `onSeatingHallChange`.
2. "Cấu Hình Phân Khu" opens `openCustomizeZonesModal()`.
3. "Mẫu Hội Trường" (amber; label hidden below sm) opens the catalog modal.
4. "Tự Động Xếp Chỗ (Random)" (purple gradient, dice icon).
5. Icon button "Hủy tất cả vị trí ghế đã xếp" (rotate-left).
6. Icon button print, `window.print()`.

Legend `#seatingZoneLegendContainer`: one entry per zone (color dot + "{zone.name} ({getGroupName(assignedGroup)})"), then a dashed white swatch "Còn trống".

Hall diagram `#seatingPrintArea` (min-w 700px):
- Stage bar "★ SÂN KHẤU CHÍNH / MAIN STAGE ★".
- A row of three static chips: "🎙️ Bục phát biểu Lãnh đạo", "🏛️ Bàn Đoàn Chủ tịch", "🌐 Cabin Dịch song ngữ".
- `#seatingHallZonesContainer` holds one block per zone in config order:
  - Header: layer icon + `ZONE NAME UPPERCASE` in the zone text color, plus counter "{assigned}/{seatCount} đã xếp".
  - Grid of seat tiles (4 cols, 6 from sm). Seat codes run `prefix+pad2(1..seatCount)`.

Seat tile (16558-16605), min height 82px, click opens `openAssignSeatModal(code)`:
- Occupied: solid 2px border in the zone color, light zone background. Row 1: mono seat code + green check icon. Name uppercase, bold, truncated. Organization, small and truncated. Tooltip "Ghế {code}: {name} ({org}) - Bấm để thay đổi".
- Empty: dashed border in the zone color, white background. Shows code, italic "Trống", indigo "+ Xếp chỗ". Tooltip "Ghế trống {code} - Bấm để xếp đại biểu".

Zone color registry (repeated 4 times in the source; one table in the rewrite):

| colorScheme | dot | header text | occupied tile | empty tile |
|---|---|---|---|---|
| red | red-500 | red-600/400 | border-red-500 bg-red-50 | dashed red-300 |
| blue | blue-500 | blue-600/400 | border-blue-500 bg-blue-50 | dashed blue-300 |
| emerald | emerald-500 | emerald-600/400 | border-emerald-500 bg-emerald-50 | dashed emerald-300 |
| purple | purple-500 | purple-600/400 | border-purple-500 bg-purple-50 | dashed purple-300 |
| slate | slate-400 | slate-700/300 | border-slate-400 bg-slate-100 | dashed slate-300 |
| unknown | slate-400 | slate | **red** (occupied default 16560) | **red** dashed (empty default 16586) |

Other entry points into seat assignment (from the M4a guest table, 14617-14620):
- Seat chip `{seatCode}` opens `openAssignSeatModal(seatCode)`.
- Link "Chưa xếp" opens `openAssignSeatModalForGuest(guestId)`.

### 1.5 Modal "Xếp Chỗ Ngồi Ghế {code}" (`assignSeatModal`)

- Subtitle "Chỉ định đại biểu ngồi vị trí này".
- Label "Chọn Đại Biểu Từ Danh Sách:".
- Select options:
  - "-- Chưa chỉ định (Để trống ghế) --".
  - Every guest of the event, any RSVP status, in list order, as "{name} - {organization}". A suffix " (Đang ở {seatCode})" is added when the guest sits elsewhere.
  - The current occupant is preselected.
- Footer: rose link "Bỏ xếp chỗ" calls `clearCurrentSeatAssignment`. "Hủy". Indigo "Xác Nhận" calls `saveSeatAssignment`.
- Toasts: "Đã lưu xếp chỗ cho ghế {code}" (1.8 s) and "Đã hủy xếp chỗ ghế {code}".

### 1.6 Modal "Cấu Hình Phân Khu Hội Trường" (`customizeZonesModal`)

- Subtitle "Cán bộ xử lý chính chỉ định nhóm đại biểu và số ghế tương ứng từng khu".
- One card per zone of the event's config copy `currentCustomizingZones` (16176-16212). Each card has:
  - Index.
  - Editable name.
  - Read-only "Tiền tố: {prefix}".
  - "Chỉ định nhóm đại biểu ưu tiên:" select with long labels: "⭐ Đại biểu VIP (Biển tên chữ A để bàn)", "🏛️ Khối Sở, Ban, Ngành & Quận/Huyện", "🌐 Ngoại giao, Đại sứ quán & Quốc tế", "💼 Doanh nghiệp, Hiệp hội & Nhà đầu tư", "📰 Phóng viên Báo chí & Truyền hình", "👥 Hỗn hợp / Không giới hạn nhóm".
  - "Số lượng ghế quy hoạch:" number (1-500) + "ghế ngồi".
- You cannot add or remove zones, or change color or prefix, per event.
- Footer: link "Khôi phục về mẫu gốc" reloads the zones of template `config.hallId` into the modal only. "Đóng". "Lưu Phân Khu" writes `eventHallConfig[ev].zones`, then toast "Đã lưu cấu hình phân khu cho sự kiện!".

### 1.7 Swal flows of seating

**Change hall** (15772-15819):
- Confirm "Áp Dụng Hội Trường Mẫu?" with text: "Bạn đang chuyển sang mẫu hội trường: {name}", "Sức chứa: {totalSeats} ghế với {n} phân khu.", and amber "Lưu ý: Bạn có thể chọn giữ nguyên vị trí cũ hoặc hủy xếp chỗ để phân chia lại từ đầu." The promised choice does not exist (BUG-05).
- Buttons "Đồng ý chuyển hội trường" / "Hủy". Cancel restores the select.
- Confirm sets `eventHallConfig[ev] = {hallId, zones: deepCopy(template.zones)}`, then toast "Đã chuyển sang {name}".
- The seat map is untouched.

**Auto random** (16251-16302):
- Guard: no event gives "Chưa chọn sự kiện".
- Guard: 0 guests with RSVP `confirmed|substituted` gives info "Chưa Có Đại Biểu Xác Nhận" / "Không có đại biểu nào đã xác nhận tham dự (RSVP) để tự động xếp chỗ. Vui lòng cập nhật trạng thái RSVP trước!".
- Guard: no zones gives "Chưa cấu hình hội trường".
- Confirm "Tự Động Random Xếp Chỗ Theo Khu Vực?" lists "{zone.name} ({seatCount} ghế): {groupName}" and the confirmed count. Button "🎲 Tiến Hành Xếp Chỗ Ngẫu Nhiên".
- Result Swal "🎉 Xếp Chỗ Thành Công!":
  - "{totalAssigned}/{confirmed}".
  - Per-zone "{assigned}/{total} ghế". This counts phase 1 only.
  - Then either rose "Còn {n} đại biểu chưa xếp được do hết ghế trong hội trường." or green "Tất cả đại biểu xác nhận đều đã được xếp ghế ngẫu nhiên theo khu vực!".

**Clear all** (16419-16451):
- Confirm "Hủy tất cả xếp chỗ?" / "Thao tác sẽ đưa toàn bộ ghế hội trường về trạng thái Trống để xếp lại từ đầu." / "Đồng ý hủy tất cả" / "Không".
- Then toast "Đã giải phóng toàn bộ ghế ngồi".

### 1.8 Booth tab "Gian hàng Hội chợ" (`mainTab-booths`)

- Sidebar "Gian hàng Hội chợ" (275), router `booths` calls `renderModuleBooths()` (8074). Also `openModule4Booths(eventId)` (18091).
- Top bar title "Quản Lý Gian Hàng Hội Chợ", subtitle "Sơ đồ phân lô mặt bằng 3m x 3m, hồ sơ doanh nghiệp tham gia, kinh phí hỗ trợ và phân công cán bộ trực SCE." (7897-7907).

Header card (1915-1951):
- Title "Mặt Bằng & Doanh Nghiệp".
- "Hội chợ:" select `#boothEventSelector`. It lists ALL events, prefix "🎪 " for `type==='hoi_cho'` else "📅 ". Empty: "(Chưa có sự kiện)".
- Buttons:
  - "Thêm Gian Hàng" opens `openCreateBoothModal`.
  - "Nạp Mẫu Gian" (tooltip "Nạp nhanh 24 gian hàng mẫu Dãy A và B") calls `quickPopulateStarterBooths`.
  - Icon "Xuất danh sách gian hàng ra Excel" calls `exportBoothsExcel`.
  - Icon "In Sơ đồ mặt bằng gian hàng" calls `window.print()`.

Default event (16766-16773, 16836-16839): the first event with `type==='hoi_cho'` or a name containing "hội chợ", else `events[0]`.

Four KPI tiles (16848-16887):

| Label | Value | Sub-line |
|---|---|---|
| "Tỷ Lệ Lấp Đầy Gian Hàng" | `{confirmed}` / `{planned}` "gian quy hoạch", badge `{fill%}`, progress bar | "Còn trống: {available} gian • Đang thẩm định: {reviewing}" |
| "Doanh Nghiệp / HTX Tham Gia" | unique trimmed `company` count, "đơn vị đã chốt vị trí" | static "Sản phẩm OCOP, Nông sản xuất khẩu, Làng nghề" |
| "Chính Sách Hỗ Trợ Kinh Phí" | count subsidy 100 + 50, "gian được hỗ trợ kinh phí" | "Hỗ trợ 100%: a • Hỗ trợ 50%: b • Tự túc: c" |
| "Cán Bộ SCE Trực Hỗ Trợ (Mục 9)" | `max(unique staff, 6)`, "cán bộ theo ca trực" | "Đồng hành cùng DN suốt kỳ Hội chợ" |

Pill sub-tabs (2012-2026). The active one is emerald filled. Clicking a tab restyles the buttons, but the content never switches (BUG-38).
1. "1. Sơ Đồ Mặt Bằng Gian Hàng (3m x 3m = 9m²)" (default).
2. "2. Danh Sách Doanh Nghiệp & Gian Hàng Chi Tiết" with badge `booths.length`.
3. "3. Lịch Trực Cán Bộ SCE Hỗ Trợ Doanh Nghiệp (Mục 9)".

**Sub-tab 1, floorplan** (`boothSubTabContent-floorplan` 2029-2053, render 16984-17018):
- Heading "Mặt Bằng Phân Bổ Gian Hàng Tiêu Chuẩn (Dãy A, B, C...)", help "Click vào ô gian hàng để xem chi tiết doanh nghiệp, mức hỗ trợ kinh phí hoặc chỉnh sửa thông tin."
- Legend: green "Đã giao doanh nghiệp", amber "Đang thẩm định", slate "Gian còn trống".
- Grid with 3/4/6/8 cols, booths in array order. Each tile (min-h 85px) shows: code, chip "{subsidy}%", company (2 lines), and a status word: confirmed "Đã giao DN", reviewing "Thẩm định", available "Gian trống".
- Click opens `openEditBoothModal(id)`.
- Empty: "Chưa có dữ liệu gian hàng. Bấm "Thêm Gian Hàng" hoặc "Nạp Mẫu Gian"."

**Sub-tab 2, list** (`boothSubTabContent-list` 2056-2104, render 17020-17081). Unreachable today (BUG-38).
- Search placeholder "Tìm kiếm theo mã gian, tên doanh nghiệp, sản phẩm...". It lowercases and trims, then matches a substring of code, company, products, contact or staff.
- Subsidy filter "Tất cả chính sách" / "Hỗ trợ 100%" / "Hỗ trợ 50%" / "Tự túc".
- Buttons "Thêm Gian Hàng" and "Xuất Excel".
- Table columns: "Gian" | "Doanh Nghiệp / HTX Tham Gia" (with status badge under it) | "Sản Phẩm Trưng Bày" | "Diện Tích" (`size || '9m²'`) | "Hỗ Trợ Kinh Phí" (badge) | "Người Đại Diện & Hotline" (`contact || 'Chưa có'`) | "Cán Bộ SCE Trực" (`staff || 'Tổ Hội chợ'`) | "Thao Tác" (edit "Sửa gian hàng", delete "Xóa gian hàng").
- Empty: "Chưa có gian hàng nào phù hợp với điều kiện tìm kiếm." (colspan 8).
- Status badges: confirmed "Đã giao doanh nghiệp" (green check), reviewing "Đang thẩm định hồ sơ" (amber hourglass), anything else "Gian còn trống".
- Subsidy badges: 100 purple "Hỗ trợ 100%", 50 emerald "Hỗ trợ 50% TP", anything else slate "Tự túc".

**Sub-tab 3, duty schedule** (`boothSubTabContent-schedule` 2107-2140, render 16919-16947). Unreachable today (BUG-38).
- Heading "Phân Công Cán Bộ Trực Hỗ Trợ Doanh Nghiệp Theo Ca (Mục 9)", text "Theo đúng quy định Phụ lục III: Phân công cán bộ trực, giải quyết các vướng mắc về điện, nước, an ninh, kết nối giao thương trong suốt kỳ Hội chợ."
- Button "Thêm Ca Trực".
- Columns: "Ngày Trực", "Khung Giờ Ca Trực", "Cán Bộ Phụ Trách Trực", "Phòng Ban", "Hotline Trực", "Khu Vực / Dãy Gian Hàng Phụ Trách", "Trạng Thái Ca".
- The rows are 6 HARDCODED entries, the same for every event (BUG-19).
- The add modal is a Swal with "Ngày Trực", "Khung Giờ", "Cán Bộ Phụ Trách", "Khu Vực Phụ Trách" and "Lưu Ca Trực". It saves nothing and shows toast "Đã thêm ca trực cán bộ SCE".

### 1.9 Booth modal "Thêm Gian Hàng Hội Chợ" / "Chỉnh Sửa Gian Hàng {code}" (`crmBoothModal`)

- Subtitle "Cập nhật thông tin gian hàng và chính sách hỗ trợ kinh phí".

Fields, with create defaults:

| Field | Create default |
|---|---|
| "Mã Gian Hàng *" (placeholder "Ví dụ: A01, B12...", uppercased) | blank |
| "Diện Tích / Quy Cách" | "01 gian tiêu chuẩn (9m²)" |
| "Tên Doanh Nghiệp / HTX Tham Gia *" | blank |
| "Sản Phẩm Trưng Bày Chính" | blank |
| "Chính Sách Hỗ Trợ Kinh Phí" | 50 |
| "Trạng Thái Gian Hàng" | confirmed |
| "Người Đại Diện & Hotline DN" | blank |
| "Cán Bộ SCE Trực Hỗ Trợ" | "Đ/c Lê Thị Mai (Phòng PTDN)" |

Select options:
- Subsidy: 50 "Hỗ trợ 50% chi phí gian hàng (Quy định TP)", 100 "Hỗ trợ 100% chi phí gian hàng (Đặc biệt)", 0 "Doanh nghiệp tự túc kinh phí".
- Status: confirmed "Đã chốt hợp đồng & vị trí", reviewing "Đang thẩm định sản phẩm", available "Gian còn trống".

Footer: "Hủy", "Lưu Gian Hàng".

- Validation: Swal "Thiếu thông tin" / "Vui lòng nhập mã gian hàng và tên doanh nghiệp.".
- Save toast "Đã lưu gian hàng {code}".
- Delete confirm "Xóa gian hàng {code}?" / "Doanh nghiệp: {company}" / "Đồng ý xóa", then toast "Đã xóa gian hàng". No undo.
- "Nạp Mẫu Gian" replaces the event's booths with 16 seed booths and NO confirm, then toast "Đã nạp 24 gian hàng mẫu Dãy A và B" (BUG-20).

---

## 2. Domain types

Persistence today:
- Everything lives in the single `appData` blob.
- localStorage `sce_tcsk_app_data` (whole blob) and `sce_tcsk_local_events`.
- Supabase `sce_tcsk_app_data` row `id=1`, column `data` (6799-6807).
- No module-specific tables.
- Keys: `appData.hallTemplates`, `appData.eventHallConfig`, `appData.eventSeating`, `appData.eventBooths`. Guest seat fields are in `appData.eventGuests` (M4a).

```ts
type EventId = string; type GuestId = string; type HallTemplateId = string; type BoothId = string;
type SeatCode = string;          // `${zone.prefix}${String(n).padStart(2,'0')}`, n = 1..seatCount (3+ digits past 99)
type GuestGroup = 'VIP' | 'SoNganh' | 'DoanhNghiep' | 'QuocTe' | 'BaoChi';    // guest form 3718-3722; 'BanToChuc' only in a label map (17252)
type ZoneGroup = GuestGroup | 'all';
type ZoneColor = 'red' | 'blue' | 'emerald' | 'purple' | 'slate';
type ZoneBadgeText = 'Biển tên để bàn chữ A' | 'Thẻ đại biểu';  // free string; no UI input; never rendered (BUG-28)

// appData.hallTemplates: HallTemplate[]  (global catalog; seeded from DEFAULT_HALL_TEMPLATES 12187)
interface HallZone {
  id: string;                    // 'zone_A'...; unique only by convention (BUG-04)
  name: string;                  // e.g. 'Khu A: Đại biểu VIP (Bố trí Biển tên chữ A)'
  prefix: string;                // 'A-'; seat-code prefix; must be unique per hall (not enforced)
  seatCount: number;             // 1..500 intended
  colorScheme: ZoneColor;
  assignedGroup: ZoneGroup;      // priority group for auto-assign and the guest "Chưa xếp" shortcut
  badgeText: ZoneBadgeText;
}
interface HallTemplate {
  id: HallTemplateId;            // 'hall_ncc' | 'hall_ubnd_tang3' | 'hall_sce_tang2' | `hall_${ms}`
  name: string; location: string; description: string;
  totalSeats: number;            // stored; = Σ zones.seatCount at save time (derive in rewrite)
  zones: HallZone[];             // ordered; ≥1
}

// appData.eventHallConfig[eventId]: EventHallConfig  (lazy-created = deep copy of hallTemplates[0])
interface EventHallConfig { hallId: HallTemplateId; zones: HallZone[]; }   // zones = independent copy, customizable

// appData.eventSeating[eventId]: SeatingMap   (seat → guest)
type SeatingMap = Record<SeatCode, GuestId>;

// Guest fields this module reads/writes (Guest owned by M4a)
interface GuestSeatFields {
  id: GuestId; name: string; organization: string; group: GuestGroup;
  rsvpStatus: 'confirmed' | 'substituted' | 'declined' | 'pending';
  seatCode: SeatCode | '';       // DENORMALIZED copy of SeatingMap (BUG-06)
}
// Legacy alias read by M4c exports: `g.assignedSeat` (17447, 17634, 17759, 17798); never written.

// appData.eventBooths[eventId]: Booth[]
type BoothStatus = 'confirmed' | 'reviewing' | 'available';
type SubsidyPercent = 0 | 50 | 100;
interface Booth {
  id: BoothId;                   // 'bth_01'..'bth_16' (seed, SAME across events) | 'bth_<ms>_<rand4>'
  code: string;                  // uppercase, e.g. 'A01'; row letter = code[0] by convention only
  size: string;                  // free text, default '01 gian tiêu chuẩn (9m²)'
  company: string;               // required today; the "enterprise" is just this string
  products: string;
  subsidyPercent: SubsidyPercent;
  status: BoothStatus;
  contact: string;               // free text 'Name - phone'
  staff: string;                 // free text SCE officer
}
// Duty shifts: NOT persisted (hardcoded 16923-16930). Shape shown:
interface BoothDutyShift { date: string; shift: string; officer: string; dept: string; phone: string; zone: string; status: 'Sẵn sàng' | 'Đã phân công'; }

// In-memory UI state
interface SeatingUiState { selectedEventId: EventId | null /* module4State, shared with M4a */; selectedSeatCode: SeatCode | null /* written, never read */; }
interface BoothsUiState {
  selectedEventId: EventId | null;   // independent from module4State
  activeSubTab: 'boothSubTab-floorplan' | 'boothSubTab-list' | 'boothSubTab-schedule';
  searchKeyword: string; filterSubsidy: 'all' | '100' | '50' | '0'; filterStatus: 'all' /* unused */;
}
```

**Seed data** becomes a typed constant table (`DEFAULT_HALL_TEMPLATES`, 12187-12304). Zone id, prefix and badge per row are `zone_X` / `X-` / VIP = "Biển tên để bàn chữ A", others "Thẻ đại biểu".

| hall id | name | location | zones (prefix seats color group) | total |
|---|---|---|---|---|
| hall_ncc | Trung tâm Hội nghị Quốc gia (NCC) | Đại lộ Thăng Long, Mễ Trì, Nam Từ Liêm, Hà Nội | A 18 red VIP; B 36 blue SoNganh; C 24 emerald QuocTe; D 36 slate DoanhNghiep | 114 |
| hall_ubnd_tang3 | Hội trường Tầng 3 UBND Thành phố | Số 12 Lê Lai, Hoàn Kiếm, Hà Nội | A 12 red VIP; B 18 blue SoNganh; C 24 slate DoanhNghiep | 54 |
| hall_sce_tang2 | Hội trường Đa năng Tầng 2 Trung tâm SCE | Tòa nhà Liên cơ quan Sở ngành, Võ Chí Công, Tây Hồ, Hà Nội | A 10 red VIP; B 16 blue SoNganh; C 16 emerald DoanhNghiep | 42 |

Zone names, verbatim:
- NCC: "Khu A: Đại biểu VIP (Bố trí Biển tên chữ A)", "Khu B: Lãnh đạo các Ban, Bộ, Sở ngành & Quận/Huyện", "Khu C: Khách Ngoại giao, Đại sứ quán & Quốc tế", "Khu D: Doanh nghiệp, Hiệp hội & Báo chí".
- UBND: "Khu A: Đoàn Chủ tịch & Lãnh đạo Thành phố VIP", "Khu B: Giám đốc các Sở, Ban, Ngành & Đại diện Quận Huyện", "Khu C: Doanh nghiệp tiêu biểu, Hiệp hội & Báo chí".
- SCE: "Khu A: Bàn Chủ tọa & Khách mời VIP", "Khu B: Khối Sở ban ngành & Tổ chức Quốc tế", "Khu C: Đại diện Doanh nghiệp & Nhà đầu tư".

Descriptions:
- NCC: "Hội trường đa năng cấp quốc tế, âm thanh ánh sáng và bàn ghế tiêu chuẩn cao cấp".
- UBND: "Hội trường giao ban và hội nghị kinh tế đối ngoại UBND Thành phố Hà Nội".
- SCE: "Phòng hội thảo chuyên đề kết nối đầu tư, hỗ trợ doanh nghiệp và xúc tiến thương mại".

Note that the default event hall is `hallTemplates[0]` = NCC, which has A18/B36/C24 (QuocTe)/D36. M5 assumes A12/B18/C24, which is the UBND layout.

**How seeding happens today.** Each of these reseeds `hallTemplates` from defaults whenever it is missing, not an array, or empty: `initModule4` (13687), `ensureStarterDataForEvent` (13779), `getEventHallConfig` (15739), `populateSeatingHallSelector` (15758), `renderAdminHallTemplatesList`, `renderAdminHallsTabUI` (15885) and `openEditHallTemplateModal`. `eventHallConfig[ev]` is created lazily from `hallTemplates[0]`.

Rewrite:
- Ship the defaults as a typed constant and seed the catalog once (migration or admin "Khôi Phục Mặc Định").
- Never seed during render.
- Seed booths: 16 rows (14171-14350): A01-A08 and B01-B08. All "01 gian tiêu chuẩn (9m²)". A05 and B07 are 100%, B08 is 0%, the rest 50%. B05 and B06 are `reviewing`, B08 `available` "(Gian hàng dự phòng Ban Tổ chức)", the rest `confirmed`. This is demo data and must not be ported as auto-seed (BUG-02). Keep it only as an explicit "Nạp mẫu" action if product wants it.

**Recommended rewrite model:**
- Seating is a single relation `SeatAssignment { eventId, seatCode, guestId }`. Unique keys are (eventId, seatCode) and (eventId, guestId).
- `guest.seatCode` is a derived read.
- `EventHall { eventId, templateId | null, zones: HallZone[] }`.
- `HallTemplate` and its zones are rows owned by an admin.
- `Booth` gets `row` (Dãy) and `position` derived from or stored beside `code`.
- An optional `Enterprise` entity (company, tax id, contact) is shared with the M4c master directory. Today the "enterprise" is only `booth.company` text.
- `BoothDutyShift` is persisted per event with `officerUserId`.

---

## 3. Business rules and state machines

### 3.1 Seat codes and capacity

| Rule | Current | Intended |
|---|---|---|
| Seat code | `prefix + pad2(i)`, i = 1..seatCount (16330-16334, 16529) | same; pure `seatCodes(zone)` |
| Missing prefix / count in render and auto-assign | fallback `'A-'` / `10` (16328-16329, 16517-16518) | invalid data rejected at save |
| Prefix uniqueness within a hall | not checked | required, case-insensitive |
| Zone capacity | `seatCount` | 1..500 integer |
| Hall capacity shown | template `totalSeats` (16479, 15767) | Σ event zones `seatCount` |
| "Ghế đã xếp" KPI (M4a card 4) | `Object.keys(seatingMap).length` (14492), counts orphans | count of assignments whose seat exists in event zones |
| Zone counter | occupied tiles whose guest still exists | same |

### 3.2 Seat assignment state (per seat)

States: `empty` and `occupied(guestId)`. The invariant is that one guest has at most one seat and one seat has at most one guest. The current code only partly keeps it (BUG-06).

| From | Action | To | Side effects (current, 16678-16756) |
|---|---|---|---|
| empty | modal pick guest G, "Xác Nhận" | occupied(G) | if G.seatCode = other seat S: `delete map[S]`; `map[seat]=G`; `G.seatCode=seat` |
| occupied(H) | pick G≠H | occupied(G) | `H.seatCode=''` only if H.seatCode===seat; then as above |
| occupied(H) | pick "-- Chưa chỉ định --" or "Bỏ xếp chỗ" | empty | `delete map[seat]`; H.seatCode='' |
| any | "Hủy tất cả" | all empty | `map={}`; every guest `seatCode=''` |
| any | auto random | recomputed | `map={}`, all `seatCode=''`, then the algorithm in 3.3 |
| occupied(G) | M4a quick RSVP → declined (14680-14692) | empty | `delete map[G.seatCode]`; `G.seatCode=''` |
| occupied(G) | M4a guest modal RSVP → declined (14755-14797) | **occupied (unchanged)** | inconsistency; intended to free the seat |
| occupied(G) | M4a delete guest (14851) | empty | `delete map[G.seatCode]` |
| empty | M5 walk-in (21245-21283) | occupied(new) | hardcoded A12/B18/C24 search; writes both stores |
| occupied | change hall / shrink zone / edit prefix | orphan (seat not rendered) | nothing; intended: block or release with explicit choice |

Intended rules:
- Only `confirmed|substituted` guests appear first in the picker. Others are grouped as "Chưa xác nhận" (product question 7.3).
- Picking a guest whose group differs from the zone's `assignedGroup` (when not `all`) shows a warning, not a block.
- Moving a guest who already sits elsewhere asks "Chuyển {name} từ {S} sang {seat}?".

### 3.3 Auto random assignment (16321-16417)

Input: confirmed guests (`rsvpStatus ∈ {confirmed, substituted}`), event zones in order.

1. Clear the whole map and every guest's `seatCode`, including non-confirmed, manual and walk-in seats.
2. Shuffle the unassigned list.
3. For each zone in config order:
   - Shuffle the zone's seat codes.
   - `matching` = all unassigned if `assignedGroup==='all'`, else the unassigned with `g.group===assignedGroup`.
   - Fill seats until `matching` runs out.
   - Record `{name, total, assigned}`.
4. Overflow: collect every empty seat across ALL zones (including VIP zones), shuffle, and pop remaining guests into them.
5. Sync and render. Report `Object.keys(map).length / confirmed`.

Flaws are in BUG-03, BUG-09 and BUG-04. Intended algorithm, as a pure function `autoAssign(zones, guests, existing, mode)`:
- Process zones with a specific group first, then `all` zones.
- Optionally keep existing assignments (`mode: 'fill-empty' | 'reassign-all'`).
- Overflow never goes into VIP zones unless product says so.
- Deterministic given an RNG seed, for tests.

### 3.4 "Chưa xếp" shortcut target seat (16636-16671)

| Condition | Current target |
|---|---|
| a zone has `assignedGroup === guest.group` | the first such zone's prefix |
| no match, guest not VIP, ≥2 zones | `zones[1].prefix` |
| otherwise | `'A-'` |
| scan | `prefix+01..count`, count from the zone with that prefix, else `zones[0]` |
| no free seat | `prefix+'01'` (occupied) |

Intended order: the first free seat in the zone matching the group, then `all` zones, then any non-VIP zone. When nothing is free, show the message "Hội trường đã hết ghế trống". The modal opens with the guest preselected.

### 3.5 Group label registry (replace three divergent maps)

| key | zone short (`getGroupName` 16312) | guest label (`getGuestGroupName` 17245) | template-form option | customize option |
|---|---|---|---|---|
| VIP | ⭐ Đại biểu VIP | ⭐ Đại biểu VIP | ⭐ VIP | ⭐ Đại biểu VIP (Biển tên chữ A để bàn) |
| SoNganh | 🏛️ Khối Sở ban ngành | 🏛️ Sở ban ngành | 🏛️ Sở ngành | 🏛️ Khối Sở, Ban, Ngành & Quận/Huyện |
| QuocTe | 🌐 Ngoại giao & Quốc tế | 🌐 Khách quốc tế | 🌐 Quốc tế | 🌐 Ngoại giao, Đại sứ quán & Quốc tế |
| DoanhNghiep | 💼 Doanh nghiệp & Nhà đầu tư | 🏢 Doanh nghiệp | 💼 Doanh nghiệp | 💼 Doanh nghiệp, Hiệp hội & Nhà đầu tư |
| BaoChi | 📰 Báo chí & Truyền thông | 📰 Báo chí truyền thông | 📰 Báo chí | 📰 Phóng viên Báo chí & Truyền hình |
| all | 👥 Chung / Tất cả nhóm | n/a | 👥 Tất cả | 👥 Hỗn hợp / Không giới hạn nhóm |

Rewrite: one `GROUPS` table with `{key, icon, short, long}`.

### 3.6 VIP rules

- A zone is the VIP zone when `assignedGroup==='VIP'`. Seeds also give it `colorScheme 'red'` and `badgeText 'Biển tên để bàn chữ A'`.
- M4a name-card lists treat a guest as VIP when `group==='VIP'` OR `seatCode.startsWith('A-')` (14878, 15269, 15507). This is a prefix convention (BUG-33). Intended: VIP when `group==='VIP'` or the guest's seat is in a zone whose `badgeText` is the tent card. Expose `seatZone(eventHall, seatCode)`.
- M5 VIP alert hard-codes "Khu A - Ghế {seat}" (21133). It should print the real zone name.

### 3.7 Booth status and KPI rules

| status | floorplan tile | floorplan word | table badge | form option |
|---|---|---|---|---|
| confirmed | emerald-500 | Đã giao DN | Đã giao doanh nghiệp | Đã chốt hợp đồng & vị trí |
| reviewing | amber-400 | Thẩm định | Đang thẩm định hồ sơ | Đang thẩm định sản phẩm |
| available | slate-200 | Gian trống | Gian còn trống | Gian còn trống |
| other/missing | **emerald (as confirmed)** | Đã giao DN | Gian còn trống | n/a |

Transitions: free. Any status can change to any other through the edit modal, with no history. Intended canonical labels: confirmed "Đã giao doanh nghiệp", reviewing "Đang thẩm định", available "Gian còn trống".

| KPI | Current formula | Intended |
|---|---|---|
| planned | `max(booths.length, 24)` | `booths.length`, or an event field `plannedBooths` |
| assigned | count confirmed | same |
| fill % | `round(confirmed/planned*100)` | same over real planned |
| available | `max(0, planned − confirmed)` (includes reviewing) | count `available` (+ unplanned slots) |
| companies | unique `company` over all booths | unique company over confirmed (+reviewing?) booths |
| subsidized | count 100 + 50 over all booths | over non-available booths |
| staff on duty | `max(unique staff, 6)` | unique officers in persisted duty shifts |

Subsidy: `0 | 50 | 100` only. The filter matches equality.

---

## 4. External side effects

- **Persistence**: `syncModule4Storage(notifyCloud)` (13759-13769). It writes localStorage `sce_tcsk_app_data` and `sce_tcsk_local_events`, then, if logged in, `saveAppDataToSupabase('Cập nhật dữ liệu Phân hệ 4 (Khách mời / Gian hàng)')`. That function records an undo snapshot (`window.recordUndoSnapshot`), upserts the whole blob into `sce_tcsk_app_data` `{id:1, data, updated_at, updated_by, updated_by_email}`, and calls `createBackgroundBackup(note)` (6782-6817).
  - Every mutation in this module calls `syncModule4Storage(true)`.
  - Seeding calls `(false)`, local only.
  - Render-time lazy creation (`getEventHallConfig`) does not save.
- **No module-specific Supabase tables.** No realtime.
- **Printing**: `window.print()` for the seating chart (16454) and the booth floorplan (1946). There is no `@media print` in the file, so the whole UI prints.
- **Export**: `exportBoothsExcel` (18008-18056). It builds a CSV with a UTF-8 BOM, CRLF line ends, and every field quoted.
  - Headers: "Mã gian", "Doanh nghiệp / HTX tham gia", "Sản phẩm trưng bày chính", "Quy cách / Diện tích", "Mức hỗ trợ kinh phí (%)", "Trạng thái gian hàng", "Người đại diện & Hotline", "Cán bộ SCE trực hỗ trợ".
  - Filename `DS_GianHang_{event.name with non [A-Za-z0-9À-ỹ] → '_', max 40}_{ms}.csv`.
  - Exports ALL booths, ignoring the search and filter.
  - Empty list gives Swal "Danh sách trống" / "Chưa có gian hàng nào để xuất file.".
  - Success toast "Đã xuất file Excel danh sách gian hàng" (18057).
  - Intended: `.xlsx` through the shared ExcelJS export kit from M4c, with Vietnamese status labels.
- **SweetAlert2** for every confirm and toast. Toasts are top-end, 1.8-2.5 s.
- **localStorage keys owned here**: none beyond the blob.
- **Randomness**: `Math.random` Fisher-Yates (16304).

---

## 5. Dependencies

**Into this module (calls or reads it needs):**
- `appData.events[]` (`id`, `name`, `title`, `type`). `escapeHtml` (8202). `Swal`. `syncModule4Storage` (13759). `saveAppDataToSupabase` (6782). `currentUser`.
- `module4State.selectedEventId` (12175) and `populateCrmEventSelector`, `renderModule4` (14409, re-rendered after every seat/booth mutation), `renderActiveCrmSubTab` (14511), `switchCrmSubTab` (13736) from M4a.
- `ensureStarterDataForEvent` (13774), `generateStarterGuestsList`, `generateStarterBoothsList` (14171), `generateStarterSeatingMap` (14352) in the M4 init/seed block.
- Router `switchMainTab` (8013), DOMContentLoaded `initModuleBooths()` (8231).

**Out of this module (who reads its data):**

| Consumer | Reads | Ref |
|---|---|---|
| M4a guest table | `g.seatCode`; calls `openAssignSeatModal`, `openAssignSeatModalForGuest` | 14617-14620 |
| M4a RSVP/delete | deletes `eventSeating[ev][seatCode]`, clears `seatCode` | 14689-14691, 14851-14852 |
| M4a KPI card 4 | `Object.keys(eventSeating[ev]).length` | 14492-14501 |
| M4a quick seed | rewrites `eventBooths[ev]`, `eventSeating[ev]` | 14389-14391 |
| M4a/M4c name cards, badges, print lists | `seatCode`, VIP via `'A-'` prefix | 14878-14978, 15148-15222, 15269-15386, 15507-15698 |
| M4c Excel guest export | `seatCode \|\| assignedSeat` | 17447, 17634, 17759, 17798 |
| M5 live | `eventSeating`, `seatCode`; walk-in writes the map; monitor hardcodes A12/B18/C24 and ignores `eventHallConfig` | 21245-21283, 21619-21676, 21133 (M5 BUG-19) |
| M6 reports | `eventBooths[ev]` confirmed count, fallback `booths.length \|\| 16` | 22139-22155, 22645-22656 |
| M3 templates | `getGroupName` name collision (BUG-01) | 11147, 11348, 11641, 11770, 11935 |
| M2/M3 navigation | `openModule4Seating`, `openModule4Booths` | 18079, 18091 |

**Contract the rewrite must expose** (serves M4a, M4c, M5, M6):
- `getEventHall(eventId): EventHallConfig` (no render-time mutation).
- `seatCodes(zone)`.
- `seatZone(hall, seatCode): HallZone | null`.
- `seatOf(eventId, guestId)` and `occupantOf(eventId, seatCode)`.
- `assignSeat` / `releaseSeat` / `releaseGuestSeat(guestId)`, called by RSVP-declined and guest delete.
- `findFreeSeat(hall, map, group)`, used by M5 walk-in and the "Chưa xếp" shortcut.
- `zoneOccupancy(zone, map, guests)`, used by M5 for check-in presence.
- `boothsOf(eventId)` and `boothKpis(booths)`, used by M6.

---

## 6. Bugs and logic flaws

Severity: Critical (data corruption or fake data passed off as real), High (wrong core behavior or security), Medium, Low.

| ID | Sev | Where | What is wrong | Intended behavior |
|---|---|---|---|---|
| BUG-01 | High | 11147, 16312 | Two top-level `function getGroupName` in one `<script>` (6031-22713), verified by parsing with acorn. Hoisting makes the seating one (16312) win everywhere. So M3 template category labels (11348, 11641, 11770) show "👥 Chung / Tất cả nhóm" for `cap_ubnd` and other groups, and 11935 PERSISTS that wrong `groupName` into new templates. | Module-scoped label maps; no globals. |
| BUG-02 | Critical | 13774-13811, 16799, 16845, 18073-18097 | `ensureStarterDataForEvent` seeds 16 fake OCOP booths for any event with 0 booths, including conferences, and 22 fake guests when the guest list is empty. It runs on booth-tab event change, `openModule4*` and init. Deleting every booth makes them reappear. `renderModuleBooths` also seeds when the list is undefined. The data later syncs to cloud as real. | Never auto-seed. An empty list shows an empty state. Sample data only by explicit action with confirm. |
| BUG-03 | High | 16276-16300, 16323-16325 | Auto random clears ALL existing assignments, including hand-placed VIPs and M5 walk-ins, and resets `seatCode` for every guest. The confirm text never says existing seats are wiped. | State the wipe in the confirm, or offer the mode "Chỉ xếp người chưa có ghế" (default). |
| BUG-04 | High | 16004, 16030-16044, 16357-16361 | Zone prefixes are not unique. "Thêm Khu Vực" derives the letter from `zones.length`, so A,B,C → remove A → add yields a second `zone_C`/`C-`. With duplicate prefixes the chart renders one occupant in two zones. Auto-assign writes `map[code]` twice: guest 1 keeps `seatCode=X` while `map[X]=guest 2`, so two guests claim one seat. | Validate unique non-empty prefix and zone id. Generate the next unused letter. |
| BUG-05 | High | 15786, 15800-15807, 16215-16236 | Changing the hall, shrinking a zone, or editing a template prefix leaves `eventSeating` and `guest.seatCode` pointing at seats that are no longer rendered. Those guests show a seat chip, count in "Ghế đã xếp" and print on cards, but cannot be released from the chart. The confirm promises "giữ nguyên vị trí cũ hoặc hủy xếp chỗ", which is never offered. | On hall/zone change, compute orphans and ask: release them, or remap by zone order and index. Block shrinking below the occupied index without confirm. |
| BUG-06 | High | 16688-16705, 14755-14797, 21281-21282 | Two sources of truth: `eventSeating[ev]` and `guest.seatCode`. The guest modal setting RSVP "declined" keeps the seat, while quick toggle frees it (14689). `saveSeatAssignment` deletes the guest's old seat via `guest.seatCode`, so if they disagree the old map entry survives and one guest holds two seats. | Single `SeatAssignment` relation with uniqueness. Derive `seatCode`. Release on decline from every path. |
| BUG-07 | High | 16577, 16579, 16599-16600, 14619, 15861, 16187, 17008-17010, 17051, 17059 | Stored XSS. Seat codes (admin-editable prefix), `b.code`, `b.size`, `z.seatCount`, `z.prefix` go raw into HTML text, `title=` and `onclick="fn('${code}')"`. `escapeHtml` (8202) does not escape `'`. Data is shared through the cloud blob to every user. | Components with bound handlers. No HTML strings. |
| BUG-08 | High | 15814, 16094, 16110, 17202, 17215 | SweetAlert2 `title` renders HTML. Hall names and booth codes are interpolated unescaped into titles and toasts. | Text-only dialog titles. |
| BUG-09 | High | 16636-16671, 16625 | "Chưa xếp" shortcut: (a) opens the modal on a seat without preselecting the clicked guest, so the user must find them again; (b) a full zone targets `prefix+'01'` (16667), an occupied seat, and saving evicts that occupant; (c) with no matching prefix, the count comes from `zones[0]` while codes use `'A-'`, producing phantom seats not in the chart. | Rules in 3.4. Preselect the guest. Never target an occupied seat silently. |
| BUG-10 | Medium | 16344-16349, 16371-16390 | Auto-assign depends on zone order. An `all` zone listed before group zones absorbs VIPs and others. Overflow pours any group into any free seat, including the VIP zone. Per-zone result counts ignore overflow placements. | Group zones first, then `all`. Overflow excludes VIP zones (product question). Report final counts per zone. |
| BUG-11 | Medium | 16466, 16479, 15767, 15783 | Header and selector show template `totalSeats`, not the customized event zones total. If the event's template was deleted, `currentHall` falls back to `templates[0]`, so another hall's name and location are shown above this event's zones. | Capacity = Σ event zones. Show "Hội trường (đã xóa khỏi danh mục)" or the stored name snapshot. |
| BUG-12 | Medium | 16100-16133, 15766 | Deleting a template ignores events referencing it. The selector then shows no matching selected option, so the browser displays the first option as if chosen, and picking it fires no change. | Warn with the count of events using it. Keep a name snapshot in the event config. |
| BUG-13 | Medium | 16007, 16206, 16066, 16544 | Seat count `parseInt(v) \|\| 1` accepts negatives and huge values (HTML `max=500` only). 100000 renders 100000 tiles and freezes the page. Negatives reduce `totalSeats`. Empty prefix falls back to `'A-'` and collides. An empty or missing zone name is allowed, and `zone.name.toUpperCase()` throws on a missing name. | Schema validation (zod) on save: name required, prefix pattern `^[A-Z0-9]{1,3}-?$`, unique, count integer 1..500. |
| BUG-14 | Medium | 15940 | Admin tab zone chip dot reads `z.color`, but the field is `colorScheme`, so it is always blue. | Use the color registry. |
| BUG-15 | Low | 1006, 1014, 1023-1024, 991, 16138, 15894 | Static KPI text: "5 Phân Khu", "VIP 1, VIP 2, Đại biểu, Khách, DN", "NCC, UBND TP Hà Nội, KS Quốc tế", placeholder "2.300 Ghế" (real seed total 210). The reset tooltip says "Khách sạn Quốc tế" while the confirm says "Tầng 2 SCE". `toLocaleString()` without `'vi-VN'`. | Computed zone count. Template names from data. `formatNumberVN`. |
| BUG-16 | Medium | 320, 1857, 6380-6397 | Hall template CRUD has no permission check. The sidebar gate hides only `tabBtn-admin` and `tabBtn-users`. Any user can open "Quản trị Hội trường" or the "Mẫu Hội Trường" modal and edit or delete the global catalog. | Admin-only route and actions, enforced server-side (RLS). Officers may only customize their event's zones. |
| BUG-17 | Medium | 13759-13769, 6799-6807 | Every seat or booth change upserts the whole `appData` blob to row id=1. Two officers seating or editing booths at once means last writer wins, with silent loss of the other's changes. | Per-entity writes. Unique seat constraint. Optimistic concurrency. |
| BUG-18 | Medium | 16849, 16852, 16867, 16884, 1980 | Booth KPIs are fabricated or wrong. Planned has a floor of 24. "Còn trống" counts reviewing booths too. Staff has a floor of 6. Companies counts placeholder, available and reviewing booths under the label "đã chốt vị trí". Subsidy counts include empty booths. The product summary is static. | Formulas in 3.7. |
| BUG-19 | High | 16919-16947, 16949-16981, 16923-16930 | The duty schedule (Mục 9) is fake. Six hardcoded rows with real-looking names and phones are shown for every event. "Thêm Ca Trực" collects 4 fields, discards them, and toasts success. The table columns "Phòng Ban" and "Hotline Trực" have no input. | Persisted `BoothDutyShift[]` per event with full CRUD, the officer picked from user profiles, and status computed from the date. |
| BUG-20 | Medium | 1937, 16902-16917, 14171-14350 | "Nạp Mẫu Gian" claims 24 booths ("Đã nạp 24 gian hàng mẫu Dãy A và B"). The generator returns 16. It overwrites the event's booth list with no confirm. | Correct count. Confirm before replacing. Better, append-only into empty slots. |
| BUG-21 | Medium | 3844, 17160 | Company is required even for status "Gian còn trống", so a planned empty booth cannot be created. The seed works around this with the fake company "(Gian hàng dự phòng Ban Tổ chức)". | Company required only when status ≠ available. |
| BUG-22 | Medium | 17144-17206 | No uniqueness check on booth code per event. Two "A01" booths are allowed. | Unique (eventId, code), with an inline form error. |
| BUG-23 | Low | 16997-17005, 17083-17091 | An unknown or missing status renders green "Đã giao DN" on the floorplan but "Gian còn trống" in the table. | One status registry with a single fallback. |
| BUG-24 | Medium | 16841, 16791, 16988, 17024, 17146, 18009 | If `moduleBoothsState.selectedEventId` refers to a deleted event, KPIs use `events[0]` while the floorplan, table, save and export use the stale id. The selector is set to a missing value and shows blank. Saving writes booths under a dead event id. | Validate the selection on every render. Single selected-event source (URL). |
| BUG-25 | Medium | 18031, 18036, 18046, 18057 | Booth export is CSV but is labelled "Xuất Excel" and "Đã xuất file Excel". Status is raw `confirmed`. `code` is not quote-escaped. No formula-injection guard (`=`,`+`,`-`,`@`). `currentEvent.name.replace` throws for events that only have `title`. It ignores the active filter. | xlsx through the shared kit. Vietnamese labels. Escaping. Filename from `name ?? title`. |
| BUG-26 | Low | 16762-16763, 16892-16900 | `filterStatus` exists but has no UI. Search and filter persist across event switches while the input is not cleared. Search is accent-sensitive ("ha noi" ≠ "hà nội"). | Status filter. Reset or keep explicitly. `normalizeVi` matching. |
| BUG-27 | Medium | 16454, 1946, 1886 | Print calls `window.print()` with no print stylesheet. It prints sidebar, top bar, toolbars and dark colors. The 700px-min chart may clip. | Dedicated print view of the chart or floorplan (A4 landscape) with the event and hall header. |
| BUG-28 | Low | 16558, 16609/16675, 278, 16987/17023/17121/17146/17209/18009, 15833 vs 15881, 17196/17228 | Dead or duplicate code. `noteTag` (zone `badgeText`) is never rendered. `module4State.selectedSeatCode` is written but never read. `#sidebarBoothsBadge` is never updated. `typeof moduleBoothsState !== 'undefined'` branches are always true. Two renderers of the hall list differ in labels ("Sửa" vs "Chỉnh Sửa"). Booth save/delete re-render M4 needlessly. | Delete. One list component. |
| BUG-29 | Medium | 1886, 1923 | Responsive. `#seatingPrintArea` has `min-w-[700px]` inside a card with no horizontal scroll container, causing page-level horizontal scroll on phones. The booth header toolbar is `flex-nowrap` with a 200px select and 4 buttons, which overflows at 360px. | Scroll container around the chart only. Toolbar wraps or collapses into a menu. |
| BUG-30 | Medium | 16577, 16599, 17008, 1869, 1874, 1942, 1946, 3824, 3906, 4328, 4354, 4414, 16004-16024 | A11y. Seat and booth tiles are clickable `div`s (no keyboard or role). Icon-only buttons have only `title`. Modals lack `role="dialog"`, a focus trap, Esc and focus return. Status is conveyed by color in the legend and tiles. Zone form inputs have only placeholders (no labels). Booth labels are not bound with `for`. | Buttons with `aria-label`. Accessible Dialog. Visible text status. Labelled inputs. |
| BUG-31 | Low | 16312, 17245, 16012-16019, 16193-16200, 3718-3722, 16997-17003, 17083-17091, 3865-3867, 4352, 15977 | UI inconsistency. Four label sets for guest groups and three for booth statuses (table 3.5, 3.7). Modal title "Tạo..." vs "Thêm Hội Trường Mẫu Mới". Two reset labels ("Khôi Phục Mặc Định" vs "Khôi phục mẫu mặc định ban hành"). Accent colors differ per screen (indigo, emerald, amber, blue) for the same primary action. | Shared registries and one primary button style. |
| BUG-32 | Medium | 14878, 15269, 15507, 13893 | VIP name-card eligibility uses `seatCode.startsWith('A-')`. Seed guest "SoNganh" at A-07 gets a VIP tent card. A hall whose VIP zone uses another prefix gives none, and in NCC zone A has 18 seats while M5 shows 12. | Zone-based (3.6). |
| BUG-33 | Low | 16608-16632 | The seat picker lists every guest (declined and pending included) with no group, RSVP, search or VIP hint. It is unusable for large events. | Searchable combobox grouped by RSVP, showing group and current seat. |
| BUG-34 | Low | 15737-15751, 15739, 15758, 15885, 15963, 15776, 16242, 16465 | Render-time mutation and repeated fallbacks. `getEventHallConfig` creates config and reseeds templates inside renders without saving. `appData.hallTemplates \|\| DEFAULT_HALL_TEMPLATES` is repeated about 8 times. | Selectors are pure. Config is created once when the event is created or the hall is chosen. |
| BUG-35 | Low | 17115 | The new-booth default officer is a specific person ("Đ/c Lê Thị Mai (Phòng PTDN)"). | Blank, or the current user. Picked from user profiles. |
| BUG-36 | Low | 17005, 2035 | The floorplan is in insertion order, not grouped by row ("Dãy A, B, C..." in the heading) or sorted by code. There is no aisle or row layout model. | Group by row letter, sort by number, one row band per Dãy. |
| BUG-37 | Low | 16135-16155 | "Khôi phục mặc định" replaces the whole catalog and deletes custom templates. Events that used a deleted custom template are left with dangling `hallId` (see BUG-12). | Restore by upserting seed rows by id and keeping custom templates, or warn explicitly. |
| BUG-38 | High | 16805-16816, 2029, 2056, 2107 | `switchBoothSubTab` looks up `getElementById('boothSubTab-list')` and similar, but the content divs are `boothSubTabContent-*`. No element has id `boothSubTab-*` (grep). `content` is always null, so the floorplan stays visible and sub-tabs 2 (list, search, filter, edit and delete buttons) and 3 (duty schedule) can never be shown. Only the buttons restyle. The table is still rendered into the hidden tbody. | Working tabs. Tab in the URL (`?tab=`). |

Total: 38.

---

## 7. Rewrite notes

### 7.1 Feature breakdown (suggested `src/features/halls`, `src/features/seating`, `src/features/booths`)

- `halls/domain.ts`: `HallTemplate`, `HallZone` schemas (zod), `DEFAULT_HALL_TEMPLATES` constant, `ZONE_COLORS` registry, `GROUPS` registry (shared with M4a), `nextZoneLetter(zones)`, `validateHall(t)`, `hallCapacity(zones)`.
- `halls/AdminHallsPage` (route `/admin/halls`, admin only): KPI row (count, seats, zones), `HallTemplateCard` list, `HallTemplateDialog` (fields + `ZoneRowsEditor`), delete confirm with usage count, restore defaults.
- `seating/domain.ts`: `seatCodes(zone)`, `seatZone`, `assignSeat`, `releaseSeat`, `releaseGuestSeat`, `findFreeSeat`, `autoAssign(zones, guests, existing, {mode, rng})`, `orphans(hall, assignments)`, `zoneOccupancy`. All pure and unit-tested.
- `seating/SeatingTab` (within the guest module route `/events/[id]/guests?tab=seating`): `HallSelect` (with orphan-resolution dialog), `ZoneCustomizeDialog`, `AutoAssignDialog` (mode choice + per-zone preview), `ClearAllConfirm`, `ZoneLegend`, `HallDiagram` (stage + zones), `SeatTile` (button), `SeatAssignDialog` (searchable guest combobox), `SeatingPrintView`.
- `booths/domain.ts`: `Booth` schema, `BOOTH_STATUS` and `SUBSIDY` registries, `boothKpis`, `filterBooths(booths, {q, subsidy, status})`, `boothRow(code)`.
- `booths/BoothsPage` (route `/events/[id]/booths?tab=floorplan|list|schedule`): KPI row, `FloorplanGrid` grouped by row, `BoothTable`, `BoothDialog`, `DutyScheduleTable` + `DutyShiftDialog` (persisted), export (xlsx through the shared kit), `FloorplanPrintView`.
- Data layer: per-entity tables or slices (`hall_templates`, `event_halls`, `seat_assignments` unique(event, seat) and unique(event, guest), `booths` unique(event, code), `booth_duty_shifts`). While the blob is kept for compatibility, write through typed slice reducers and serialize back to the same `appData` keys.

### 7.2 Shared UI primitives seen

`Dialog` (icon tile + title + subtitle + close, body, footer), `ConfirmDialog`, `Toast`, `KpiCard` (label, value, of-total, badge, progress, sub-line), `PillTabs` with count badge, `DataTable` with empty-state row, `EmptyState`, `Badge` (status, subsidy, group, count), `Button` (primary, secondary, ghost, danger, icon-only with aria-label), `FormField`/`TextInput`/`NumberInput`/`Select`/`Textarea`, `SearchInput` + `normalizeVi`, `EventSelect` (one selected-event source shared M2-M6), `ColorDot`/legend, `Combobox` (seat picker), `PrintPage` (A4 landscape), and the xlsx export helper shared with M4c.

### 7.3 Open product questions (could not determine from code)

- Should auto-assign keep existing seats by default? Current: wipes all. Suggested default: fill empty only.
- Should overflow seat non-VIP guests in the VIP zone, or VIPs in other zones?
- Should VIP seat order follow protocol rank (seat 01 = highest) instead of random? Current: random within the zone.
- Should pending or declined guests be seatable? Current: any guest.
- Should editing a template propagate to events that use it? Current: events keep their own copy, so no.
- May officers add or remove zones and change prefix or color per event? Current: only name, group and count.
- Is the booth tab limited to `type==='hoi_cho'` events? Current: lists all events.
- Is a real enterprise entity wanted, linked to the M4c master directory (tax id, address, sector, OCOP rating), or is free-text `company` enough?
- Is `plannedBooths` per event a stored target? The current 24 is invented.
- Are booth subsidy tiers fixed at 0/50/100? Is the "Hỗ trợ 50% TP" wording a legal reference?
- Who may edit booths, and is a booth status history (thẩm định → chốt) required for Phụ lục III reporting?
- Duty shifts: per-event dates (Ngày 1..N from the event date range) or free text? Is the shift status computed or manual?
- Should the static stage/podium/cabin chips be per-hall configurable?
