# Status: feature `reports` (M6, Báo cáo & Tổng kết)

Branch `t3/b312cd83`. The feature lives in `src/features/reports/`. The routes are `/events/[eventId]/reports` (Báo cáo hàng ngày), `/reports/official`, `/reports/media`, `/reports/bidding` and `/reports/dashboard`, plus the print page `/events/[eventId]/reports/print`, with `?report=<id>` for an issued report, under `(print)`.

## What is built

- **Domain** (`domain/`).
  - `figures.ts` holds `reportFigures` (the contract's selector), `dashboardFigures` (the same figures plus the counts the screens spell out), `biddingTotals`, the signed `savingsPercent`, the one `formatPercent2`, the T-10 `dailyReportState`, `milestoneLabel`, `workdaysToEvent` and the snapshot `encodeFigures`/`decodeFigures`.
  - Progress, the invite quota and the booth counts come from `eventProgress`/`isInDailyReportWindow` (progress), `guestKpis`/`quotaProgress` (guests, decision 2) and `boothKpis` (venue). So a report never disagrees with the screen that owns the number.
  - `report.ts` is the NĐ30 document model (`dailyReportDocument`), built only from an issued snapshot or from today's figures for a preview. It also holds the signer title (decision 17) and the snapshot milestone.
  - `word.ts` renders that model as Word HTML: tables with inline styles, escaped by the `html` tag, and a folded file name. `schemas.ts` holds the zod rules the forms and the commands share, the closed lists with their registries, and `nextPackageCode`. `screen.ts` holds the screen data type.
- **Data**. `202611041300_reports_issue_snapshot.sql`:
  - It freezes the event name and date and the signer title on an issued report.
  - A trigger stamps `issued_by`, `issued_at` and `report_date` (VN day) from the server for any user session, so a report cannot be backdated or signed as someone else. The service-role import keeps its legacy values.
  - It adds check constraints for the media types and contract statuses, and non-blank code, name, outlet and title.
  - It adds a case-insensitive unique index on (event, package code).
  - RLS is the 0002 registration from the generated matrix: `reports.read` reads, `reports.write` edits, `reports.issue` issues, and `sce_tcsk_daily_reports` has no update or delete policy.
- **Server** (`server/`).
  - The tables and reads come first. `upstream.ts` reads the plan, roster and booths, and turns `not implemented` into a named "chưa sẵn sàng" state. `screen-data.ts` builds one shape for every sub-tab and the print page's report. Then come `legacy-importer.ts` and `dev-seed.ts`.
  - There are 10 commands: create, update and delete for clippings, packages and press releases, plus `reports.issueDailyReport`. Every edit is audited and returns its undo.
  - `issueDailyReport` needs `reports.issue`. It computes the figures on the server at issue time and freezes them in the row, and it takes only the narrative, the signer's name and the document number from the client.
  - It is idempotent per (event, VN date). A repeat, a retry with the same id, or a second desk racing the first all return the first report unchanged, and the audit row says so. It has no undo, because the report is immutable.
- **Screens** (`components/`).
  - Four headline KPI cards sit on every sub-tab. When an upstream is missing they become a "chưa sẵn sàng" alert.
  - **Daily.** The T-state alert, the issue form behind a confirm ("không sửa được sau đó"), the issued-today summary, and the history. Each history row prints or exports its own snapshot.
  - **Official.** The three templates open in the templates feature for this event.
  - **Media.** Clippings and press releases, with dialogs, delete after a confirm, and undo.
  - **Bidding.** Packages labelled "Nhập tay", a signed saving per row and in total, and .xlsx export.
  - **Dashboard.** Five computed KPI cards and one bar per task group.
  - **Print.** An A4 NĐ30 page through the kit's `PrintPage`, `Nd30Header` and `SignatureBlock`. The type face and size live in the print component only (see change request 2). Word export is `.doc` per decision 14, labelled "Tải Word (.doc)".
- **Tests** (`__tests__/`, 147 in 11 files).
  - **Worked examples by hand.** Progress 2/7 = 29% with two late steps, the 130% quota boundaries (194 vs 195 of 150, 9 vs 10 of 7, 100% and 200%), the legacy seed's 465.000.000 / 449.500.000 = 3,33%, overruns (-12,50%, -4,19%), rounding (66,67 not 66,66), zero budgets and unawarded packages (no rate, not 100%).
  - **T-10 on the holiday calendar.** 30/04 and 01/05 make Tue 28/04 to Tue 05/05 T-3, against T-5 with weekends alone. Quốc khánh, a weekend today, a compensatory Saturday, an event on a Sunday, the T-10/T-11 boundary, event day, past, the threshold from settings, and the VN midnight.
  - **Commands through the real pipeline**, with real progress, guests and venue behind the figures.
  - **Issue.** Frozen figures equal to the hand-computed ones, the audit text, idempotency, retry, a race where another desk issues mid-command, the snapshot unchanged after the plan, roster, packages and event name change, forged figures, date and issuer ignored, and immutability.
  - **Permissions.** Every verb is denied to another department twice: through RLS and with RLS bypassed. A chuyên viên is refused issue the same two ways. Each command's declared permission is pinned.
  - **Not-ready upstream** (mocked guests read). The PGlite SQL test (`sql.test.ts`) covers RLS on issue, the server stamp, one report per day, immutability, the case-insensitive code index and the check constraints.
  - **Rendering.** XSS payloads on every tab, the print page and the Word body, the issue flow with its confirm, permission hiding, the importer fixture, and the dev-memory end-to-end scenario below.
- **Dev-memory end to end** (`dev-e2e.test.ts`, `SCE_DEV_MEMORY=1`, clock fixed to Tue 08/12/2026). It runs every feature's real dev seed. The dashboard then shows exactly the hand-computed numbers:
  - T0 Fri 18/12 = T-8.
  - 2/32 steps = 6%.
  - 9 invitations of a 156 quota, 5 attending.
  - Booths 1/3.
  - 240 tr dự toán, 2.000.000 / 200.000.000 = 1,00%.
  - 2 clippings.

  Then the dept_leader issues, the leader's second issue the same day returns the first report, a completed step and a new guest change the live figures but not the snapshot, and both issue attempts are in the audit.
- **Browser** (`SCE_DEV_MEMORY=1 pnpm dev`, T3 preview, as `dept_leader:XTDT`). All five tabs and the print page answer 200.
  - At 360 px the page `scrollWidth` is 352 on daily, media and bidding. Only the shell's own sub-tab bar scrolls, inside itself.
  - A package added through the dialog turned the total into "vượt dự toán 8.000.000 đ (2,29%)", which is correct by hand.
  - A report issued through the form showed in the KPI card and in the history.
  - Its print page showed "Hà Nội, ngày 04 tháng 11 năm 2026", "TRƯỞNG PHÒNG XÚC TIẾN ĐẦU TƯ", the computed sentences and Times New Roman.
  - The dashboard was checked in dark mode at 360 px and at 1440 px.
- **Mutation pass** (`node src/features/reports/__tests__/mutation-pass.mjs .`): 22 mutations, 22 killed.
  - The KPI mutations were the savings sign, rounding, zero budget, unawarded packages counted, the legacy clamp at 0, the quota base, attending, overdue, the event-day check, the window rule, the milestone unit and the snapshot boolean.
  - The permission mutations were issue opened to `reports.write`, edits opened to `reports.read`, the UI's issue flag, and the matrix grant of `reports.issue` to `user`.
  - The issue mutations were idempotency, race recovery, a UTC report date, the issuer, case-sensitive codes and the quota wording.
  - One survived the first run: edits opened to `reports.read`. It is equivalent under today's matrix, because read and write grant the same roles. It is now killed by the test that pins each command's declared permission, which is the permission the pipeline checks and SQL re-checks on the audit row.

## Bugs (m6 §6)

41 fixed, 6 not applicable, 1 deferred.

| Bug | Result |
|---|---|
| BUG-01 | Fixed. Nothing seeds a real event. The importer skips `media_0x`, `bid_0x` and `rpt_*` and reports them. The dev seed adds fake clippings and packages to the dev event only, and never an issued report. |
| BUG-02 | Fixed. The target is `event.targetGuests`, through guests' `quotaProgress`. |
| BUG-03 | Fixed. `dailyReportState` derives not yet, active, event day or past from the event date and the holiday calendar, with the threshold from settings. The window is progress's `isInDailyReportWindow`. |
| BUG-04 | Fixed. The badge and the alert come from the state. |
| BUG-05 | Fixed. "Quá hạn" is progress's `stepState`, never a stored flag. |
| BUG-06 | Fixed. The card reads "Xong • Quá hạn • Chưa xong", with Chưa xong = total − done. |
| BUG-07 | Fixed. Every number in the report is computed. The narrative, kiến nghị, signer and number are typed by the person issuing. No plan number, JETRO, 86%, 465.000.000 or signer name is printed. A test checks this. |
| BUG-08 | Fixed. The quota sentence is worded by outcome ("đã đủ định mức" or "còn thiếu N thư mời"). |
| BUG-09 | Not applicable. The event is the URL, and the event layout 404s an absent event. |
| BUG-10 | Not applicable. The same: there is no stored selection to go stale. |
| BUG-11 | Fixed. There is no static time or channel text. The KPI card shows the real issue time. |
| BUG-12 | Fixed. `reports.issueDailyReport` saves an immutable snapshot, and the history lists the issued reports. |
| BUG-13 | Fixed. "Xem bản in A4" and "Tải Word" render the row's own snapshot: date, milestone, figures, text, event name and signer. |
| BUG-14 | Fixed. The packages feed section III. The quota is used. |
| BUG-15 | Fixed. The Word file is built from the document model, never from the DOM. |
| BUG-16 | Fixed within decision 14. The file stays an honest Word-HTML `.doc`. The NĐ30 header and signature are tables with inline styles. The file name folds tone marks (`Hoi_nghi`). |
| BUG-17 | Fixed. No LaTeX: the heading is plain text. |
| BUG-18 | Fixed on the reports side. Each card opens its own template (`form_kh_ubnd`, `form_baocao_ubnd_ketqua`, `form_baocao_stc_quyettoan`) through `templateHref`/`templatePrintHref`. Filling those templates with event data is the templates feature's. |
| BUG-19 | Fixed. The document number is typed (otherwise dots). The date uses `formatNd30Date`. The tiêu ngữ is upright bold with the kit's rule. The signer is the event department head (decision 17). |
| BUG-20 | Fixed. The template links carry the event id. |
| BUG-21 | Deferred to progress. The daily-report bell should link to `/events/<id>/reports` (integration item 1). |
| BUG-22 | Fixed. Booths are confirmed over the real count, with "Sự kiện chưa có gian hàng" for none. The seat line and the "điểm nghẽn" tile are gone: kiến nghị is typed per report. |
| BUG-23 | Fixed. Press releases are saved per event, with edit, delete and undo. The dialog says the system does not send them. Export is not built. |
| BUG-24 | Fixed. A new release starts from the event's time, date, place and target. The contact starts empty. |
| BUG-25 | Fixed. A link must parse as http(s) in the form, the command, the row parse, the importer and a DB check. It opens with `rel="noopener noreferrer"`. Tests check this. |
| BUG-26 | Fixed. React text everywhere, with no inline handlers. Payload tests cover every tab, the print page and the Word body. |
| BUG-27 | Fixed. Deletes ask through `useDialogs().confirm({ tone: 'danger' })`, toast, and can be undone. |
| BUG-28 | Fixed. Clippings and packages have edit. The author is a field. A clipping without a link reads "Không có liên kết", whatever its type. |
| BUG-29 | Fixed. Clippings are newest first; packages are by code. |
| BUG-30 | Fixed. There is one registry per list. The legacy "Báo in & Điện tử" and "Đang nghiệm thu thanh lý" are valid values, and the importer maps unknown ones and reports them. |
| BUG-31 | Fixed. The default date is the server's VN day. |
| BUG-32 | Fixed (decision 15). Packages are labelled "Nhập tay: chưa liên thông với hệ thống Quản lý Đấu thầu" on the tab, the dialog, the KPI card, the export and the report. |
| BUG-33 | Fixed. The default code is `TB-{yyyy}-{pad3(max+1)}`. Codes are unique per event, case- and tone-insensitively, in the command and the DB. The importer suffixes duplicates. |
| BUG-34 | Fixed. Money is a whole-đồng `MoneyInput`. The dự toán must be above 0 and the winning price at least 0. A winning price above the dự toán is accepted and reported as an overrun. |
| BUG-35 | Fixed. The saving is signed, with one two-decimal formatter everywhere. An overrun shows as "Vượt x%". |
| BUG-36 | Fixed. A blank contractor is stored as none and shown as "Chưa chọn". |
| BUG-37 | Fixed. One wording and unit for the totals. |
| BUG-38 | Fixed. The dashboard numbers are computed. One bar per real group, whatever their number. |
| BUG-39 | Fixed. The dashboard has an empty state for an event without groups. |
| BUG-40 | Fixed. One quota, from the guests selector, on every card and in the report. |
| BUG-41 | Not applicable. There is no browser storage, and every write is an audited command with undo. |
| BUG-42 | Not applicable. There is no blob: pages read per request and refresh after each command. |
| BUG-43 | Not applicable. The dead state was not ported. |
| BUG-44 | Fixed. A `(print)` route with `@page` A4 and NĐ30 margins prints only the sheet. |
| BUG-45 | Fixed by the kit: `Dialog`, labelled `RowMenu` triggers and `LinkTabs` sub-tabs. |
| BUG-46 | Fixed. There is no horizontal page scroll at 360 px (browser). The KPI grid is one column on phones. |
| BUG-47 | Not applicable. Kit tokens only. |
| BUG-48 | Fixed. Every date is `formatVNDate` or `formatNd30Date`. |

## Product questions (m6 §7.3)

| Q | Resolution |
|---|---|
| 1 Starter data | None (decision 13). The dev seed only, in dev memory mode. |
| 2 Issuance | Yes: an immutable snapshot of the date, milestone, figures, text, signer and number. The signer is the department head of the event's lead department (decision 17). The number is typed by hand. |
| 3 Free text | Typed per day: "Tình hình triển khai nổi bật" and "Khó khăn, vướng mắc và kiến nghị". Section I's step counts are generated. |
| 4 "Thư mời" | Every roster row, the same count as guests' KPI 1, so the two screens agree. Declined guests count as invitations, not as attending. |
| 5 Quota rounding | Ceil, the shared selector (decision 2). |
| 6 Event selection | The URL. |
| 7 /quanlydauthau | Manual entry, labelled (decision 15). There is no check against the event budget. |
| 8 Press release | Saved per event. There is no export and no sending. |
| 9 Official reports | The templates feature's renderer, opened for the event. |
| 10 Holidays | Non-working days (decision 1). |
| 11 After 16h30 | Not enforced. Issuing is allowed any day of the event's life, and the alert names the deadline. |

Choices made here that a product owner may want to revisit, each reversible:

1. The savings rate compares only packages that have a winning price. The KPI also shows the full dự toán.
2. Issuing is allowed outside the T-10 window.
3. A repeat issue writes an audit row that says nothing changed, as live's repeat scan does.
4. "Kính gửi" lists UBND TP, then the parent agency and the agency as settings store them, in capitals (change request 3).

## Change requests (frozen contract)

1. **contract.ts, `DailyReport`.** Add `eventName`, `eventDate` and `signatoryTitle`. The snapshot needs them so a renamed event or a moved T0 does not rewrite a sent document. Until then, the local `IssuedReport` extends `DailyReport`, and the migration adds the three columns.
2. **Kit print type.** `PrintPage` uses the generic serif at `text-print-base` (14 px, about 10.5 pt). NĐ30 asks for Times New Roman at 13 to 14 pt. Ask: a print font token and a 13 pt size. Until then, `print-daily-report.tsx` names Times New Roman at 13 pt in a style scoped to the sheet. **This font choice was inferred from the decree and needs user confirmation.**
3. **Sentence-case agency names.** `orgIdentity(settings)` has only the capitalised letterhead lines. "Kính gửi" and running text need "Sở Tài chính Hà Nội". Ask: sentence-case fields in settings, or a recipients setting.
4. **Server-side issue.** RLS lets any holder of `reports.issue` insert a `sce_tcsk_daily_reports` row straight through PostgREST with figures of their choosing. The trigger fixes the date, time and issuer, not the figures. Ask: an RPC `sce_tcsk_issue_daily_report` (RpcMap) that the command calls, with direct inserts revoked. This is the same accepted model as every other table today, but this one is an official document.
5. **memoryDb.** It emulates neither the issue trigger nor expression indexes (`lower(code)`). The command enforces both rules itself, and `sql.test.ts` proves the SQL on PGlite.

## Integration items

1. **progress.** Point the daily-report bell and its pop-up rows at `/events/<id>/reports` (BUG-21).
2. **templates.** The three official templates should fill the event's data when opened with `?event=` (BUG-18). reports passes the event id.
3. **Lead.** Apply `202611041300_reports_issue_snapshot.sql` on a local `supabase start`, and check the trigger with a real `auth.uid()` and the `Asia/Ho_Chi_Minh` day.
4. **comms.** Sending a press release, if product wants it.
5. **Realtime.** The report screens do not subscribe to `useEventChanges`. They refresh after the actor's own command and on navigation.

## Foundation feedback

1. The T3 preview tool's click, type and snapshot timed out in this session, as guests reported. Forms were driven through `preview_evaluate` with DOM events.
2. A command input that an undo replays must accept the stored shape (`null` for a blank link, contractor or document number). Two of these surfaced as real bugs here, found by the undo tests. Worth a line in `src/features/README.md`.

## Not verified

- RLS, the trigger and the indexes on a real Supabase. Only PGlite with the Supabase stub was used.
- The `.doc` opened in Microsoft Word or LibreOffice. Only its HTML was checked.
- Paper or PDF output. Only the on-screen A4 sheet and its `@page` rule were checked.
- The downloaded `.xlsx` read back.
- A keyboard-only walk (ui-rules 20). Light and dark were checked at 360 px on some tabs only, and 1440 px on the dashboard only.
- That Times New Roman is installed on the users' machines.
