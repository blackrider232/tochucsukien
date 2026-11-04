# Module 2 spec. Tiến độ sự kiện (`mainTab-events`)

Source: `code/index.html`. HTML tab 1137-1345, modals 3198-3678, JS 8241-11107. All line refs are `index.html:<line>`.

Sidebar entry: button `tabBtn-events` (257), tooltip "Tiến độ", default active tab (blue-600). Top bar (`FUNCTION_METADATA.events`, 7864): title "Tiến Độ Tổ Chức Sự Kiện", shortTitle "Tiến độ", icon `fa-calendar-check`, subtitle "Theo dõi tiến độ, phân công nhiệm vụ và cập nhật trạng thái thực hiện các sự kiện.", badge = bell button `btnHeaderDailyReportBell` ("Báo Cáo Hàng Ngày" + count `bellDailyReportBadge`, label hidden < sm) → opens Daily-report pop-up. The bell exists only while this tab is active (top bar badgeHtml is per-tab).

Module entry point `renderModule2()` (9171) runs on DOMContentLoaded (8228), on every switch to this tab (8071), after Supabase load (6753-6778), after undo/redo (6130, 6170), and after event create/edit/delete.

---

## 1. Purpose and screens

Purpose: plan and track preparation of SCE events against the standard SCE process (6 preparation groups + 1 day-of/after group), with deadlines computed backward/forward from event day T0, progress KPIs, a daily-report regime from T-10 working days, A4 plan printing and CSV export.

Screen order top to bottom:

### 1.1 Dashboard card "Bảng Điều Khiển Sự Kiện" (1140)

Header row: icon `fa-layer-group`, title "Bảng Điều Khiển Sự Kiện". Toolbar right, single row (`flex-nowrap`):

| # | Control | Label / tooltip | Action |
|---|---|---|---|
| 1 | Primary blue button | "Tạo Sự Kiện" (≥ sm) / "Tạo SK" (< sm); tooltip "Tạo Sự Kiện Mới" | open Event wizard (create) |
| 2 | Dropdown button `btnViewModeDropdown` | current label `currentViewModeLabel` (hidden < md), default "Thu gọn tất cả"; tooltip "Chế độ hiển thị thu gọn / mở rộng" | toggle menu; click outside closes (10280) |
| 3 | Icon button print | tooltip "In tổng hợp tiến độ sự kiện (A4)" | `printAllEventsPlan()` (see BUG-30) |
| 4 | Icon button excel (emerald) | tooltip "Xuất báo cáo Excel / CSV" | `exportEventsExcel()` → CSV |

View-mode menu items (value, title, sub-line):
- `collapse_all` "Thu gọn tất cả (Mặc định)" / "Chỉ hiển thị thanh Sự kiện chính". Label after select: "Thu gọn tất cả".
- `expand_groups` "Mở rộng Nhóm việc" / "Hiện danh sách các nhóm công việc". Label: "Mở rộng Nhóm việc".
- `expand_all` "Mở rộng tất cả chi tiết" / "Xem tất cả các bước chi tiết". Label: "Mở rộng tất cả".

KPI grid (2 cols, 4 at lg). Each card clickable → pop-up.

| # | id | Label | Value | Highlight rule | Opens |
|---|---|---|---|---|---|
| 1 | `kpiTotalEventsCard` | "Tổng Sự Kiện" | events.length | none | All-events pop-up |
| 2 | `kpiDailyReportCard` | "Báo Cáo Hàng Ngày" (rose number) | count events with 0 ≤ workdaysDiff(eventDate) ≤ 10 | count>0 → `ring-2 ring-rose-500/50 bg-rose-50/50`; also bell badge rose + bounce, else bell `opacity-60` (9226-9256) | Daily-report pop-up |
| 3 | `kpiCompletedTasksCard` | "Việc Hoàn Thành" | "{completed} / {total}" steps across all events | none | Completed pop-up |
| 4 | `kpiOverdueCard` | "Việc Chậm Tiến Độ" (amber) | count steps !completed and daysDiff(deadline) < 0 | count>0 → `ring-2 ring-amber-500/50 bg-amber-50/50` | Overdue pop-up |

Card tooltips: "Nhấp để xem danh sách chi tiết tất cả các sự kiện", "Nhấp để xem việc cần báo cáo hàng ngày trình Lãnh đạo", "Nhấp để xem danh sách các công việc đã hoàn thành", "Nhấp để xem danh sách các công việc chậm tiến độ cần xử lý gấp".

### 1.2 Daily-report banner `module2DailyReportAlert` (1264). Permanently hidden.

Inline `style="display:none !important"` means it never shows even though JS toggles `hidden` (BUG-34). Content if shown: pinging dot, title "BÁO CÁO TIẾN ĐỘ HÀNG NGÀY TRÌNH LÃNH ĐẠO TRUNG TÂM & UBND THÀNH PHỐ", chip "Sự kiện sắp diễn ra", text "Danh sách các sự kiện sắp diễn ra cần cập nhật và gửi báo cáo tiến độ hàng ngày:", then one chip per urgent event: tag (diff 0 → emerald "⭐ Hôm nay diễn ra", else rose "🚨 Còn {diff} ngày làm việc"), bold name, "• dd/mm/yyyy", arrow; click → `focusAndExpandEvent`.

### 1.3 Search and filter bar (1288)

- Search `module2SearchInput`, placeholder "Tìm kiếm tên sự kiện, nhóm việc, bước chi tiết, cán bộ, ghi chú...". Live on input. Clear button (times-circle) visible when trimmed value non-empty.
- `filterEventType`: `all` "Tất cả loại hình", `hoi_nghi` "🏛️ Hội nghị / Tọa đàm", `hoi_cho` "🎪 Hội chợ / Triển lãm".
- `filterEventDept`: `all` "Tất cả phòng ban"; values are full department names, labels abbreviated: "Phòng Hành chính - Tổ chức"→"Phòng HC - TC", "Phòng Phát triển doanh nghiệp"→"Phòng PTDN", "Phòng Xúc tiến đầu tư"→"Phòng XTĐT", "Phòng Tư vấn doanh nghiệp"→"Phòng TVDN". Hard-coded, not from `appData.departments`.
- `filterEventStatus`: `all` "Tất cả trạng thái", `daily_report` "🚨 Cần báo cáo hàng ngày", `dday_today` "⭐ Hôm nay diễn ra", `has_overdue` "⚠️ Có việc chậm tiến độ", `preparing` "Đang chuẩn bị", `completed` "Đã hoàn thành".
- Filter/search state is in memory only (`module2State`, 8246); not persisted, not in URL.

### 1.4 Event list `eventsListContainer` (4-tier accordion)

Order = `appData.events` array order (new events `unshift`ed to top; no sort).

**Tier 1, Event master card** (`renderEventMasterCard`, 9787), id `eventCard_{evt.id}`. Header click toggles expand.
- Chevron (rotated + blue when expanded).
- Badges row: type badge (`hoi_cho` amber "🎪 Hội chợ / Triển lãm", else indigo "🏛️ Hội nghị / Tọa đàm"); countdown badge (rules §3.4); if overdue>0 amber pulsing "⚠️ Có {n} việc chậm".
- Name h3 (truncate, title attr = name).
- Meta row: "{Thứ X, dd/mm/yyyy}" bold + "({eventTime || '08:30'})"; location or "Địa điểm chưa chốt"; department; leadPerson or "Chưa phân công".
- Right: "{done}/{total} việc" + "{pct}%" (emerald bold at 100), progress bar (emerald at 100 else blue).
- Action icons (stopPropagation): edit "Chỉnh sửa thông tin sự kiện", print "In kế hoạch A4", delete "Xóa sự kiện".
- Card border priority: overdue>0 amber ring; else 0 ≤ workdaysDiff ≤ 10 rose ring; else pct=100 emerald; else slate.

**Expanded body** (`renderEventDetailsBody`, 9941):
- If `evt.note`: blue info box "Chỉ đạo chung của Sự kiện: {note}".
- Section "Giai Đoạn I: Chuẩn Bị Trước Sự Kiện" (blue dot), right caption "6 Nhóm công việc chuẩn hóa" (hard-coded) → groups with `phase === 'phase_prepare'`.
- Section "Giai Đoạn II: Tác Nghiệp Hiện Trường Ngày Diễn Ra & Sau Sự Kiện (`$T_0 - 2<TAB>ext{h}$ đến $T + 3$`, a literal tab replaced `\t` of `\text`)" (rose; broken LaTeX string rendered literally, BUG-26), caption "Quy chuẩn 9-10 bước tác nghiệp" → groups with `phase === 'phase_dday'`.
- Groups with any other `phase` are never rendered.
- Event with zero groups renders both headers and nothing else (no "add group" UI, BUG-14).

**Tier 2, Group bar** (`renderGroupAccordion`, 9992), id `groupCard_{grp.id}`. Click toggles group.
- Chevron, name, badges "Chậm hạn" (amber, any overdue step) and "Có ghi chú" (if note).
- Right: "{done}/{total} hoàn thành", status dot: all done & total>0 emerald; else overdue amber ping; else blue.

**Tier 3, Group expanded header**: "Phụ trách nhóm: {leadPerson || 'Đội chuyên trách'}". Buttons: "Thêm Ghi chú nhanh" (only when no note) → Quick-note modal; "Thêm bước việc" → Step modal (create). If note: amber card "GHI CHÚ & LƯU Ý ĐẶC BIỆT CỦA NHÓM:" + text, pen "Sửa ghi chú" → modal, × "Xóa ghi chú" → delete immediately (no confirm).

**Tier 4, Step row** (`renderStepRow`, 10081), id `stepRow_{st.id}`. Red border + tint when overdue. Column 1:
- Status badge (§3.3), quota chip (§3.3), "• Hạn: {Thứ X, dd/mm/yyyy}".
- Name h5; requirement in quoted grey box if present.
- Sub-tasks block if any: "Việc nhỏ ({done}/{n}):", 2-col checkbox grid, completed = line-through. Checkbox toggles directly.
- Links chips (paperclip, name truncated 160px, external icon), `target=_blank`.
- If `templateKey`: purple link "Xem Biểu Mẫu: `{templateKey}`" → `openFormNotice(templateKey, stepName, evtId)` (M3).
Column 2:
- Large checkbox label "Đã Xong"/"Chưa Xong" → toggle step.
- "Phụ trách: {assignee || 'Chuyên viên'}"; if completed and completedBy: "Bởi: {completedBy}" (emerald).
- Icons: sub-tasks "Quản lý việc nhỏ ({n})", links "Đính kèm links/tài liệu ({n})", edit "Sửa bước việc", delete "Xóa bước việc".

Expansion rule: event expanded iff in `expandedEvents` OR viewMode ∈ {expand_groups, expand_all} OR keyword non-empty. Group expanded iff in `expandedGroups` OR viewMode = expand_all OR keyword non-empty (9788, 9993).

### 1.5 Empty state `eventsEmptyState` (1331)

Shown when filtered list empty: folder icon, "Không tìm thấy sự kiện nào", "Vui lòng điều chỉnh lại từ khóa tìm kiếm hoặc bộ lọc, hoặc bấm Tạo Sự Kiện Mới để bắt đầu.", button "Tạo Sự Kiện Mới". Same text whether zero events exist or filters exclude all.

### 1.6 Pop-ups (KPI)

All four: overlay `bg-slate-900/70 backdrop-blur`, backdrop click closes, max-w-2xl, max-h 90vh, scrollable body, footer "Đóng". Rendered fresh on open; not live-updated while open except Overdue after toggle.

**P1 Daily report** `modalDailyReportPopup` (3206). Title "Việc Cần Báo Cáo Hàng Ngày Trình Lãnh Đạo" + badge "{n} sự kiện". Sub "Các sự kiện sắp diễn ra trong vòng 10 ngày làm việc cần cập nhật tiến độ liên tục". Footer note "Áp dụng chế độ báo cáo khẩn cấp mốc 10 ngày làm việc".
- Empty: check icon, "Không có sự kiện nào trong mốc báo cáo hàng ngày (≤ 10 ngày làm việc)", "Hệ thống sẽ tự động kích hoạt thông báo khi các sự kiện sắp diễn ra."
- Per urgent event card: tag (diff 0 emerald "⭐ Hôm nay diễn ra" else rose "🚨 Còn {diff} ngày làm việc"), name, date dd/mm/yyyy, location || "Hà Nội", `evt.leadDept || 'P. XTĐT'` (BUG-21).
- Inner box "Nhiệm vụ trọng tâm cần cập nhật:" + "{k} việc cần chú ý". Lists first 4 steps where !completed && deadline daysDiff ≤ 3, sorted ascending by daysDiff (most late first). Each: name, "({groupName})", chip: <0 rose "Trễ {|d|} ngày", 0 "Hạn hôm nay", else amber "Còn {d} ngày". None: "Các bước hiện tại đều đang được tiến hành đúng kế hoạch."
- Buttons: "Xem Chi Tiết Sự Kiện" → close + focusAndExpandEvent; "Xuất Báo Cáo Hàng Ngày" → close, `switchMainTab('tab-reports')`, after 150 ms set `#reportEventSelector`=evt.id, `onReportEventChange()`, `openGenerateDailyReportModal()` (M6).

**P2 All events** `modalAllEventsPopup`. Title "Danh Sách Tất Cả Sự Kiện" + badge "{n} sự kiện". Sub "Tổng hợp toàn bộ các sự kiện đang triển khai và quản lý trên hệ thống". Footer: "Tạo Sự Kiện Mới" (close + open wizard), "Đóng".
- Empty: "Chưa có sự kiện nào trong hệ thống".
- Card per event (click → close + focusAndExpandEvent): name, chip `evt.scale || 'Hội nghị'` (BUG-22), rose "{k} việc trễ" if overdue, date, location || "Hà Nội", "Còn {workdaysDiff} ngày làm việc" (negative for past, BUG-23), right "{pct}%" + "{done}/{total} việc", progress bar.

**P3 Completed** `modalCompletedTasksPopup`. Title "Danh Sách Việc Đã Hoàn Thành" + badge "{n} việc". Sub "Các công việc và bước chi tiết đã được nghiệm thu hoàn thành". Footer "Cập nhật theo thời gian thực".
- Empty: "Chưa có công việc nào được đánh dấu hoàn thành".
- Row per completed step (array order): check icon, step name, "{event} • {group}", optional `step.dept` chip (never set, dead). Button "Xem vị trí" (tooltip "Xem trên bảng tiến độ") → close + focusAndExpandStep.

**P4 Overdue** `modalOverdueTasksPopup`. Title "Danh Sách Việc Chậm Tiến Độ" + badge "{n} việc". Sub "Các công việc đã quá hạn chót cần xử lý gấp và đôn đốc thực hiện". Footer rose "Ưu tiên xử lý các việc trễ hạn nhiều ngày nhất".
- Empty: "Tuyệt vời! Không có công việc nào bị chậm tiến độ", "Tất cả các nhiệm vụ đều đang đúng hạn hoặc đã hoàn thành."
- Sorted by daysOverdue desc. Card: rose "Quá hạn {n} ngày", step name, "{event} • {group}", "Hạn chót: dd/mm/yyyy", "• Cán bộ: {assignee}" if any, "• Phòng: {dept}" (dead). Buttons "Đánh Dấu Hoàn Thành" → toggle step then re-render this pop-up; "Xem Chi Tiết" → close + focusAndExpandStep.

focusAndExpandStep (9639): add evt to expandedEvents and grp to expandedGroups, re-render, after 150 ms find `stepItem_{id}` (never exists) or `stepRow_{id}`, smooth-scroll center, add rose ring + bg for 2.5 s; fallback scroll to event card. focusAndExpandEvent (10229): expand event, scroll to card start after 100 ms.

### 1.7 Event wizard modal `eventWizardModal` (3349)

Title "Tạo Sự Kiện Mới" / "Sửa Thông Tin Sự Kiện"; sub "Khởi tạo kế hoạch tổ chức sự kiện theo chuẩn quy trình SCE". No backdrop-click close (unlike pop-ups).

| Field id | Label | Type / default (create) | Edit prefill |
|---|---|---|---|
| wizardEventName | "Tên Sự Kiện / Chương Trình *" | text required; placeholder "Ví dụ: Hội nghị Xúc tiến Đầu tư Hà Nội - Hoa Kỳ 2026" | name |
| wizardEventType | "Loại Hình Sự Kiện *" | `hoi_nghi` "🏛️ Hội nghị / Hội thảo / Tọa đàm (Luồng 1)", `hoi_cho` "🎪 Hội chợ / Triển lãm (Luồng 2 - Phụ lục III)"; default hoi_nghi | type |
| wizardEventDept | "Phòng Ban Chủ Trì *" | XTĐT, PTDN, TVDN, HC-TC full names; default `currentProfile.department` or "Phòng Xúc tiến đầu tư" | department |
| wizardEventDate | "Ngày Tổ Chức *" | date required; default today + 15 working days; hint "Đổi ngày này sẽ tự động Cascade tính lại toàn bộ hạn chót" | eventDate |
| wizardEventTime | "Giờ Khai Mạc" | time, "08:30" | eventTime |
| wizardEventLocation | "Địa Điểm Tổ Chức" | text, placeholder "Ví dụ: Trung tâm Hội nghị Quốc tế, 11 Lê Hồng Phong" | location |
| wizardEventLead | "Cán Bộ Chủ Trì / Phụ Trách" | text; default `currentProfile.fullname`; placeholder "Ví dụ: Nguyễn Văn A" | leadPerson |
| wizardTargetGuests | "Số Lượng Khách Dự Kiến (Đại biểu)" | number min 1, 150 | targetGuests |
| wizardEventBudget | "Kinh Phí Dự Kiến (VNĐ)" | free text, "350.000.000" | budget |
| wizardAutoGenerate | "Áp dụng mẫu quy trình chuẩn" + "Khởi tạo sẵn danh sách các nhóm công việc và các bước chi tiết cho sự kiện." | checkbox, checked; wrapper hidden in edit | n/a |
| wizardEventNote | "Ghi Chú Chung" | textarea, placeholder "Lưu ý quan trọng từ Lãnh đạo hoặc Ban Giám đốc..." | note |

Buttons "Hủy", "Lưu Sự Kiện". Behavior §3.6.

### 1.8 Step modal `stepEditModal` (3458)

Title "Chỉnh Sửa Bước Việc" (static, also for create); sub "Cập nhật định mức thời hạn và tiêu chuẩn quy trình". Fields: "Tên Công Việc *" (required), "Yêu Cầu Tiêu Chuẩn Quy Trình SCE" (textarea), "Giai Đoạn" (`before` "Trước sự kiện", `dday` "Trong ngày diễn ra", `after` "Sau sự kiện"), "Số Ngày Lệch (Offset)" (number min 0), "Cách Tính Ngày" (`workday` "Ngày làm việc (Trừ T7, CN)", `calendar` "Ngày lịch (Liên tục)"), "Cán Bộ Phụ Trách" (placeholder "Ví dụ: Trần Thị B"), "Mã Biểu Mẫu Liên Kết" (mono, placeholder "Ví dụ: form_dskhach, form_giaymoi..."). Buttons "Hủy", "Lưu Bước Việc". Create defaults: before / 5 / workday. Phase change: dday → offset 0 and disabled; other → enabled, and 0 becomes 3.

### 1.9 Sub-tasks modal `subTasksModal` (3532)

Title "Việc Nhỏ Chi Tiết", sub = step name. Add form: input required placeholder "Thêm việc nhỏ cần làm..." + "Thêm". List (max-h 64): checkbox + name (line-through when done) + trash (no confirm). Empty: "Chưa có việc nhỏ nào. Hãy thêm vào bên trên." Footer "Đóng".

### 1.10 Links modal `linksModal` (3570)

Title "Tài Liệu & Đính Kèm", sub = step name. Inputs: name required "Tên tài liệu / Văn bản (Ví dụ: Danh sách khách mời VIP.xlsx)", URL `type=url` required "Đường dẫn URL (Google Drive, Docs, Trang web...)" + "Thêm". List: link (new tab) + URL line + trash (no confirm, by index). Empty: "Chưa có liên kết hoặc tài liệu đính kèm nào." No upload: links only.

### 1.11 Quick-note modal `quickNoteModal` (3613)

Title "Ghi Chú Nhanh Nhóm Việc", sub "{group.name} ({event.name})". Textarea required "Nội Dung Ghi Chú Lưu Ý", placeholder "Nhập các chỉ đạo gấp, số điện thoại đầu mối hoặc lưu ý kiểm tra...". Buttons: "Xóa ghi chú" (left, hidden when no note), "Hủy", "Lưu Ghi Chú".

### 1.12 Print plan modal `printPlanModal` (3652)

Header (print:hidden): "Xem Trước Bản In Kế Hoạch (Khổ A4)", "Chuẩn hóa theo thể thức văn bản hành chính phục vụ công tác tổ chức sự kiện", "In Ngay" → `window.print()`, close ×. Body = A4 document §4.3.

---

## 2. Domain types

Persisted inside the shared blob `appData` (Supabase table `sce_tcsk_app_data`, row `id = 1`, column `data` jsonb) under key `events`. Mirror copy of `appData.events` in localStorage `sce_tcsk_local_events`. Legacy key `appData.programs` is migrated to `events` on load when `events` empty (6758).

```ts
type EventType = 'hoi_nghi' | 'hoi_cho';            // Luồng 1 / Luồng 2 (Phụ lục III)
type EventStatus = 'preparing' | 'completed';      // only 'preparing' is ever written (BUG-12)
type GroupPhase = 'phase_prepare' | 'phase_dday';
type StepPhase = 'before' | 'dday' | 'after';
type DayType = 'workday' | 'calendar';
type Department =                                  // free string in data; these 4 in UI
  | 'Phòng Xúc tiến đầu tư' | 'Phòng Phát triển doanh nghiệp'
  | 'Phòng Tư vấn doanh nghiệp' | 'Phòng Hành chính - Tổ chức';

type IsoDate = string;      // 'YYYY-MM-DD', local calendar date, no TZ
type IsoDateTime = string;  // new Date().toISOString(), UTC
type HHmm = string;         // '08:30'

interface SceEvent {
  id: string;                 // 'evt_' + Date.now()  (collides, BUG-01)
  name: string;
  type: EventType;
  eventDate: IsoDate;         // T0
  eventTime: HHmm;            // default '08:30'
  location: string;           // template default 'Khách sạn Melia Hà Nội, 44B Lý Thường Kiệt' when empty
  department: Department | string;
  leadPerson: string;         // template default 'Lãnh đạo phụ trách' when empty
  budget: string;             // free text VND, e.g. '350.000.000'; template default '350.000.000'
  targetGuests: number;       // default 150. Other modules read `expectedDelegates` instead (BUG-38)
  status: EventStatus;
  note: string;               // "Chỉ đạo chung"
  created_at: IsoDateTime;
  updated_at: IsoDateTime;    // set on edit only, not on step changes
  created_by: string;         // currentUser.email || 'system'
  groups: TaskGroup[];
  // Fields read by other modules but never written here: expectedDelegates, date (13720), scale, leadDept
}

interface TaskGroup {
  id: string;                 // 'grp_{1..6}_' + Date.now() | 'grp_dday_' + Date.now()
  phase: GroupPhase;
  name: string;
  leadPerson: string;
  note: string;               // amber quick note; '' = none
  steps: Step[];
}

interface Step {
  id: string;                 // template: fixed 'step_1a' etc. (same across events); new: 'step_' + Date.now()
  name: string;
  requirement: string;
  offsetDays: number;         // ≥ 0
  dayType: DayType;
  targetPhase: StepPhase;
  calculatedDeadline: IsoDate | '';   // derived, stored; recomputed on T0 change or step save
  completed: boolean;
  completedAt: IsoDateTime | null;
  completedBy: string;        // currentProfile.fullname || currentUser.email || 'Chuyên viên'
  assignee: string;
  templateKey: string;        // M3 template id or alias; '' = none
  subTasks: SubTask[];
  links: StepLink[];
  // read but never written: dept (9529, 9612), isOverdue (M6, 22066)
}

interface SubTask { id: number; name: string; completed: boolean; }  // template ids 1..n; new: Date.now()
interface StepLink { name: string; url: string; }                     // identified by array index

// UI-only state (module2State, 8246), not persisted
interface Module2State {
  viewMode: 'collapse_all' | 'expand_groups' | 'expand_all';
  keyword: string;
  filterType: 'all' | EventType;
  filterDept: 'all' | string;
  filterStatus: 'all' | 'daily_report' | 'dday_today' | 'has_overdue' | 'preparing' | 'completed';
  expandedEvents: Set<string>;
  expandedGroups: Set<string>;          // keyed by group id only (BUG-01)
  activeSubTasksTarget: { evtId: string; grpId: string; stepId: string } | null;
  activeLinksTarget: { evtId: string; grpId: string; stepId: string } | null;
}
```

Related settings that exist but M2 ignores (`appData.systemSettings`, 6065): `dailyReportThresholdDays: 10`, `fieldPresenceHours: 2`, `guestQuotaPercent: 130`, `badgeQuotaPercent: 120` (BUG-07). Department list `appData.departments` (6059) also unused here.

Rewrite: make ids collision-free (`crypto.randomUUID()` or ULID) for event, group, step, sub-task, link; keep reading old ids. Brand `IsoDate`. Parse the blob at load with a schema (zod) and default missing arrays.

---

## 3. Business rules

### 3.1 Calendar primitives (8261-8366)

- Working day = Mon-Fri. Weekend = `getDay()` 0 or 6. **No public holidays** (Tết, 30/4, 1/5, 2/9, Giỗ Tổ) and no compensatory working Saturdays. See open question Q1.
- All dates parsed as local midnight `new Date(str + 'T00:00:00')`; output formatted from local Y/M/D. Correct for Asia/Ho_Chi_Minh (no DST). Rewrite: pure date-only arithmetic (e.g. `Temporal.PlainDate` / date-fns on `YYYY-MM-DD`), independent of runtime TZ, and "today" taken in `Asia/Ho_Chi_Minh`.

| fn | Semantics |
|---|---|
| `subtractWorkdays(d, n)` | step back one day at a time, count only weekdays, stop at n. n ≤ 0 → d. If d is a weekend, first counted day is the previous weekday. |
| `addWorkdays(d, n)` | same forward. |
| `add/subtractCalendarDays(d, n)` | ± n days. |
| `getDaysDiff(t)` | round((t − today)/86400000) calendar days; empty t → 0. |
| `getWorkdaysDiff(t)` | number of weekdays in the half-open interval (min, max], signed (+ future, − past). t = today → 0. Empty t → 0. Invalid t → 0. |
| `formatVNDate(t, dow)` | 'dd/mm/yyyy' or 'Thứ Hai, dd/mm/yyyy' (names: Chủ Nhật, Thứ Hai … Thứ Bảy); invalid → raw string; empty → ''. |

### 3.2 Deadline formula `calculateStepDeadline(T0, offset, dayType, phase)` (8307)

| condition (first match) | deadline |
|---|---|
| T0 empty | '' |
| phase = dday OR offset === 0 | T0 |
| phase = after, workday | addWorkdays(T0, offset) |
| phase = after, calendar | T0 + offset |
| phase = before, workday | subtractWorkdays(T0, offset) |
| phase = before, calendar | T0 − offset |

Worked examples (verified by running the original functions in Node; T0 2026-12-15 is a Tuesday):

| T0 | offset | type | phase | deadline | note |
|---|---|---|---|---|---|
| 2026-12-15 (T3) | 10 | workday | before | 2026-12-01 (T3) | two full weeks back |
| 2026-12-15 (T3) | 3 | workday | before | 2026-12-10 (T5) | skips 12-13 weekend |
| 2026-12-14 (T2) | 1 | workday | before | 2026-12-11 (T6) | |
| 2026-12-19 (T7) | 2 | workday | before | 2026-12-17 (T5) | T0 on weekend: Fri=1, Thu=2 |
| 2026-12-15 | 20 | calendar | before | 2026-11-25 | |
| 2026-12-18 (T6) | 1 | workday | after | 2026-12-21 (T2) | |
| 2026-12-18 (T6) | 3 | calendar | after | 2026-12-21 (T2) | |
| 2026-12-15 | 0 | workday | before | 2026-12-15 | offset 0 → T0 |
| 2026-12-15 | 5 | workday | dday | 2026-12-15 | offset ignored |

Deadlines are stored. Recompute triggers: (a) event save where `eventDate` changed → `rescheduleEventCascade` recomputes every step of every group (8383); (b) step save recomputes that step. Nothing else (template data or settings changes do not recompute). Rewrite option: derive deadline on read instead of storing (Q4); if stored, keep the field for compatibility.

### 3.3 Step status (render-time, calendar days)

d = getDaysDiff(calculatedDeadline), null if no deadline.

| state (first match) | condition | badge |
|---|---|---|
| done | completed | emerald "Đã xong" |
| overdue | d < 0 | rose pulsing "Quá hạn {|d|} ngày"; row red border |
| due soon | 0 ≤ d ≤ 2 | amber "Cận hạn: Còn {d} ngày" |
| upcoming | d > 2 | slate "Còn {d} ngày" |
| no deadline | d null | no badge |

Overdue counts everywhere (KPI, card, group, popups, filter) use `!completed && deadline && daysDiff < 0`. Deadline day itself is not overdue. Units are calendar days even when the step's dayType is workday.

Quota chip (10099): phase dday OR offset 0 → "Trước 2 giờ"; phase after → "Sau sự kiện {n} ngày"; else "Trước {n} ngày". dayType not shown (BUG-28).

Step state machine: `open ⇄ done` by checkbox (row, or "Đánh Dấu Hoàn Thành" in Overdue pop-up which also toggles). On done set completedAt=now, completedBy=actor; on undo clear both. Sub-task completion never affects step completion and vice versa (Q3).

### 3.4 Progress and event countdown

- Event pct = round(100 × completedSteps / totalSteps) over all steps in all groups, equal weight; 0 when no steps. Sub-tasks do not count. Group: "{done}/{total} hoàn thành".
- Event countdown badge (9815), daysDiff = calendar, wd = getWorkdaysDiff:

| first match | badge |
|---|---|
| daysDiff = 0 | emerald pulsing "HÔM NAY: NGÀY DIỄN RA" |
| 0 < wd ≤ 10 | rose pulse "Còn {wd} ngày làm việc (Báo cáo hàng ngày)" |
| daysDiff > 0 | blue "Còn {wd} ngày làm việc" (can read "Còn 0 ngày làm việc", BUG-03) |
| else | slate "Đã diễn ra cách đây {|daysDiff|} ngày" |

Worked examples of `getWorkdaysDiff` (Node, mocked today):

| today | event T0 | daysDiff | workdaysDiff | old UI | intended |
|---|---|---|---|---|---|
| 2026-11-04 T4 | 2026-11-04 T4 | 0 | 0 | today | today |
| 2026-11-04 T4 | 2026-11-05 T5 | 1 | 1 | rose "Còn 1" | same |
| 2026-11-06 T6 | 2026-11-07 T7 | 1 | 0 | card "Còn 0 ngày làm việc"; popups "⭐ Hôm nay diễn ra" | "Còn 1 ngày (T7)"; still in daily-report window |
| 2026-11-06 T6 | 2026-11-08 CN | 2 | 0 | same as above | same |
| 2026-11-06 T6 | 2026-11-09 T2 | 3 | 1 | rose "Còn 1" | same |
| 2026-11-04 T4 | 2026-11-18 T4 | 14 | 10 | rose "Còn 10" (last daily-report day) | same |
| 2026-11-04 T4 | 2026-11-19 T5 | 15 | 11 | blue "Còn 11" | same |
| 2026-11-08 CN | 2026-11-07 T7 | −1 | −0 | counted as daily-report and labelled "⭐ Hôm nay diễn ra" in popups | past, not in window |
| 2026-11-09 T2 | 2026-11-07 T7 | −2 | −1 | past | past |

### 3.5 Daily-report regime (trigger)

- In window iff `0 ≤ getWorkdaysDiff(eventDate) ≤ 10` (hard-coded at 9198, 9299, 9663, 9713, 9823, 9855; should read `systemSettings.dailyReportThresholdDays`).
- Effects: KPI 2 count + ring; bell badge + bounce; event card rose border (if no overdue) and rose badge; status filter `daily_report`; pop-up P1 list. No notifications, emails, timers or scheduled checks: evaluated only on render.
- Intended (fix): in window iff event is today or in the future AND workdays until T0 ≤ threshold, using `daysDiff ≥ 0`, not the signed-zero workday count. Template step 6a ("Báo cáo … tiến độ triển khai", T-10 workday) marks the start of the regime.

### 3.6 Event lifecycle

Create (`saveEventWizard`, 10409):
1. Validate name and date non-empty (Swal "Lỗi" / "Vui lòng nhập tên sự kiện và ngày tổ chức."). targetGuests = parseInt || 150.
2. If autoGenerate: `generateStandardEventTemplate(type, date, name, dept, lead, location, budget, guests)` (§3.7) then set eventTime, note. Else bare event with `groups: []`.
3. `events.unshift`, auto-expand it, close modal, renderModule2, persist ("Tạo sự kiện mới: "{name}" (dd/mm/yyyy)"), Swal success "Đã khởi tạo sự kiện và toàn bộ khung quy trình chuẩn SCE!" (shown even without template).

Edit: overwrite name, type, department, eventTime, location, leadPerson, targetGuests, budget, note, updated_at. Type change does not touch groups. If date changed: cascade (§3.2) + Swal info "Cascade Shift thành công!" / "Đã cập nhật lại hạn chót của các bước theo ngày tổ chức mới (dd/mm/yyyy)." Persist "Cập nhật thông tin sự kiện: "{name}"".

Delete: Swal confirm "Xác nhận xóa sự kiện?" / "Toàn bộ dữ liệu tiến độ của "{name}" sẽ bị xóa vĩnh viễn." / "Đồng ý xóa" (#e11d48) / "Hủy"; filter out, persist "Xóa sự kiện: "{name}"", Swal "Đã xóa" / "Sự kiện đã được xóa khỏi hệ thống." Guests/halls/booths etc. keyed by event id in other appData maps are NOT deleted (orphans; e.g. `appData.eventGuests[evId]`, `eventBiddingPackages[evId]`) (BUG-15).

Status: `preparing` on create; nothing sets `completed`.

Seeding: `renderModule2` loads `sce_tcsk_local_events` when `appData.events` empty, and if still empty calls `initDefaultSampleEvents()` (9113): two demo events, hội nghị "Hội nghị Xúc tiến Đầu tư và Giao thương Hà Nội - Tokyo 2026" at today+8 workdays and hội chợ "Hội chợ Đặc sản Vùng miền và Sản phẩm OCOP Hà Nội 2026" at today+22 workdays, with some steps pre-completed by fake names, written to localStorage. Rewrite: drop auto-seeding from production paths (BUG-02); keep as a dev fixture.

Step CRUD (10582): create appends to group with fields from form, computed deadline, not completed, empty subTasks/links. Edit overwrites name, requirement, phase, offset, dayType, assignee, templateKey, deadline; keeps completion. Delete: Swal "Xóa bước công việc?" / "Bạn có chắc muốn xóa bước "{name}"?" / "Xóa" / "Hủy". Steps keep insertion order (not sorted by deadline).

Sub-task CRUD: add {id: Date.now(), name, completed:false}; toggle; delete (no confirm). Links: push {name,url}; delete by index (no confirm). Quick note: save trimmed text (required), delete sets '' (no confirm).

Search (9737): case-insensitive substring (no diacritic folding) over event name, location, leadPerson, note, group name, group note, step name, requirement, assignee. Matching event shows all its groups/steps expanded (no step-level filtering or highlighting). Department and sub-task names are not searched.

Status filter (first applicable):

| value | keep event iff |
|---|---|
| daily_report | 0 ≤ wd ≤ 10 |
| dday_today | daysDiff = 0 |
| completed | status = 'completed' (never true) |
| preparing | status ≠ completed AND wd ≥ 0 |
| has_overdue | any overdue step |

All filters AND together with type, department and keyword.

### 3.7 Standard SCE template (DATA, `generateStandardEventTemplate`, 8404-9110)

Extraction: the generator is pure apart from `Date.now()` and `currentUser`. The table below was produced by running the original function in Node for both types (script reproduced at the end of this section). In the rewrite store it as a typed constant, e.g. `src/features/progress/templates/sceStandard.ts`:

```ts
interface TemplateStep {
  key: string;               // stable template id, e.g. 'step_1a'
  name: string | Record<EventType, string>;
  requirement: string | Record<EventType, string>;
  offsetDays: number | Record<EventType, number>;
  dayType: DayType | Record<EventType, DayType>;
  targetPhase: StepPhase;
  assignee: '' | '$lead' | string;   // '$lead' = wizard leadPerson ('' if empty)
  templateKey: string;
  subTasks: string[];
  onlyFor?: EventType;
}
interface TemplateGroup {
  key: 'g1'|'g2'|'g3'|'g4'|'g5'|'g6'|'dday';
  phase: GroupPhase;
  name: string | Record<EventType, string>;
  leadPerson: string;        // literal, or '$lead||<fallback>'
  note: string;
  steps: TemplateStep[];
}
```

Instantiation: new ids for event/group/step/sub-task; sub-task ids 1..n; `calculatedDeadline` via §3.2; completed false, completedAt null, completedBy ''; links []. Event defaults: name || 'Sự Kiện SCE', type || 'hoi_nghi', eventTime '08:30', location || 'Khách sạn Melia Hà Nội, 44B Lý Thường Kiệt', department || 'Phòng Xúc tiến đầu tư', leadPerson || 'Lãnh đạo phụ trách', budget || '350.000.000', targetGuests || 150, status 'preparing', note ''. Keep the old step ids (`step_1a` …) as `templateStepKey` so data from the old app stays matchable. Consider storing per-event `templateVersion` (Q5).

Groups (7, order fixed):

| key | phase | name | leadPerson | note |
|---|---|---|---|---|
| g1 | phase_prepare | Nhóm 1: Khách mời & Lễ tân | $lead \|\| 'Đ/c phụ trách Lễ tân' | '' |
| g2 | phase_prepare | Nhóm 2: Biển tên, Thẻ & Chỗ ngồi | Đ/c phụ trách In ấn & Thẻ | '' |
| g3 | phase_prepare | Nhóm 3: Nội dung, Tham luận, MOU, MC & Kịch bản | Đ/c phụ trách Nội dung & Kịch bản | '' |
| g4 | phase_prepare | Nhóm 4: Địa điểm & Kỹ thuật | Đ/c phụ trách Hậu cần & Kỹ thuật | '' |
| g5 | phase_prepare | Nhóm 5: Truyền thông & Báo chí | Đ/c phụ trách Truyền thông | '' |
| g6 | phase_prepare | Nhóm 6: Chế Độ Báo Cáo | $lead \|\| 'Đ/c phụ trách Báo cáo' | Bắt buộc báo cáo tiến độ hàng ngày trình Lãnh đạo Trung tâm và UBND TP từ mốc T - 10 ngày. |
| dday | phase_dday | HN: Giai đoạn II: Công Tác Hậu Cần Trong & Sau Ngày Tổ Chức Sự Kiện / HC: Giai đoạn II: Công Tác Hậu Cần Trong & Sau Ngày Tổ Chức Hội Chợ | $lead \|\| 'Đội Điều hành Hiện trường' | Yêu cầu: Có mặt trước 2 tiếng, trang phục lịch sự, trực hỗ trợ đến khi kết thúc sự kiện. |

Steps. Offset column "HN / HC" (hội nghị / hội chợ) when they differ. W = workday, C = calendar. Deadline example for T0 = 2026-12-15 (HN / HC).

| group | key | name | phase | offset | dayType | assignee | templateKey | example deadline |
|---|---|---|---|---|---|---|---|---|
| g1 | step_1a | Lập danh sách khách mời (VIP & Doanh nghiệp) | before | 20 | C | $lead | form_dskhach | 25/11 |
| g1 | step_1b | Viết và gửi Giấy mời | before | 10 | W | $lead | form_giaymoi | 01/12 |
| g1 | step_1c | Xác nhận đại biểu tham dự (RSVP) | before | 3 | W | '' | form_rsvp | 10/12 |
| g1 | step_1d | Phương án đón tiếp đại biểu, đưa vào chỗ ngồi & mời tiệc | before | 3 | W | '' | form_phuongan_dontiep | 10/12 |
| g1 | step_1e | Cập nhật và báo cáo Lãnh đạo Trung tâm thường xuyên (Nhóm 1) | before | 2 | W | $lead | form_baocao_nhom1 | 11/12 |
| g2 | step_2a | Tổng hợp, rà soát lại tên, chức danh đại biểu. Phối hợp in biển tên | before | 3 / 20 | W / C | '' | form_bienten | 10/12 / 25/11 |
| g2 | step_2b | Chuẩn bị Thẻ đại biểu, Thẻ báo chí, Thẻ xe, Thẻ an ninh | before | 7 / 18 | W | '' | form_the_daibieu | 04/12 / 19/11 |
| g2 | step_2c | HN: Phương án sắp xếp chỗ ngồi theo khu vực trong Hội trường / HC: Phương án sắp xếp sơ đồ mặt bằng gian hàng & khu vực chỗ ngồi | before | 7 / 18 | W | '' | form_sodo_chongoi | 04/12 / 19/11 |
| g2 | step_2d | Cập nhật và báo cáo Lãnh đạo Trung tâm thường xuyên (Nhóm 2) | before | 2 / 15 | W | '' | form_baocao_nhom2 | 11/12 / 24/11 |
| g3 | step_3a | Chuẩn bị phim trình chiếu, ấn phẩm, tài liệu, quà tặng | before | 5 / 3 | W | '' | form_duyet_anpham | 08/12 / 10/12 |
| g3 | step_3b | Liên hệ tổng hợp, xây dựng bài tham luận, phát biểu, MOU | before | 3 / 7 | C / W | '' | form_duyet_mou | 12/12 / 04/12 |
| g3 | step_3c | Liên hệ MC, dịch cabin, phiên dịch theo VIP | before | 30 | C | '' | form_hopdong_mc | 15/11 |
| g3 | step_3d | Xây dựng Kịch bản Chương trình tổng thể & Kịch bản MC | before | 3 | C | '' | form_kichban_mc | 12/12 |
| g3 | step_3e | Cập nhật và báo cáo Lãnh đạo Trung tâm thường xuyên (Nhóm 3) | before | 2 | W | '' | form_baocao_nhom3 | 11/12 |
| g4 | step_4a | Liên hệ thuê địa điểm tổ chức | before | 45 | C | $lead | form_khaosat_diadiem | 31/10 |
| g4 | step_4b | Chuẩn bị phòng VIP, phòng báo chí & nghiệm thu kỹ thuật âm thanh ánh sáng, backdrop | before | 1 / 3 | C | '' | form_checklist_kythuat | 14/12 / 12/12 |
| g4 | step_4c | Cập nhật và báo cáo Lãnh đạo Trung tâm thường xuyên (Nhóm 4) | before | 1 | C | '' | form_baocao_nhom4 | 14/12 |
| g5 | step_5a | Xây dựng phương án truyền thông (trước, trong và sau) | before | 20 / 45 | W / C | '' | form_kehoach_truyenthong | 17/11 / 31/10 |
| g5 | step_5b | Đăng tải thư mời doanh nghiệp, tuyên truyền trên cổng HPA | before | 7 / 1 | W / C | '' | form_thumoi_hpa | 04/12 / 14/12 |
| g5 | step_5c | Lập danh sách cơ quan thông tấn, truyền thông trong và ngoài nước | before | 7 | W | '' | form_ds_baochi | 04/12 |
| g5 | step_5d | Cập nhật và báo cáo Lãnh đạo Trung tâm thường xuyên (Nhóm 5) | before | 2 | W | '' | form_baocao_nhom5 | 11/12 |
| g5 | step_5e | Tổng hợp kết quả truyền thông về chương trình | after | 1 | C | '' | form_baocao_truyenthong | 16/12 |
| g6 | step_6a | Báo cáo Lãnh đạo Trung tâm, UBND Thành phố tiến độ triển khai | before | 10 | W | $lead | form_baocao_tiendo_hangngay | 01/12 |
| dday | step_dday_1 | Kiểm tra trước giờ khai mạc (T0 - 2h) | dday | 0 | C | Toàn bộ Cán bộ được phân công | form_checklist_hientruong | 15/12 |
| dday | step_dday_2 | Tập trung, vào vị trí lễ tân đã được sắp xếp | dday | 0 | C | Tổ Lễ tân | form_checkin_letan | 15/12 |
| dday | step_dday_3 | Đón tiếp đại biểu VIP & đưa vào chỗ ngồi | dday | 0 | C | Tổ Lễ tân VIP | '' | 15/12 |
| dday | step_dday_4 | Đón tiếp báo chí | dday | 0 | C | Tổ Truyền thông | '' | 15/12 |
| dday | step_dday_5 | HN: Trực Hội trường & Hỗ trợ kỹ thuật / HC: Trực Hội chợ & Điều hành chương trình | dday | 0 | C | Cán bộ kỹ thuật trực | '' | 15/12 |
| dday | step_dday_6 | Mời khách dự tiệc (nếu có) | dday | 0 | C | Tổ Lễ tân | '' | 15/12 |
| dday | step_dday_7 | Tiễn khách | dday | 0 | C | Tổ Lễ tân VIP | '' | 15/12 |
| dday | step_dday_8 | Thu dọn tài liệu, ấn phẩm | dday | 0 | C | Cán bộ hậu cần | '' | 15/12 |
| dday | step_dday_booth (HC only) | Phối hợp, hỗ trợ, quản lý doanh nghiệp tham gia hội chợ, triển lãm | dday | 0 | C | Cán bộ trực gian hàng | form_truc_gianhang | 15/12 |
| dday | step_dday_thanks | Tổng hợp số liệu kết quả, hình ảnh & Dự thảo Thư cảm ơn | after | 3 | C | $lead | form_thu_camon | 18/12 |

Totals: HN 32 steps, HC 33 steps.

Requirement text and sub-tasks (HN text; HC differs only where marked):

- step_1a. Req: "Số lượng khách mời tối thiểu bằng 130% số lượng khách dự kiến tham gia. Khách mời là doanh nghiệp phải đảm bảo phù hợp với tiêu chí tham gia, chủ đề Chương trình." Subs: "Lập danh sách khách mời VIP (UBND TP, Sở ban ngành, Đối tác)"; "Lập danh sách Doanh nghiệp tham gia (đạt định mức ≥ 130%)"; "Trình Lãnh đạo Trung tâm phê duyệt danh sách".
- step_1b. Req: "Viết theo danh sách đã duyệt. Doanh nghiệp, tổ chức quốc tế phải viết bằng Tiếng Anh. Chữ viết Giấy mời sạch sẽ, rõ ràng. Giấy mời đại biểu VIP phải ghi rõ họ tên, chức danh cụ thể, đưa tận tay và xin đầu mối xác nhận. Giấy mời doanh nghiệp gửi bảo đảm qua Bưu điện." Subs: "In Giấy mời song ngữ và Giấy mời đại biểu VIP"; "Phân công cán bộ đưa giấy mời tận tay đại biểu VIP"; "Gửi giấy mời Doanh nghiệp bảo đảm qua Bưu điện".
- step_1c. Req HN: "Đại biểu VIP: Xác nhận qua thư ký. Doanh nghiệp: Xác nhận qua điện thoại, email. Thông báo cho bộ phận xây dựng kịch bản chương trình, kịch bản MC." Req HC: "Đại biểu VIP: Xác nhận qua thư ký. Doanh nghiệp: Xác nhận qua điện thoại, email. Thống nhất với doanh nghiệp: Vị trí gian hàng, Sản phẩm trưng bày, Mức hỗ trợ kinh phí, Thời gian tham gia. Thông báo cho bộ phận xây dựng kịch bản MC." Subs: "Điện thoại thư ký đại biểu VIP xác nhận tham dự"; "Gọi điện và gửi email xác nhận với Doanh nghiệp"; "Chốt số lượng đại biểu chính thức dự tiệc (nếu có)".
- step_1d. Req: "Cập nhật thông tin từ đại biểu VIP để có phương án đón tiếp chu đáo. Phối hợp với bộ phận tổng hợp bài tham luận, phát biểu. Phối hợp với bộ phận sắp xếp chỗ ngồi theo khu vực trong Hội trường." Subs: "Lập sơ đồ phân công lễ tân đón VIP từ sảnh vào phòng chờ"; "Chuẩn bị phòng VIP và tiệc trà giải lao".
- step_1e. Req: "Báo cáo kịp thời tình hình gửi giấy mời và các trường hợp đại biểu VIP báo vắng để xin ý kiến chỉ đạo." Subs: none.
- step_2a. Req: "Tổng hợp, rà soát tên, chức danh đại biểu VIP mời tham dự. Sắp xếp vị trí, đặt biển tên đại biểu VIP. In tất cả biển tên để bàn chữ A (đầy đủ tên và chức danh). Trường hợp không có thì in cơ quan công tác." Subs: "Rà soát chuẩn xác học hàm, học vị, chức danh đại biểu VIP"; "In thử mẫu biển tên để bàn chữ A kiểm tra chất lượng"; "Hoàn thiện toàn bộ biển tên VIP".
- step_2b. Req: "Thẻ đại biểu tham dự (đảm bảo số thẻ bằng 120% số khách mời dự kiến). Thẻ Báo chí (phân loại thẻ được tham gia trực tiếp và thẻ tham gia gián tiếp qua màn hình). Không phát thẻ cho đại biểu VIP. Phối hợp truyền thông cấp thẻ báo chí, phối hợp lễ tân bàn giao thẻ, gửi giấy mời kèm thẻ xe cho VIP." Subs: "In thẻ đại biểu đạt định mức ≥ 120% số khách dự kiến"; "Phân loại thẻ Báo chí (Trực tiếp / Gián tiếp qua màn hình)"; "Chuẩn bị thẻ xe VIP gửi kèm giấy mời".
- step_2c. Req: "Đảm bảo phân khu theo tiêu chí riêng, dễ quản lý, theo dõi và sắp xếp đón tiếp đại biểu." Subs: "Thiết kế sơ đồ phân khu hàng ghế VIP, Sở ban ngành, Doanh nghiệp"; "Dán nhãn số ghế / vị trí bàn đại biểu".
- step_2d. Req: "Báo cáo mẫu in và sơ đồ vị trí chỗ ngồi trước khi nghiệm thu." Subs: none.
- step_3a. Req: "Báo cáo lãnh đạo Trung tâm về video clip dự kiến chiếu, số lượng, chủng loại ấn phẩm, tài liệu, quà tặng dự kiến phát tại sự kiện." Subs: "Biên tập và duyệt video clip trình chiếu tại sự kiện"; "In ấn kỷ yếu, brochure, tài liệu xúc tiến"; "Chuẩn bị quà tặng lưu niệm cho đại biểu VIP và khách mời".
- step_3b. Req: "Liên hệ tổng hợp các bài tham luận, phát biểu của Doanh nghiệp gửi Văn phòng UBND Thành phố duyệt nội dung. Chuyển Sở Ngoại vụ các MOUs để rà soát quy phạm." Subs: "Tổng hợp bài phát biểu của Lãnh đạo UBND TP và Trung tâm"; "Gửi Văn phòng UBND TP thẩm định bài phát biểu"; "Gửi Sở Ngoại vụ rà soát các biên bản ghi nhớ MOU song ngữ".
- step_3c. Req: "Liên hệ hợp đồng thuê MC chuyên nghiệp song ngữ, đội ngũ dịch cabin và phiên dịch viên tháp tùng VIP." Subs: "Lựa chọn và ký hợp đồng MC chuyên nghiệp"; "Ký hợp đồng đơn vị dịch cabin chuyên nghiệp".
- step_3d. Req: "Liên hệ bộ phận khách mời (Nhóm 1) để có phương án xây dựng kịch bản chi tiết tổng thể và lời dẫn MC song ngữ." Subs: "Soạn thảo kịch bản điều hành tổng thể từng phút (Run-sheet)"; "Soạn kịch bản chi tiết lời dẫn MC Tiếng Việt - Tiếng Anh"; "Chạy thử kịch bản (Rehearsal) với MC và bộ phận kỹ thuật".
- step_3e. Req: "Báo cáo thẩm định kịch bản và tiến độ duyệt bài tham luận của Văn phòng UBND TP." Subs: none.
- step_4a. Req: "Liên hệ đầu mối, đề nghị báo giá làm cơ sở xây dựng dự toán, phối hợp để lên phương án thiết kế, chỗ ngồi." Subs: "Khảo sát thực tế sảnh, hội trường, phòng VIP, bãi đỗ xe"; "Thu thập 03 báo giá thuê địa điểm làm căn cứ lập dự toán"; "Ký hợp đồng thuê địa điểm".
- step_4b. Req: "Đảm bảo trang trọng, lịch sự. Nghiệm thu lắp đặt âm thanh, ánh sáng, thiết bị dịch cabin, backdrop sân khấu, biển chỉ dẫn..." Subs: "Nghiệm thu lắp đặt backdrop, photobooth, standee chỉ dẫn"; "Kiểm tra đường truyền Internet cáp quang tốc độ cao"; "Thử nghiệm hệ thống cabin dịch, tai nghe không dây"; "Trang bị phòng đón tiếp VIP chu đáo".
- step_4c. Req: "Báo cáo biên bản nghiệm thu kỹ thuật trước giờ khai mạc." Subs: none.
- step_5a. Req: "Họp báo, đăng tin, bài, phóng sự quảng bá trên truyền hình và các cơ quan báo chí chủ chốt." Subs: "Soạn thảo thông cáo báo chí chính thức"; "Liên hệ đài truyền hình VTV, HTV đưa tin".
- step_5b. Req: "Đăng thông tin bài viết và thư mời điện tử trên Cổng thông tin điện tử HPA." Subs: none.
- step_5c. Req: "Lập danh sách phóng viên các báo đài đăng ký tham dự và tác nghiệp." Subs: none.
- step_5d. Req: "Báo cáo danh sách phóng viên và kế hoạch họp báo trước sự kiện." Subs: none.
- step_5e. Req: "Tổng hợp link các bài báo, hình ảnh, phóng sự phát sóng về chương trình báo cáo Lãnh đạo." Subs: none.
- step_6a. Req: "Trước thời điểm diễn ra Hội nghị/Hội chợ 10 ngày, thực hiện chế độ báo cáo hàng ngày. Báo cáo trong quá trình triển khai, nếu có vướng mắc, cần xin ý kiến chỉ đạo ngay." Subs: "Khởi động chế độ báo cáo tiến độ hàng ngày (mốc T - 10)"; "Tổng hợp vướng mắc phát sinh xin ý kiến chỉ đạo khẩn"; "Trình báo cáo tổng hợp trước 2 ngày diễn ra sự kiện".
- step_dday_1. Req: "Tất cả cá nhân có mặt tại địa điểm trước 2 tiếng. Trang phục: Lịch sự. Kiểm tra biển chỉ dẫn, biển tên, tài liệu hội trường, phòng VIP, an ninh, thử mic, loa đài, âm thanh, máy tính, quà tặng..." Subs: "Có mặt đúng 2 tiếng trước giờ khai mạc, trang phục chuẩn công sở"; "Kiểm tra mic, slide trình chiếu, cabin dịch, wifi hội trường"; "Đặt biển tên để bàn chữ A đúng vị trí VIP"; "Kiểm tra phòng đón tiếp VIP và tiệc trà".
- step_dday_2. Req: "Tiếp nhận thông tin đăng ký, phát thẻ đại biểu (nếu có); phát tài liệu cho Đại biểu, doanh nghiệp..." Subs: "Bố trí bàn tiếp đón: Bàn VIP và Bàn Doanh nghiệp"; "Phát tài liệu, thẻ đại biểu cho khách tham dự".
- step_dday_3. Req: "Đứng dọc lối vào và hướng dẫn đại biểu vào đúng vị trí theo sơ đồ chỗ ngồi trong Hội trường." Subs: none.
- step_dday_4. Req: "Hướng dẫn phóng viên báo chí vào vị trí theo sơ đồ (tác nghiệp trực tiếp hoặc khu vực màn hình)." Subs: none.
- step_dday_5. Req: "Hỗ trợ, phối hợp nhà thầu trong quá trình diễn ra: Film, slide trình chiếu; tham luận; micro; câu hỏi của doanh nghiệp..." Subs: none.
- step_dday_6. Req: "Thông báo cho đại biểu (hoặc thư ký) ngay khi đón tiếp tại bàn lễ tân." Subs: none.
- step_dday_7. Req: "Đưa đại biểu VIP ra xe ô tô chu đáo, an toàn." Subs: none.
- step_dday_8. Req: "Thu dọn tài liệu, ấn phẩm chưa phát hết, thu gom biển tên để bàn, bàn giao mặt bằng cho đơn vị tổ chức." Subs: none.
- step_dday_booth (HC). Req: "Phân công cán bộ trực, hỗ trợ doanh nghiệp trong suốt thời gian diễn ra Hội chợ, triển lãm." Subs: "Điểm danh doanh nghiệp tham gia tại các gian hàng"; "Hỗ trợ xử lý phát sinh về điện nước, kỹ thuật gian hàng".
- step_dday_thanks. Req: "Tổng hợp các số liệu kết quả tham dự, kết nối giao thương, hình ảnh sự kiện. Dự thảo thư cảm ơn theo mẫu gửi đại biểu và doanh nghiệp." Subs: "Tổng hợp báo cáo nhanh số lượng đại biểu thực tế tham dự"; "Chọn lọc hình ảnh nổi bật sự kiện lưu trữ dữ liệu"; "Gửi thư cảm ơn đến các cơ quan, đại biểu và doanh nghiệp".

Reproducible extraction (run from repo root, read-only): concatenate lines 8261-8332 (calendar fns), a stub `var currentUser=null;`, and lines 8404-9110 (generator) into one script; call `generateStandardEventTemplate(t, '2026-12-15', 'N', 'D', 'LEAD', 'L', 'B', 150)` for `t ∈ {hoi_nghi, hoi_cho}`; dump `groups[].steps[]` fields. Wherever a field equals 'LEAD' it is `$lead`. Diff both outputs to get the HN/HC variants. A unit test in the rewrite should assert the typed table reproduces this dump (deadline column included) so the data cannot drift.

Template key → M3 alias map used by `openFormNotice` (11666, owned by M3): form_rsvp→form_dskhach, form_phuongan_dontiep→form_giaymoi_vip, form_bienten→form_the_xe_vip, form_the_daibieu→form_bienban_giaothe, form_the_baochi→form_ds_baochi, form_sodo_chongoi→form_dskhach, form_duyet_anpham→form_baocao_truyenthong, form_hopdong_mc→form_kichban_mc, form_khaosat_diadiem→form_checklist_hientruong, form_checklist_kythuat→form_checklist_hientruong, form_thumoi_hpa→form_thongcao_baochi, form_giaymoi_dn/form_giaymoi_en/form_so_buudien→form_giaymoi_vip, form_thoa_thuan_gianhang→form_truc_gianhang. Unknown key → first template (silent wrong form, BUG-40).

---

## 4. External side effects

### 4.1 Persistence `persistEventsData(summary)` (11087)

Called after every mutation, after the UI re-render (optimistic):
1. `window.recordUndoSnapshot(summary)` (6098): diff-based undo; pushes previous committed full-appData JSON (MAX_HISTORY).
2. `localStorage['sce_tcsk_local_events'] = JSON.stringify(appData.events)` (unguarded).
3. If `supabaseClient && currentUser`: `saveAppDataToSupabase(summary)` (6782) →
   - recordUndoSnapshot again (no-op),
   - skip if `window._supabaseTcskTableMissing`,
   - `upsert` into `sce_tcsk_app_data` `{id: 1, data: appData (whole blob), updated_at, updated_by: user.id, updated_by_email}`,
   - then `createBackgroundBackup(summary)` (7448): **insert a full copy of appData into `sce_tcsk_backups`** `{data, note, created_by, created_by_email}` on every save,
   - errors: console.warn only (`isExplicit` false), status badge via `updateDbStatusBadge`.
4. Errors swallowed; user never told.

Audit log: M2 writes **no** rows to `sce_tcsk_audit_logs`. The summary strings go only to backups `note` and undo. Summary strings (keep as audit action text in the rewrite): "Cập nhật tiến độ: {Hoàn thành|Chưa xong} bước "{step}" ({event})", "Cập nhật việc nhỏ: {name}" (row) / "Cập nhật việc nhỏ: "{name}"" (modal), "Tạo sự kiện mới: "{name}" (dd/mm/yyyy)", "Cập nhật thông tin sự kiện: "{name}"", "Xóa sự kiện: "{name}"", "Cập nhật bước việc: "{name}" ({event})", "Xóa bước việc: "{name}" ({event})", "Thêm việc nhỏ: "{name}" ({step})", "Xóa việc nhỏ trong bước "{step}"", "Thêm liên kết tài liệu: "{name}" ({step})", "Xóa đính kèm trong bước "{step}"", "Cập nhật ghi chú nhóm "{group}" ({event})", "Xóa ghi chú nhóm "{group}"".

Load path (6735): `select data from sce_tcsk_app_data where id=1` → `Object.assign(appData, remote)`; legacy `programs` → `events`; empty → seed samples. Missing table (PGRST205) → localStorage mode. No realtime subscription; no polling for events.

localStorage keys touched by M2: `sce_tcsk_local_events` (read 9173, write 9165, 11093). Others written elsewhere: `sce_tcsk_app_data` (whole blob, written by M4/M5/M6/undo, never read back).

### 4.2 Timers

None persistent. One-shot: focus scroll 100/150 ms, highlight removal 2500 ms, M6 hand-off 150 ms (9378). Countdowns recomputed only on render; an open page does not roll over at midnight.

### 4.3 Print (A4 plan) `openPrintPlan(evtId)` (10919)

Rendered into `printPlanContentArea`, printed with `window.print()` (no print stylesheet, BUG-29). Layout:
- Header two columns. Left: "SỞ TÀI CHÍNH THÀNH PHỐ HÀ NỘI", "TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP HÀ NỘI", "Số: ..... /KH-SCE-TCSK". Right: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", underlined "Độc lập - Tự do - Hạnh phúc", "Hà Nội, ngày ..... tháng ..... năm 2026" (hard-coded year). Agency names hard-coded although `systemSettings.agencyName/parentAgency` exist (and differ: "SỞ TÀI CHÍNH HÀ NỘI").
- Title "KẾ HOẠCH HẬU CẦN & TIẾN ĐỘ THỰC HIỆN", event name, "Ngày tổ chức: {Thứ X, dd/mm/yyyy} ({time}) • Địa điểm: {location || 'Tại Hội trường'}".
- Per group (array order): heading "{group} (Phụ trách: {lead || 'Đội chuyên trách'})", optional "Lưu ý: {note}", table columns: "STT" | "Nội dung công việc" | "Yêu cầu tiêu chuẩn SCE" | "Thời hạn hoàn thành" (dd/mm/yyyy + "(T0)" if offset 0 else "(T-{offset})") | "Người phụ trách" | "Tình trạng" ("✓ Hoàn thành" / "Đang làm").
- Signatures: left "NGƯỜI LẬP KẾ HOẠCH" "(Ký và ghi rõ họ tên)" + event leadPerson || "Chuyên viên phụ trách"; right "GIÁM ĐỐC TRUNG TÂM" "(Ký duyệt, đóng dấu)" + "BAN GIÁM ĐỐC SCE".
- `printAllEventsPlan` = openPrintPlan(events[0]) only; Swal "Thông báo" / "Chưa có sự kiện nào trong hệ thống." when empty.

### 4.4 Export `exportEventsExcel()` (11045)

Despite the name and tooltip, produces **CSV** (UTF-8 BOM), file `SCE_BaoCao_TienDo_SuKien_{UTC YYYY-MM-DD}.csv`. Empty → Swal "Thông báo" / "Chưa có dữ liệu sự kiện để xuất Excel." One row per event, all fields quoted:

| column | value |
|---|---|
| STT | index+1 |
| Tên Sự Kiện | name |
| Loại Hình | 'Hội chợ Triển lãm' if hoi_cho else 'Hội nghị Tọa đàm' |
| Ngày Tổ Chức T0 | raw YYYY-MM-DD |
| Địa Điểm | location |
| Phòng Ban Chủ Trì | department (quotes not escaped) |
| Người Phụ Trách | leadPerson |
| Tổng Bước | total steps |
| Đã Hoàn Thành | done |
| Tỷ Lệ % | "{pct}%" |
| Trạng Thái | pct=100 → 'Hoàn thành' else 'Đang chuẩn bị' |

ExcelJS is already loaded app-wide (48) and used for the styled guest-list .xlsx export (commit 90877b7); the rewrite should produce .xlsx through the shared export helper (see §7).

---

## 5. Dependencies

### 5.1 Into M2 (globals it calls)

| symbol | where | role |
|---|---|---|
| `appData`, `window.appData` | 6057 | blob; M2 owns `events` |
| `currentUser`, `currentProfile` (`fullname`, `department`) | 6055 | defaults, completedBy, created_by |
| `supabaseClient` | 6050 | gate for cloud save |
| `saveAppDataToSupabase` | 6782 | upsert + backup |
| `createBackgroundBackup` | 7448 | per-save backup row |
| `window.recordUndoSnapshot`, undo/redo | 6098-6180 | history; undo calls `renderModule2` |
| `escapeHtml` | 8202 | escapes & < > " only (not ') |
| `Swal` (sweetalert2@11) | 46 | confirms, toasts |
| `switchMainTab` | 8013 | hand-off to reports |
| `openFormNotice` (M3) | 11655 | step "Xem Biểu Mẫu" |
| `onReportEventChange`, `openGenerateDailyReportModal` (M6) | 21840, 22215 | daily report export |
| DOM in top bar: `btnHeaderDailyReportBell`, `bellDailyReportBadge` | 371, 7869 | bell |
| `updateDbStatusBadge` | via save | DB badge |

### 5.2 Out of M2 (what others read)

`appData.events` is the master event list for every module.

| consumer | lines | reads | note |
|---|---|---|---|
| M3 templates | 11187-11525 | id, name, eventDate (via `formatVNDate`), targetGuests | event selector, form merge fields |
| M4 guests / CRM | 13692-13762, 14411-14428, 14937 | id, name, eventDate \|\| date, `expectedDelegates` | writes events back via `syncModule4Storage` (whole blob) |
| M4b halls/booths, seating | 15060, 15656, 16767-16903, 17431, 17750 | id, name, eventDate | |
| M5 live | 20583-20686, 20833 | id, name, `expectedDelegates` | `syncModule5Storage` writes whole blob |
| M6 reports | 21725-22675 | id, name, eventDate, groups[].steps[].completed, `s.isOverdue`, `expectedDelegates` | M6 overdue count always 0 (BUG-39) |
| Undo/redo, backups restore | 6124, 6164, 7529 | entire blob | restore at 7529 does not re-render M2 |
| `formatVNDate` | 11200, 11387, 11391, 13720 | shared helper defined in M2 | move to shared date lib |

Other appData maps keyed by event id (owned by other modules, orphaned on delete): `eventGuests`, `eventBiddingPackages`, and the per-event maps of M4b/M5/M6 (see those specs).

Rewrite boundary: M2 exports a typed `events` slice + selectors (`selectEventOptions`, `selectEventById`, `computeEventProgress`, `isInDailyReportWindow`, `stepStatus`) and the date lib (`addWorkdays`, `workdaysBetween`, `deadlineFor`, `formatVNDate`). Other modules must use these instead of re-deriving progress or overdue.

---

## 6. Bugs and logic flaws

Severity: H = data loss / security / wrong numbers users act on; M = wrong behavior with workaround; L = cosmetic / dead code.

### Data integrity

- **BUG-01 (H) Id collisions.** `'evt_' + Date.now()` (8406) and `'grp_N_' + Date.now()` (8410…9081) run twice in the same tick in `initDefaultSampleEvents` (9124, 9149). Verified: 195 of 200 back-to-back runs gave both sample events the same id. Then `find(e => e.id === id)` always hits the first event (edit/print/toggles on event 2 act on event 1) and `deleteEvent` filter removes both (10513). Template step ids are constants (`step_1a`), so DOM ids `stepRow_*`/`groupCard_*` (10000, 10113) duplicate across events and `focusAndExpandStep` scrolls to the wrong event's step (9644); `expandedGroups` keyed by group id alone expands groups of both events. Intended: globally unique ids (UUID) for event/group/step/subtask/link; lookups scoped by event.
- **BUG-02 (H) Deleting the last event is impossible; samples resurrect.** `deleteEvent` sets `events = []` then calls `renderModule2()` before persisting (10513-10516); `renderModule2` sees empty events and reloads the stale list from `sce_tcsk_local_events` (9172-9176), then persists it. On a fresh device or when cloud has `events: []`, demo events are seeded (9178, 6761) and later uploaded to the shared blob by any save. Intended: empty list is a valid state; no auto-seed in production.
- **BUG-03 (M) Weekend countdown is wrong.** `getWorkdaysDiff` returns 0 for a future weekend T0 when the days between are all weekend (8351-8365), and `-0` for a T0 one weekend day in the past. Effects: card shows "Còn 0 ngày làm việc" (9834); P1 and banner label tomorrow-Saturday events "⭐ Hôm nay diễn ra" (9319, 9677); on Sunday an event from Saturday counts in KPI 2, P1, banner and `daily_report` filter (9198, 9299, 9663, 9713 accept −0 ≥ 0). See §3.4 table. Intended: use `daysDiff` for today/past decisions, workdays only for the count.
- **BUG-04 (M) Empty or invalid `eventDate` counts as "today".** `getDaysDiff`/`getWorkdaysDiff` return 0 for empty (8336, 8346); invalid strings also give 0 (NaN comparison). Legacy `programs` rows may lack `eventDate` (consumer at 13720 reads `e.date`). Such events show "HÔM NAY: NGÀY DIỄN RA" and enter the daily-report window. Intended: no date → "Chưa có ngày", excluded.
- **BUG-06 (M) No public holidays.** Working days skip only Sat/Sun (8261). Vietnamese holidays (Tết ~5-9 days, 30/4-1/5, 2/9, Giỗ Tổ) are counted as working days, so T-10 workday deadlines land on holidays and the daily-report window is short. Intended: holiday calendar (Q1).
- **BUG-07 (M) Admin threshold ignored.** `systemSettings.dailyReportThresholdDays` (6068, editable at 6910) is never read; 10 is hard-coded in 6 places plus pop-up copy (3220, 3236, 9309). `guestQuotaPercent`/`badgeQuotaPercent` likewise not applied to template text (8419, 8546). Intended: read settings.
- **BUG-08 (H) Whole-blob last-writer-wins.** Every toggle upserts all of `appData` (6799-6806). Two users editing any module concurrently overwrite each other's changes; no version check, no realtime refresh. Rapid toggles fire overlapping un-awaited-in-order upserts (10337-10339), so an older payload can land last. Intended: per-entity rows or optimistic concurrency (`updated_at` check) and a serialized save queue.
- **BUG-09 (H) Backup row per click.** `createBackgroundBackup` inserts a full appData copy into `sce_tcsk_backups` on every save (6817, 7451), i.e. every checkbox. Unbounded table growth and large write per click. Intended: debounce / periodic or explicit backups.
- **BUG-10 (M) Silent save failures.** `persistEventsData` swallows errors (11099-11101); `localStorage.setItem` is unguarded (11093) and throws on quota, aborting the cloud save. UI already shows success. Intended: surface failed/queued state.
- **BUG-11 (M) Remote load clobbers local.** `Object.assign(appData, remote)` (6756) discards edits made while offline/table-missing; `sce_tcsk_app_data` localStorage is written but never read. Intended: explicit offline queue or no offline mode (Q6).
- **BUG-12 (M) "Đã hoàn thành" filter never matches.** No code sets `status = 'completed'` (grep: only `'preparing'` writes at 9102, 10450). Filter `completed` always empty (9716); `preparing` keeps all non-past events. Intended: derive status (e.g. completed when pct = 100 or T0 + last after-step passed) or add an explicit close action (Q2).
- **BUG-13 (L) Card/export status disagree.** CSV status from pct (11070); filter uses `evt.status`. Intended: one derived status.
- **BUG-14 (M) Blank events are dead ends.** Unchecking "Áp dụng mẫu quy trình chuẩn" creates `groups: []` (10455) and no UI adds a group, so no steps can ever be added; success toast still says "toàn bộ khung quy trình chuẩn SCE" (10464). Intended: "Thêm nhóm việc" or always seed groups.
- **BUG-15 (M) Delete orphans related data.** `deleteEvent` removes only the event (10513); guests, bidding packages, halls/booths/live data keyed by event id stay in the blob. No undo prompt beyond global Ctrl+Z.
- **BUG-16 (L) Type change ignored.** Editing `type` hoi_nghi↔hoi_cho keeps the old groups/steps (10472). Product decision (Q5).
- **BUG-17 (L) Default dept may be outside options.** `currentProfile.department` (10366) not in the 4 options → select shows blank, saves `''`.

### Security

- **BUG-18 (H) Stored XSS via `templateKey`.** Inserted unescaped inside an inline `onclick` JS string and inside `<code>` (10171-10173). Any user can set it in the step modal; data is shared through Supabase to every user. Also `escapeHtml(st.name)` inside the JS string (10171) is wrong context: `'` is not escaped and HTML entities are decoded before JS runs, so a step name with an apostrophe breaks the button or injects script. Intended: no inline handlers; React props.
- **BUG-19 (H) `javascript:` links.** Link URL is only HTML-escaped into `href` (10159, 10807); `<input type=url>` accepts `javascript:alert(1)`. Click executes in app origin (session token in localStorage). Intended: allow only http(s) (and maybe mailto), validate at save and render.
- **BUG-20 (M) No authorization.** Any logged-in user can edit/delete any event or step (10498, 10644); no role checks in the module. Intended: per Q7.
- **BUG-41 (M) CSV formula injection.** Event fields written raw into CSV (11072); a name starting with `=`, `+`, `-`, `@` executes as a formula in Excel. `department` quotes not escaped; `evt.name.replace` throws if name missing.

### Wrong labels / fields

- **BUG-21 (L)** P1 shows `evt.leadDept || 'P. XTĐT'` (9349); field is `department`, so always "P. XTĐT".
- **BUG-22 (L)** P2 chip `evt.scale || 'Hội nghị'` (9445); field is `type`, so hội chợ events show "Hội nghị".
- **BUG-23 (L)** P2 "Còn {workdays} ngày làm việc" prints negatives for past events (9451).
- **BUG-24 (L)** `step.dept` read in P3/P4 (9529, 9612) never exists. Dead.
- **BUG-25 (L)** `handleToggleStepFromPopup` branch `'daily'` (9633) unused; `stepItem_` id (9644) never rendered. Dead.
- **BUG-26 (L)** Section heading contains a broken LaTeX string with a literal tab: `(`$T_0 - 2<TAB>ext{h}$ đến $T + 3$`, a literal tab replaced `\t` of `\text`)` (9978). Intended: "(T0 − 2h đến T+3)". Captions "6 Nhóm công việc chuẩn hóa" and "Quy chuẩn 9-10 bước tác nghiệp" are hard-coded (9965, 9980) regardless of actual counts.
- **BUG-27 (L)** Print offset label: after-phase steps print "(T-1)"/"(T-3)" instead of "(T+1)"/"(T+3)" (10988); before-phase steps with offset 0 print "(T0)". Workday vs calendar not shown.
- **BUG-28 (L)** Quota chip "Trước {n} ngày" does not say working vs calendar days (10105); offset 0 on a `before` step shows "Trước 2 giờ" (10100). Step badges count calendar days while event badge counts working days, side by side (9367 vs 9319).
- **BUG-29 (M) Printing prints the app.** No `@media print` rules exist in the file; `window.print()` (3663) prints the whole page with the modal overlay, and the preview body is `overflow-y-auto` inside `max-h-[95vh]`, so long plans are clipped. Hard-coded "năm 2026" (10938) and hard-coded agency header instead of `systemSettings`. Intended: dedicated print route / print CSS, current date.
- **BUG-30 (M)** "In tổng hợp tiến độ sự kiện (A4)" prints only `events[0]` (11039), not a summary of all events.
- **BUG-31 (L)** "Xuất báo cáo Excel / CSV" yields CSV only; filename date is UTC (11078), so 00:00-07:00 Hanoi time gives yesterday's date.

### UI state / interaction

- **BUG-32 (M) Cannot collapse in expand modes.** `isExpanded` ORs viewMode and keyword (9788, 9993), so clicking an event/group header in `expand_groups`/`expand_all` or while searching changes the Set but nothing visibly changes. Intended: view mode seeds the sets once; headers always toggle.
- **BUG-33 (L) Stale disabled offset input.** `onStepPhaseChange` disables offset for dday (10575); `openCreateStepModal`/`openEditStepModal` reset phase but not `disabled` (10557, 10538), so after editing a dday step the next create has a disabled offset of 5; opening an existing dday step leaves offset editable. Edit modal title stays "Chỉnh Sửa Bước Việc" for create.
- **BUG-34 (L) Banner dead.** `module2DailyReportAlert` has `style="display:none !important"` (1264); JS toggling `hidden` (9667-9671) is dead code. Decide keep or remove (Q8).
- **BUG-35 (L) Search quality.** No Vietnamese diacritic folding (9695); matches show all steps unfiltered and unhighlighted; department not searched though dropdown exists.
- **BUG-36 (L) Inconsistent modals.** KPI pop-ups close on backdrop (3206), wizard/step/sub-task/links/note/print do not; no Escape key, no focus trap, no `role="dialog"`/`aria-modal`, icon-only close and action buttons have only `title` (3361, 9919-9926, 10199-10209). Sub-task/link/note deletes have no confirm; event/step deletes do. Inline `onclick` everywhere.
- **BUG-37 (L) Non-existent Tailwind classes.** `py-0.2` (39 uses, e.g. 9230, 9366), `shadow-xs`, `shadow-2xs` (Tailwind v3 CDN at 27 has neither), `animate-swing` (3211, no CSS). All no-ops.
- **BUG-42 (L) No midnight rollover.** Countdowns and overdue states computed only on render (§4.2); a page left open overnight shows yesterday's states.
- **BUG-43 (L) Wizard/filter department lists hard-coded** in two different orders (1304, 3383) instead of `appData.departments`.
- **BUG-44 (L) Step order.** Steps are shown in insertion order; a step added later with an earlier deadline appears at the end. Print/export same.

### Cross-module (reported here because M2 owns the data)

- **BUG-38 (M)** M2 writes `targetGuests`; M4/M5/M6 read `expectedDelegates || 100` (14428, 20833, 22141, 22226, 22649). Guest targets and check-in % elsewhere always use 100. Intended: one field (`targetGuests`), migrate reads.
- **BUG-39 (M)** M6 counts overdue via `s.isOverdue` (22066), which no code writes; M6 overdue is always 0. Intended: M6 uses M2's `stepStatus` selector.
- **BUG-40 (L)** `openFormNotice` falls back to the first template for unknown keys (11684), so custom keys typed in the step modal open an unrelated form without warning.

Bug count: 43 distinct entries, ids BUG-01 to BUG-44 (BUG-05 unused).

---

## 7. Rewrite notes

### 7.1 Feature breakdown (suggested `src/features/progress/`)

1. `domain/` types (§2), zod schema with defaults and legacy migration (`programs` → `events`, missing arrays, string offsets → number).
2. `lib/workdays.ts` pure date-only calendar (§3.1-3.2) with holiday table input; unit tests from §3.2/§3.4 tables (both "old" and "intended" rows).
3. `templates/sceStandard.ts` typed table (§3.7) + `instantiateTemplate(type, input, idGen, deadlineFn)`; snapshot test against the Node dump.
4. `selectors.ts`: `stepStatus`, `eventProgress`, `eventCountdown`, `isInDailyReportWindow(event, today, threshold)`, `filterEvents(state)`, `searchEvents` (diacritic-insensitive).
5. `store` actions: createEvent, updateEvent (cascade on date change), deleteEvent (+ cascade/orphan policy), toggleStep, CRUD step/subtask/link/note. Each action emits one audit summary string (§4.1) and goes through the foundation's persistence/audit service.
6. UI: Dashboard header + KPI cards; 4 KPI dialogs; filters bar; event accordion (event → group → step); wizard; step dialog; subtasks dialog; links dialog; note dialog; print route `/events/[id]/print` with print CSS; export via shared xlsx helper.
7. Integration points: `openTemplate(templateKey, eventId)` (M3 route), `openDailyReport(eventId)` (M6 route with query param instead of setTimeout DOM poking).

### 7.2 Shared primitives seen (belong to foundation UI kit)

- Modal/dialog (overlay blur, header icon tile + title + subtitle, close ×, footer actions), confirm dialog (Swal replacement), toast.
- KPI stat card (icon tile, label, value, optional sub-value, highlight ring, hover chevron, click).
- Badge/chip variants: emerald/rose/amber/blue/slate/indigo/purple, pulse.
- Progress bar (blue → emerald at 100%).
- Accordion row with rotating chevron.
- Filter bar: search input with clear button + selects.
- Empty state (icon circle, title, text, CTA).
- Checkbox with label (large touch target), icon button with tooltip + aria-label.
- A4 administrative document layout (Quốc hiệu/Tiêu ngữ header, signature block). Same layout appears in M6 daily report (22228) and other modules; build once, read agency names from `systemSettings`.
- Helpers: `formatVNDate(date, withDow)`, VN weekday names, working-day lib, CSV/XLSX export, safe URL check, id generator.

### 7.3 UX consistency targets

- One countdown vocabulary: "Hôm nay", "Còn N ngày làm việc", "Còn N ngày", "Quá hạn N ngày", "Đã diễn ra N ngày trước"; always say which unit.
- Show offset as "T-10 (ngày làm việc)" / "T+3 (ngày lịch)" in row, modal and print.
- Every destructive action uses the same confirm; every dialog closes on Escape and backdrop.
- Mobile: header buttons collapse to icons (current behavior), step row stacks (current `md:flex-row`).

### 7.4 Open product questions

- Q1. Holiday calendar: should working days exclude Vietnamese public holidays and include compensatory Saturdays? Source of the list (admin-editable table vs fixed)?
- Q2. When is an event "Đã hoàn thành"? Auto at 100% steps, after T0 + last after-step, or a manual close button?
- Q3. Should completing all sub-tasks auto-complete the step (and un-checking one reopen it)?
- Q4. Store `calculatedDeadline` or derive at read time? Deriving fixes stale deadlines after rule changes but changes old data semantics.
- Q5. Changing event type after creation: regenerate template (losing progress), merge, or forbid? Version templates per event?
- Q6. Offline/localStorage mode: keep (with sync queue) or drop now that Supabase is required?
- Q7. Permissions: who may create/edit/delete events and steps (admin, department of the event, assignee)?
- Q8. The daily-report banner was force-hidden; remove it, or restore it?
- Q9. "In tổng hợp" button: one A4 summary of all events, or a per-event picker?
- Q10. Demo events: keep as an explicit "Tạo dữ liệu mẫu" action for training, or remove?
- Q11. Should the daily-report regime notify (email/push) or stay a visual badge?
- Q12. Event list default sort: by T0 ascending, by urgency, or creation order (current)?
