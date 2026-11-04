# Status: feature `live` (M5, Điều hành hiện trường)

The feature lives in `src/features/live/`. Routes are `/events/[eventId]/live` (Bàn lễ tân check-in), `/live/duty` (Phân công ca trực), `/live/incidents` (Sổ xử lý sự cố) and `/live/monitor` (Giám sát chỗ ngồi), plus the print page `/events/[eventId]/live/car-pass` under `(print)`.

## What is built

- **Domain** (`domain/`). `desk.ts` holds the desk search (`filterDesk`), the header KPIs (`liveKpis`), the hall monitor (`monitorZones`, over venue's `zoneOccupancy` and `seatCodes`), `seatLabel`, `formatAt` and the car-pass list. `duty.ts` holds the one desk registry (`DUTY_DESKS`), `dutyRequiredAt` and `dutyStatus`. `incidents.ts` holds the urgency and status registries, `incidentCode`, `nextIncidentSeq`, the sort and the allowed status changes. `schemas.ts` holds the zod rules that the forms and the commands share.
- **Server** (`server/`). `tables.ts` and `reads.ts` hold `readCheckIns`, `readDutyStaff` and `readIncidents`. There are 19 commands, split by subject: `checkin-commands.ts`, `arrival-commands.ts` (walk-in, substitute), `duty-commands.ts` and `incident-commands.ts`. `command-kit.ts` holds the permission rules and the one guest read (`readRoster`). `commands.ts` declares the extra verbs and builds the record. `screen-data.ts`, `legacy-importer.ts` and `dev-seed.ts` complete the server.
- **Check-in model.** A check-in is its own row in `sce_tcsk_checkins`, unique per (event, guest). No live command writes the guest row.
  - `live.checkIn` is a set, not a toggle. A repeat scan answers `already` with the first time, writes an audit row that says nothing changed, and has no undo.
  - When two desks race, the unique key decides. The losing desk re-reads and is told the winner's time.
  - Undo is the separate `live.undoCheckIn`. It refuses when the check-in it would remove is no longer that guest's check-in.
  - `live.cancelCheckIn` comes from the row menu after a confirm. Its undo, `live.restoreCheckIn`, re-checks the check-in rules.
  - A declined guest is refused by `live.checkIn` and is checked in only through `live.checkInDeclined`, the confirmed path of decision 7, which has its own audit action. `live.setGift` is the separate welcome-pack toggle of decision 8, for checked-in guests only.
- **Scan.** `live.scan` is a query that runs the contract's `matchScan` against the roster as it is now. Every code goes through `@/core/checkin-code`, and a typed short code must equal `checkin_code` exactly. A legacy badge (`SCE-CHK:<evt_…>:<gst_…>` or `SCE-CHECKIN:…`) resolves when `deterministicIds.eventId(legacyEventId)` is this event, so no event `legacy_id` read is needed. A badge of another event answers `other_event` with that event's name when the actor can see it.
- **Arrivals.**
  - `live.walkIn` checks the duplicate (`guestIdentityKey`), the hall, the zone, the VIP-zone confirmation and a free seat before the first write. It then calls `guests.create`, `venue.assignSeat` with the seat `findFreeSeat(…, zoneKey)` picked, `live.checkIn` and optionally `live.setGift`. Each nested step is permission-checked and audited by its owner.
  - When another desk takes the seat, the next free seat of the zone is tried once. If none is left, the guest is still checked in, and the result and the audit say there is no seat.
  - The client id makes a retry converge on one guest. The undo, `live.undoWalkIn`, takes back the check-in, the seat and the guest in that order, and only while the guest is unedited.
  - `live.checkInSubstitute` marks the invited guest `substituted` with the attendee's name through `guests.update`, then checks in that same record, which keeps its seat. Its undo is `live.undoSubstitute`.
- **Duty and incidents.**
  - Presence is always the server clock. `setDutyPresence` audits "đúng giờ" or "trễ n phút" against `dutyRequiredAt(event, settings)`, which is the event opening in Vietnam time minus `fieldPresenceHours`. A present staff member cannot be deleted. Undoing "Hủy điểm danh" records the arrival time at the moment of the undo, never a time from the client.
  - An incident's `seq` is one above the highest. The unique (event, seq) key turns two simultaneous reports into a retry. Status moves through `INCIDENT_TRANSITIONS`, and "resolved" takes a note (default "Đã kiểm tra và xử lý thành công."). Deleting is only the undo of a report nobody acted on.
- **Screens** (`components/`). `LiveScreen` holds the shared action bar (Quét mã QR check-in, Khách phát sinh, Báo sự cố, In thẻ xe VIP), the realtime state (`useEventChanges` over the five tables, with a "Tải lại số liệu" button when not connected) and the four KPI cards, then the sub-tab.
  - `DeskProvider` is the one check-in path for every entry point. It handles the declined confirm, sound and vibration (`useBeep` plus `navigator.vibrate`, behind the `sce_beep` pref), the toasts, the queued VIP alert and the "nhiều đại biểu khớp" picker.
  - The desk search folds tones. Enter sends a code to the scanner path, or checks in the only visible match.
  - The scan dialog has a real `BarcodeDetector` camera with every permission and support state put into words, and a typed field that a USB or Bluetooth scanner fills. It stays open between scans.
  - The other screens are the walk-in dialog (Khách mới, Người đi thay), the duty roster with its desk summary and dialog, the incident log with its dialog, the read-only seat monitor and the A5 car pass.
- **Importer.** Check-in fields on `eventGuests` come through guests' `legacyCheckins`. `HH:MM:SS` keeps its seconds on the event day in Vietnam time.
  - The four check-ins the legacy seeder faked are recognised by their exact time and staff name and skipped. So are `duty_01..04` and `sc_01/02`.
  - A gift without a check-in, or a check-in time that cannot be read, is reported, not invented.
  - `eventDutyRoster` reads the desk from "Bàn n". `eventIncidents` takes `seq` from "SC-NN" and gives a duplicate or missing code the next number. Each change is reported.
- **Dev seed.** Three fake duty staff (one present, one with a markup name) and one open incident on progress's dev event. It never creates a guest check-in.
- **Tests** (`__tests__/`, 81).
  - Check-in: idempotency, undo and redo, an undo refused after another desk re-checked in, two desks interleaved on one badge, and the declined refusal writing neither a row nor an audit, then the confirm path.
  - Cancel, restore and gift rules.
  - Every `matchScan` outcome through `live.scan`, including legacy badges and short or partial codes.
  - Walk-in: seat, VIP confirm, a full zone refused before any write, the duplicate refusal, retry convergence, a seat raced away, the zone filled meanwhile, undo, and a forbidden nested owner. Substitute and its undo.
  - The 2-hour rule as a table across the time-zone and midnight boundaries, and the presence audit text.
  - The incident sequence under interleaved creates, its lifecycle and undo.
  - Every command refused to `user` of another department with RLS bypassed (`runWithoutRls`) and through RLS, with nothing written. Swapping the check-in rule for a global read makes this fail.
  - The importer fixture, KPI and monitor math against the venue model, and XSS payloads on all four tabs and the car pass.

## Bugs (m5 §6)

38 fixed, 6 not applicable, 1 partly deferred.

| Bug | Result |
|---|---|
| BUG-01 | Fixed. Nothing seeds a check-in. The importer skips the seeder's four fingerprinted check-ins (test). The dev seed has none. |
| BUG-02 | Fixed. Empty roster and empty log show empty states. The importer skips `duty_01..04` and `sc_01/02`. |
| BUG-03 | Fixed. The target is `event.targetGuests`. |
| BUG-04 | Fixed. "Chưa đến" counts attending guests not checked in (test). |
| BUG-05 | Fixed. One row per guest with a unique key, no whole-blob write, and the two-desk race is tested. Realtime refresh goes through `useEventChanges`. |
| BUG-06 | Fixed. A human code or phone must match exactly. A shared phone opens a pick list (test). |
| BUG-07 | Fixed. A canonical code of another event, and a legacy badge whose uuid v5 event differs, answer `other_event` with the event name (test). |
| BUG-08 | Fixed. A repeat scan reports "đã check-in lúc …" and never cancels (test, browser). |
| BUG-09 | Fixed. Monitor tiles are read-only text (test). Cancel lives in the row menu behind a confirm. |
| BUG-10 | Partly deferred. There is a real camera where `BarcodeDetector` exists, honest states otherwise, and the typed or wedge field always. No viewfinder is ever faked. Browsers without `BarcodeDetector` (Safari on iOS, Firefox) have no camera decode until a JS decoder is allowed (change request D). |
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
| BUG-30 | Fixed. The gift is never automatic and needs a check-in. Cancel clears it, and the KPI counts gifts among checked-in guests only. |
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
- **E. Real, shared with venue's G.** Server-kept undo tokens. `live.restoreCheckIn` takes the original time from the undo payload. It refuses a future time and the audit names the time, but a crafted payload could restore an earlier time.

## Foundation feedback

1. **Audit API change on dev.** No live code calls `sce_tcsk_write_audit`. Every audit, partial failures included (a walk-in without a seat), is in the command's own returned summary, and nested steps audit through their owners.
2. **memoryDb does not run the incident `seq` trigger.** The command passes an explicit `seq` and retries on the unique key, which works in both runtimes. The trigger's advisory-lock path goes unused.
3. **`useCommand` refreshes the route after a query.** Each `live.scan` re-renders the page. A `refresh: false` option would save one render per scan.
4. **`SubTab` has no count**, so the legacy sub-tab badges ("4/10") are not possible.
5. **No scanner primitive in the kit.** The `<video>` viewfinder and its states are hand-rolled in `scan-dialog.tsx` (ui-rules 21).
6. **`useBeep` has no vibration.** Live adds `navigator.vibrate` behind the same `sce_beep` preference.
7. **`FilterBar` has no Enter handler.** The desk wraps it in a `<form>` to submit on Enter.
8. **A no-op mutation must still audit.** A repeat scan therefore writes a "QUÉT LẠI CHECK-IN … không thay đổi" row, as venue's `assignSeat` does.
9. **Console error on 404 pages** ("Encountered a script tag") appears for `user:PTDN` on `/live`, as venue reported.
10. **The dev event is eight working days out**, so every presence in dev reads as on time. The tests cover lateness.

## Not verified

- RLS and SQL on a real Supabase. The incident `seq` race under Postgres is covered only by the unique key in memoryDb.
- Realtime between two browsers. `useEventChanges` is a no-op in dev memory mode.
- A real camera. Headless Chrome has none, so only the waiting state was seen. `BarcodeDetector` decoding is untested on a device.
- A hardware scanner. The keyboard wedge was simulated with typed text plus Enter.
- Paper output. Only the screen preview of the A5 car pass was checked.
