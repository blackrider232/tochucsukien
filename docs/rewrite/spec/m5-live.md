# Module 5 spec. Điều hành hiện trường / Live check-in (`mainTab-live`)

Source: `code/index.html`. HTML tab 2149-2475, modals 5167-5468, JS 20600-21786. All line refs are `index.html:<line>`.

Sidebar entry: button `tabBtn-live`, label "Tổ chức sự kiện", icon `fa-mobile-screen-button` (282). Active sidebar color teal-600 (8060). Top bar (FUNCTION_METADATA['live'], 7862+47): title "Tác Nghiệp Hiện Trường Ngày Sự Kiện (Giờ G)", shortTitle "Hiện trường", subtitle "Điều hành tác nghiệp thời gian thực từ T0 - 2h, kiểm tra kỹ thuật, check-in QR và điều phối hội trường."

---

## 1. Purpose and screens

Purpose: day-of-event (T0 / "Giờ G") operations for one selected event: reception check-in of invited guests, walk-in and substitute registration, duty-staff roster with pre-event attendance, field incident log, live hall seat-occupancy monitor, VIP arrival alert, VIP car-pass printing.

### 1.1 Header card (always visible above sub-tabs)

Title row: icon `fa-bolt` teal, text "Điều Hành Hiện Trường".

Toolbar (right, `flex-nowrap`):
- Event select `liveEventSelector`, label "Sự kiện:" (hidden < sm). Options = `appData.events` by `name`. Empty: single option "(Chưa có sự kiện)". Change → select event, seed starter data (see BUG-01), re-render.
- Primary button "Quét Mã QR Check-in" (icon qrcode, emerald→teal gradient) → QR modal.
- Button "Khách Phát Sinh" (blue; label hidden < sm; tooltip "Tiếp nhận đại biểu phát sinh tại chỗ hoặc người đi thay") → walk-in modal.
- Button "Báo Sự Cố" (rose; label hidden < sm; tooltip "Báo cáo sự cố phát sinh tại hiện trường để Tổ Kỹ thuật xử lý") → incident modal.
- Icon-only button car (amber icon, tooltip "In Thẻ xe Ưu tiên VIP (Dán kính lái)") → car-pass modal.

KPI grid (2 cols, 4 at lg). Each card: label, big number, sub-line.

| # | Label (exact) | Big number | Secondary | Sub-line (JS text) |
|---|---|---|---|---|
| 1 | "Tiến Độ Check-in Giờ G" + % badge | checked-in count | "/ {target} mục tiêu"; progress bar width = min(100, %) | "Đã xác nhận: {confirmed} • Chưa đến: {max(0, confirmed − checkedIn)}" |
| 2 | "Đại Biểu VIP Có Mặt" (star icon) | VIP checked-in | "/ {VIP total} Lãnh đạo VIP" | "Đã đón vào Phòng VIP: {vipIn}/{vipTotal} Lãnh đạo" |
| 3 | "Sở Ngành & Doanh Nghiệp" (building icon) | non-VIP checked-in | "đại biểu đã vào hội trường" | "Túi quà & tài liệu đã phát: {n} bộ" (static HTML says "Túi tài liệu đã phát: 0 bộ") |
| 4 | "Trực Ban & Sự Cố" (shield icon) | open incidents (status ≠ resolved) | high>0: "có {n} sự cố KHẨN CẤP" else "sự cố đang xử lý" | "Cán bộ trực đã điểm danh: {present}/{total}" |

Formulas (20832-20899): target = `event.expectedDelegates || 100` (BUG-03); % = round(checkedIn/target×100); confirmed = rsvpStatus ∈ {confirmed, substituted}.

### 1.2 Sub-tab bar (pill buttons, horizontally scrollable)

| id | Label | Badge |
|---|---|---|
| `subtab-checkin` (default) | "1. Bàn Lễ Tân Check-in & Quét QR" | "{checkedIn}/{guests}" |
| `subtab-duty` | "2. Phân Công Ca Trực (Trước ≥ 2h)" | "{present}/{staff}" |
| `subtab-incidents` | "3. Sổ Xử Lý Sự Cố Hiện Trường" | open incident count |
| `subtab-viphall` | "4. Giám Sát Chỗ Ngồi Trực Tiếp" | none |

Active style emerald-600 white; inactive slate text. Only active sub-tab renders.

### 1.3 Sub-tab 1. Bàn lễ tân check-in

Filter bar:
- Search input, placeholder "Nhập tên đại biểu, cơ quan, số điện thoại hoặc mã quét barcode (Enter để check-in)...". Live filter on input; matches case-insensitive substring of `name`, `title`, `organization`, `phone`, `seatCode`. (Enter does nothing, BUG-11.)
- Select status: `all` "Tất cả trạng thái Check-in", `checked_in` "✓ Đã đến (Đã Check-in)", `not_yet` "⏳ Chưa đến".
- Select group: `all` "Tất cả nhóm khách", `VIP` "⭐ Lãnh đạo VIP", `SoNganh` "🏛️ Khối Sở ngành", `DoanhNghiep` "💼 Doanh nghiệp & HTX", `QuocTe` "🌐 Khách Quốc tế", `BaoChi` "📰 Báo chí, Truyền hình".
- Toggle button beep: "Âm báo: Bật" (volume-high emerald) / "Âm báo: Tắt" (volume-xmark slate); tooltip "Bật/Tắt âm thanh bíp khi quét QR thành công". Default on, not persisted.

Table columns: "STT" (1-based index in filtered list), "Họ và Tên Đại Biểu", "Chức Danh & Cơ Quan", "Nhóm Khách", "Vị Trí Ghế", "Suất Tiệc", "Túi Quà & Tài Liệu", "Giờ Check-in", "Trạng Thái & Thao Tác".

Row cells:
- Name: star icon if VIP (tooltip "Đại biểu VIP"); name; if `substituteName` → amber italic "Người thay: {substituteName}"; phone with phone icon if present.
- Title (fallback "Đại biểu") bold, organization below.
- Group badge (shared `renderGroupBadgeHtml`, 14637): VIP "⭐ VIP" amber; SoNganh "🏛️ Sở ngành" blue; DoanhNghiep "💼 Doanh nghiệp" emerald; QuocTe "🌐 Quốc tế" purple; BaoChi "📰 Báo chí" rose; else "Đại biểu" slate.
- Seat: mono indigo chip `{seatCode}`, else italic "Chưa xếp".
- Banquet: `hasBanquet` → amber "Có" with utensils icon, else "Không".
- Gift: toggle button "✓ Đã phát" (blue) / "Chưa phát" (slate). Click toggles `hasGiftPackage`, saves.
- Check-in time: checked → emerald clock + `checkInTime` (fallback "Vừa xong"); else italic "Chưa đến".
- Action: not checked → emerald "Check-in"; checked → slate "Hủy Check-in" (undo icon, hover rose). Both call the same toggle, no confirmation.
- Checked-in rows tinted emerald-50/40.

Empty state (`liveGuestEmptyState`): user-slash icon, "Không tìm thấy đại biểu phù hợp", "Thử tìm kiếm với từ khóa khác hoặc bấm "Khách Phát Sinh" để tiếp nhận đại biểu mới."

Feedback on check-in: beep; VIP → VIP arrival modal; non-VIP → toast success "Check-in: {name} (Ghế {seatCode} | Đại biểu)" 2 s. On cancel → toast info "Đã hủy check-in: {name}" 1.8 s.

### 1.4 Sub-tab 2. Phân công ca trực

Header: "Phân Công 4 Bàn Trực Trọng Yếu (Quy Định Có Mặt Trước ≥ 2h)"; description "Theo quy chế điều hành SCE, toàn bộ cán bộ trực phải có mặt trước giờ khai mạc ít nhất 2 giờ để kiểm tra cơ sở vật chất và tiếp nhận bàn lễ tân."; amber button "Phân Công Cán Bộ Trực" → duty modal.

Summary grid, 4 fixed cards (21317-21342):

| Desk | Card name | Icon | Dept line (hardcoded) |
|---|---|---|---|
| 1 | "Bàn 1: Tiếp Đón VIP" | star amber | "Phòng HC-TC / BGĐ" |
| 2 | "Bàn 2: Tiếp Đón Đại Biểu" | users blue | "Phòng Phát triển DN" |
| 3 | "Bàn 3: Điều Phối Sân Khấu" | microphone purple | "Phòng Xúc tiến ĐT" |
| 4 | "Bàn 4: Trực Hội Chợ OCOP" | store emerald | "Phòng Tư vấn DN" |

Per card: badge "{present}/{assigned} có mặt" (emerald when all present and ≥1 assigned, else amber); staff names comma-joined or "Chưa phân công". Staff→desk match: `role.includes('Bàn {n}')`.

Table: "STT", "Họ và Tên Cán Bộ SCE", "Phòng Ban Công Tác", "Vị Trí / Bàn Trực Ban", "Giờ Quy Định" (fallback "06:30"), "Giờ Điểm Danh" (emerald time or italic "Chưa điểm danh"), "Trạng Thái Đến" ("✓ Đã có mặt" emerald / "Chờ điểm danh" amber), "Thao Tác" (amber "Điểm danh" button, or emerald "Sẵn sàng" text). No empty state (empty tbody). No edit, delete, or undo.

Điểm danh → `checkedInAt` = now "HH:MM", `status='on_time'`, save, toast "Đã điểm danh ca trực: {name}".

### 1.5 Sub-tab 3. Sổ xử lý sự cố

Header "Sổ Nhật Ký Xử Lý Sự Cố & Điều Phối Kỹ Thuật Hiện Trường"; description "Tiếp nhận, phân loại và điều phối xử lý tức thì các sự cố âm thanh, ánh sáng, điện lưới, trùng ghế ngồi hoặc khiếu nại gian hàng."; rose button "Báo Cáo Sự Cố Mới".

Grid of cards (1/2/3 cols), array order (new ones unshifted to front). Card:
- Code (mono; rose if open, slate if resolved) + urgency badge: high "🔴 KHẨN CẤP" rose, medium "🟡 TRUNG BÌNH" amber, low "🟢 THẤP" slate; unknown falls to KHẨN CẤP.
- Location with pin icon; description bold; note box (clipboard icon) if `note`.
- Footer: "Phụ trách: {assignee || 'Tổ Kỹ thuật'}"; "Báo lúc: {reportedAt || '07:30'}" + " • Xử lý: {resolvedAt}" if set.
- Open: emerald "Đã xử lý xong" button. Resolved: "Đã khắc phục" text, card opacity-80. Open card border rose + shadow.

Empty state: check icon, "Hiện trường hoạt động an toàn", "Chưa ghi nhận sự cố kỹ thuật nào phát sinh. Bấm "Báo Cáo Sự Cố Mới" nếu có vấn đề cần điều phối xử lý tức thì."

Resolve dialog (Swal): title "Xác nhận giải quyết {code}?", text input label "Ghi chú phương án khắc phục:", placeholder "Ví dụ: Đã thay thế dây cáp mới, tín hiệu ổn định...", buttons "Đã khắc phục xong" / "Hủy". Confirm → resolved, `resolvedAt` HH:MM, `note` = input or "Đã kiểm tra và xử lý thành công.", toast "Sự cố {code} đã được giải quyết".

### 1.6 Sub-tab 4. Giám sát chỗ ngồi trực tiếp

Header "Giám Sát Tỷ Lệ Lấp Đầy Chỗ Ngồi Hội Trường Thời Gian Thực"; description "Các vị trí ghế màu xanh lá đậm biểu thị đại biểu đã check-in và đã an tọa trong hội trường."; legend "Đã đến & an tọa" (emerald), "Đã đến (ở phòng VIP)" (amber, never rendered, BUG-22), "Chưa đến" (slate).

Hall diagram: stage bar "★ SÂN KHẤU CHÍNH / MAIN STAGE ★"; three hardcoded zones, 6-col grid each (21619-21680):
- "KHU A: ĐẠI BIỂU VIP (12 GHẾ HÀNG 1)" seats A-01..A-12, stats "{n}/12 đã có mặt".
- "KHU B: LÃNH ĐẠO SỞ NGÀNH & QUỐC TẾ (18 GHẾ)" B-01..B-18, "{n}/18 đã có mặt".
- "KHU C: DOANH NGHIỆP & BÁO CHÍ (24 GHẾ)" C-01..C-24, "{n}/24 đã có mặt".

Seat tile (min-height 75px), resolved via `eventSeating[ev][code] → guestId → guest`:
- Occupied + checked in: solid emerald, code + check icon, name, `checkInTime` or "Đã đến". Tooltip "{code}: {name} (ĐÃ CÓ MẶT)".
- Occupied + not checked in: white bordered, code + amber "Chờ", name, organization. Tooltip "{code}: {name} (Chưa đến)".
- Empty: dashed, code, italic "Trống".
- Click on occupied tile toggles check-in (both directions, no confirm).

### 1.7 Modals

**QR scanner** (`liveQrScannerModal`, 5171): title "Quét Mã QR Check-in", subtitle "Bàn Lễ tân đón tiếp đại biểu Giờ G". Static fake camera frame text "Hướng camera về phía mã QR trên thẻ đại biểu" (no camera, BUG-10). Form: label "Hoặc nhập chuỗi quét Barcode / Mã định danh:", input placeholder "Ví dụ: SCE-CHK:...", submit "Check-in"; footer "Đóng". Open: clear input, focus after 150 ms. Submit: trim, ignore empty, process, clear input. Not found → Swal warning "Mã không tồn tại" / "Không tìm thấy đại biểu khớp với mã quét: "{code}"" / "Đóng". Found → close modal, toggle check-in.

**Walk-in** (`liveWalkInModal`, 5211): title "Tiếp Nhận Khách Phát Sinh / Người Đi Thay", subtitle "Đăng ký nhanh tại bàn Lễ tân ngày diễn ra sự kiện". Fields:
- "Họ và Tên Đại Biểu *" (required) placeholder "Họ tên người đến dự".
- "Nhóm Khách Mời *": DoanhNghiep "💼 Doanh nghiệp & HTX" (default), SoNganh "🏛️ Khối Sở ban ngành", QuocTe "🌐 Khách Quốc tế / Ngoại giao", BaoChi "📰 Báo chí, Truyền hình", VIP "⭐ Khách VIP phát sinh".
- "Chức Danh / Vị Trí" placeholder "Ví dụ: Phó Giám đốc / Trưởng phòng".
- "Cơ Quan / Đơn Vị *" (required) placeholder "Tên đơn vị công tác".
- "Số Điện Thoại Liên Hệ" placeholder "0912.xxx.xxx".
- "Đi Thay Cho Đại Biểu (nếu có)" placeholder "Tên đại biểu nhận giấy mời" (free text, not a picker).
- Checkbox "Đăng ký suất tiệc chiêu đãi" (default off); checkbox "Đã phát túi tài liệu & thẻ" (default on).
- Buttons "Hủy", "Check-in Ngay".
Validation message: Swal warning "Thiếu thông tin" / "Vui lòng nhập họ tên đại biểu và cơ quan công tác.". Success: Swal "Check-in Phát Sinh Thành Công!" with lines "Đại biểu:", "Cơ quan:", "Vị trí ghế cấp: {seat || 'Khu vực chung'}", "Suất tiệc chiêu đãi: Đã đăng ký|Không", button "Xác nhận". Plays beep. No VIP alert even for VIP group.

**Incident** (`liveIncidentModal`, 5293): title "Báo Cáo Sự Cố Hiện Trường", subtitle "Điều phối giải quyết tức thì các phát sinh Giờ G". Fields:
- "Vị Trí Xảy Ra Sự Cố *" options (value = label text without emoji): "Sân khấu / Bục phát biểu" (default), "Bàn Lễ tân đón tiếp", "Hội trường Khu A (VIP)", "Hội trường Khu B / Khu C", "Khu gian hàng Hội chợ OCOP", "Phòng Khánh tiết VIP Lầu 1", "Sảnh đón xe & Bãi đỗ xe".
- "Mức Độ Nghiêm Trọng *": high "🔴 Khẩn cấp (Báo Giám đốc SCE xử lý ngay)" (default), medium "🟡 Trung bình (Cần khắc phục trong 15p)", low "🟢 Thấp (Ghi nhận điều chỉnh)".
- "Nội Dung Sự Cố Cần Xử Lý *" textarea 3 rows (required), placeholder "Mô tả cụ thể sự cố: Mất mic, màn hình LED lỗi, khách VIP phát sinh ngoài danh sách, trùng ghế ngồi...".
- "Cán Bộ Phụ Trách Khắc Phục" placeholder "Ghi rõ họ tên cán bộ hoặc tổ phụ trách"; prefilled on open with "Đ/c Phạm Văn Hùng (Tổ Âm thanh)" (BUG-27).
- Buttons "Hủy", "Tiếp Nhận & Điều Phối".
Validation: "Thiếu thông tin" / "Vui lòng nhập nội dung sự cố.". Success toast warning "Đã phát lệnh điều phối sự cố {code}" 2.5 s.

**VIP car pass** (`vipCarPassModal`, 5355): title "Thẻ Xe Ưu Tiên VIP (VIP Car Pass)", subtitle "Khổ chuẩn A5 ngang dán kính chắn gió trước phục vụ xe Lãnh đạo UBND TP và Ngoại giao vào sảnh chính"; amber "In Thẻ Xe" → `window.print()`; close X. Content: one pass per guest with `group==='VIP'`; empty → "Chưa có đại biểu VIP để tạo Thẻ xe.". Pass layout (21733-21773): double red border, serif; header "SỞ TÀI CHÍNH HÀ NỘI" / "TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP HÀ NỘI" (hardcoded); big "XE ƯU TIÊN SỰ KIỆN"; "VIP CAR PASS • SẢNH ĐÓN CHÍNH"; event name (fallback "HỘI NGHỊ XÚC TIẾN ĐẦU TƯ SCE 2026"); left "Phương tiện phục vụ:" + title (fallback "LÃNH ĐẠO VIP") + name; right "Khu vực dừng đỗ:" "CỔNG VIP - SẢNH A" "Lối đón tiếp dành riêng"; footer "* Yêu cầu lái xe dán thẻ tại góc dưới bên phải kính chắn gió trước. Lực lượng an ninh tạo điều kiện cho xe vào sảnh đón." `page-break-after: always` per pass.

**VIP arrival alert** (`vipArrivalModal`, 5380): red/amber full-screen overlay. "★ THÔNG BÁO LỄ TÂN KHẨN CẤP ★"; name "ĐỒNG CHÍ {NAME UPPERCASE}"; "{title || 'Lãnh đạo'} - {organization}"; "Thời gian đến:" checkInTime; "Vị trí ghế VIP:" "Khu A - Ghế {seat} (Biển tên chữ A)" or "Phòng Khánh tiết VIP Lầu 1"; fixed instruction "Chỉ đạo lễ tân: Hướng dẫn vào Phòng Khánh tiết VIP Lầu 1. Trưởng BTC ra đón."; button "ĐÃ TIẾP NHẬN - BẮT ĐẦU ĐÓN TIẾP" closes. Static HTML defaults contain a real person's name (5388-5399), BUG-23.

**Duty staff** (`liveDutyStaffModal`, 5413): title "Phân Công Cán Bộ Trực", subtitle "Quy định có mặt trước giờ khai mạc tối thiểu 2 giờ". Fields: "Họ và Tên Cán Bộ SCE *" placeholder "Ví dụ: Nguyễn Văn Cường"; "Phòng Ban Công Tác *": "Phòng Hành chính - Tổ chức" (default), "Phòng Phát triển doanh nghiệp", "Phòng Xúc tiến đầu tư", "Phòng Tư vấn doanh nghiệp"; "Vị Trí / Bàn Trực Phụ Trách *": "Bàn 1: Đón tiếp Lãnh đạo UBND TP & VIP" (default), "Bàn 2: Đón tiếp Sở ngành & Doanh nghiệp (Phát thẻ/Tài liệu)", "Bàn 3: Điều phối Hội trường, Sân khấu & Cabin dịch", "Bàn 4: Trực hiện trường Hội chợ & Hỗ trợ gian hàng"; "Giờ Bắt Buộc Có Mặt (Trước 2 giờ)" free text default "06:30 (Sáng sớm)". Buttons "Hủy", "Lưu Phân Công". Validation "Thiếu thông tin" / "Vui lòng nhập họ tên cán bộ.". Toast "Đã phân công cán bộ trực".

---

## 2. Domain types

All Module 5 state lives inside the single `appData` JSON blob. Persisted to localStorage `sce_tcsk_app_data` (whole blob) and `sce_tcsk_local_events` (`appData.events`), and to Supabase table `sce_tcsk_app_data` row `id=1` column `data` (whole blob). There are no Module-5-specific tables.

```ts
type EventId = string;            // appData.events[].id
type GuestId = string;            // 'gst_vip_01' (seed, SAME across events), 'gst_<ms>_<rand4>' (M4), 'gst_walkin_<ms>' (M5)
type SeatCode = string;           // `${zone.prefix}${pad2(n)}` e.g. 'A-04'. Prefix from hall zone config (M4).

type GuestGroup = 'VIP' | 'SoNganh' | 'DoanhNghiep' | 'QuocTe' | 'BaoChi';
type RsvpStatus = 'confirmed' | 'substituted' | 'declined' | 'pending';   // owned by M4
type SendMethod = 'direct' | 'ems' | 'email';                              // owned by M4
type InviteStatus = string;  // M4 enum; walk-in writes 'received'

// appData.eventGuests[eventId]: Guest[]  (owned by M4; M5 adds the check-in fields and creates walk-ins)
interface Guest {
  id: GuestId;
  name: string;
  group: GuestGroup;
  title: string;
  organization: string;
  phone: string;
  email: string;
  sendMethod: SendMethod;
  inviteStatus: InviteStatus;
  rsvpStatus: RsvpStatus;
  substituteName: string;          // M4 meaning: name of the person attending instead. Walk-in writes "Đi thay cho: X" (BUG-15)
  hasBanquet: boolean;
  seatCode: SeatCode | '';
  notes: string;
  // Written only by M5:
  isCheckedIn?: boolean;
  checkInTime?: string | null;     // toLocaleTimeString('vi-VN') ≈ 'HH:MM:SS', no date
  checkInStaff?: string;           // currentUser.email or 'Lễ tân SCE' (seeds use a staff name)
  hasGiftPackage?: boolean;
}

// appData.eventSeating[eventId]: Record<SeatCode, GuestId>  (owned by M4; M5 walk-in writes one entry)
type SeatingMap = Record<SeatCode, GuestId>;

// appData.eventHallConfig[eventId] (owned by M4, read via getEventHallConfig 15737). M5 IGNORES it today (BUG-19); rewrite must read it.
interface HallZone { id: string; name: string; prefix: string; seatCount: number;
  colorScheme: string; assignedGroup: GuestGroup | 'all'; badgeText: string; }
interface EventHallConfig { hallId: string; zones: HallZone[]; }

// appData.events[] fields M5 reads
interface EventLite { id: EventId; name: string; eventDate: string /* 'YYYY-MM-DD' */;
  eventTime: string /* 'HH:MM', e.g. '08:30' */; targetGuests: number;
  expectedDelegates?: never; /* read by M5 but never written anywhere (BUG-03) */ }

// appData.eventDutyRoster[eventId]: DutyStaff[]   (M5-owned, persisted in blob)
type DutyDesk = 1 | 2 | 3 | 4;
type DutyStatus = 'pending' | 'on_time';  // 'late' never produced; status is written but never read
interface DutyStaff {
  id: string;                      // 'duty_01'..'duty_04' (seed) | 'duty_<ms>'
  name: string;
  department: 'Phòng Hành chính - Tổ chức' | 'Phòng Phát triển doanh nghiệp' | 'Phòng Xúc tiến đầu tư' | 'Phòng Tư vấn doanh nghiệp';
  role: string;                    // full desk label; desk number parsed by substring 'Bàn n'
  requiredTime: string;            // free text, e.g. '06:30 (Sáng sớm)'
  checkedInAt: string | null;      // 'HH:MM'
  status: DutyStatus;
}

// appData.eventIncidents[eventId]: Incident[]   (M5-owned, persisted in blob)
type IncidentUrgency = 'high' | 'medium' | 'low';
type IncidentStatus = 'open' | 'in_progress' | 'resolved';   // in_progress only from seed
type IncidentLocation = 'Sân khấu / Bục phát biểu' | 'Bàn Lễ tân đón tiếp' | 'Hội trường Khu A (VIP)'
  | 'Hội trường Khu B / Khu C' | 'Khu gian hàng Hội chợ OCOP' | 'Phòng Khánh tiết VIP Lầu 1' | 'Sảnh đón xe & Bãi đỗ xe';
interface Incident {
  id: string;                      // 'sc_01' (seed) | 'sc_<ms>'
  code: string;                    // 'SC-NN', NN = list length + 1 at creation, per event
  location: IncidentLocation;
  description: string;
  urgency: IncidentUrgency;
  assignee: string;                // default 'Tổ Kỹ thuật'
  status: IncidentStatus;
  reportedAt: string;              // 'HH:MM'
  resolvedAt: string | null;       // 'HH:MM'
  note: string;                    // resolution note
}

// In-memory UI state (not persisted)
interface Module5State {
  selectedEventId: EventId | null;     // init: module4State.selectedEventId ?? events[0].id
  activeSubTab: 'subtab-checkin' | 'subtab-duty' | 'subtab-incidents' | 'subtab-viphall';
  filterCheckInStatus: 'all' | 'checked_in' | 'not_yet';
  filterGroup: 'all' | GuestGroup;
  searchKeyword: string;               // trimmed, lowercased
  audioBeepEnabled: boolean;           // default true
}

// QR payload produced by M4 badge printing (14988, 15713): `SCE-CHK:${eventId}:${guestId}`
```

Rewrite type recommendations: store `checkInAt`/`checkedInAt`/`reportedAt`/`resolvedAt` as ISO 8601 timestamps and format on display; brand `EventId`/`GuestId`; derive `DutyDesk` as a number field instead of substring of the label; `requiredAt` as derived value (see 3.3), not free text. Model check-in as `CheckIn { guestId, eventId, at: ISO, by: userId, desk?: string, giftGiven: boolean }` so desks can write independently (see BUG-05).

---

## 3. Business rules and state machines

### 3.1 Guest check-in (21028-21072)

| From | Trigger | To | Side effects |
|---|---|---|---|
| not checked in | "Check-in" button, seat tile click, QR/manual code match | checked in | `checkInTime`=now; `hasGiftPackage=true` (forced); `checkInStaff`=user email or 'Lễ tân SCE'; beep; VIP → arrival modal, else toast; save; re-render |
| checked in | "Hủy Check-in", seat tile click, scanning same code again | not checked in | `checkInTime=null`; gift and staff NOT reset; toast info; save |
| any | gift button | same | `hasGiftPackage` toggled (allowed before check-in) |

Intended rewrite rules:
- Scan/manual code on an already checked-in guest must NOT toggle off. Show "Đã check-in lúc {time}" warning (BUG-08).
- Cancel check-in requires confirmation and is only offered from the table row, not seat tiles (BUG-09).
- Code `SCE-CHK:{eventId}:{guestId}` must match the selected event; mismatch → error naming the other event (BUG-07).
- Non-prefixed codes: exact guest id or exact normalized phone only; reject ambiguous matches (BUG-06).
- Declined guests (`rsvpStatus='declined'`) may still check in; show a warning badge. (Current code allows silently; parity keeps allowing.)

### 3.2 Walk-in / substitute (21223-21303)

- Required: name, organization (HTML `required` + JS check).
- Creates new Guest: `id='gst_walkin_'+ms`, `title||'Đại biểu phát sinh'`, `email=''`, `sendMethod='direct'`, `inviteStatus='received'`, `rsvpStatus = substituteFor ? 'substituted' : 'confirmed'`, `substituteName = substituteFor ? 'Đi thay cho: '+substituteFor : ''`, `isCheckedIn=true`, `checkInTime=now`, `checkInStaff`, `notes = substituteFor ? 'Đại biểu phát sinh tại chỗ (Đi thay {X})' : 'Đại biểu phát sinh đăng ký tại bàn Lễ tân'`.
- Seat auto-assign: prefix/size by group: VIP → 'A-' 12; SoNganh → 'B-' 18; all others → 'C-' 24. First code A-01.. not present in `eventSeating[ev]`. None free → `seatCode=''`, shown "Khu vực chung". Writes `eventSeating[ev][seat]=guestId`.
- Intended: zones and sizes from `getEventHallConfig(ev)` (zone whose `assignedGroup` = group, then `'all'`, then any free seat); substitute flow should pick the original invited guest from a list, set original `rsvpStatus='substituted'`, `substituteName=<walk-in name>`, check in the original record (keeping its seat) instead of creating a second guest (BUG-15). Duplicate check on phone/name+org before creating (BUG-16).

### 3.3 Duty roster and the 2-hour rule

Current: no rule is computed. `requiredTime` is free text default '06:30 (Sáng sớm)'. Điểm danh sets `checkedInAt=HH:MM` and `status='on_time'` unconditionally. "Present" = `checkedInAt` truthy. Desk card counts by `role.includes('Bàn n')`.

| From | Trigger | To |
|---|---|---|
| (none) | "Lưu Phân Công" | pending, checkedInAt=null |
| pending | "Điểm danh" | on_time, checkedInAt=now |
| on_time | (none) | terminal; no undo/edit/delete |

Intended rule: `requiredAt = combine(event.eventDate, event.eventTime) − systemSettings.fieldPresenceHours h` (setting exists, default 2, admin input `cfgFieldTime` 678, saved 6911; Module 5 ignores it, BUG-18). Điểm danh: `status = checkedInAt <= requiredAt ? 'on_time' : 'late'`. Show "Trễ {n} phút" for late. Allow undo điểm danh, edit, delete. Desk KPI "{present}/{total}" uses roster length, not the hardcoded "/4" HTML placeholder.

### 3.4 Incident lifecycle

| From | Trigger | To | Effects |
|---|---|---|---|
| (none) | "Tiếp Nhận & Điều Phối" | open | `code='SC-'+pad2(len+1)`, `reportedAt=HH:MM`, `assignee||'Tổ Kỹ thuật'`, unshift |
| open / in_progress | "Đã xử lý xong" + confirm | resolved | `resolvedAt=HH:MM`, `note=input||'Đã kiểm tra và xử lý thành công.'` |
| resolved | (none) | terminal | |

KPI "open" = status ≠ resolved. High-urgency open count drives "có {n} sự cố KHẨN CẤP". Intended additions: explicit "Đang xử lý" (in_progress) transition and badge, reopen, edit, sort open-first then urgency then time; code from max existing number + 1.

### 3.5 VIP seating monitor

Seat state = f(seatingMap[code], guest.isCheckedIn): empty | reserved-not-arrived | arrived. Counts per zone = arrived tiles. Intended: zones from hall config (all zones, real names, real seat counts); third state "Đã đến (ở phòng VIP)" either implemented with a `vipLoungeAt` / `seatedAt` field or removed from the legend (product call; default: remove). Tiles read-only or open a guest detail sheet; no direct toggle.

### 3.6 VIP arrival alert

Trigger: check-in of guest with `group==='VIP'` via toggle (not via walk-in). Shows name uppercased with "ĐỒNG CHÍ " prefix, title - organization, time, seat. Dismiss only by button. Intended: also for VIP walk-ins; seat text uses the real zone of the seat; queue alerts if two VIPs check in back-to-back (current second call just overwrites the open modal's text).

### 3.7 VIP car pass

Source list: all guests of selected event with `group==='VIP'` (any RSVP). One pass per guest. Print = browser print of the page. Intended: exclude `declined`; optional plate number field; header from `appData.systemSettings.parentAgency` / `agencyName`; dedicated print route or print stylesheet with `@page { size: A5 landscape; margin: … }`, only passes printed, one per page.

### 3.8 Beep

Web Audio sine 880→1320 Hz, 0.12 s, gain 0.15→0.01. Plays on successful check-in (toggle on) and walk-in save. Not on cancel or error. Intended: reuse one AudioContext; also an error tone on "Mã không tồn tại"; persist on/off per device (localStorage).

### 3.9 Starter/demo data (current behavior, must NOT be ported as-is)

`ensureStarterDataForModule5(ev)` (20698), called on init and every event change:
- If roster empty → 4 demo staff (Nguyễn Văn Cường, Lê Thị Mai, Phạm Văn Hùng, Trần Quang Vinh; desks 1-4; 3 checked in 06:20/06:25/06:28, 1 pending).
- If incidents empty → SC-01 (resolved mic issue 07:15→07:22) and SC-02 (in_progress OCOP power 07:35).
- If guests exist and none checked in → marks guests[0], [1], [5], [10] checked in with fixed times and staff names.
- Saves locally only (`notifyCloud=false`), but the next cloud save uploads it.
Rewrite: demo data only behind an explicit "Nạp dữ liệu mẫu" action or a dev seed, never auto (BUG-01, BUG-02).

---

## 4. External side effects

- **Persistence per mutation** (`syncModule5Storage`, 20683): `localStorage.setItem('sce_tcsk_app_data', JSON(appData))`, `localStorage.setItem('sce_tcsk_local_events', JSON(appData.events))`; if `currentUser` → `saveAppDataToSupabase('Cập nhật dữ liệu Phân hệ 5 (Hiện trường T0 & Check-in)')` (not awaited). That function (6782): `recordUndoSnapshot(note)` (global undo stack, Ctrl+Z restores whole blob); skips network if `window._supabaseTcskTableMissing`; `from('sce_tcsk_app_data').upsert({ id: 1, data: appData, updated_at: ISO, updated_by: user.id, updated_by_email })`; then `createBackgroundBackup(note)` → `from('sce_tcsk_backups').insert({ data: appData, note, created_by, created_by_email })` (7448). Errors swallowed to console (non-explicit). Every check-in, gift toggle, điểm danh, incident create/resolve, walk-in triggers one full-blob upsert plus one full-blob backup row.
- **Load**: `loadAppDataFromSupabase` (6735) `select('data').eq('id',1).maybeSingle()`, `Object.assign(appData, data.data)`; calls renderModule2 only. No realtime subscription anywhere (no `.channel(` / `postgres_changes`).
- **QR scanning**: none. No camera, no `getUserMedia`, no decoder library. The "camera" is a static mock. Input works with keyboard-wedge USB/Bluetooth scanners via the manual field (scanner types code + Enter → form submit). Library `qrcodejs 1.0.0` (cdnjs) is used only by M4 to render badge QR (`renderQrCodeIntoElement` 14993).
- **Printing**: car pass via `window.print()`; no print CSS for this modal (`page-a5-landscape` class undefined; `@page` rules exist only at 11467, 11581, 22343 for other modules). Intended A5 landscape.
- **Toasts/dialogs**: SweetAlert2 11 (CDN) for toasts (top-end, 1.8-2.5 s), confirm, prompt with text input.
- **Timers**: `setTimeout(focus, 150)` in QR modal. No intervals. "Thời gian thực" is re-render on local mutation only.
- **Audio**: Web Audio API, new `AudioContext` per beep.
- **File import/export**: none in this module.
- **Clock**: `new Date().toLocaleTimeString('vi-VN', …)`, client clock, no timezone/date.

---

## 5. Dependencies

Consumed from other modules / shared:
- `appData` global blob and keys `events`, `eventGuests`, `eventSeating` (M4), `eventHallConfig` + `getEventHallConfig` (M4, should be used), `systemSettings.fieldPresenceHours|parentAgency|agencyName` (M1 admin, should be used).
- `module4State.selectedEventId` for initial event (20623). Each module keeps its own selected event; no shared selection.
- `escapeHtml` (8202; does not escape `'`), `renderGroupBadgeHtml` (14637), `saveAppDataToSupabase` (6782), `recordUndoSnapshot` (6098), `currentUser` (`id`, `email`), `Swal`.
- Guest records and seat map created by M4 (`generateStarterGuestsList`, `saveCrmGuest` 14755, `executeAutoRandomSeatAssignment` 16323, `quickToggleRsvp` frees seat on decline 14680).
- QR payload format from M4 badge print (14988, 15713).

Calls into Module 5:
- `initModule5()` on DOMContentLoaded (8232), before cloud load finishes.
- `renderModule5()` on main tab switch to `live` (8075), and after undo/redo (6133, 6173).

Read by other modules: nothing. No other code reads `isCheckedIn`, `checkInTime`, `checkInStaff`, `hasGiftPackage`, `eventDutyRoster`, `eventIncidents` (grep outside 20600-21789 is empty). M6 reports do not include check-in, duty, or incident data. M4 guest edit (`saveCrmGuest`) mutates fields in place, so check-in fields survive edits; M4 delete removes the guest (and its check-in). M4 "Tự động xếp chỗ" resets `eventSeating` and every `seatCode`, including walk-ins already seated.

Dead code: `printAllVipCarPasses` (21783) has no caller.

---

## 6. Bugs and logic flaws

Severity: Critical (data loss/corruption or core flow wrong at the live event), High, Medium, Low.

| ID | Sev | Where | What is wrong | Intended behavior |
|---|---|---|---|---|
| BUG-01 | Critical | 20776-20804 | Seeder marks guests[0],[1],[5],[10] as checked in (fake times/staff) whenever an event has guests and none checked in. Runs on init and every event switch, so real events get fake attendance, and cancelling all check-ins makes them reappear. | Never mutate real guests. No auto demo data. |
| BUG-02 | High | 20704-20774 | Demo duty roster (4 named people) and 2 demo incidents auto-inserted into every event whose list is empty; impossible to have an empty roster or incident log. Uploaded on next cloud save. | Empty lists with empty states; seed only on explicit action. |
| BUG-03 | High | 20833 | Target uses `currentEvent.expectedDelegates`, which no code ever writes; event field is `targetGuests` (9102, 10419). KPI target and % are always vs 100. Same bug in M4 14428, M6 22141/22226/22649. | `event.targetGuests` (shared selector). |
| BUG-04 | Medium | 20851 | "Chưa đến" = confirmed − totalCheckedIn; walk-ins and pending/declined check-ins reduce it wrongly. | Count of confirmed/substituted guests with `!isCheckedIn`. |
| BUG-05 | Critical | 20683-20693, 6798-6806 | Every action upserts the whole `appData` blob to row id=1, fire-and-forget, last write wins, no realtime. Two reception desks overwrite each other's check-ins; overlapping async upserts can land out of order. | Per-record writes (e.g. `checkins`/`guests` rows, or per-event JSON with optimistic version), realtime subscription, idempotent check-in (set, not toggle). |
| BUG-06 | Critical | 21182-21187 | Non-prefixed code match uses `g.id.endsWith(code.toUpperCase())`; ids are lowercase, and a short numeric code ('1', '01') matches the first guest whose id ends in it. Wrong guest gets checked in. Phone compared raw (formats like '0913.210.001'). | Exact id match, or normalized phone exact match; multiple matches → pick list. |
| BUG-07 | High | 21177-21180 | `SCE-CHK:` payload ignores `parts[1]` (eventId); seed guest ids (`gst_vip_01`) repeat in every event, so a badge from another event checks in a guest here. Uses `includes` not `startsWith`. | Parse strictly; require eventId === selected; else error. |
| BUG-08 | Critical | 21192 → 21034-21068 | Scanning a code calls `toggleLiveCheckIn`; a second scan of the same badge cancels the check-in silently (toast only). | Scan is idempotent check-in; already-checked-in → warning with time. |
| BUG-09 | High | 21686, 21697 | Seat tiles in the monitor are click-to-toggle check-in, including un-check-in, no confirmation; easy accidental data change on a "monitor" screen. | Tiles read-only or open detail; cancel requires confirm. |
| BUG-10 | High | 5186-5193 | QR modal shows a fake camera viewfinder ("Hướng camera về phía mã QR…") but no camera or decoder exists. Misleads reception staff. | Real camera scan (BarcodeDetector with a JS fallback library) plus manual/wedge input; or remove the viewfinder. |
| BUG-11 | Medium | 2280, 20916 | Search placeholder promises "Enter để check-in" and barcode search; no Enter handler; search does not match `id` or QR payload. | Enter with exactly one match (or a QR payload) checks in; search matches id/payload. |
| BUG-12 | High | 21051, 21064, 21397, 21577, 21590, 21608 | SweetAlert2 `title` renders HTML; guest name, staff name, and incident code interpolated raw → stored XSS (names come from M4 input/imports). | Text-only rendering (React escapes; never pass user data as HTML). |
| BUG-13 | High | 21338, 21358, 21361 | Duty summary joins `s.name` unescaped; `requiredTime` (free text input) and `checkedInAt` rendered unescaped → stored XSS. | Escape / React text. |
| BUG-14 | Low | 20645, 20996, 21005, 21016, 21019, 21371, 21491, 21514, 21686, 21697 | Ids, `seatCode`, `code`, `checkInTime` interpolated raw into HTML and into `onclick="fn('${id}')"`; `escapeHtml` (8202) does not escape `'`. Zone prefixes are admin-editable in M4. | Event handlers bound in components, no string HTML. |
| BUG-15 | High | 21268-21276, 20982 | Substitute walk-in creates a new guest with `substituteName='Đi thay cho: X'`, inverting M4's meaning (substituteName = attendee). Table then shows "Người thay: Đi thay cho: X". Original invitee stays "Chưa đến" holding a seat; counts double. | Pick original invitee; mark substituted with attendee name; check in that record. |
| BUG-16 | Medium | 21223-21303, 5283 | Walk-in has no duplicate check and the submit button is not disabled during save; double tap creates two guests and two seats. | Duplicate warning; disable while saving. |
| BUG-17 | Medium | 21228, 21281 | `appData.eventGuests[evId]` and `appData.eventSeating[evId]` dereferenced without ensuring the parent object exists; crash if M4 init has not created them. | Typed store with initialized maps. |
| BUG-18 | High | 21387-21388, 5456, 20711 | 2-hour rule not implemented: required time free text, `status='on_time'` always, `eventTime` and `systemSettings.fieldPresenceHours` ignored, `status` never read. | Compute requiredAt; on_time/late; show lateness. |
| BUG-19 | High | 21619-21680, 21247-21248, 2442-2465 | Hall monitor and walk-in seating hardcode A12/B18/C24. Hall config is per event (M4 `eventHallConfig`, default NCC hall A18/B36/C24 QuocTe/D36 DoanhNghiep, 12187). Seats A-13..18, B-19..36, all D-* invisible; walk-in DoanhNghiep put in C (a QuocTe zone in NCC); zone titles wrong. | Render zones from `getEventHallConfig(ev)`; assign walk-ins by `assignedGroup`. |
| BUG-20 | Medium | 20823 vs 20935, 20647 | If `selectedEventId` no longer exists (event deleted), KPIs fall back to `events[0]` but table/duty/incidents/hall use the stale id → mixed data; select shows first option while state holds stale id. | Validate selection on every render; reset to first existing event. |
| BUG-21 | Medium | 21130-21133 | VIP alert always says "Khu A - Ghế {seat}" regardless of seat zone; `guest.name.toUpperCase()` throws if name missing; second VIP check-in overwrites a visible alert. | Zone from config; null-safe; queue alerts. |
| BUG-22 | Low | 2428, 21682-21715 | Legend "Đã đến (ở phòng VIP)" (amber) has no corresponding state; KPI2 "Đã đón vào Phòng VIP" just equals VIP checked-in count. Fake metrics. | Implement lounge state or drop legend/line. |
| BUG-23 | Medium | 5388-5399 | VIP alert HTML ships hardcoded real-person defaults ("ĐỒNG CHÍ TRẦN SỸ THANH", "Chủ tịch UBND thành phố Hà Nội", "Khu A - Ghế A-04"). | Render only from data. |
| BUG-24 | Medium | 21086-21110 | New `AudioContext` per beep, never closed; browsers limit concurrent contexts and leak; first beep can be blocked by autoplay policy without user gesture (scanner input). | One lazily created context, resumed on user gesture. |
| BUG-25 | Medium | 21366-21374 | Duty roster: no edit, delete, or undo of điểm danh; wrong person/time cannot be fixed. Comment on modal says "Thêm / Sửa" (5412). | CRUD + undo. |
| BUG-26 | Low | 21324-21326, 21318-21321 | Desk grouping by `role.includes('Bàn n')`; desk card names and dept lines hardcoded and differ from role option labels. | Typed `desk` field; one desk registry for labels. |
| BUG-27 | Medium | 21528 | Incident assignee prefilled with seed person "Đ/c Phạm Văn Hùng (Tổ Âm thanh)"; reports silently assign him. | Empty by default; optional picker from duty roster. |
| BUG-28 | Low | 21510, 21480, 21554 | Missing `reportedAt` displays fabricated "07:30"; unknown urgency shows "KHẨN CẤP"; code from `length+1` (collides if items are ever removed). `in_progress` shown same as open; no transition to it. | No fabricated values; exhaustive enums; max+1 code; in-progress state. |
| BUG-29 | Medium | 21037, 21274, 21387, 21563, 21600 | Times stored as locale strings without date (`'HH:MM:SS'` vs `'HH:MM'` mixed); multi-day events (hội chợ) cannot tell days; not sortable; client-clock only. | ISO timestamps; format at render in Asia/Ho_Chi_Minh. |
| BUG-30 | Medium | 21038, 21057-21059, 21080 | Check-in forces `hasGiftPackage=true`; cancel keeps gift and `checkInStaff`; gift can be toggled for absent guests; KPI3 gift count includes absent guests (20867). | Gift default configurable; cancel clears check-in metadata; count gifts among checked-in. |
| BUG-31 | Low | 20866, 2224 | KPI3 "Sở Ngành & Doanh Nghiệp" counts every non-VIP (QuocTe, BaoChi too). | Rename "Đại biểu khác (ngoài VIP)" or filter SoNganh+DoanhNghiep. |
| BUG-32 | High | 5366, 5373, 21734 | Car pass print: no print stylesheet; `page-a5-landscape` undefined; `window.print()` prints the whole app with the fixed modal (scroll-clipped at 95vh). A5 landscape not implemented. Includes declined VIPs. Header agency hardcoded instead of `systemSettings`. | Dedicated print view with `@page A5 landscape`, one pass/page, filtered list, agency from settings. |
| BUG-33 | Low | 21783-21785 | `printAllVipCarPasses` dead code. | Delete. |
| BUG-34 | Medium | 2254, 2259, 20670-20676 | Sub-tab switch rewrites button classes but not badge spans; checkin badge keeps `text-white bg-white/20` on a light inactive button (invisible); other badges keep slate on emerald active button. | Tab primitive owns active/inactive badge styles. |
| BUG-35 | Medium | 2434 | Hall container has both `overflow-x-auto` and `min-w-[700px]` on the same element, so it forces 700px width and the page scrolls horizontally on phones instead of the diagram scrolling. | Scroll wrapper outside, min-width inside. |
| BUG-36 | Medium | 2160-2187 | Header toolbar is `flex-nowrap shrink-0` with a 200px select and 4 buttons next to the title; overflows at 360px width. | Wrap/stack on small screens; overflow menu. |
| BUG-37 | Medium | 5171-5468, 21686 | Modals lack `role="dialog"`, `aria-modal`, labelled title, focus trap, Esc close, focus return; icon-only buttons (car 2184, close X 5183/5223/5305/5369/5425) lack `aria-label`; seat tiles are clickable `div`s (no keyboard); status conveyed by color only in the hall; labels not bound to inputs (`for`). | Shared accessible Dialog, IconButton with label, buttons for interactive tiles, text status. |
| BUG-38 | Low | 2205/20851, 2218/20863, 2231/20872, 2242/20885, 2244/20888, 2443/21641 | Static HTML placeholders differ from JS text ("Túi tài liệu" vs "Túi quà & tài liệu", "sự cố cần xử lý" vs "sự cố đang xử lý", "0/4", "có mặt" vs "đã có mặt"); flash of wrong copy. | Single source strings; render from state only. |
| BUG-39 | Low | 2196, 2254, 21332 | `py-0.2` is not a Tailwind class (no effect). | Use scale value. |
| BUG-40 | Low | 5171/5211/5355/5380, 5205/5282, 5366-5369 | UI inconsistencies: overlay opacity /80 vs /70; card `dark:bg-slate-800` vs car pass `dark:bg-slate-900`; header card `rounded-xl` vs other cards `rounded-2xl`; button padding px-3/3.5/4/5 and radius xl vs lg (car pass print `rounded-lg py-1.5`); confirmation uses Swal prompt (21589) while forms use custom modals; active sub-tab emerald while module accent is teal. | Shared Button/Card/Dialog variants; one accent per module. |
| BUG-41 | Medium | 21028-21072 | No permission checks: any logged-in or anonymous (local mode) user can check in, cancel, and edit; roles exist (`user`, `dept_leader`, `leader`, `admin`, 7005). `checkInStaff` falls back to 'Lễ tân SCE' when logged out. | Require auth for writes; record user id; role gate for destructive actions (cancel check-in, resolve, delete). |
| BUG-42 | Medium | 20615-20633, 6735-6772 | `initModule5` seeds on DOMContentLoaded before cloud load; cloud `Object.assign` then replaces lists but never re-renders M5 or re-runs seeding; when the live tab is opened, data may be pre-cloud demo state already uploaded by a later save. | Load data first, then render; no seeding. |
| BUG-43 | Medium | 6798-6826, 7448 | Each live action writes a full-blob row to `sce_tcsk_backups`; a 300-guest check-in session creates ~300 full copies. | Backups on schedule or explicit, not per check-in. |
| BUG-44 | Low | 20941-20947 | Search is accent-sensitive; reception staff typing "nguyen van" will not find "Nguyễn Văn". | Normalize NFD, strip diacritics, đ→d on both sides. |
| BUG-45 | Low | 5381 | `animate-bounce-short` undefined (no keyframes in config/styles), alert has no animation. | Define or drop. |

Total: 45.

---

## 7. Rewrite notes

### 7.1 Feature breakdown (suggested `features/live/`)

- `LivePage` (route `/live?event=<id>&tab=<checkin|duty|incidents|hall>`; tab and event in URL).
- `LiveHeader`: `EventSelect` (shared), action buttons, `LiveKpiGrid` (4 `KpiCard`).
- `CheckInDesk`: `GuestFilters` (search, status, group, beep toggle), `GuestCheckInTable` (row actions), `ScanInput` (wedge scanner, Enter handling, auto-refocus).
- `QrScanDialog`: camera scanner (BarcodeDetector + fallback lib) + manual field; result feedback states (ok, already, not found, wrong event).
- `WalkInDialog`: form + duplicate check + substitute picker (search invited guests).
- `VipArrivalAlert`: queued full-screen alert.
- `DutyRoster`: `DutyDeskSummary` (desk registry), `DutyStaffTable`, `DutyStaffDialog` (create/edit), undo/delete.
- `IncidentLog`: `IncidentCard`, `IncidentDialog`, `ResolveIncidentDialog` (note input), status transitions.
- `HallMonitor`: `HallZone` from `EventHallConfig.zones`, `SeatTile` (read-only, detail popover).
- `CarPassPrint`: print route `/live/car-pass?event=` with A5 landscape CSS.

Pure domain module `live/domain.ts`: `parseCheckInCode(code, eventId)`, `matchGuest(guests, code)`, `checkIn(guest, at, by)` (idempotent), `cancelCheckIn`, `computeLiveKpis(event, guests, staff, incidents)`, `dutyRequiredAt(event, settings)`, `dutyStatus(checkedInAt, requiredAt)`, `nextIncidentCode(incidents)`, `assignWalkInSeat(hallConfig, seating, group)`, `zoneOccupancy(zone, seating, guests)`. All unit-testable without UI.

Data layer: replace whole-blob saves with per-entity mutations and realtime for check-ins (multi-desk is the core use case). Keep a `CheckIn` record per guest/event (unique key), writes as upsert-set, not toggle.

### 7.2 Shared primitives seen in this module

- `Dialog` (header icon tile + title + subtitle + close, body, footer actions; sizes md/lg/3xl; accessible).
- `ConfirmDialog` and `PromptDialog` (replace Swal confirm/input).
- `Toast` (success/info/warning/error, top-end, 2 s).
- `KpiCard` (label, value, of-total, badge, progress bar, sub-line).
- `Tabs` / `PillTabs` with count badge.
- `DataTable` (sticky header, STT column, empty state slot, row tint).
- `EmptyState` (icon, title, description, optional action).
- `Badge` variants: group badge (`GroupBadge`, shared with M4), urgency, status, count.
- `Button` variants (primary per accent, secondary, ghost, danger, icon-only with aria-label).
- `FormField` (label bound to control, required marker, help/error), `TextInput`, `Select`, `Textarea`, `Checkbox`.
- `SearchInput` with icon and accent-insensitive matching helper `normalizeVi`.
- `EventSelect` (shared across M2-M6; one selected-event source of truth, ideally URL).
- Date/time helpers: `formatTimeVN(iso)`, `formatDateVN`, `combineDateTime(eventDate, eventTime)`, `subHours`, all in Asia/Ho_Chi_Minh.
- `useBeep()` hook (single AudioContext, persisted toggle).
- Print layout primitive (`PrintPage size="A5" orientation="landscape"`), shared with M4 badges/name cards and M6 A4 reports.
- Agency header from `systemSettings` (shared with M4/M6 print).
- Selectors shared with M4/M6: `eventTargetGuests(event)`, `confirmedGuests(guests)`, `getEventHallConfig(ev)`.

### 7.3 Parity checklist

Event select; 4 KPIs; 4 sub-tabs with badges; check-in table with search, 2 filters, gift toggle, check-in/cancel; beep toggle; QR/manual code check-in incl. `SCE-CHK:{event}:{guest}`; walk-in with auto seat; VIP arrival alert; duty roster add + điểm danh + 4 desk cards; incident create + resolve with note; hall occupancy per zone; VIP car pass print.

### 7.4 Open product questions (could not determine from code)

- Whether "Đã đến (ở phòng VIP)" lounge tracking is wanted (default: drop).
- Whether declined guests may check in (current: yes).
- Gift default on check-in (current: forced true).
- Whether car pass needs license plate / driver fields.
- Whether QuocTe and BaoChi walk-ins should get seats in their own zones (depends on hall config; default: zone by `assignedGroup`).
