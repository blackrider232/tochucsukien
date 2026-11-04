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
