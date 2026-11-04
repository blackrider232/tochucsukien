# Module 3 spec: Biểu mẫu (Smart Template Studio) + Quản trị biểu mẫu

Source: `code/index.html` (22,715 lines, one classic `<script>` block 6031-22713, so all top-level `function` declarations share one scope).
Owned ranges: user tab HTML 1346-1537, admin tab HTML 866-977, JS 11108-12171, admin editor modal 5678-5793 (outside the 3198-5470 modal range).
Built-in template data: `STANDARD_TEMPLATES`, one 78 KB JSON literal on line 11112 (23 entries). A rebuild must extract it verbatim. A parse script that works: take line 11112, slice from the first `[` to the last `]`, `JSON.parse`.

There is NO template import feature, NO real DOCX handling, and NO Supabase Storage use. "Word (.docx)" is HTML saved with a `.doc` extension and MIME `application/msword`.

---

## 1. Purpose and screens

Purpose. A library of 23 standardized Vietnamese administrative documents (Nghị định 30/2020/NĐ-CP format) at three issuing levels. A staff member (chuyên viên) picks an event; the app fills `{{TAG}}` placeholders from that event and lets them preview, download Word/CSV, print/PDF, or copy text. Only admins edit the canonical templates. Edits are stored in the shared app-data blob and "sync to all staff".

### 1.1 Screen A: `mainTab-templates` (sidebar "Biểu mẫu", 263; top-bar title "Kho Biểu Mẫu Chuẩn Hóa", subtitle "Hệ thống 23 biểu mẫu hành chính chuẩn 3 cấp thẩm quyền theo Nghị định 30/2020/NĐ-CP.", badge "23 Biểu Mẫu Chuẩn", config at ~7876)

Order on screen:

1. **Control card** (1349-1424)
   - Event picker. Label "Điền dữ liệu từ:" + `<select id=studioEventSelector>`. Options: `"{escape(name)} ({dd/mm/yyyy})"` for every `appData.events` entry. Empty state: single option "(Chưa có sự kiện nào)", value `""`. Default: first event, or keep previous selection if it still exists (11183-11203).
   - Action buttons, in order:
     - "Tải Word (.docx)" → export current preview (`exportCurrentTemplateDocx`).
     - "Tải Excel" (`#btnExportCsvTop`) → CSV of current preview tables. Hidden unless template has a table.
     - "In / PDF" → print window.
     - "Danh Mục (Excel)" → CSV catalog of all templates (tooltip says "32 biểu mẫu", wrong).
     - "⚙️ Quản trị Biểu Mẫu (Admin)" (`#btnGoToAdminTemplates`) → hidden unless admin (toggled in `updateUserHeaderUI` 6401-6421).
   - Four static stat tiles: "Kho Biểu Mẫu" = `#statTotalTemplates` = `"{N} biểu mẫu"` (N = all active templates, live); "Trộn Dữ Liệu / Tự động theo sự kiện"; "Tải File / Word / Excel / PDF A4"; "Phân Quyền / Admin quản trị • CV tải về".
2. **Split layout** `lg:grid-cols-12`.
   - **Left (4/12): "Danh Mục Biểu Mẫu"** + count badge `#templatesCountBadge` = `"{filtered} mẫu"`.
     - Search `#templateSearchInput`, placeholder "Tìm tờ trình, giấy mời, kịch bản, thẻ...". Case-insensitive substring over title, code, description. Trimmed + lowercased.
     - Group pills (single-select): "Tất cả biểu mẫu" (`all`), "🏛️ Cấp UBND TP" (`cap_ubnd`), "🏢 Cấp Sở Tài chính" (`cap_stc`), "🎯 Cấp Trung tâm (SCE)" (`cap_trungtam`). Active pill: purple filled.
     - List (`max-h-[640px]` scroll). Card per template:
       - Top-left: code chip (mono) or, if code empty, grey chip "Biểu mẫu nội bộ".
       - Top-right: type chip "Bảng tính Excel" (grid, green) or "Văn bản Word A4" (doc, blue).
       - Title (2-line clamp), description (1-line clamp).
       - Footer: "Tải Word" (quick download with merge, toast "Đang tải Word: {title}"), "Tải Excel" (only if hasTable), right label "👁 Xem".
       - Click card → select + preview. Selected card: purple border/bg.
     - Empty state: "Không tìm thấy biểu mẫu phù hợp."
   - **Right (8/12): preview**
     - Header row 1: code badge `#currentTemplateKeyBadge` (code, or "Biểu mẫu nghiệp vụ" if empty); group badge `#currentTemplateCategoryBadge` = `groupName`; static green badge "Mẫu Chuẩn SCE"; title `#currentTemplateTitle`.
     - Header row 2 toolbar: "Tải Word (.docx)", "Tải Excel" (`#btnExportCsvEditor`, hidden if no table), "In / PDF", icon-only copy button (title "Sao chép nội dung văn bản"); right side "Sửa Mẫu (Admin)" (`#btnEditCurrentTemplateAdmin`, admin only, opens editor for selected template).
     - Info strip: "**Dành cho Cán bộ Chuyên viên:** Bấm **Tải Word (.docx)** hoặc **Tải Excel** để lưu biểu mẫu về máy tính và tự do chỉnh sửa, điền số liệu." + (sm+) "Quyền sửa mẫu chuẩn thuộc về Admin".
     - A4 paper canvas `#smartEditorCanvas`, `contenteditable=false`, max-w 800px, serif. Shows template HTML with tags merged when an event is selected. With no event, raw `{{TAGS}}` are shown.
     - Status bar: word count "{n} từ", char count "{n} ký tự", status `#editorSaveStatus`:
       - Event selected: "✨ Đã tự động điền thông tin: "{event name}"".
       - No event: "✓ Mẫu chuẩn ban hành • Sẵn sàng tải về".
       - Right: "Chuẩn thể thức Nghị định 30/2020/NĐ-CP • Chuyên viên tải file về tự chỉnh sửa".

Initial state: selected template `form_kh_ubnd`, filter `all`, search empty.

### 1.2 Screen B: `mainTab-admin-templates` (sidebar "Quản trị biểu mẫu", 314, group "Hệ thống & Quản trị"; top-bar "Quản Trị Biểu Mẫu Chuẩn Hóa", badge "23 Biểu Mẫu Gốc", ~7952)

1. Four stat cards, ALL HARDCODED (867-901): "Tổng Biểu Mẫu Chuẩn: 23 Mẫu / Nghị định 30/2020/NĐ-CP"; "Cấp UBND TP Hà Nội: 04 Mẫu / Kế hoạch, Giấy mời, Báo cáo"; "Cấp Sở Tài Chính: 02 Mẫu / Tờ trình & Báo cáo TP"; "Cấp Trung Tâm SCE: 17 Mẫu / Tác nghiệp & Ký hiệu -TTXT". Rewrite: compute live.
2. Section `#adminTemplatesSection`. Header "Quản Trị & Sửa Đổi Các Loại Biểu Mẫu Chuẩn" + chip "Admin Only". Subtitle "Chỉ Quản trị viên mới có quyền sửa đổi nội dung mẫu gốc, mã hiệu và thẻ trộn dữ liệu. Thay đổi sẽ tự động đồng bộ đến toàn bộ chuyên viên."
   - Buttons: "Thêm Biểu Mẫu Mới" (create modal), "Khôi phục Mẫu Gốc SCE" (reset all), "Xuất Excel" (same catalog CSV as user tab).
3. Search `#adminTemplateSearchInput` (placeholder "Tìm theo tên biểu mẫu, mã hiệu (TT-SCE...), mô tả...") + select `#adminTemplateGroupFilter`: "Tất cả phân cấp thẩm quyền (23 mẫu)" (hardcoded count), "1. Cấp UBND Thành phố Hà Nội", "2. Cấp Sở Tài chính", "3. Cấp Trung tâm (SCE)". Filter state is read from the DOM on each render (module3State admin fields are unused).
4. Table columns: "STT" (index within filtered list), "Mã hiệu" (chip, or italic "(Không số hiệu)"), "Tên biểu mẫu chuẩn" (title + 1-line description), "Nhóm quy trình" (groupName), "Định dạng" ("Bảng tính"/"Văn bản"), "Trạng thái", "Thao tác Admin".
   - Status rule (11748-11749), first match wins:
     | Condition | Chip |
     |---|---|
     | id not in STANDARD_TEMPLATES | "Admin tạo mới" (indigo) |
     | `isCustom` true, or stored content ≠ built-in content | "Đã sửa bởi Admin" (amber) |
     | else | "Mẫu gốc SCE" (grey) |
   - Actions (icon-only): edit (title "Chỉnh sửa nội dung biểu mẫu này"); preview (title "Xem trước biểu mẫu", switches to Screen A and selects it); reset-to-original (only modified built-ins, title "Khôi phục về mẫu gốc ban đầu"); delete (only admin-created, title "Xóa biểu mẫu này").
   - Empty state row: "Không tìm thấy biểu mẫu nào theo tiêu chí tìm kiếm."

Other entry: the Settings tab (`mainTab-admin`) button "Quản trị Biểu Mẫu" (584) calls `scrollToAdminTemplates()`, which is broken (bug B07).

### 1.3 Modal: `#adminTemplateModal` (5681-5793, owned by this module)

- Header: icon, `#adminTemplateModalTitle` = "Sửa Đổi Biểu Mẫu Chuẩn: {title}" (edit) or "Thêm Biểu Mẫu Chuẩn Mới (Admin Only)" (create). Sub "Chỉ Quản trị viên mới có quyền cấu hình nội dung biểu mẫu chuẩn của hệ thống." Close ×.
- Metadata grid:
  - Hidden `#adminTmplId`.
  - "Mã Hiệu Biểu Mẫu *" (placeholder "TT-SCE/DSKM").
  - "Tên Biểu Mẫu Chuẩn *".
  - "Nhóm Quy Trình" select: cap_ubnd/cap_stc/cap_trungtam with the 1./2./3. labels.
  - "Định Dạng Biểu Mẫu": `doc` "Văn bản hành chính A4 (Word/PDF)", `grid` "Bảng tính / Biểu mẫu số liệu (Excel/Word)".
  - "Mô Tả Mục Đích & Hướng Dẫn Sử Dụng".
- Toolbar:
  - B / I / U, justify left/center/right/full (all via `document.execCommand`).
  - "Chèn Bảng": inserts a fixed 4-col table (STT | Nội dung công việc | Số lượng / Định mức | Ghi chú) with two sample rows using `{{SO_KHACH_DU_KIEN}}` and `{{DINH_MUC_MOI_130}}` (12131-12160).
  - Dropdown "Chèn Thẻ Trộn {{...}}" listing the 11 tags of §3.1 with Vietnamese labels.
- Canvas `#adminEditorCanvas`, contenteditable, A4 look, `oninput` sets status "Có thay đổi chưa lưu".
- Footer:
  - Status `#adminEditorStatus`. Values: "Sẵn sàng chỉnh sửa", "Đang soạn thảo biểu mẫu chuẩn", "Tạo biểu mẫu chuẩn mới", "Có thay đổi chưa lưu", "Đã tải lại nội dung mẫu gốc ban hành".
  - Link "Khôi phục mẫu gốc SCE": reloads built-in content/title/code/desc into the form (not group/type). For a new template: info "Đây là biểu mẫu mới tạo thêm, không có bản gốc ban đầu của SCE."
  - "Đóng" (discards silently).
  - "Lưu Cập Nhật Biểu Mẫu Chuẩn".
- Create defaults: id `form_custom_{Date.now()}`, code `BM-SCE/2026`, group `cap_trungtam`, type `doc`, content = standard SCE letterhead + "TIÊU ĐỀ BIỂU MẪU MỚI" + "Về việc phục vụ chương trình: {{TEN_SU_KIEN}}" + placeholder paragraph (11862-11888).

### 1.4 SweetAlert2 dialogs and toasts (exact text)

| Trigger | Kind | Text |
|---|---|---|
| Non-admin opens edit/create/save | warning | "Quyền hạn" / "Chỉ Quản trị viên (Admin) mới có quyền sửa đổi biểu mẫu chuẩn hệ thống!" (create: "...quyền tạo biểu mẫu chuẩn!", save: "...quyền lưu thay đổi biểu mẫu!") |
| Save without code or title | warning | "Thiếu thông tin" / "Vui lòng nhập Mã hiệu và Tên biểu mẫu chuẩn." |
| Save OK | success 2.5 s | "Đã lưu biểu mẫu chuẩn thành công!" / "Nội dung biểu mẫu đã được cập nhật vào kho chuẩn hệ thống và đồng bộ đến toàn bộ chuyên viên." |
| Reset one, confirm | warning, confirm red | "Khôi phục về mẫu gốc ban đầu?" / "Mọi sửa đổi của Admin đối với biểu mẫu "{title}" sẽ bị hủy bỏ và quay lại mẫu chuẩn ban hành." Buttons "Đồng ý khôi phục" / "Hủy". Done: "Đã khôi phục" / "Biểu mẫu đã được đưa về trạng thái chuẩn ban hành của SCE." |
| Reset all, confirm | warning | "Khôi phục TOÀN BỘ 32 biểu mẫu gốc?" (should be 23) / "...Hành động này không thể hoàn tác." "Xác nhận khôi phục tất cả". Done: "Đã khôi phục toàn bộ" |
| Delete, confirm | warning | "Xóa biểu mẫu này?" / "Bạn có chắc chắn muốn xóa biểu mẫu "{title}" khỏi hệ thống?" "Xóa biểu mẫu". Done: "Đã xóa" / "Biểu mẫu đã được gỡ bỏ khỏi hệ thống." |
| CSV with no table | info | "Thông báo" / "Biểu mẫu này là văn bản thuần túy, không có bảng biểu để xuất file Excel. Vui lòng sử dụng tính năng "Tải Word (.docx)"." |
| CSV OK | toast | "Đã xuất file bảng biểu Excel thành công!" |
| Copy OK | toast | "Đã sao chép nội dung biểu mẫu!" (failure: console only) |
| openFormNotice | info toast 3.5 s | "Đã mở biểu mẫu: {stepName}" / "Chuyên viên bấm "Tải Word (.docx)" để tải về máy và tự do chỉnh sửa." |

---

## 2. Domain types

```ts
type TemplateGroup = 'cap_ubnd' | 'cap_stc' | 'cap_trungtam';
type TemplateType = 'doc' | 'grid';

// Persisted: built-ins in code (STANDARD_TEMPLATES, line 11112);
// overrides + admin-created in appData.systemTemplates (full array, see §3.3),
// stored in localStorage 'sce_tcsk_app_data' and Supabase sce_tcsk_app_data.data (row id=1).
interface DocumentTemplate {
  id: string;            // built-ins: 'form_*'; admin-created: 'form_custom_<epochMs>'
  group: TemplateGroup;
  groupName: string;     // denormalized label; derive it in the rewrite (bug B03)
  code: string;          // document symbol, e.g. 'KH-UBND'; '' for 9 built-ins
  title: string;
  type: TemplateType;
  description: string;
  content: string;       // HTML with inline styles + {{TAG}} placeholders
  isCustom?: true;       // set on every admin save
  updatedAt?: string;    // ISO, set on every admin save
}

// Read-only input from Module 2 (appData.events). Only the fields used here:
interface EventForMerge {
  id: string;
  name: string;
  eventDate: string;     // 'YYYY-MM-DD' (T0)
  eventTime?: string;    // 'HH:MM'
  location?: string;
  department?: string;
  leadPerson?: string;
  targetGuests?: number | string;
  budget?: string;       // free text from wizard, e.g. '350.000.000'
}

// In-memory UI state (11156-11164). Not persisted.
interface Module3State {
  selectedEventId: string;
  selectedTemplateKey: string;  // default 'form_kh_ubnd'
  activeFilterGroup: 'all' | TemplateGroup;
  searchKeyword: string;
  adminFilterGroup: string;     // dead
  adminSearchKeyword: string;   // dead
  editingTemplateId: string | null; // written, never read
}

// Audit log row written on save only (11956).
// Table sce_tcsk_audit_logs(actor_id uuid, actor_email text, action text, summary text, created_at).
interface TemplateAuditLog {
  actor_id: string; actor_email: string;
  action: 'CẬP NHẬT BIỂU MẪU CHUẨN';
  summary: string; // `Admin cập nhật biểu mẫu chuẩn: "${title}" (${code})`
}
```

Related settings that exist but are NOT used by templates (`appData.systemSettings`, 6065-6074): `agencyName`, `parentAgency`, `guestQuotaPercent` (130), `badgeQuotaPercent` (120).

Step → template link (Module 2 data): `step.templateKey: string`, edited as free text in the step modal `#stepEditTemplateKey` (3520, shared modal owned by Module 2).

### 2.1 Built-in catalog (23)

| # | id | group | code | type | tags used |
|---|---|---|---|---|---|
| 1 | form_kh_ubnd | cap_ubnd | KH-UBND | doc | HOM_NAY, TEN, NGAY_TO_CHUC, GIO, DIA_DIEM, SO_KHACH |
| 2 | form_giaymoi_ubnd | cap_ubnd | GM-UBND | doc | HOM_NAY, TEN, GIO, NGAY_TO_CHUC, DIA_DIEM |
| 3 | form_congvan_ubnd_phoihop | cap_ubnd | UBND-KT | doc | HOM_NAY, TEN, NGAY_TO_CHUC, DIA_DIEM |
| 4 | form_baocao_ubnd_ketqua | cap_ubnd | BC-UBND | doc | HOM_NAY, TEN, NGAY_TO_CHUC, DIA_DIEM, SO_KHACH |
| 5 | form_totrinh_stc_ubnd | cap_stc | TTr-STC | doc | HOM_NAY, TEN, NGAY_TO_CHUC, DIA_DIEM, KINH_PHI |
| 6 | form_baocao_stc_quyettoan | cap_stc | BC-STC | doc | HOM_NAY, TEN, KINH_PHI |
| 7 | form_qd_sce_btc | cap_trungtam | QĐ-TTXT (body says /QĐ-SCE) | doc | HOM_NAY, TEN |
| 8 | form_kh_sce_chitiet | cap_trungtam | QĐ-TTXT | doc | HOM_NAY, TEN, NGAY_TO_CHUC, GIO, DIA_DIEM, SO_KHACH, MOI_130, THE_120 |
| 9 | form_dskhach | cap_trungtam | "" | grid | TEN, SO_KHACH, MOI_130 |
| 10 | form_giaymoi_vip | cap_trungtam | GM-TTXT | doc | TEN, GIO, NGAY_TO_CHUC, DIA_DIEM, CAN_BO |
| 11 | form_the_xe_vip | cap_trungtam | THEXE-TTXT | doc | TEN, NGAY_TO_CHUC, DIA_DIEM |
| 12 | form_bienban_giaothe | cap_trungtam | BB-TTXT | doc | TEN, NGAY_TO_CHUC, THE_120, SO_KHACH |
| 13 | form_congvan_mou_ngoaivu | cap_trungtam | TTXT-XTĐT | doc | HOM_NAY, TEN |
| 14 | form_mou_template | cap_trungtam | "" | doc | none |
| 15 | form_kichban_mc | cap_trungtam | "" | doc | TEN, GIO, NGAY_TO_CHUC, DIA_DIEM |
| 16 | form_thongcao_baochi | cap_trungtam | "" | doc | TEN, HOM_NAY, NGAY_TO_CHUC, DIA_DIEM, SO_KHACH, CAN_BO |
| 17 | form_ds_baochi | cap_trungtam | "" | grid | TEN |
| 18 | form_baocao_truyenthong | cap_trungtam | BC-TTXT | doc | TEN |
| 19 | form_baocao_tiendo_hangngay | cap_trungtam | BC-TTXT | doc | TEN, HOM_NAY, MOI_130, CAN_BO |
| 20 | form_checklist_hientruong | cap_trungtam | "" | grid | TEN |
| 21 | form_phieu_cauhoi_hoidap | cap_trungtam | "" | doc | TEN |
| 22 | form_truc_gianhang | cap_trungtam | "" | grid | TEN, CAN_BO |
| 23 | form_thu_camon | cap_trungtam | TTXT-XTĐT | doc | NGAY_TO_CHUC, TEN, DIA_DIEM |

Counts: UBND 4, STC 2, SCE 17. Grid templates hold static sample rows. They do not pull real data: `form_dskhach` does not read guests from Module 4. Duplicate codes: QĐ-TTXT ×2, BC-TTXT ×2, TTXT-XTĐT ×2. 20 of 23 contain `<table>`, mostly letterhead/signature layout tables. Only 6 have `<th>` data tables: form_dskhach, form_bienban_giaothe, form_kichban_mc, form_ds_baochi, form_checklist_hientruong, form_truc_gianhang.

Letterheads are hardcoded per template:
- UBND: "ỦY BAN NHÂN DÂN / THÀNH PHỐ HÀ NỘI".
- STC: "ỦY BAN NHÂN DÂN THÀNH PHỐ HÀ NỘI / SỞ TÀI CHÍNH".
- SCE: "SỞ TÀI CHÍNH THÀNH PHỐ HÀ NỘI / TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP".

All use the right column "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM / Độc lập - Tự do - Hạnh phúc / Hà Nội, {{NGAY_HOM_NAY}}", a "Nơi nhận:" block, and a signature block.

---

## 3. Business rules

### 3.1 Placeholder (merge tag) substitution (`replaceMergeTagsWithEvent`, 11382-11408)

Syntax: literal `{{UPPER_SNAKE}}`. Global replace via `String.replaceAll` over a fixed map. Unknown tags stay literal. No escaping (bug B01). Applied only when an event is selected. Exports reuse the merged preview HTML (current-template buttons) or merge again (list quick buttons).

| Tag | Dropdown label | Value | Fallback when falsy |
|---|---|---|---|
| `{{TEN_SU_KIEN}}` | Tên sự kiện | `evt.name` | `''` |
| `{{NGAY_TO_CHUC}}` | Ngày tổ chức | `formatVNDate(eventDate, true)` → "Thứ Hai, 09/11/2026" | `''` |
| `{{GIO_KHAI_MAC}}` | Giờ khai mạc | `evt.eventTime` | `'08:30'` |
| `{{DIA_DIEM}}` | Địa điểm tổ chức | `evt.location` | `'Tại Hội trường Trung tâm'` |
| `{{PHONG_BAN_CHU_TRI}}` | Phòng chủ trì | `evt.department` | `'Phòng Xúc tiến đầu tư'` (unused by built-ins) |
| `{{CAN_BO_PHU_TRACH}}` | Cán bộ phụ trách | `evt.leadPerson` | `'Cán bộ phụ trách'` |
| `{{SO_KHACH_DU_KIEN}}` | Số khách dự kiến | `targetGuests` | `150` |
| `{{DINH_MUC_MOI_130}}` | Định mức mời ≥130% | `round(targetGuests × 1.3)` | from 150 → 195 |
| `{{DINH_MUC_THE_120}}` | Định mức thẻ ≥120% | `round(targetGuests × 1.2)` | from 150 → 180 |
| `{{KINH_PHI_DU_TOAN}}` | Kinh phí dự toán | `evt.budget` (raw string) | `'350.000.000'` |
| `{{NGAY_HOM_NAY}}` | Ngày hiện tại | `formatVNDate(new Date().toISOString().slice(0,10))` → "04/11/2026" (UTC date) | — |

`formatVNDate(str, withDow)` (8368): parses `str+'T00:00:00'` local. Returns `''` for empty and the input unchanged if invalid. Format `dd/mm/yyyy`, optionally prefixed "Chủ Nhật|Thứ Hai..|Thứ Bảy, ".

Intended (rewrite): one registry `{ tag, label, resolve(ctx), format }`. HTML-escape every value. Quotas come from `systemSettings.guestQuotaPercent/badgeQuotaPercent`. "Today" is computed in Asia/Ho_Chi_Minh. Missing values render as a visible highlighted blank, never fabricated defaults (B12). NĐ30 date format applies (B13).

### 3.2 Template resolution and selection

| Rule | Source |
|---|---|
| Active set = `appData.systemTemplates` if it is a non-empty array, else `STANDARD_TEMPLATES` | 11117 |
| Select unknown id → first active template | 11324-11331 |
| `hasTable` = `type==='grid'` OR content contains `<table` | 11268, 11346 |
| CSV buttons visible iff `hasTable` | 11347-11350 |
| Preview is read-only for everyone (`contenteditable=false`) | 11366 |
| Filters: group equality AND (title ∪ code ∪ description) contains keyword | 11244-11255, 11731-11741 |

Step-link alias map (`openFormNotice`, 11655-11704): opens Screen A, optionally sets the event, maps `templateKey` through aliases, falls back to the first template, selects it, scrolls the canvas into view, shows a toast.

| Step templateKey | → template | Step name (Module 2 defaults, 8428-9072) |
|---|---|---|
| form_rsvp | form_dskhach | Xác nhận đại biểu tham dự (RSVP) |
| form_phuongan_dontiep | form_giaymoi_vip | Phương án đón tiếp... |
| form_bienten | form_the_xe_vip | Tổng hợp... Phối hợp in biển tên (mismatch) |
| form_the_daibieu | form_bienban_giaothe | Chuẩn bị Thẻ đại biểu... |
| form_the_baochi | form_ds_baochi | — |
| form_sodo_chongoi | form_dskhach | "Chuẩn bị thẻ xe VIP gửi kèm giấy mời" (should be form_the_xe_vip) |
| form_duyet_anpham | form_baocao_truyenthong | Chuẩn bị phim trình chiếu, ấn phẩm... (mismatch) |
| form_hopdong_mc | form_kichban_mc | Liên hệ MC... |
| form_khaosat_diadiem | form_checklist_hientruong | Liên hệ thuê địa điểm |
| form_checklist_kythuat | form_checklist_hientruong | Chuẩn bị phòng VIP... |
| form_thumoi_hpa | form_thongcao_baochi | Đăng tải thư mời... HPA |
| form_giaymoi_dn, form_giaymoi_en, form_so_buudien | form_giaymoi_vip | — |
| form_thoa_thuan_gianhang | form_truc_gianhang | — |
| **unmapped, fall back to form_kh_ubnd**: form_giaymoi, form_baocao_nhom1..5, form_duyet_mou, form_kehoach_truyenthong, form_checkin_letan | form_kh_ubnd (UBND plan) | "Viết và gửi Giấy mời", "Cập nhật và báo cáo... (Nhóm n)", "...MOU", "Xây dựng phương án truyền thông", "Tập trung, vào vị trí lễ tân" (bug B08) |

Other callers: Reports tab (2705, 2722, 2739) opens form_kh_ubnd, form_baocao_ubnd_ketqua, form_baocao_stc_quyettoan without an eventId, so the studio's current event is used.

### 3.3 Admin CRUD and the override model

The store is a full array copy. The first mutating admin action seeds `appData.systemTemplates = deepClone(STANDARD_TEMPLATES)` (`ensureSystemTemplatesLoaded`, 11124). From then on, built-in content in code is never read again for display (bug B10).

| Action | Guard | Effect | Persist | Audit |
|---|---|---|---|---|
| Open edit | `isCurrentAdmin()` | load template into modal | — | — |
| Open create | `isCurrentAdmin()` | new id `form_custom_<ms>`, defaults §1.3 | — | — |
| Save | `isCurrentAdmin()`; code AND title non-empty | upsert by id: `{...form, groupName:getGroupName(group), content: canvas.innerHTML, isCustom:true, updatedAt}` | localStorage + `saveAppDataToSupabase(note)` if logged in | insert `sce_tcsk_audit_logs` |
| Reset one | **none** | replace with deep clone of built-in (drops isCustom) | localStorage + cloud | no |
| Reset all | **none** | `systemTemplates = clone(STANDARD)` (silently deletes admin-created) | localStorage + cloud | no |
| Delete | **none** (button only for admin-created) | filter out by id; select form_kh_ubnd | localStorage + cloud | no |
| Editor "Khôi phục mẫu gốc" | — | reload built-in content/title/code/desc into form; not group/type; not saved | — | — |
| Close modal | — | discard, no confirm | — | — |

Template lifecycle:

| State | Enters via | Leaves via |
|---|---|---|
| Built-in pristine (status "Mẫu gốc SCE") | default, reset one, reset all | save → Modified |
| Modified built-in ("Đã sửa bởi Admin") | save | reset one / reset all → pristine |
| Admin-created ("Admin tạo mới") | save from create | delete, reset all → gone |

Versioning: none. Only `updatedAt` on the latest save. Backups come from Module 1's `createBackgroundBackup` snapshot of the whole appData on each cloud save, plus the in-memory undo stack (`recordUndoSnapshot`, max 30) via `saveAppDataToSupabase`.

### 3.4 Who can do what

`isCurrentAdmin()` (11131-11144), client-side only:

| Condition | Admin? |
|---|---|
| no currentUser AND no currentProfile | **true** ("demo mode") |
| `profile.role \|\| user.role \|\| user.user_metadata.role` === 'admin' | true |
| email === 'blackrider232@gmail.com' or 'admin@sce.gov.vn' | true |
| email contains 'admin@' (any domain, any prefix like `notadmin@x.com`) | true |
| else | false |

| Capability | Staff (chuyên viên) | Admin |
|---|---|---|
| View list, preview, merge, download Word/CSV, print, copy, catalog CSV | yes | yes |
| See admin buttons on Screen A | no (hidden) | yes |
| Open Screen B (sidebar) | **yes, not gated** (B05) | yes |
| Edit/create/save | blocked by guard | yes |
| Reset one / reset all / delete | **yes, no guard** (B04) | yes |

Server enforcement: none. RLS on `sce_tcsk_app_data` is `FOR ALL TO authenticated USING (true)` and SELECT for `anon` (7695-7699).

Intended: an admin-only server-side mutation, with role from `sce_tcsk_profiles.role` (no email heuristics), and the same guard on every mutating action.

### 3.5 Export formats

| Export | Function | Output |
|---|---|---|
| Word, current | `exportCurrentTemplateDocx` 11426 | merged preview HTML wrapped in Word-HTML (`xmlns:w`, `@page WordSection1` A4, margins 2cm 2cm 2cm 3cm, TNR 14pt, `td,th{border:1px solid #000}`), BOM, MIME `application/msword`, filename `SCE_{code with / → _}_{YYYY-MM-DD UTC}.doc` |
| Word, list quick | `downloadTemplateDocx` 11436 | same, code fallback `BM`, toast |
| CSV, current/quick | `downloadCsvFromHtml` 11535 | BOM; every `<table>` in the document, blank line between tables; each `tr` → quoted `th,td` `innerText`, `"`→`""`; filename `SCE_{code\|\|'Table'}_{date}.csv` |
| Print/PDF | `printCurrentTemplatePdf` 11573 | `window.open` 950×850, writes HTML (`@page A4 portrait; margin 20mm 15mm 20mm 25mm`, TNR 13pt, bordered td), `print()` after 300 ms, then `close()` |
| Copy | `copyCurrentTemplateContent` 11619 | `navigator.clipboard.writeText(canvas.innerText)` |
| Catalog | `exportTemplatesSummaryExcel` 11637 | CSV columns "STT","Mã Biểu Mẫu","Tên Biểu Mẫu","Nhóm Quy Trình","Định Dạng","Mô Tả Mục Đích"; filename `SCE_Danh_Muc_23_Bieu_Mau_Chuan_{date}.csv` |

---

## 4. External side effects

- **Supabase tables**
  - `sce_tcsk_app_data`: upsert `{id:1, data: appData, updated_at, updated_by, updated_by_email}` via `saveAppDataToSupabase(note)` (6782). It also writes `sce_tcsk_backups` through `createBackgroundBackup`.
  - `sce_tcsk_audit_logs`: insert on save only.
  - Read: `loadAppDataFromSupabase` (6735) merges `data` into appData with `Object.assign`, so `systemTemplates` arrives with the blob.
  - No realtime subscription in this module.
- **Supabase Storage**: none.
- **localStorage**: `sce_tcsk_app_data` (whole appData JSON) written directly at 11950, 12011, 12041, 12090.
- **Files**: `.doc` (Word-HTML), `.csv` (UTF-8 BOM). No import, no `.docx`, no `.xlsx`, even though ExcelJS 4.4.0 is loaded (48) and used by other modules.
- **Printing**: popup window + `window.print()`.
- **Clipboard**: `navigator.clipboard.writeText`.
- **DOM APIs**: `document.execCommand` (bold, italic, underline, justify*, insertText, insertHTML), all deprecated.
- **Libraries**: SweetAlert2 11 (`Swal`), Font Awesome icons, Tailwind CDN. No editor library.

---

## 5. Dependencies

### 5.1 In (this module calls)

| Symbol | Line | Owner | Use |
|---|---|---|---|
| `appData` (`events`, `systemTemplates`, `systemSettings`) | 6057 | core state | data |
| `currentUser`, `currentProfile`, `supabaseClient` | 6055, 6056, 6042 | auth/core | admin check, persistence |
| `saveAppDataToSupabase(note)` | 6782 | core | cloud save + undo snapshot + backup |
| `switchMainTab(tabId)` | 8013 | shell | `openFormNotice`, preview, scrollToAdminTemplates |
| `escapeHtml(str)` | 8202 | shared util | does not escape `'` |
| `formatVNDate(str, dow)` | 8368 | shared util | dates |
| `getGroupName` | **16312 (seating module) shadows 11147** | Module 4 seating | group labels (bug B03) |
| `Swal` | CDN | lib | dialogs |

### 5.2 Out (others call this module)

| Caller | Line | Calls |
|---|---|---|
| DOMContentLoaded boot | 8229 | `initModule3()` (runs before cloud load) |
| `switchMainTab` | 8072, 8078 | `renderModule3()`, `renderAdminTemplatesTable()` |
| undo / redo | 6131, 6171 | `renderModule3()` |
| `updateUserHeaderUI` | 6401-6424 | `isCurrentAdmin()`, toggles `#btnGoToAdminTemplates`/`#btnEditCurrentTemplateAdmin`, `renderAdminTemplatesTable()` |
| Module 2 step card | 10171 | `openFormNotice(st.templateKey, escapeHtml(st.name), evt.id)` |
| Module 2 step modal | 3520, 10542, 10599 | free-text `templateKey` (placeholder suggests nonexistent `form_giaymoi`) |
| Module 2 default workflow | 8404-9072 | step `templateKey` values (§3.2) |
| Reports tab | 2705, 2722, 2739 | `openFormNotice(key, label)` |
| Settings tab | 584 | `scrollToAdminTemplates()` |
| Sidebar | 263, 314 | `switchMainTab('tab-templates' / 'tab-admin-templates')` |
| Top bar config | ~7876, ~7952 | hardcoded "23" copy |

Duplicated elsewhere: the Word-HTML export pattern is reimplemented in Module 6 `exportDailyReportWord` (22325-22370), with different margins and styles. The admin-email heuristic is duplicated at 6387 and 6650-6652.

---

## 6. Bugs and logic flaws

Severity: H high, M medium, L low.

| ID | Sev | Where | What is wrong | Intended |
|---|---|---|---|---|
| B01 | H | 11382-11407, 11365, 11607 | Merge values (`evt.name`, `location`, `leadPerson`, `budget`...) are inserted raw into HTML, then set via `innerHTML` (preview), `document.write` (print), and into Word files. An event named `<img src=x onerror=...>` (any user can create events) runs script for every viewer. | HTML-escape every resolved value. |
| B02 | H | 11365, 11836, 11920, 7695-7699 | Template `content` is stored unsanitized and rendered with `innerHTML` for all users. RLS lets any authenticated user write the whole appData row, so anyone can plant stored XSS in `systemTemplates`. Admin paste from Word or web also brings arbitrary HTML. | Sanitize on save and on render (DOMPurify allow-list of formatting tags and inline styles). Server-side admin-only writes. |
| B03 | H | 11147 vs 16312 | Two top-level `function getGroupName` declarations in one script. The seating one (16312) wins. Module 3 gets "👥 Chung / Tất cả nhóm" for every group. Saved templates store that as `groupName` (11935). Admin-created and edited templates show the wrong group in the list badge, preview badge, admin table, and catalog CSV. | Unique names. Derive the label from `group` at render. Never store it. |
| B04 | H | 11985, 12027, 12071 | `resetSingleTemplateToDefault`, `resetAllTemplatesToDefault`, `deleteAdminTemplate` have no `isCurrentAdmin()` check. | Same guard as save, enforced server-side. |
| B05 | H | 314, 6380-6398 | Sidebar "Quản trị biểu mẫu" is never hidden for non-admins (only `tabBtn-admin`/`tabBtn-users` are toggled). Staff reach Screen B and its unguarded reset/delete. | Hide tab and route-guard for non-admins. |
| B06 | H | 11134-11143 (also 6387, 6650) | `isCurrentAdmin` returns true when not logged in. Any email containing `admin@` (e.g. `notadmin@gmail.com`) is admin. Self-signup exists (6599), so anyone can become template admin. | Role from `sce_tcsk_profiles.role` only, checked server-side. |
| B07 | M | 11709-11716, 584, 1384 | `scrollToAdminTemplates` switches to `tab-admin` (Settings), but `#adminTemplatesSection` lives in `mainTab-admin-templates`, which stays hidden. Both "Quản trị Biểu Mẫu" (Settings) and "⚙️ Quản trị Biểu Mẫu (Admin)" (Screen A) land on the wrong screen. | Navigate to `tab-admin-templates`. |
| B08 | M | 11666-11686 + 8448, 8509, 8594, 8640, 8699, 8766, 8792, 8843, 8931 | 9 default step keys (form_giaymoi, form_baocao_nhom1..5, form_duyet_mou, form_kehoach_truyenthong, form_checkin_letan) have no template or alias. They silently open "Kế hoạch... (UBND Thành phố)". The toast still says "Đã mở biểu mẫu: {step}". | Map each key to the right template or add templates. Show "Chưa có biểu mẫu" when unresolved. Validate `templateKey` in the step modal (select, not free text). |
| B09 | M | 11671-11685 | Wrong aliases: `form_sodo_chongoi` (step "Chuẩn bị thẻ xe VIP gửi kèm giấy mời", 8575) → form_dskhach instead of form_the_xe_vip; `form_bienten` (biển tên) → form_the_xe_vip; `form_duyet_anpham` (ấn phẩm) → media report. | Product to confirm mapping (§7.3). |
| B10 | M | 11124-11129, 12039, 11748 | First admin save freezes a full copy of all 23 built-ins in appData. Later code fixes to STANDARD_TEMPLATES (e.g. commit aff2037 org-name standardization) never reach users. Every unchanged built-in then shows "Đã sửa bởi Admin" because content differs from the new code. "Reset all" re-freezes instead of clearing. | Store only overrides keyed by id plus admin-created templates. Resolve built-in ∪ override at read. Reset = delete override. |
| B11 | M | 11922 + 9 built-ins with `code:""` | Save requires `code`. Admins cannot save edits to the 9 built-ins that have no code (form_dskhach, form_mou_template, form_kichban_mc, ...) without inventing one. | Code optional (or required only for `doc` with a symbol). |
| B12 | M | 11384, 11391-11399 | Fabricated fallbacks print into official documents: budget "350.000.000" (wizard allows empty budget, 10420), location "Tại Hội trường Trung tâm", time 08:30, guests 150. `targetGuests` of 0 becomes 150. | Leave a visible highlighted blank "……" and flag missing fields in the UI. |
| B13 | M | 11387, 8368 | `{{NGAY_HOM_NAY}}` renders "Hà Nội, 04/11/2026". NĐ30 requires "Hà Nội, ngày 04 tháng 11 năm 2026". `{{NGAY_TO_CHUC}}` yields "Ngày Thứ Hai, 09/11/2026". Footer claims "Chuẩn thể thức Nghị định 30/2020". | Separate formatters: NĐ30 long date for the place-date line, explicit weekday tag. |
| B14 | M | 11387, 11433, 11448, 11517, 11532, 11649 | "Today" and filenames use the UTC date (`toISOString().slice(0,10)`). 00:00-06:59 ICT gives yesterday. | Asia/Ho_Chi_Minh date. |
| B15 | M | 11385-11386 vs 6070-6071 | 130%/120% quotas are hardcoded. `systemSettings.guestQuotaPercent/badgeQuotaPercent` (editable in Settings) are ignored. Tag names embed the number. | Read settings. Rename tags to `DINH_MUC_MOI`/`DINH_MUC_THE` and keep old tags as aliases. |
| B16 | M | 11486-11491, 11598-11602 | Export and print CSS apply `border:1px solid #000` to every `td`. Letterhead and signature layout tables (borderless in preview) get boxed borders in Word and print. | Border only data tables (e.g. class or `th` presence). |
| B17 | M | 11268, 11346, 11535-11549 | `hasTable` is true for 20/23 templates because of layout tables. "Tải Excel" shows on prose documents and exports letterhead/signature text as CSV rows. For real grids it also prepends the letterhead. | Export only data tables (tables with `<th>`). Show Excel only for those. |
| B18 | M | 1356, 1362, 1425-1426, 11433, 11643, 931 | Labels say "Tải Word (.docx)" and "Tải Excel". Files are `.doc` HTML (Word shows a format warning) and `.csv`. ExcelJS is loaded but unused here. | Real .docx and .xlsx, or honest labels (product decision §7.3). |
| B19 | M | 11573-11617 | `window.open` result is not null-checked. A popup blocker throws at `printWindow.document`. `close()` after 300 ms can kill a non-blocking print dialog (mobile browsers, unverified). Print left margin 25mm vs Word 30mm; NĐ30 asks 30-35mm left. | Print via hidden iframe or print route with `@media print`. One shared page-setup constant. |
| B20 | M | 11175-11181, 6755-6771 | `renderModule3` (tab switch, undo/redo) never re-renders the preview. Cloud load (`loadAppDataFromSupabase`) calls only `renderModule2`. The event selector can switch to another event while the canvas still shows content merged with the old event, the stale template version, or a deleted template. | Derive preview from state (selected template, selected event) on every render. |
| B21 | M | 11901-11904, 12163 | Closing the editor (× or "Đóng") discards edits silently although status shows "Có thay đổi chưa lưu". No Esc handling, no backdrop behavior. | Confirm on dirty close. |
| B22 | M | 12110-12160 | Toolbar and merge-tag insert use `document.execCommand` with no check that the selection is inside `#adminEditorCanvas`. Inserts can be dropped or land elsewhere when focus is on the toolbar button or a metadata input (behavior varies by browser, not verified at runtime). | Real editor (TipTap/Lexical) with commands bound to the editor instance. |
| B23 | M | 11953-11965, 11968-11982 | Save shows "đồng bộ đến toàn bộ chuyên viên" even when not logged in (local only) or when the cloud save fails. `saveAppDataToSupabase` swallows errors (6829-6849). Whole-blob upsert is last-write-wins, so concurrent edits by other modules or users are lost. | Await a typed result and report failure. Per-template rows or optimistic concurrency (`updated_at` check). |
| B24 | L | 12044-12046, 12093-12095, 12014-12016 | Audit log only on save. Reset one, reset all, and delete are not audited. | Audit every mutation. |
| B25 | L | 12029-12030, 12051, 1378 | "32 biểu mẫu" in reset-all dialogs and catalog tooltip. Actual count is 23. Reset all silently deletes admin-created templates without saying so. | Live counts. Warn "N biểu mẫu do Admin tạo sẽ bị xóa". |
| B26 | L | 867-901, 945, 314, ~7876, ~7952, 11649 | Hardcoded counts (23 / 04 / 02 / 17, "(23 mẫu)", filename "_23_") drift after create/delete. | Compute from data. |
| B27 | L | 12055-12068 | Editor "Khôi phục mẫu gốc" does not restore `group`/`type`. | Restore all fields. |
| B28 | L | 11431 | `tmpl.code.replace` throws if `code` is missing (data from the cloud without `code`). Empty code produces filename `SCE__date.doc`, while quick download uses `BM`. | One filename builder with slug fallback. Six built-ins share codes, so same-day files collide. Include id or title slug. |
| B29 | L | 11466, 11454, 11657-11704 | `<title>${title}</title>` unescaped in Word file. Swal `title` (HTML-rendered in SweetAlert2) receives `tmpl.title` and `stepName`. `stepName` arrives HTML-decoded from the onclick attribute (10171), so it is an injection path. | Escape, or use text-only toasts. |
| B30 | L | 10171 (Module 2 caller) | `onclick="openFormNotice('${st.templateKey}', '${escapeHtml(st.name)}', ...)"`: `escapeHtml` does not escape `'`, and `templateKey` is raw. A step name with an apostrophe breaks the handler. | React handlers, no string-built JS. |
| B31 | L | 11271, 11303, 11309, 11794-11808 | `onclick="selectTemplate('${tmpl.id}')"` and similar inline handlers interpolate ids raw (ids are user-controllable via the shared blob). | Same as B30. |
| B32 | L | 11619-11635 | Copy failure only `console.warn`. No user feedback. Copies plain text only. | Error toast. Optionally copy `text/html` too. |
| B33 | L | 11498-11509, 11555-11561, 11644-11651 | `URL.createObjectURL` never revoked. Download code is triplicated (and again in Module 6 22355). | One `downloadBlob` helper that revokes. |
| B34 | L | 11161-11163, 11718-11721, 11169, 11177, 6422 | Dead state (`adminFilterGroup`, `adminSearchKeyword`, `editingTemplateId` write-only). One-caller wrapper `goToAdminTemplates`. Always-true `typeof renderAdminTemplatesTable === 'function'` guards. `selectTemplate` re-renders the list each call, so init renders it twice. Names `smartEditorCanvas`/`editorSaveStatus` are left over from a removed editable editor. | Delete. |
| B35 | L | 11112 (#6 form_baocao_stc_quyettoan) | "Kinh phí được phê duyệt" and "Kinh phí thực tế giải ngân quyết toán" both use `{{KINH_PHI_DU_TOAN}}`, so the settlement report always shows actual = approved. | Separate tag (e.g. `{{KINH_PHI_THUC_TE}}`) sourced from real spend, or a blank to fill. |
| B36 | L | 11112 (#7 form_qd_sce_btc) | Metadata code "QĐ-TTXT" but body symbol "Số: /QĐ-SCE". #20 description says "12 hạng mục" while the table has 5 rows. | Fix data. |
| B37 | L | 11112 vs 6066-6067, commit aff2037 | Letterheads hardcode "SỞ TÀI CHÍNH THÀNH PHỐ HÀ NỘI / TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP" (no "HÀ NỘI"). They differ from the standardized settings `agencyName`/`parentAgency`, which aff2037 did not apply to templates. | Letterhead tags `{{CO_QUAN_CHU_QUAN}}`, `{{TEN_CO_QUAN}}` from settings. |
| B38 | L | 1465-1467 | Initial badge text "TT-SCE/DSKM" and "Nhóm 1: Khách mời & Lễ tân" match no template. Static "Mẫu Chuẩn SCE" badge shows even for modified or admin-created templates. `selectTemplate` swaps badge classes (`text-xs` vs initial `text-[11px]`), so the layout jumps. | Render from data. Show status consistent with Screen B. |
| B39 | L | 11270-11320, 1414-1417, 11790-11810, 5756-5770 | a11y: template cards are clickable `div`s (no keyboard/role). Icon-only buttons have only `title`, no `aria-label`. Pills lack `aria-pressed`. Modal lacks `role=dialog`/`aria-modal`/focus trap/Esc. Merge-tag dropdown never closes on outside click or Esc. | Accessible primitives (§7.2). |
| B40 | L | 5682-5776 | Modal is `max-h-[96vh] flex-col` with no outer overflow, and the canvas area has `min-h-[420px]`. On short viewports the footer (Save) can be pushed off-screen (inferred from CSS, not run). | Scrollable body, sticky footer. |
| B41 | L | 11950, 12011, 12041, 12090 | `localStorage.setItem` of the whole appData is not wrapped. A QuotaExceededError aborts the action after state was already mutated (inferred). | Persistence layer with error handling. |

Count: 41 (6 H, 17 M, 18 L).

---

## 7. Rewrite notes

### 7.1 Feature breakdown (suggested Next.js units)

1. `templates/registry.ts`: built-in catalog (extracted JSON, data fixes B35-B37), `TemplateGroup` labels, type labels.
2. `templates/merge.ts`: tag registry `{tag, label, resolve(ctx: {event, settings, now}), escape}`. NĐ30 date formatters. Missing-value rendering. Pure and unit-testable.
3. `templates/store`: overrides + custom templates. Read = built-in ∪ override. Admin-only mutations (server action/RLS). Audit every mutation. Optional version history (§7.3).
4. `templates/export`: shared `downloadBlob`; Word export (shared with Module 6 report export); data-table → xlsx via ExcelJS (shared with guest export, commit 90877b7); print route `/templates/[id]/print?event=` with `@media print` A4 NĐ30 margins; copy.
5. Screen A `/templates`: event picker, group pills + search (URL params), list, preview pane, export toolbar.
6. Screen B `/admin/templates`: live stats, table, status chips, actions, editor modal or route.
7. `openTemplateForStep(templateKey, eventId)`: typed key → template resolution with an explicit alias table, used by Module 2 and Reports. Step modal uses a template `<Select>`.

Sanitize (DOMPurify) on save and render. Render preview in a sandboxed container, or use parsed React output.

### 7.2 Shared UI primitives seen

- StatTile (icon + label + value).
- FilterPills (single-select segmented).
- SearchInput with leading icon.
- Badge/Chip (code mono, type, status).
- ListCard (selectable).
- DataTable with empty-state row and icon actions.
- IconButton with tooltip + aria-label.
- Modal (header icon + title + sub, scroll body, footer actions, dirty-close confirm).
- RichTextEditor + toolbar + MergeTagMenu.
- A4PaperPreview.
- StatusBar.
- ConfirmDialog (danger) and Toast (replace Swal).
- EventSelect (shared with other modules' event pickers).

Colors: purple = templates domain, blue = Word, emerald = Excel, slate = print.

### 7.3 Open product questions

1. Must "Tải Word" produce a true `.docx` (e.g. `docx`/html-to-docx), or is Word-HTML `.doc` acceptable? Same for Excel: `.xlsx` via ExcelJS or CSV?
2. Should grid templates (form_dskhach, form_ds_baochi, checklist) fill rows from live data (Module 4 guests, press list), or stay static samples?
3. Correct target templates for the 9 unmapped step keys and the 3 questionable aliases (B08, B09). Are new templates (Giấy mời DN, báo cáo nhóm 1-5, phương án truyền thông, MOU review) wanted?
4. Template versioning or history beyond "reset to original"? Who approves admin edits?
5. Should staff edit the merged document in-browser before export? Today the preview is read-only by design.
6. Letterhead and signer: from `systemSettings` (agencyName, parentAgency) and per-template issuing level? Signer names?
7. Missing event fields: show blanks, block export, or keep the current defaults?
8. Should admins upload an existing `.docx` as a template (import)? Not present today.
9. Should "Reset all" keep or delete admin-created templates?

Undetermined at runtime (read-only task, nothing was executed): exact `execCommand` focus behavior (B22), mobile print-close race (B19), modal overflow (B40).
