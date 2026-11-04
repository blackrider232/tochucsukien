# Status: feature `reports` (M6, Báo cáo & Tổng kết)

Branch `t3/reports-kpi-nd30-daily-report`, then the review fixes on `t3/reports-review-fixes`. The feature lives in `src/features/reports/`. The routes are `/events/[eventId]/reports` (Báo cáo hàng ngày), `/reports/official`, `/reports/media`, `/reports/bidding` and `/reports/dashboard`, plus the print page `/events/[eventId]/reports/print`, with `?report=<id>` for an issued report, under `(print)`.

## What is built

- **Domain** (`domain/`).
  - `figures.ts` holds `reportFigures` (the contract's selector), `dashboardFigures` (the same figures plus the counts the screens spell out), `biddingTotals`, the signed `savingsPercent`, the one `formatPercent2`, the one savings wording `savingsLabel` and totals sentence `biddingTotalsSentence`, the T-10 `dailyReportState`, `milestoneLabel`, `workdaysToEvent` and the snapshot `encodeFigures`/`decodeFigures`.
  - Progress, the invite quota and the booth counts come from `eventProgress` (progress), `guestKpis`/`quotaProgress` (guests, decision 2) and `boothKpis` (venue). So a report never disagrees with the screen that owns the number.
  - **T-n.** `workdaysToEvent` counts the working days in [today, T0) on the holiday calendar. On every working day that is the n for which progress puts a T-n deadline on today (`addWorkdays(T0, -n)`), whatever day T0 falls on, and a weekend or holiday reads as the next working day. Worked examples: T0 Sun 13/12/2026 makes Fri 11/12 T-1 and Sat 12/12 T-0 ("không còn ngày làm việc"). T0 on the Quốc khánh holiday Wed 02/09 makes Tue 01/09 T-1. A property test checks the inverse over six T0s. The active state uses the same count, so "active from T-10" and the T-n label cannot disagree (integration item 1 asks progress to count its bell's window the same way).
  - The snapshot also freezes `guestQuotaPercent` from settings, so the quota sentence names the percent the report was issued under.
  - `report.ts` is the NĐ30 document model (`dailyReportDocument`), built only from an issued snapshot or from today's figures for a preview. It also holds the signer title (decision 17) and the snapshot milestone.
  - `word.ts` renders that model as Word HTML: tables with inline styles, escaped by the `html` tag, and a folded file name. `ND30_PT` is the one table of NĐ30 type sizes (body 14 pt, letterhead 13, signer 14, "Nơi nhận" 12, copies 11). The Word file writes it inline and the print page sets it over the kit's px sizes, and a rendering test reads the same pt from both.
  - `agency-name.ts` puts the settings' capitalised agency names in proper case for "Kính gửi" (decision 18) from a small explicit table of the org names the docs, the legacy app, the dev seed and the settings defaults carry (`KNOWN_AGENCIES`). A name not in the table prints as stored, in capitals, instead of a guessed casing. Proper-case fields in settings (change request 3) are the real fix, after which the table goes. `schemas.ts` holds the zod rules the forms and the commands share, the closed lists with their registries, and `nextPackageCode`. `screen.ts` holds the screen data type.
- **Data**.
  - `202611041400_reports_issue_snapshot.sql` adds the frozen event name and date and the signer title to an issued report, check constraints for the media types and contract statuses, and non-blank code, name, outlet and title. Its timestamp was 202611041300 until the review, which collided with core's `202611041300_core_table_privileges.sql`.
  - `202611041410_reports_issue_derived.sql`. For any user session the issue trigger stamps `issued_by`, `issued_at` and `report_date` (VN day), and derives `event_name`, `event_date`, `signatory_title` and `workdays_to_event` from the event row and `sce_tcsk_holidays`. `tcsk.reports_workdays_to_event` and `tcsk.reports_signer_title` are the SQL twins of `workdaysToEvent` and `signerTitle`, and `sql.test.ts` compares them with the app's functions. An event the caller cannot see is refused. The service-role import keeps its legacy values.
  - `202611041420_reports_issue_lead_department.sql`. The insert policy of `sce_tcsk_daily_reports` is `tcsk.reports_can_issue`: `reports.issue` on the event's lead department only, and never on a soft-deleted event (decision 17).
  - `202611041440_reports_issue_restore.sql`. The issue trigger returns the new row as it is while `sce.restoring` is on, as core's `tcsk.stamp` does. Before it, core's restore (a signed-in admin, daily reports reinserted before events) raised `forbidden` as soon as any daily report existed, and would have restamped every report's date and issuer. The other reports tables have no trigger beyond `tcsk.stamp` (which already returns early), and their checks and the folded code index hold for restored rows. `sql.test.ts` makes a backup of an event with two reports plus packages and clippings, restores it as an aal2 admin, and compares every row before and after.
  - `202611041450_reports_vn_day.sql`. `tcsk.reports_vn_day(timestamptz)` is the Hà Nội day the trigger stamps. The test checks it at fixed instants across the 17:00 UTC boundary and swaps it for a stub to show the trigger takes its day from it, so a trigger on the UTC day fails at any hour the suite runs.
  - `202611041460_reports_package_code_fold_spaces.sql`. `tcsk.reports_code_key` decomposes the code (NFD) and collapses exactly the characters JavaScript's `\s` matches, non-breaking space included, so the index and `foldVi` agree. It reindexes the unique index: two codes of one event that differ only by such a space make the apply fail until one is changed.
  - `202611041430_reports_package_code_folded.sql`. The package code is unique per event after folding tone marks, đ, case and spacing, as `foldVi` does in the command. It is an expression index over the immutable `tcsk.reports_code_key`. It is not a generated column, because core's restore inserts every column of a backup and a generated column refuses that.
  - The other RLS is the 0002 registration from the generated matrix: `reports.read` reads, `reports.write` edits, and `sce_tcsk_daily_reports` has no update or delete policy.
  - **What the database cannot check.** The figures (`progress_percent`, `figures`) are the progress, guests and venue selectors' results, computed in the app. SQL does not recompute them. A lead-department holder of `reports.issue` can therefore insert a report with invented figures straight through PostgREST. The row names them (`issued_by`, stamped by the server) and cannot be edited or deleted afterwards, but such an insert writes no audit row. Change request 4 asks for the RPC that closes the direct insert.
- **Server** (`server/`).
  - The tables and reads come first. `upstream.ts` reads the plan, roster and booths, and turns `not implemented` into a named "chưa sẵn sàng" state. `screen-data.ts` builds one shape for every sub-tab and the print page's report. Then come `legacy-importer.ts` and `dev-seed.ts`.
  - There are 10 commands: create, update and delete for clippings, packages and press releases, plus `reports.issueDailyReport`. Every edit is audited and returns its undo.
  - `issueDailyReport` needs `reports.issue` on the event's lead department (`issueScope`, decision 17). It computes the figures on the server at issue time and freezes them in the row, and it takes only the narrative, the signer's name and the document number from the client.
  - It is idempotent per (event, VN date). A repeat, a retry with the same id (looked up by id first, so a retry that lands after midnight still returns its report), or a second desk racing the first all return the first report unchanged, and the audit row says so. It has no undo, because the report is immutable.
  - The audit row and the milestone use the day the database stored. The trigger stamps the day from `now()`, so a call at 23:59:59.9 stored as the next day is audited as that day, and the race recovery also looks at the next day.
- **Screens** (`components/`).
  - Four headline KPI cards sit on every sub-tab. When an upstream is missing they become a "chưa sẵn sàng" alert. The bidding card reads "1/2 gói có giá trúng: 198 tr trên dự toán 200 tr", the base of its rate.
  - **Daily.** The T-state alert, the issue form behind a confirm ("không sửa được sau đó"), the issued-today summary, and the history. Each history row prints or exports its own snapshot.
  - **Official.** The three templates open in the templates feature for this event.
  - **Media.** Clippings and press releases, with dialogs, delete after a confirm, and undo.
  - **Bidding.** Packages labelled "Nhập tay", a signed saving per row and in total, and .xlsx export. The export's saving cell and footer use the screen's wording ("Tiết kiệm 2,27%", "Vượt 12,50%", "Chưa có giá trúng").
  - **Dashboard.** Five computed KPI cards and one bar per task group.
  - **Print.** An A4 NĐ30 page through the kit's `PrintPage`, `Nd30Header` and `SignatureBlock`, in Times New Roman at 14 pt, the Word file's size (see change request 2). Word export is `.doc` per decision 14, labelled "Tải Word (.doc)".
- **Tests** (`__tests__/`, 188 in 11 files).
  - **Worked examples by hand.** Progress 2/7 = 29% with two late steps, the 130% quota boundaries (194 vs 195 of 150, 9 vs 10 of 7, 100% and 200%), the legacy seed's 465.000.000 / 449.500.000 = 3,33%, overruns (-12,50%, -4,19%), rounding (66,67 not 66,66), zero budgets and unawarded packages (no rate, not 100%).
  - **T-10 on the holiday calendar.** 30/04 and 01/05 make Tue 28/04 to Tue 05/05 T-3, against T-5 with weekends alone. Quốc khánh, a weekend today, a compensatory Saturday, events on a Saturday, a Sunday and a holiday, the property that T-n is progress's T-n deadline on every working day, the T-10/T-11 boundary, event day, T+1, the threshold from settings, and the VN midnight.
  - **Commands through the real pipeline**, with real progress, guests and venue behind the figures.
  - **Issue.** Frozen figures equal to the hand-computed ones, the audit text, idempotency, retry (also across midnight), a race where another desk issues mid-command (also just after midnight), 23:59:59 and 00:00:01 in Hà Nội, a database day one ahead of the request's and the request's one ahead of the database's (the race lookup spans yesterday to tomorrow), a conflict reported by Supabase, a report id of another event, the snapshot unchanged after the plan, roster, packages and event name change, the print page and the Word export of an issued report after a rename, forged figures, date and issuer ignored, and immutability.
  - **Permissions.** Every verb is denied to another department twice: through RLS and with RLS bypassed. A chuyên viên and a supporting department's head are refused issue the same two ways, and the screen offers the form to the lead department only. Each command's declared permission is pinned.
  - **Not-ready upstream** (mocked guests read). The PGlite SQL test (`sql.test.ts`) covers RLS on issue (another department, a supporting department, a locked and a pending head), the server stamp and the derived event, title and T-n of a forged direct insert, the SQL twins against `workdaysToEvent`, `signerTitle` and `foldVi` (spaces, tabs, non-breaking and zero-width characters included), the Hà Nội day, a soft-deleted event refused to the lead head and to an admin, a backup and restore round trip of two reports, one report per day, immutability, the folded code index and the check constraints.
  - **Rendering.** XSS payloads on every tab, the print page and the Word body, the issue flow with its confirm, permission hiding, the bidding card's base, the step counts, the type sizes of the sheet and the Word file, a sub-0,01% overrun on the card, the dashboard, the print text and the Excel cell, the quota sentence, the proper-case "Kính gửi", the .xlsx cells and footer (`exports.test.tsx`, through the Xuất Excel button), the importer fixture, and the dev-memory end-to-end scenario below.
- **Dev-memory end to end** (`dev-e2e.test.ts`, `SCE_DEV_MEMORY=1`, clock fixed to Tue 08/12/2026). It runs every feature's real dev seed. The dashboard then shows exactly the hand-computed numbers:
  - T0 Fri 18/12 = T-8.
  - 2/32 steps = 6%.
  - 9 invitations of a 156 quota, 5 attending.
  - Booths 1/3.
  - 240 tr dự toán, 2.000.000 / 200.000.000 = 1,00%.
  - 2 clippings.

  Then the dept_leader issues, the leader's second issue the same day returns the first report, a completed step and a new guest change the live figures but not the snapshot, and both issue attempts are in the audit.
- **Browser** (`SCE_DEV_MEMORY=1 pnpm dev`, T3 preview, as `dept_leader:XTDT`), before the review fixes. All five tabs and the print page answer 200.
  - At 360 px the page `scrollWidth` is 352 on daily, media and bidding. Only the shell's own sub-tab bar scrolls, inside itself.
  - A package added through the dialog turned the total into "vượt dự toán 8.000.000 đ (2,29%)", which is correct by hand.
  - A report issued through the form showed in the KPI card and in the history.
  - Its print page showed "Hà Nội, ngày 04 tháng 11 năm 2026", "TRƯỞNG PHÒNG XÚC TIẾN ĐẦU TƯ", the computed sentences and Times New Roman.
  - The dashboard was checked in dark mode at 360 px and at 1440 px.
- **Mutation pass** (`node src/features/reports/__tests__/mutation-pass.mjs .`): 47 mutations, 47 killed.
  - The KPI mutations were the savings sign, rounding, zero budget, unawarded packages counted, the legacy clamp at 0, the quota base, attending, overdue, the event-day check, T+1, the window boundary, the T-n count over (today, T0], the milestone unit and the snapshot boolean.
  - The permission mutations were issue opened to `reports.write`, edits opened to `reports.read`, the UI's issue flag, issue opened to supporting departments in the command and in the UI, and the matrix grant of `reports.issue` to `user`.
  - The issue mutations were idempotency, race recovery, the next-day recovery, the retry by id, the audit day from the request clock, a UTC report date, the issuer, case-sensitive codes, the code check on edit, the event check of `readDailyReport`, the stored-days-only milestone, and the live event name on an issued report's print page and Word export.
  - The review-fix mutations were the restore guard, the UTC day, the soft-deleted event rule, the `conflict` and other-event race paths, the clock one day ahead, a tiny overrun rounding to -0, the print header and signature sizes, the Word letterhead size, a guessed agency casing and the NBSP fold.
- The wording mutations were the quota outcome, the quota percent, a target of 0, the letterhead capitals in "Kính gửi", the bidding card's base, the step counts, the .xlsx cell and footer, and the 13 pt body.
  - The SQL mutations were the trigger keeping a forged event name or T-n, the SQL T-n over (today, T0], the insert policy back to lead and supporting departments, and the code index on `lower(code)`.
  - "Edits opened to `reports.read`" is equivalent under today's matrix, because read and write grant the same roles. It is killed by the test that pins each command's declared permission.

## Bugs (m6 §6)

42 fixed, 6 not applicable, none deferred.

| Bug | Result |
|---|---|
| BUG-01 | Fixed. Nothing seeds a real event. The importer skips `media_0x`, `bid_0x` and `rpt_*` and reports them. The dev seed adds fake clippings and packages to the dev event only, and never an issued report. |
| BUG-02 | Fixed. The target is `event.targetGuests`, through guests' `quotaProgress`. |
| BUG-03 | Fixed. `dailyReportState` derives not yet, active, event day or past from the event date and the holiday calendar, with the threshold from settings. Active and T-n use one count, the working days in [today, T0), which matches progress's T-n deadlines. |
| BUG-04 | Fixed. The badge and the alert come from the state. |
| BUG-05 | Fixed. "Quá hạn" is progress's `stepState`, never a stored flag. |
| BUG-06 | Fixed. The card reads "Xong: 2/7 • Quá hạn: 2 • Chưa đến hạn: 3": the three parts add up to the total (Chưa đến hạn = total − done − overdue). |
| BUG-07 | Fixed. Every number in the report is computed. The narrative, kiến nghị, signer and number are typed by the person issuing. No plan number, JETRO, 86%, 465.000.000 or signer name is printed. A test checks this. |
| BUG-08 | Fixed. The quota sentence is worded by outcome ("đã đủ định mức" or "còn thiếu N thư mời"). It names the settings' percent frozen at issue (a target of 7 reads 130%, not 143%), and an event without a target says it has no quota. |
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
| BUG-19 | Fixed. The document number is typed (otherwise dots). The date uses `formatNd30Date`. The tiêu ngữ is upright bold with the kit's rule. The signer is the head of the event's lead department, and only that department issues (decision 17). "Kính gửi" names the agencies in proper case. |
| BUG-20 | Fixed. The template links carry the event id. |
| BUG-21 | Fixed by progress: its daily-report dialog links each event to `/events/<id>/reports` (`progress/components/kpi-dialogs.tsx:79`). |
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
| BUG-33 | Fixed. The default code is `TB-{yyyy}-{pad3(max+1)}`. Codes are unique per event, case-, tone- and spacing-insensitively, in the command (`foldVi`, on create and on edit) and in the DB (`tcsk.reports_code_key`, 202611041430 and 202611041460; until the review the DB ignored case only). The importer suffixes duplicates. |
| BUG-34 | Fixed. Money is a whole-đồng `MoneyInput`. The dự toán must be above 0 and the winning price at least 0. A winning price above the dự toán is accepted and reported as an overrun. |
| BUG-35 | Fixed. The saving is signed, with one two-decimal formatter and one wording (`savingsLabel`) everywhere. An overrun shows as "Vượt x%" on the screen and, since the review, in the .xlsx cell and footer too (they printed a raw 3.33 and "tiết kiệm -4,19%" before). A difference too small for two decimals is stored as ±0,001 and printed "<0,01%" ("Vượt <0,01%"), so 40.000 đ over a 1 tỷ dự toán no longer reads "Tiết kiệm 0,00%" on the card, the dashboard, the print text, Word or Excel. |
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
| 2 Issuance | Yes: an immutable snapshot of the date, milestone, figures, text, signer and number. Only the event's lead department issues, and its head signs (decision 17). The number is typed by hand. |
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
4. "Kính gửi" lists UBND TP, then the parent agency and the agency in proper case, derived from the capitalised settings by `agencyName` (change request 3).
5. A supporting department reads the daily reports but cannot issue one (decision 17 read as "the lead department's head signs").

## Change requests (frozen contract)

1. **contract.ts, `DailyReport`.** Add `eventName`, `eventDate` and `signatoryTitle`. The snapshot needs them so a renamed event or a moved T0 does not rewrite a sent document. Until then, the local `IssuedReport` extends `DailyReport`, and the migration adds the three columns.
2. **Kit print type.** `PrintPage` uses the generic serif at `text-print-base` (14 px, about 10.5 pt). NĐ30 asks for Times New Roman at 13 to 14 pt. Ask: a print font token and a 14 pt body size. Until then, `print-daily-report.tsx` names Times New Roman and sets every size from `ND30_PT` in a style scoped to the sheet (over the kit's 13 and 12 px header and footer classes), and the Word body sets the same face and sizes, as the kit's Word HTML and the legacy templates do. **This size was inferred from the decree and the legacy templates and needs user confirmation.**
3. **Sentence-case agency names.** `orgIdentity(settings)` has only the capitalised letterhead lines. "Kính gửi" and running text need "Sở Tài chính Hà Nội". Ask: proper-case fields in settings, or a recipients setting. Until then `agencyName` looks the capitalised name up in a small table of known org names and prints any other name as stored, because a rule cannot case Vietnamese proper names reliably (the earlier rule produced "Xúc tiến đầu TƯ" and "Bộ kế hoạch và Đầu tư"). A new agency needs a table entry or, better, proper-case settings.
4. **Issue through an RPC (core: RpcMap, RPC_ALLOWLIST, memoryDb).** A holder of `reports.issue` on the lead department can still insert a `sce_tcsk_daily_reports` row straight through PostgREST. Since the review, the event name and date, the signer title, T-n, the day, the time and the issuer are the database's, and a supporting department or a locked or pending user is refused. Two gaps remain: the figures and the progress percent are whatever that caller sends, and a direct insert writes no audit row. The review asked for `sce_tcsk_issue_daily_report(event_id, id, snapshot jsonb)` (SECURITY DEFINER, search path pinned, EXECUTE to authenticated only, checking `reports.issue` on the lead department, returning the stored row) with INSERT revoked from authenticated. reports cannot ship that alone: a feature calls SQL only through `RpcMap` and `RPC_ALLOWLIST`, which are core's, and memoryDb needs a handler. Revoking INSERT without them would break issuing. Ask core for the three entries; reports then adds the function in its own migration, revokes INSERT, and switches the command. Even then the function takes the figures from its caller, because SQL cannot recompute the progress, guests and venue selectors. Its gain is that every issued report gets an audit row in the same transaction. The issuer stays accountable through `issued_by` either way.
5. **memoryDb.** It emulates neither the issue trigger, nor the lead-department insert policy, nor expression indexes (`tcsk.reports_code_key`). The command enforces all three itself (it freezes the same derived values, authorizes on the lead department, and folds codes), and `sql.test.ts` proves the SQL on PGlite.

## Integration items

1. **progress.** `isInDailyReportWindow` counts the working days in (today, T0], while progress's own T-n deadlines (`addWorkdays(T0, -n)`) match [today, T0). The two differ by one when today or T0 is not a working day. For a Sunday T0 the bell opens at reports' T-11; on a weekend before a weekday T0 it counts one more. Ask: count the window as reports' `workdaysToEvent` does. reports no longer uses `isInDailyReportWindow`.
2. **templates.** The three official templates should fill the event's data when opened with `?event=` (BUG-18). reports passes the event id.
3. **Lead.** Apply the four `2026110414*_reports_*.sql` migrations on a local `supabase start`. Check the trigger with a real `auth.uid()` and the `Asia/Ho_Chi_Minh` day, and that `upper()` gives the Vietnamese capitals of `tcsk.reports_signer_title` under the production collation (PGlite's C.UTF-8 does).
4. **comms.** Sending a press release, if product wants it.
5. **Realtime.** The report screens do not subscribe to `useEventChanges`. They refresh after the actor's own command and on navigation.

## Foundation feedback

1. The T3 preview tool's click, type and snapshot timed out in this session, as guests reported. Forms were driven through `preview_evaluate` with DOM events.
2. A command input that an undo replays must accept the stored shape (`null` for a blank link, contractor or document number). Two of these surfaced as real bugs here, found by the undo tests. Worth a line in `src/features/README.md`.

## Not verified

- RLS, the trigger and the indexes on a real Supabase. Only PGlite with the Supabase stub was used.
- The review fixes in a browser. They are covered by rendering tests and the dev-memory end-to-end test, not by a new browser pass.
- The `.doc` opened in Microsoft Word or LibreOffice. Only its HTML was checked.
- Paper or PDF output. Only the on-screen A4 sheet and its `@page` rule were checked.
- The downloaded `.xlsx` read back.
- A keyboard-only walk (ui-rules 20). Light and dark were checked at 360 px on some tabs only, and 1440 px on the dashboard only.
- That Times New Roman is installed on the users' machines.
