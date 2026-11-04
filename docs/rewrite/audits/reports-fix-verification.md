# Reports fix diff: independent verification

Scope: `git diff 98b913f 7a162cb -- src/features/reports supabase/migrations docs`, checked on the integrated branch (dev 5c2f515 merged with reports 7a162cb). The probes were written for this check and kept out of the tree. Each one ran on PGlite with every migration applied, or through the reports harness on the real command pipeline.

## Claims

| Claim | Result | Evidence |
| --- | --- | --- |
| a. The issue trigger derives event name, event date, signer title, T-n, day, time and issuer | Verified | A lead head's forged insert stored the event's name and date, `TRƯỞNG PHÒNG XÚC TIẾN ĐẦU TƯ`, T-29, today and the head's id. A nonexistent event and a supporting head were refused. |
| a. What can still be forged is stated | Verified | `progress_percent`, `figures`, `signatory`, `key_highlight`, `document_number` and `legacy_id` keep the caller's values. The status doc names the figures, the percent and the missing audit row (change request 4). The rest are caller text in the command too, and `legacy_id` has no unique constraint on this table. |
| a. The SECURITY DEFINER issue RPC was not built and is a change request | Verified | No `sce_tcsk_issue_daily_report` exists. Change request 4 names RpcMap, RPC_ALLOWLIST and memoryDb. |
| b. A supporting department head, a locked head and a pending head cannot issue | Verified | The command returns `forbidden`, or `gate` for locked and pending. The RLS insert is refused. |
| c. T-n matches progress's addWorkdays deadlines | Verified | 12,410 pairs: every T0 in 2026, from 30 working days before to 3 after, with Tết, a compensatory Saturday and 27/04 added. SQL, `workdaysToEvent` and `addWorkdays(T0, -n) === today` agree everywhere. |
| d. The bidding card's caption and badge use one base | Verified | Both use the awarded packages' dự toán. |
| e. The audit row's day equals the stored day at 23:59:59 and 00:00:01, and a same-id retry after midnight converges | Verified | See finding 4 for the opposite clock skew. |
| f. Print and Word use a 14 pt body | Verified for the body only | See finding 3 for the header and signature. |
| f. Agency names in proper case | Partly | See finding 2. |
| g. The Excel export words an overrun as the screen does | Verified | Except for finding 5. |
| h. The folded code index survives core's restore | Not verified, regression | See finding 1. |

## Findings

1. **HIGH. Restore fails once any daily report exists.** File: `supabase/migrations/202611041410_reports_issue_derived.sql:38`. Core's `sce_tcsk_restore_backup` runs as an authenticated admin, so `auth.uid()` is set. It sets `sce.restoring` and reinserts tables in `relname` order, which puts `sce_tcsk_daily_reports` before `sce_tcsk_events`. `tcsk.reports_issue_stamp` ignores `sce.restoring`, finds no event yet, and raises `forbidden`, which rolls back the whole restore. With the order fixed, it would still restamp every report's date, time, issuer, title and T-n to the restorer's today. Two reports of one event would then collide on `(event_id, report_date)`. Reproduction: one event, a daily report, `sce_tcsk_create_backup` then `sce_tcsk_restore_backup` as an aal2 admin. Result: `forbidden`. With the guard below, the round trip returns the rows unchanged. Fix: open the trigger with `if auth.uid() is null or coalesce(current_setting('sce.restoring', true), '') = 'on' then return new; end if;`, as `tcsk.stamp` does. Add a PGlite restore round trip with two reports of one event. verify:sql's round trip has no daily report, which is why it passes.
2. **MED. Real agency names come out mis-cased.** File: `src/features/reports/domain/agency-name.ts:16`.
   - `TRUNG TÂM XÚC TIẾN ĐẦU TƯ, THƯƠNG MẠI VÀ DU LỊCH HÀ NỘI` gives `… Xúc tiến đầu TƯ, thương mại và Du lịch …`. A word with trailing punctuation fails the syllable test and keeps its capitals, and the word after a comma starts no new function.
   - `BAN QUẢN LÝ CÁC KHU CÔNG NGHIỆP VÀ CHẾ XUẤT HÀ NỘI` gives `… khu công nghiệp và Chế xuất …`. Capitalising after `và` is wrong inside one function.
   - `UỶ BAN NHÂN DÂN THÀNH PHỐ HÀ NỘI` (the older tone placement) gives `Uỷ ban nhân dân thành phố Hà Nội`.
   - `HĐND THÀNH PHỐ HÀ NỘI`, `ĐOÀN ĐBQH THÀNH PHỐ HÀ NỘI` and `SỞ TÀI CHÍNH THÀNH PHỐ HÀ NỘI` give a lower-case `thành phố`, while the first Kính gửi line prints `Thành phố Hà Nội`.
   - `BỘ KẾ HOẠCH VÀ ĐẦU TƯ` gives `Bộ kế hoạch và Đầu tư`, and `TỔNG CỤC THỐNG KÊ` gives `Tổng cục thống kê`, because `bộ` and `tổng cục` are not heads.
   - These come out right: `SỞ TÀI CHÍNH HÀ NỘI`, `TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP HÀ NỘI`, `UBND TP HÀ NỘI` (as `UBND TP Hà Nội`), `SỞ KH&ĐT HÀ NỘI` and `CỤC THUẾ TP. HÀ NỘI`.
   - Fix: strip punctuation before the syllable test and treat a comma as a new function. Capitalise after `và` only between two functions. NFC-normalise `uỷ` to `ủy`. Add `bộ`, `tổng cục`, `văn phòng` and `hội đồng` as heads. Case `thành phố` + city as line 1 does. The lasting fix is change request 3, proper-case fields in settings.
3. **MED. Print and Word disagree outside the body.** File: `src/features/reports/components/print-daily-report.tsx:13`. On print, `Nd30Header` and `SignatureBlock` carry the kit's `text-print-sm` (13 px, about 9.75 pt) and `text-print-xs` (12 px). In Word the header is 13 pt, the signer's title and name are 14 pt, `Nơi nhận` is 12 pt and the copies are 11 pt. The `.nd30-small { 11pt }` wrapper is dead, because the footer's own class wins. The status doc says only the body matches. Fix: scope `.nd30-report header` and `.nd30-report footer` sizes to Word's, or ask the kit for print tokens in pt (change request 2).
4. **LOW. An app clock ahead of the database fails at midnight instead of converging.** File: `src/features/reports/server/issue.ts:65`. The app has passed midnight, the database still stamps D, and D's report exists. The insert hits the unique key, and the race lookup checks only `[today, today+1]`, which is `[D+1, D+2]`. The result is `{ok:false, kind:'constraint', message:'Dữ liệu bị trùng hoặc không hợp lệ.'}`, reproduced with a wrapper that stamps D. Fix: look up `[addCalendarDays(today, -1), today, addCalendarDays(today, 1)]`.
5. **LOW. A tiny overrun reads as a saving.** File: `src/features/reports/domain/figures.ts:54`. With a 1.000.000.000 đ budget won at 1.000.040.000 đ, `savingsPercent` is `-0`. `savingsLabel` then prints `Tiết kiệm 0,00%`, the KPI badge is green, the Alert tone is `info` and the Excel cell says `Tiết kiệm 0,00%`. Meanwhile `biddingTotalsSentence` says `vượt dự toán 40.000 đ (0,00%)`. Fix: decide the sign from `budget - winning`, not from the rounded percent.
6. **LOW. The folded code index and `foldVi` disagree on NBSP.** File: `supabase/migrations/202611041430_reports_package_code_folded.sql:16`. PostgreSQL's `\s` does not match U+00A0, but `foldVi` folds it to a space. So `GÓI A` with an NBSP passes the index after `GÓI A` but not the command. This matters only outside the command.

## Mutation pass

I ran 23 mutations against the reports suites, excluding these probes. 17 were killed and 6 survived:

- **Trigger day computed in UTC.** It survives whenever the suite runs between 07:00 and 24:00 in Hà Nội, because the SQL test reads the VN day from the same `now()`. Pinning a time needs a `tcsk.vn_day(timestamptz)` helper the test can call.
- **Policy without `e.deleted_at is null`.** The rule itself holds (the probe was refused by RLS), but no test covers it. A lead head can still see the soft-deleted event, so the trigger would not catch it either.
- **Race branch without `e.kind === 'conflict'`.** On Supabase a same-id concurrent retry surfaces as `conflict` (`supabase.ts` insert), but no test covers that.
- **Same id on another event returned as this event's report.** No test covers it.
- **Trigger without its `forbidden` raise.** Effectively equivalent. RLS refuses the same rows, and the test accepts either message.
- **Signer title `like 'phòng%'`.** Equivalent for every real department.

## Resolved (reports-fixes2)

Each fix was written test first, and the new test failed before it. Commits are `fix(reports): ...` on `t3/reports-fixes2`.

| # | Finding | Fix | Test that failed before |
| --- | --- | --- | --- |
| 1 | HIGH. Restore failed once a daily report existed | `202611041440_reports_issue_restore.sql`: the trigger returns the row as stored while `sce.restoring` is on, as `tcsk.stamp` does. The other reports tables carry only `tcsk.stamp`, which already returns early. | `sql.test.ts` "core's backup and restore keep every reports table as it was": two reports of one event (one stamped, one legacy dated 30/11), packages and clippings, a backup and a restore as an aal2 admin, every row compared before and after. It failed with `forbidden`. |
| 2 | MED. Agency names mis-cased | `agency-name.ts` is a table of 21 known org names (every name in the docs, legacy app, dev seed, settings defaults and orgIdentity, plus the verifier's examples). Any other name prints as stored, capitals kept. Proper-case settings (change request 3) remain the real fix. | `agency-name.test.ts`: every table entry, the older `UỶ` placement, spacing, NFD input, the fallback and the mixed-case case. The cases of the finding failed. |
| 3 | MED. Print and Word disagreed outside the body | `ND30_PT` in `word.ts` (body 14, letterhead 13, signer 14, Nơi nhận 12, copies 11). Word writes it inline, the print page sets it over the kit's classes, and the dead `.nd30-small` wrapper is gone. | `rendering.test.tsx` "the same pt size on the sheet and in the Word file": it put the kit's px classes on the page and read computed sizes; the header read 9,75 pt against Word's 13. |
| 4 | LOW. App clock ahead of the database at midnight | The race lookup spans yesterday, today and tomorrow. | `issue.test.ts` "an app clock already past midnight while the database still stamps the day before": it returned `constraint`. |
| 5 | LOW. 40.000 đ over on 1 tỷ read "Tiết kiệm 0,00%" | `savingsPercent` returns ±0,001 for a difference below 0,005%, and `formatPercent2` prints it "<0,01%", so the label is "Vượt <0,01%" in the card, the dashboard, the print text, Word, the Excel cell and the totals sentence. | `figures.test.ts`, `rendering.test.tsx` (card, dashboard, document text) and `exports.test.tsx`: all read "Tiết kiệm 0,00%" or `-0`. |
| 6 | LOW. DB fold kept a non-breaking space | `202611041460_reports_package_code_fold_spaces.sql`: NFD, then the exact set JavaScript's `\s` matches; the unique index is reindexed. | `sql.test.ts`: a 20-string corpus (NBSP, tabs, line breaks, U+2000s, U+3000, U+FEFF, zero-width, NFD, empty) compared with `foldVi`, and a duplicate-code insert with NBSP. Both failed. |

### Survivors

- **Trigger day in UTC.** `202611041450_reports_vn_day.sql` moves the day into `tcsk.reports_vn_day(timestamptz)`. The test checks it at fixed instants around 17:00 UTC and replaces it with a stub to show the stored date is the helper's, so the mutant fails at any hour. Killed.
- **Insert rule without `e.deleted_at is null`.** A lead head cannot see a soft-deleted event, so the trigger refused it anyway and the rule never decided. An admin sees it, so the test inserts as an aal2 admin. Killed.
- **Race path without `conflict`** and **same id on another event returned as this event's report.** `issue.test.ts` has one test each. Killed.
- **Trigger without its `forbidden` raise** and **signer title `like 'phòng%'`** stay equivalent: RLS refuses the same rows and the test accepts either message, and no real department name differs between the two patterns.
- Widening the race window to yesterday made the "retry by id" mutant survive, because the window then found a retry made a day later. A retry two days later is now tested.

`mutation-pass.mjs` was brought up to the moved code and gained 14 mutants for the above: 59 mutants, 59 killed (a first run killed 56, the three others were a stale pattern, a stale pattern and the survivor just named).

### Remaining risk

- The race lookup returns the newest report of the three days when an insert fails with a `constraint` error that is not the day's key (for example a check). That would show yesterday's report as the answer. The case needs a failing check on a row the form already validated.
- The reindex in `202611041460` fails if two codes of one event differ only by such a space. That is intended, and the duplicate must be fixed first.
- The print sizes beat the kit's classes by selector specificity (`.nd30-report header` against a single class). The test simulates the kit's classes in jsdom. Paper output was not checked.
