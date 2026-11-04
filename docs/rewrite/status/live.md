# Status: feature `live` (M5, Điều hành hiện trường)

The feature lives in `src/features/live/`. Routes are `/events/[eventId]/live` (Bàn lễ tân check-in), `/live/duty` (Phân công ca trực), `/live/incidents` (Sổ xử lý sự cố) and `/live/monitor` (Giám sát chỗ ngồi), plus the print page `/events/[eventId]/live/car-pass` under `(print)`.

## What is built

- **Domain** (`domain/`). `desk.ts` holds the desk search (`filterDesk`), the header KPIs (`liveKpis`), the hall monitor (`monitorZones`, over venue's `zoneOccupancy` and `seatCodes`), `seatLabel`, `formatAt` and the car-pass list. `duty.ts` holds the one desk registry (`DUTY_DESKS`), `dutyRequiredAt` and `dutyStatus`. `incidents.ts` holds the urgency and status registries, `incidentCode`, `nextIncidentSeq`, the sort and the allowed status changes. `schemas.ts` holds the zod rules that the forms and the commands share.
- **Server** (`server/`). `tables.ts` (with the undo-token table of `202611041500_live_checkin_undo_tokens.sql`) and `reads.ts` hold `readCheckIns`, `readDutyStaff` and `readIncidents`. There are 19 commands, split by subject: `checkin-commands.ts`, `arrival-commands.ts` (walk-in, substitute), `duty-commands.ts` and `incident-commands.ts`. `command-kit.ts` holds the permission rules and the one guest read (`readRoster`). `commands.ts` declares the extra verbs and builds the record. `screen-data.ts`, `legacy-importer.ts` and `dev-seed.ts` complete the server.
- **Check-in model.** A check-in is its own row in `sce_tcsk_checkins`, unique per (event, guest). No live command writes the guest row.
  - `live.checkIn` is a set, not a toggle. A repeat scan answers `already` with the first time, writes an audit row that says nothing changed, and has no undo.
  - When two desks race, the unique key decides. The losing desk re-reads and is told the winner's time.
  - Undo is the separate `live.undoCheckIn`. It refuses when the check-in it would remove is no longer that guest's check-in.
  - `live.cancelCheckIn` comes from the row menu after a confirm.
  - Cancel and undo first copy the check-in into `sce_tcsk_checkin_undo_tokens`: event, guest, time, desk, gift time, the person who checked the guest in, and whether it was a confirmed declined check-in. Each token expires after 15 minutes, and a guest has at most one (a newer removal replaces the older token). The inverse carries only the token id.
  - `live.restoreCheckIn` loads the token and consumes it with its version. It refuses a missing, used, expired, other-guest or other-event token, and a guest checked in meanwhile. It puts back exactly what the token holds. Nothing in the payload can set a time, desk, gift or actor. A guest who declined after the removal is refused unless the removed check-in was itself a confirmed declined one, so undoing the cancel of a confirmed check-in needs no second confirmation.
  - A declined guest is refused by `live.checkIn` and is checked in only through `live.checkInDeclined`, the confirmed path of decision 7, which has its own audit action. `live.setGift` is the separate welcome-pack toggle of decision 8, for checked-in guests only.
- **Scan.** `live.scan` is a query that runs the contract's `matchScan` against the roster as it is now. Every code goes through `@/core/checkin-code`, and a typed short code must equal `checkin_code` exactly. A legacy badge (`SCE-CHK:<evt_…>:<gst_…>` or `SCE-CHECKIN:…`) resolves when `deterministicIds.eventId(legacyEventId)` is this event, so no event `legacy_id` read is needed. A badge of another event answers `other_event` with that event's name when the actor can see it.
- **Arrivals.**
  - `live.walkIn` checks the duplicate (`guestIdentityKey`), the hall, the zone, the VIP-zone confirmation and a free seat before the first write. It then calls `guests.create`, `venue.assignSeat` with the seat `findFreeSeat(…, zoneKey)` picked, `live.checkIn` and optionally `live.setGift`. Each nested step is permission-checked and audited by its owner.
  - When another desk takes the seat, the next free seat of the zone is tried once. If none is left, the guest is still checked in, and the result and the audit say there is no seat.
  - The client id makes a retry converge on one guest. A reused id counts as a retry only when that guest is a walk-in with the same identity as the draft; any other guest's id is a conflict, before anything is written. The undo, `live.undoWalkIn`, takes back the check-in, the seat and the guest in that order, and only for a walk-in that is still unedited.
  - `live.checkInSubstitute` marks the invited guest `substituted` with the attendee's name through `guests.update`, then checks in that same record, which keeps its seat. Its undo is `live.undoSubstitute`. The undo needs the guest still `substituted`, at the version the substitute left and with that check-in. The RSVP it restores comes from the inverse payload, and `guests.update` re-checks and audits that change under the actor.
- **Duty and incidents.**
  - Presence is always the server clock. `setDutyPresence` audits "đúng giờ" or "trễ n phút" against `dutyRequiredAt(event, settings)`, which is the event opening in Vietnam time minus `fieldPresenceHours`. A present staff member cannot be deleted. Undoing "Hủy điểm danh" records the arrival time at the moment of the undo, never a time from the client.
  - An incident's `seq` is one above the highest, computed by the app. The unique (event, seq) key turns simultaneous reports into a retry, up to five attempts. The advisory lock of the `incident_seq` trigger in `0003_functions.sql` never runs, because the app always sends a `seq`. Correctness rests on the unique key and the retries. Five parallel reports are tested to get five codes; more than five desks reporting in the same instant could exhaust the retries and get an error.
  - Status moves through `INCIDENT_TRANSITIONS`, and "resolved" takes a note (default "Đã kiểm tra và xử lý thành công."). Deleting is only the undo of a report nobody acted on: the row must still be at version 1 and not imported. A reopened incident stays in the log.
- **Screens** (`components/`). `LiveScreen` holds the shared action bar (Quét mã QR check-in, Khách phát sinh, Báo sự cố, In thẻ xe VIP), the realtime state (`useEventChanges` over the five tables, with a "Tải lại số liệu" button when not connected) and the four KPI cards, then the sub-tab.
  - `DeskProvider` is the one check-in path for every entry point. It handles the declined confirm, sound and vibration (`useBeep` plus `navigator.vibrate`, behind the `sce_beep` pref), the toasts, the queued VIP alert and the "nhiều đại biểu khớp" picker.
  - The desk search folds tones. Enter sends a code to the scanner path, or checks in the only visible match.
  - The scan dialog has a real `BarcodeDetector` camera with every permission and support state put into words, and a typed field that a USB or Bluetooth scanner fills. It stays open between scans. A browser without `BarcodeDetector`, or a page not served over https, is told so when the dialog opens, with no "Bật camera" button. Permission and missing-camera states are still learned only on "Bật camera", because finding them out means asking for the camera.
  - The scan result line says what the check-in did: "Đã check-in", "đã check-in từ trước", "Không check-in … (đại biểu đã báo vắng)" when staff answered no, or "Chưa check-in được …" as an error. A server refusal and a failed request both read as the error, because `useCommand` does not say which happened (change request G).
  - Offline (decision 6). While `navigator.onLine` is false, `LiveScreen` shows a "Ngoại tuyến" alert and disables the scan, walk-in and incident buttons. The sub-tabs render without row writes, and the desk refuses a check-in from a scan dialog left open. Open dialogs stay mounted so a short drop does not lose a form. Their submit still goes to `useCommand`, which sends regardless (change request F). The hook is a local copy of the shell's `useOnline` (change request H).
  - The other screens are the walk-in dialog (Khách mới, Người đi thay), the duty roster with its desk summary and dialog, the incident log with its dialog, the read-only seat monitor and the A5 car pass.
- **Importer.** Check-in fields on `eventGuests` come through guests' `legacyCheckins`. `HH:MM:SS` keeps its seconds on the event day in Vietnam time.
  - The four check-ins the legacy seeder faked are recognised by their exact time and staff name and skipped. So are `duty_01..04` and `sc_01/02`.
  - A gift without a check-in, or a check-in time that cannot be read, is reported, not invented.
  - `eventDutyRoster` reads the desk from "Bàn n". `eventIncidents` takes `seq` from "SC-NN" and gives a duplicate or missing code the next number. Each change is reported.
- **Dev seed.** Three fake duty staff (one present, one with a markup name) and one open incident on progress's dev event. It never creates a guest check-in.
- **Tests** (`__tests__/`, 108).
  - Check-in: idempotency, undo and redo, an undo refused after another desk re-checked in, two desks interleaved on one badge, and the declined refusal writing neither a row nor an audit, then the confirm path.
  - Cancel, restore and gift rules. The undo token restores the original time, desk, gift time and actor. A forged restore, a reused token, an expired token, and another guest's or event's token are refused. A legacy gift-only row is covered.
  - `checkin-guard.sql.test.ts` runs every migration on PGlite. It shows direct forged inserts, backdating updates and forged or reused tokens refused, while the statements the commands issue still succeed.
  - `dev-memory-e2e.test.ts` runs the undo scenario on the dev memory runtime, through the registry and audit writer as `dispatch` calls them.
  - The scan dialog's wording for each check-in result, the offline state, and the camera state on opening.
  - Every `matchScan` outcome through `live.scan`, including legacy badges and short or partial codes.
  - Walk-in: seat, VIP confirm, a full zone refused before any write, the duplicate refusal, retry convergence, a seat raced away, the zone filled meanwhile, undo, and a forbidden nested owner. Substitute and its undo.
  - The 2-hour rule as a table across the time-zone and midnight boundaries, and the presence audit text.
  - The incident sequence under interleaved creates, its lifecycle and undo.
  - Every command refused to `user` of another department with RLS bypassed (`runWithoutRls`) and through RLS, with nothing written. Swapping the check-in rule for a global read makes this fail.
  - The importer fixture, KPI and monitor math against the venue model, and XSS payloads on all four tabs and the car pass.

## Independent review (PASS WITH FIXES)

Each finding has a test that failed before its fix, except the mutants and LOW-3/LOW-5, which have a test that fails with the mutant applied.

| Finding | Result | Test that failed before |
|---|---|---|
| HIGH-1 restore made a check-in out of nothing | Fixed by server-kept undo tokens, and in the database by the check-in guard. A direct write still bypasses decision 7 and the audit (change request J). | `checkin.test.ts` "the undo of a cancel restores what the server kept, once"; `checkin-guard.sql.test.ts` (all five fail without the migration) |
| MED-1 scan dialog said success with no check-in | Fixed. | `rendering.test.tsx` "scan dialog words what the check-in did" |
| MED-2 walk-in reused another guest's id | Fixed. | `arrivals.test.ts` "refuses the id of a guest who is not that walk-in" |
| LOW-1 undoSubstitute on a plain check-in | Fixed. | `arrivals.test.ts` "undo of a substitute refuses a plain check-in" |
| LOW-2 undo of a confirmed declined cancel asked again | Fixed by the token. | `checkin.test.ts` "undoing the cancel of a confirmed declined check-in needs no second confirmation" |
| LOW-3 dead branch in `matchScan` | Pinned by a direct test; removal is change request I (`contract.ts` is frozen). | `scan.test.ts` "matchScan on a legacy badge", against the mutant |
| LOW-4 no offline write blocking | Fixed in live; `useCommand` is change request F. | `rendering.test.tsx` "offline (decision 6)" and "offline with the scan dialog already open" |
| LOW-5 incident number from the app | Kept, now tested under parallel creates. | `incidents.test.ts` "five desks reporting in parallel", against `MAX_SEQ_ATTEMPTS = 1` |
| M02, M12, M16, M18, M19 | Killed. | `checkin.test.ts`, `scan.test.ts`, `arrivals.test.ts`, each named "(review Mnn)" |
| M23 delete of an incident someone acted on | Killed, and fixed: a reopened incident could be deleted with its current version. | `incidents.test.ts` "deleting is refused for an incident someone acted on" |
| Camera support known only after "Bật camera" | Fixed for unsupported and insecure. | `rendering.test.tsx` "scan dialog camera" |

## Bugs (m5 §6)

38 fixed, 6 not applicable, 1 partly deferred.

| Bug | Result |
|---|---|
| BUG-01 | Fixed. Nothing seeds a check-in. The importer skips the seeder's four fingerprinted check-ins (test). The dev seed has none. |
| BUG-02 | Fixed. Empty roster and empty log show empty states. The importer skips `duty_01..04` and `sc_01/02`. |
| BUG-03 | Fixed. The target is `event.targetGuests`. |
| BUG-04 | Fixed. "Chưa đến" counts attending guests not checked in (test). |
| BUG-05 | Fixed. One row per guest with a unique key, no whole-blob write, and the two-desk race is tested. Realtime refresh goes through `useEventChanges`. |
| BUG-06 | Fixed. A human code or phone must match exactly. Tests cover a prefix, a tail of the number and a shared phone, which opens a pick list. Before the review the tail case had no test, and a suffix match would have passed. |
| BUG-07 | Fixed. A canonical code of another event, and a legacy badge whose uuid v5 event differs, answer `other_event` with the event name (test). |
| BUG-08 | Fixed. A repeat scan reports "đã check-in lúc …" and never cancels (test, browser). |
| BUG-09 | Fixed. Monitor tiles are read-only text (test). Cancel lives in the row menu behind a confirm. |
| BUG-10 | Partly deferred. There is a real camera where `BarcodeDetector` exists, honest states otherwise (unsupported and insecure said on opening), and the typed or wedge field always. No viewfinder is ever faked. Browsers without `BarcodeDetector` (Safari on iOS, Firefox) have no camera decode until a JS decoder is allowed (change request D). |
| BUG-11 | Fixed. Enter sends a code to the scanner path, or checks in the only visible match (browser). |
| BUG-12 | Fixed. All text is React text. Toasts and dialogs are plain text (test). |
| BUG-13 | Fixed. Staff names and role labels render as text (test). The required time is derived, so there is no free-text field to inject. |
| BUG-14 | Fixed. No HTML is built from strings. Handlers are bound in components. |
| BUG-15 | Fixed. A substitute checks in the invited guest's record as `substituted`, keeping its seat (test). No second guest is created. |
| BUG-16 | Fixed. A duplicate needs "Vẫn tạo khách mới". The server checks it too. The client id makes a double tap converge on one guest, and the submit button shows loading. |
| BUG-17 | Not applicable. There are no parent maps, only rows. |
| BUG-18 | Fixed. `dutyRequiredAt` and `dutyStatus` use `fieldPresenceHours` from settings, and the audit and the badge show "Trễ n phút" (tests). |
| BUG-19 | Fixed. The monitor and the walk-in zones come from venue's hall model (decision 19, test). |
| BUG-20 | Not applicable. The event is the URL; a missing or hidden event is a 404 from the event layout. |
| BUG-21 | Fixed. The seat text names the real zone, alerts queue, and every line is read from data. |
| BUG-22 | Fixed by removal (decision 11). There is no lounge legend and no "Phòng VIP" line. |
| BUG-23 | Fixed. The VIP alert renders only data. |
| BUG-24 | Fixed by the kit's `useBeep`: one AudioContext, and the on/off choice is saved per device. |
| BUG-25 | Fixed. Duty has edit, delete (refused while present) and undo, and presence can be cancelled (tests). |
| BUG-26 | Fixed. The desk is a typed number with one `DUTY_DESKS` registry. |
| BUG-27 | Fixed. The assignee starts empty and shows "Chưa phân công" (test). |
| BUG-28 | Fixed. The UI shows no fabricated time. Enums are exhaustive, the sequence is max+1, and in-progress and reopen exist (tests). The importer uses the event opening for an incident without a report time and reports it. |
| BUG-29 | Fixed. Times are stored as instants and shown in Vietnam time, with the date when not today. |
| BUG-30 | Fixed. The gift is never automatic and needs a check-in, also in the database. Cancel clears it, its undo restores the original gift time, and the KPI counts gifts among checked-in guests only. |
| BUG-31 | Fixed. The card is named "Đại biểu khác đã đến". |
| BUG-32 | Fixed. A print route renders A5 landscape, one pass per page, with declined VIPs excluded and the agency names from `orgIdentity(settings)`. |
| BUG-33 | Not applicable. The dead code was not ported. |
| BUG-34 | Fixed by the kit tabs. Sub-tab counts moved to the KPI cards, because `SubTab` has no count (feedback 4). |
| BUG-35 | Fixed. There is no horizontal scroll at 360 px on any tab (browser). |
| BUG-36 | Fixed. The action bar wraps at 360 px (browser). |
| BUG-37 | Fixed through the kit `Dialog`, `IconButton` and bound labels. Seat states are words. |
| BUG-38 | Fixed. Every string renders from state, from one source. |
| BUG-39 | Not applicable. The layout uses token classes only. |
| BUG-40 | Fixed by kit variants and one accent. |
| BUG-41 | Fixed. Each command checks `live.checkin` or `live.manage` on the event, and the nested owners check theirs (tests). |
| BUG-42 | Fixed. Data comes from the server render, and nothing seeds. |
| BUG-43 | Not applicable to live. No live action takes a backup; the backup policy is core's. |
| BUG-44 | Fixed with `matchesQuery` (test). |
| BUG-45 | Not applicable. The alert is a kit `Dialog`. |

## Product questions (m5 §7.4)

| Question | Resolution |
|---|---|
| VIP lounge tracking | Not built (decision 11). |
| Declined guests check in | Only after "Đại biểu đã từ chối. Vẫn check-in?", which is audited as its own action (decision 7). |
| Gift default | Not given by default, and a separate toggle (decision 8). |
| Car-pass fields | The legacy fields only (decision 9). |
| Walk-in zones | Staff pick the zone. The default is the first non-VIP zone with a free seat, and a VIP zone for a non-VIP guest needs a confirm (decisions 10 and 19). |
| QR format | `SCE-CHK:<eventId>:<guestId>`. Legacy payloads are accepted on scan only (decision 20). |

## Integration items

1. **guests.** Walk-ins are `guests.create` with `rsvpSource 'walk_in'` and the note "Đại biểu phát sinh đăng ký tại bàn lễ tân". Substitutes are `guests.update` to `substituted`. Deleting a guest relies on the FK cascade in Postgres; memoryDb has none, so `live.undoWalkIn` removes the check-in and the seat first.
2. **venue.** The walk-in passes an explicit seat code from `findFreeSeat(hall, taken, group, zoneKey)` and re-picks once itself. With venue's change request E, `'auto'` plus `preferredZone` would replace that.
3. **reports.** `liveKpis`, `dutyStatus`, `incidentCode` and the registries are exported from `@/features/live` if the daily report wants check-in, duty or incident figures.

## Contract change requests

- **A. Withdrawn.** A `confirmDeclined` field on `live.checkIn`. The confirmed path is the separate `live.checkInDeclined`, which also gives it a distinct audit action.
- **B. Withdrawn.** `substitutesForGuestId` on `GuestDraft`. BUG-15's intended behaviour checks in the invited record through `guests.update`. It is needed only if product wants a substitute as a second guest with its own seat or banquet.
- **C. Withdrawn.** An event `legacy_id` from progress. A legacy badge's event is matched through `deterministicIds.eventId`.
- **D. Real.** A `jsqr` dependency, used from the scan dialog when `BarcodeDetector` is missing (Safari on iOS, Firefox) to decode camera frames on a canvas.
- **E. Done inside live; venue's G stays open.** The old wording understated the problem. `live.restoreCheckIn` took the time, the desk and a gift flag from its payload. A desk user could create a check-in for a guest who never arrived, at any past time and with a gift, and the audit called it an undo. A declined guest was re-checked, but the gift time was set to the moment of the restore and the actor to the restorer. Live now keeps its own undo tokens in a live-owned table (Check-in model above), so it needs nothing from core for this.
- **F. Real, to core.** `useCommand` should refuse to send a mutation while `navigator.onLine` is false (decision 6) and say "Ngoại tuyến". Live blocks its own buttons, but a dialog that was open before the drop still sends through `useCommand`.
- **G. Real, to core.** `useCommand` should return the failure kind (or the whole failed result) rather than `undefined`. The desk could then word a server refusal (conflict) apart from a failed request.
- **H. Real, to the kit.** Export the shell's `useOnline` from `@/components/ui`. Live keeps a copy in `components/use-online.ts` until then.
- **I. Real, to the lead (`contract.ts` is frozen).** `matchScan`'s legacy branch that answers `other_event` for a legacy guest id known only under another legacy event cannot be reached through `live.scan`, which passes only this event's keys. Remove it, or let `live.scan` pass the other events' keys. A direct test pins its current behaviour.
- **J. Recommended, to core.** Check-in writes as SECURITY DEFINER RPCs (check in, check in declined, cancel, restore, gift) in `RpcMap`, `RPC_ALLOWLIST` and memoryDb, with direct INSERT, UPDATE and DELETE on `sce_tcsk_checkins` and the token table revoked from `authenticated`. Only that closes what the trigger cannot: see "What the database does not stop" below.

## Foundation feedback

1. **Audit API change on dev.** No live code calls `sce_tcsk_write_audit`. Every audit, partial failures included (a walk-in without a seat), is in the command's own returned summary, and nested steps audit through their owners.
2. **memoryDb does not run the incident `seq` trigger.** The command passes an explicit `seq` and retries on the unique key (five attempts), which works in both runtimes. The trigger's advisory-lock path never runs, in memory or in Postgres. A parallel-creates test covers five desks.
3. **`useCommand` refreshes the route after a query.** Each `live.scan` re-renders the page. A `refresh: false` option would save one render per scan.
4. **`SubTab` has no count**, so the legacy sub-tab badges ("4/10") are not possible.
5. **No scanner primitive in the kit.** The `<video>` viewfinder and its states are hand-rolled in `scan-dialog.tsx` (ui-rules 21).
6. **`useBeep` has no vibration.** Live adds `navigator.vibrate` behind the same `sce_beep` preference.
7. **`FilterBar` has no Enter handler.** The desk wraps it in a `<form>` to submit on Enter.
8. **A no-op mutation must still audit.** A repeat scan therefore writes a "QUÉT LẠI CHECK-IN … không thay đổi" row, as venue's `assignSeat` does.
9. **Console error on 404 pages** ("Encountered a script tag") appears for `user:PTDN` on `/live`, as venue reported.
10. **The dev event is eight working days out**, so every presence in dev reads as on time. The tests cover lateness.

## What the database does not stop

`202611041510_live_checkin_guard.sql` holds a signed-in user who writes `sce_tcsk_checkins` or the token table through PostgREST with the publishable key. Such a user cannot record a check-in or a gift at a time other than now (2 minutes back, 1 minute ahead), cannot sign a check-in as someone else, cannot move a check-in (time, actor, desk and gift) onto another guest by changing its `guest_id`, and cannot record a gift without a check-in. An earlier time, desk, gift time or another user's id is accepted only from an undo token that the same user consumed in the last 2 minutes. A token must copy a check-in that exists when it is written, expires within 15 minutes, and is consumed once. The brief asked for "no backdating beyond the event's day window". The trigger refuses any backdating that does not come from a token, which is stricter. Rows written without a user (the importer under the service role) and a backup restore pass unchecked.

What a direct write still does, because only an RPC could stop it (change request J):

- It checks in a declined guest without the decision-7 confirmation, and writes no audit row. The time and the actor are true.
- It checks in, cancels or records a gift for any guest of an event the user may check in on, with no audit row.
- It deletes a check-in, or a token, with no audit row.
- It copies a check-in into a token and restores it under the same user within the windows. That writes back the same values the check-in already had, so nothing is forged.

The trigger also trusts the app server's clock: the app stamps the check-in time itself, and the database accepts it from 2 minutes before to 1 minute after its own `now()`. An app server whose clock runs more than 2 minutes behind the database, or more than 1 minute ahead of it (network delay eats into the behind side), has every check-in refused. Such a refusal carries its own SQLSTATE (22008, constraint name `live_clock_skew`, which core's `translatePgError` reads as a constraint), not 42501, and the check-in, gift and walk-in commands answer "Đồng hồ máy chủ lệch so với cơ sở dữ liệu…" instead of a permission error. A person who forges a time gets the same answer, since the database cannot tell the two apart.

## Not verified

- RLS and SQL on a real Supabase. The check-in guard and the token table ran on PGlite (`checkin-guard.sql.test.ts`, `pnpm verify:sql`), not on Supabase. The incident `seq` race under Postgres is covered only by the unique key in memoryDb.
- The offline state was tested with a mocked `navigator.onLine`, not by dropping a device's network.
- Realtime between two browsers. `useEventChanges` is a no-op in dev memory mode.
- A real camera. Headless Chrome has none, so only the waiting state was seen. `BarcodeDetector` decoding is untested on a device.
- A hardware scanner. The keyboard wedge was simulated with typed text plus Enter.
- Paper output. Only the screen preview of the A5 car pass was checked.
