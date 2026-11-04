# Status: feature `templates` (M3, Biểu mẫu và Quản trị biểu mẫu)

Branch `t3/dba7053d`. The feature lives in `src/features/templates/`. Routes are `/templates`, `/templates/print` (under `(print)`) and `/admin/templates`.

## What is built

- **Built-in catalog** (`domain/builtins/`, `domain/builtin-templates.ts`). The 23 templates are typed data in code, generated from `legacy/index.html` plus one explicit list of fixes (`__tests__/legacy-templates.ts`, `LEGACY_FIXES`). `builtin-templates.test.ts` proves the shipped text equals legacy plus exactly those fixes, and that every difference from raw legacy is listed. The fixes also drop four emoji bullets from the invitation form (`check-ui` forbids emoji in source; they do not belong in an official document). To change built-in text: edit `LEGACY_FIXES`, then run `pnpm tsx src/features/templates/__tests__/generate-builtin-templates.ts`.
- **Storage**. `sce_tcsk_templates` holds only admin overrides (`base_builtin_key` set) and custom templates. Built-ins are never copied into it, so a fix to built-in text reaches everyone. Reset deletes the override row.
- **Merge tags** (`domain/merge-tags.ts`). One registry of 18 tags with label, source and format. Every value is HTML-escaped. A missing value renders as a dotted blank (`<span class="tpl-blank">……</span>`, highlighted on screen only). Quotas come from settings, agency names from `orgIdentity(settings)`, the place and date line is the NĐ 30 long date. `renderTemplate` sanitizes its output again.
- **Commands** (`server/commands.ts`). Seven, all admin only (`templates.admin`), all audited, all with an undo inverse: `saveOverride`, `resetOne`, `resetAll`, `restoreOverrides` (the undo of reset all), `createCustom`, `updateCustom`, `deleteCustom`. Content is sanitized on save. Save and update take the version the form loaded, so a stale save is a conflict. Saving content identical to the built-in removes the override instead of storing a "modified" copy.
- **Screens**. `/templates` is the library and studio (event picker, search, level tabs, list, filled preview, Word, Excel, print, copy). `/admin/templates` has the live stat cards, filters, the status table with reset and delete, and the editor dialog. Print is `/templates/print?t=…&event=…` through `PrintPage` A4 with NĐ 30 margins.
- **Importer** (`server/legacy-importer.ts`). Blob key `systemTemplates`: edited built-ins become overrides, unknown ids become custom templates, anything equal to the legacy original or to today's built-in is skipped.
- **Dev seed** (`server/dev-seed.ts`). One edited built-in and one custom template, plainly fake.
- **Tests** (226, `__tests__/`). Catalog vs legacy, merge tags (escaping, blanks, settings, aliases, one-pass substitution), key mapping over every key of the standard process, catalog resolution, exports and file names, a 19-case sanitizer table on both the list and the render path, every command (success, audit text, undo, stale version, invalid input), denial of all seven commands for six non-admin actors through RLS and with RLS bypassed (`runWithoutRls`, plus a positive control per command), the importer on a fixture, and component tests for both screens.

Mutation check done for the permission tests: changing the `authorize` of any one command to `templates.read` fails 5 to 6 tests.

## How progress calls templates (closes BUG-40)

```ts
import { resolveTemplateKey, templateHref } from '@/features/templates';
const id = resolveTemplateKey(step.templateKey);          // TemplateId | null, pure, never throws
const href = id ? templateHref(id, event.id) : null;      // '/templates?t=<id>&event=<eventId>'
```

- `null` means no form fits the step: show "Chưa gắn biểu mẫu", do not open another form. `progress/components/event-card.tsx` already does this. Its `try/catch` around the two calls can go, because they no longer throw.
- `resolveTemplateKey` maps a built-in id to itself, a legacy or step key through `STEP_TEMPLATE_KEYS` (`domain/key-mapping.ts`, the one typed table), and a uuid (a custom template) to itself. Anything else, including `constructor` and `__proto__`, is `null`.
- The step dialog's free-text "Mã biểu mẫu" should become a `Select` over `templateKeyOptions()` (23 built-ins, `{ value, label }`). That is a progress change.
- `key-mapping.test.ts` reads every `templateKey` out of `progress/domain/standard-templates.ts` (both event types) and asserts each resolves to a built-in or is in the declared no-form list. Of the 9 keys legacy left unmapped, 8 now resolve (`form_giaymoi` to Giấy mời đại biểu, `form_baocao_nhom1..5` to Báo cáo tiến độ hàng ngày, `form_duyet_mou` to Công văn rà soát MOU, `form_checkin_letan` to the on-site checklist). `form_kehoach_truyenthong` has no fitting form. The three legacy mismatches (`form_bienten`, `form_sodo_chongoi`, `form_duyet_anpham`) are now "no form" rather than a wrong one. Those four are for product to confirm (Q3).

## Bugs (m3 §6)

38 fixed, 2 not applicable, 1 deferred.

| Bug | Result |
|---|---|
| B01 | Fixed. Every merge value is escaped, in preview, print, Word and the title. Tests for `<img onerror>`, quotes in attributes, `<script>`, and a value that looks like a tag. Verified in a browser with an event named `<img src=x onerror=…>`. |
| B02 | Fixed. `sanitizeRichHtml` on save (command), on listing, on render, on paste in the editor, and in the importer. `<RichHtml>` is the only raw-HTML path. A 19-case attack table passes on the list and render paths. |
| B03 | Fixed. The group label is derived from `level` (`TEMPLATE_LEVELS`) and never stored. |
| B04 | Fixed. Reset, reset all and delete are commands that need `templates.admin`, checked in the command and by RLS. |
| B05 | Fixed. The admin nav entry has `templates.admin`, so the sidebar hides it. The proxy redirects a non-admin to `/events?denied=1`, and the page checks `can()` again. Verified as `user` and `dept_leader`. |
| B06 | Fixed. Role comes from the profile through the matrix. No email heuristic, no "demo mode". |
| B07 | Fixed for this module. The nav entry `admin-templates` carries the legacy tab id, and the library's "Quản trị biểu mẫu" button goes to `/admin/templates`. The Settings screen belongs to core. |
| B08 | Fixed. One typed key table, with a test over every standard step key. An unresolved key shows "Chưa gắn biểu mẫu" (progress). |
| B09 | Fixed. The three wrong mappings are now "no form". Product confirms (Q3). |
| B10 | Fixed. Only overrides and custom templates are stored. A built-in fix reaches everyone, and "reset" deletes the row. |
| B11 | Fixed. `code` is optional. The editor does not prefill a made-up `BM-SCE/2026`. |
| B12 | Fixed. Missing values are dotted blanks, with a warning that names the missing fields. No 350.000.000, 08:30 fallback, 150 or "Tại Hội trường Trung tâm". A budget of 0 stays 0. |
| B13 | Fixed. `{{NGAY_HOM_NAY}}` prints "ngày 04 tháng 11 năm 2026". `{{NGAY_TO_CHUC}}` prints `dd/mm/yyyy`. New `{{THU_TO_CHUC}}` gives the weekday. Three built-in sentences lost a duplicated "ngày". |
| B14 | Fixed. Today and file names use the VN date (`todayVN`, `fileDateStamp`). |
| B15 | Fixed. `{{DINH_MUC_MOI}}`, `{{DINH_MUC_THE}}`, `{{TY_LE_MOI}}`, `{{TY_LE_THE}}` read settings. The old `_130` and `_120` names are aliases. Built-in text no longer hard-codes 130% or 120%. |
| B16 | Fixed. Nothing adds a border to every `td`. The data tables carry their own `border`, the letterhead and signature tables have none. |
| B17 | Fixed. Excel shows, and exports, only for documents with a table that has header cells (6 of 23), and only those tables. |
| B18 | Fixed. Labels say "Tải Word (.doc)" (Word-HTML, decision 14) and "Tải Excel (.xlsx)", a real workbook through the kit. |
| B19 | Fixed. Print is the `(print)/templates/print` route with `PrintPage` (A4, NĐ 30 margins, same left margin as the Word export). No popup, no timer. Physical printing not tested. |
| B20 | Fixed. The preview is derived from the selected template and event on every render. Tested by switching the event and the template. |
| B21 | Fixed. Every close path of the editor (Esc, ×, backdrop, "Đóng") asks "Đóng mà không lưu?" when the form is dirty. The footer button needed its own guard, which a browser run showed missing. |
| B22 | Fixed, with a caveat. The toolbar remembers the selection made inside the page and restores it before each command, and paste is sanitized. It is still built on the browser's `execCommand` because the package set is frozen and the kit has no editor (change request A). |
| B23 | Fixed. Commands return typed results, `useCommand` toasts failures, and the success text appears only after the server accepted the write. Saves carry the loaded version. |
| B24 | Fixed. All seven commands audit, with the legacy summary text for save. |
| B25 | Fixed. Counts are live. Reset all says how many overrides it restores and how many admin-created templates it keeps. |
| B26 | Fixed. Stat cards, the "(N mẫu)" option and the catalog file name are computed. The static top-bar badge "23 Biểu Mẫu Chuẩn" is gone. |
| B27 | Fixed. The editor's "Khôi phục mẫu gốc SCE" restores every field, level and kind included. It is shown only for built-ins, so the legacy "no original" message has no place. |
| B28 | Fixed. One `templateFileName`: symbol plus a slug of the title, ASCII, with a fallback. Unique across the catalog, tested. |
| B29 | Fixed. The Word title is escaped by the kit. Toasts and dialogs are plain text. |
| B30 | Not applicable here. The inline `onclick` was in the Module 2 caller. Progress uses links. |
| B31 | Fixed. React buttons and links, no string-built handlers. |
| B32 | Fixed. A failed copy shows an error toast. Plain text only, no `text/html`. |
| B33 | Fixed. All downloads go through the kit's `downloadBlob`. |
| B34 | Fixed. The dead state, the wrapper and the guards are gone. |
| B35 | Fixed. The settlement report has a separate `{{KINH_PHI_THUC_TE}}`, left blank for the person to fill (no source in the system). |
| B36 | Fixed. The decision body reads `/QĐ-TTXT`. The checklist description says 5 hạng mục. |
| B37 | Deferred in part. The letterheads, the "GIÁM ĐỐC …" headings and the banner lines (18 replacements in 11 templates) use `{{CO_QUAN_CHU_QUAN}}`, `{{TEN_CO_QUAN}}` and `{{TEN_VIET_TAT}}` from settings. 27 mentions inside running prose ("Trung tâm Xúc tiến Đầu tư và Hỗ trợ Doanh nghiệp Hà Nội phối hợp…") stay literal text, because a tag in a sentence needs a grammatical form the settings do not hold. An admin can edit them. |
| B38 | Fixed. Badges render from the data (code, level, kind, status), the same status as the admin table. |
| B39 | Fixed. The list items are buttons (`aria-pressed`), icon-only controls are `IconButton` or `RowMenu` with labels, the editor is a kit `Dialog` (role, focus trap, Esc), and the tag picker is a kit `Combobox`. Keyboard use was tested in component tests, not by hand across a whole session. |
| B40 | Fixed. The kit `Dialog` scrolls its body and keeps the footer. Checked at 360 px. |
| B41 | Not applicable. No localStorage. |

## Product questions (m3 §7.3)

| Question | Resolution |
|---|---|
| Q1 `.docx` or `.doc` | Decision 14: Word-HTML `.doc`, labelled so. Excel is a real `.xlsx`. |
| Q2 grids from live data | Default: stay static samples. They carry made-up sample rows, as in legacy. Filling them from guests is a later change. |
| Q3 step keys and new templates | My default: map where a form clearly fits, declare "no form" otherwise, add no templates (nobody drafts official text here). Four keys are "no form" and need a product answer: `form_bienten`, `form_sodo_chongoi`, `form_duyet_anpham`, `form_kehoach_truyenthong`. |
| Q4 versioning and approval | Default: no history beyond reset one and undo, no approval. Admin edits apply at once. |
| Q5 staff edit in the browser | Default: no. The preview is read-only. Staff edit in Word after download. |
| Q6 letterhead and signer | Letterhead from settings. Signer names stay in the template text. |
| Q7 missing event fields | Default: show blanks with a warning, and still allow the download. |
| Q8 upload `.docx` as a template | Not built. |
| Q9 reset all and custom templates | Default: keep admin-created templates, and say how many. Reset all is undoable. |

Decisions used: 14 (Word export), 18 (agency names through `orgIdentity`), 13 (dev seed only), 5 (matrix). The spec says nine built-ins lack a code. The data has eight.

## Foundation feedback

1. **No rich-text primitive in the kit, and no editor package.** The admin editor is hand-built in `components/rich-editor.tsx` on `execCommand` (deprecated, but supported). The kit also lacks bold, italic, underline and alignment icons, so the toolbar uses text buttons. A kit `RichEditor` (for example TipTap behind the kit) would replace this file. Change request A.
2. **Kit `Tabs` is wider than its box on a phone.** The screen-reader count spans are absolutely positioned inside an `overflow-x-auto` list that is not `position: relative`, so they sit outside the clip and widen the page (757 px at 360 px). This module wraps the tabs in `relative overflow-x-clip`. Progress's `Tabs` has the same risk.
3. **The hex and arbitrary-value lint guards hit document content.** The built-in templates carry inline Word styles with colours. The generated data files disable `no-restricted-syntax` for that reason, only where a colour occurs. A `// data` marker or a path exception in `eslint.config.mjs` would be cleaner.
4. **`contract.ts` declares no commands and its functions throw.** This module declares seven commands in `server/commands.ts` and exports the real functions from `index.ts` and `server/index.ts`. The stubs in `contract.ts` stay as types only.
5. **Spec miscount.** m3 §2.1 says nine templates have no code. There are eight.
6. **`DevSeedHelpers` offers `id(entity, key)` only.** Custom-template ids use it. Override rows use a uuid v5 of the built-in id (`server/ids.ts`) so the command and the importer agree.
7. **Headless Chrome was the browser.** The T3 preview tab did not render (snapshots timed out), so verification used Chrome through a small CDP script. Headless Chrome with mobile emulation widened the layout viewport when the page overflowed. It was run as a plain 360 px window instead.

## Contract change requests

- **A.** Add a `RichEditor` primitive (and the text-format icons) to the kit.
- **B.** Fix `Tabs` so its screen-reader counts stay inside the scroller (`relative` on the list, or no absolute `sr-only` inside it).
- **C.** Progress: replace the free-text "Mã biểu mẫu" with a `Select` over `templateKeyOptions()`, and drop the `try/catch` around `resolveTemplateKey` and `templateHref`.

## Not verified

- A real Supabase project: RLS for `sce_tcsk_templates` is the policy from `0002`, tested through `memoryDb` and `pnpm verify:sql`, not against a live database.
- Physical printing and "Save as PDF". The print route was rendered at 1440 px and its `@page` rule checked (A4 portrait, margin 20 / 15 / 20 / 30 mm).
- Opening the `.doc` in Word, and the `.xlsx` in Excel. The `.doc` content was read back (escaped title and fields, no markup injection). The `.xlsx` was only seen to download with the expected file name.
- The editor in Safari and Firefox. It was exercised in Chrome only.
- An import of a real production blob. Frozen copies from an older legacy version differ from today's original, so they import as overrides, and the report says so ("Khôi phục mẫu gốc" clears them).
- An independent review. The brief forbade starting sub-agents, so none ran.

## Screenshots

`/private/tmp/claude-501/-Users-ngotuananh-ProjectCode-SEC-tochucsukien/f9cf2612-e9a6-4262-826e-d594e5255aff/scratchpad/templates/`
