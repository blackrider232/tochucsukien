# Status: feature `venue` (M4b, Hội trường, Sơ đồ chỗ ngồi, Gian hàng Hội chợ)

Branch `t3/venue-halls-seating-booths`. The feature lives in `src/features/venue/`. Routes are `/admin/halls`, `/events/[eventId]/seating` (sub-tab of Khách mời), `/events/[eventId]/booths`, `/booths/list` and `/booths/schedule` (sub-tabs of Gian hàng Hội chợ), and the print pages `/events/[eventId]/seating/print` and `/events/[eventId]/booths/print`.

## What is built

- **Domain** (`domain/`). `halls.ts` is the one hall/zone/seat model (decision 19): `seatCodes`, `hallCapacity` (a sum, never stored), `zoneOfSeat`, `isVipSeat` (from the `vipZone` flag), `findFreeSeat`, `orphanSeats`, `zoneOccupancy`, `remapSeats`, `nextZone`, and the zone colour and target-group registries. `auto-assign.ts` is the seeded, pure auto-assign. `booths.ts` holds the booth status, subsidy and shift-state registries, the KPI formulas, the row layout and the filter. `schemas.ts` holds the zod schemas the forms and the commands share. `default-halls.ts` is the issued catalog as a typed table.
- **Data**. `202611040900_venue_hall_templates_seed.sql` seeds the three issued halls once (`on conflict do nothing`), rendered from `DEFAULT_HALL_TEMPLATES` with the importer's uuid v5 ids; `hall-seed.test.ts` fails when they drift (regenerate with `pnpm tsx src/features/venue/__tests__/generate-hall-seed.ts`). No other migration: the 0002 tables already carry the constraints.
- **Server** (`server/`). `tables.ts`, `reads.ts` (`listHallTemplates`, `hallTemplateUsage`, `readEventHall`, `readSeating`, `readBooths`, `readBoothShifts`), `upstream.ts` (the guests adapter), `screen-data.ts`, and `commands.ts` with 19 commands: the contract's `assignSeat` and `releaseGuestSeat`, plus `applySeats`, `autoAssign`, `clearSeats`, `releaseOrphans`, `setEventHall`, `updateEventZones`, `restoreEventHall`, four hall-template commands, three booth and three shift commands. Every mutation audits; every reversible one returns its inverse. A swap is one `applySeats` with two changes.
- **Seat writes**. Seats change only through `(seatCode, from, to)` changes. `checkSeatChanges` refuses a change when the seat no longer holds `from`, when the seat is not in the hall, and when a guest being seated is unknown, declined, or holds another seat that the same changes do not vacate. The unique keys rule out a double-assigned seat and a second seat per guest. There is no transaction, so a writer acting between the check and the write can still win a seat. `commitSeatChanges` then rolls the batch back and answers a Vietnamese conflict. When a deleted row cannot come back because its seat was taken meanwhile, that guest loses the seat, and the message and an audit row say so (review finding 2). Only a SQL function per batch closes this (change request F). The undo of `applySeats`, `assignSeat`, `autoAssign` and `clearSeats` is the reversed changes, minus seats the hall no longer has. `releaseOrphans` has no undo. The undo of a hall change (`restoreEventHall`) names the guest on each seat it frees and refuses when that seat now holds someone else.
- **Screens** (`components/`). Admin halls (KPIs, one list, editor with labelled zone rows, delete confirm naming the events that use the template, restore that keeps custom halls). Seating (zones of seat buttons in their zone colour, legend, counter, orphan alert with release, seat dialog with a searchable roster, change-hall and zone dialogs with seat counts, auto-assign with a mode and a per-zone result, clear-all, guest finder, print). Booths (KPIs, floorplan by row, list with search and filters and .xlsx export, duty schedule, booth and shift dialogs, print).
- **Legacy importer** (`server/legacy-importer.ts`) for `hallTemplates`, `eventHallConfig`, `eventSeating`, `eventBooths`, tested on `__tests__/fixtures/legacy-venue.json`.
- **Dev seed** (`server/dev-seed.ts`). The issued catalog as the migration seeds it, one `[DEV]` hall on the progress dev event, three booths and two shifts.
- **Tests** (`__tests__/`, 118). Capacity and seat-code math, zone validation and uniqueness, `findFreeSeat`, `zoneOccupancy`, `zoneOfSeat`, remap, auto-assign (seated guests kept, group zones first, VIP zone VIP-only, determinism, no double use), booth KPIs and filters. Commands through the real pipeline on `memoryDb`: every event command is denied to another department twice, through the emulated RLS and with RLS bypassed (`runWithoutRls`), writing nothing; hall templates denied to leader, dept_leader and user. Audit text and undo round trips, stale `from` conflicts, a second writer interleaved mid-command (seat batch, zone undo, two desks on `assignSeat 'auto'`), a hall undo against moved seats, direct `restoreEventHall` calls, the not-ready path, the importer fixture, and XSS payloads in hall, zone, guest, company and booth names on every screen. A mutation that swaps the seating permission for a global read makes 18 of these fail.

## Guests dependency

Feature `guests` is on `dev`. `server/upstream.ts` still turns a `not implemented` roster into `{ ready: false }`, which now happens only in tests that ask for it. The dev harness page and `server/harness-fixture.ts` are deleted. Seating was walked end to end in `SCE_DEV_MEMORY=1 pnpm dev` on the guests dev seed, through headless Chrome over CDP, at 360 and 1440 px in light and dark. The walk covered assign, swap, undo of the swap, release, auto-assign ("Chỉ xếp người chưa có ghế") and its undo, the declined guest never offered, the VIP warnings, and department scoping (XTDT and leader 200, PTDN and HCTC 404, an XTDT user's writes saved). The race and direct-call cases are proven by the command tests only.

Integration items for the owners of guests and live, as they stand on `dev`:

1. **guests calls `venue.releaseGuestSeat` when RSVP becomes declined.** Done on `guests.update` and `guests.applyRsvp` (`releaseSeatIfAny`). `guests.create` never seats, and `upsertMany` does not change RSVP on an existing guest. Delete relies on the FK cascade in Postgres. `memoryDb` has no cascade, so in dev and tests a deleted guest's seat row survives.
2. **Name cards use the zone's VIP flag.** guests' `vipSeatsOf` reads `zoneOfSeat(hall, code)?.vipZone`, which is what `isVipSeat` does. It works, but it is a copy of the rule; `isVipSeat` is the shared one.
3. **Seat links open `/events/<id>/seating`.** Not done. The guest list shows the seat code as text, and its "Chưa xếp" cell links nowhere.
4. **Live walk-in.** Not started in live. It should read `readEventHall` and `readSeating`, let staff pick the zone with `findFreeSeat(hall, taken, group, zoneKey)` (decision 10), confirm when `isVipSeat(hall, code)` holds for a non-VIP guest, and call `venue.assignSeat`. Until change request E lands, it passes the picked code. Only `'auto'` re-picks on a race.

## Bugs (m4b §6)

35 fixed (BUG-05 with a gap noted), 1 mostly fixed (BUG-17), 1 not applicable, 1 partly deferred.

| Bug | Result |
|---|---|
| BUG-01 | Fixed. Zone group labels are one module registry (`ZONE_GROUPS`); nothing is global. |
| BUG-02 | Fixed. Nothing seeds itself; empty booth and hall states say so. The importer skips demo booths, demo guests' seats and demo events. |
| BUG-03 | Fixed. Auto-assign defaults to "Chỉ xếp người chưa có ghế"; "Xếp lại toàn bộ" says it clears hand-placed VIPs and walk-ins. Tested. |
| BUG-04 | Fixed. Prefix and key are unique per hall, case-insensitive, in the shared schema; "Thêm khu vực" takes the first unused letter; the importer renames duplicates and reports them. |
| BUG-05 | Fixed, with a gap. A hall change offers keep-by-position or release with both counts; a zone shrink needs a confirm; orphan seats are listed with a release action; the importer reports them. Before review finding 1, undoing a hall change could evict a guest seated meanwhile. It now refuses instead. Without a transaction, a second writer racing the seat write can still cost one guest a seat, audited (findings 2, F). |
| BUG-06 | Fixed on the venue side. One seat table with unique (event, seat) and (event, guest); the roster's `seatCode` is a join. `releaseGuestSeat` exists for guests to call on decline (integration item 3). |
| BUG-07 | Fixed. React text everywhere, handlers bound in components. Tested with payloads. |
| BUG-08 | Fixed. Kit dialogs and toasts are text-only. |
| BUG-09 | Fixed. "Xếp chỗ" from the finder preselects the guest on `suggestSeat`'s seat (m4b §3.4), never an occupied one; the dialog says who moves or loses a seat; the command checks `from`. |
| BUG-10 | Fixed. Group zones fill before "all" zones, overflow never puts a non-VIP guest in a VIP zone, and the result counts each zone's final seats. |
| BUG-11 | Fixed. Capacity is the sum of the event's zones. A hall whose template is gone reads "Hội trường riêng của sự kiện (mẫu gốc không còn trong danh mục)". |
| BUG-12 | Fixed. The delete confirm names how many events use the template; their link is cleared (as the FK does) and they keep their zones. A stored name snapshot would need a column; the label above replaces it. |
| BUG-13 | Fixed. Name required, prefix `^[A-Z0-9]{1,4}-$`, seat count integer 1..500, in the form and the command. |
| BUG-14 | Fixed. One colour registry, each colour a kit Tone. |
| BUG-15 | Fixed. KPIs are counted from the catalog; numbers use `vi-VN`; the restore text names the three issued halls. |
| BUG-16 | Fixed. `/admin/halls` and the four template commands need `venue.halls.admin` (proxy, command, RLS). Tested for leader, dept_leader and user. |
| BUG-17 | Mostly fixed. Per-row writes, version guards on halls, booths and shifts, and the `from` guard on seats. Seat batches have no transaction: a write racing between check and commit is rolled back with a conflict, and when rollback cannot restore a seat, the loss is named and audited, not silent. Change request F closes it. |
| BUG-18 | Fixed. Planned is the booth count, "Còn trống" counts available booths, subsidies count placed booths, companies count confirmed booths once, officers come from shifts. |
| BUG-19 | Partly deferred. Shifts are persisted per event with create, edit, delete, undo and a status computed from the date. The officer is typed, not picked from profiles: no read of active profiles is public (change request A). |
| BUG-20 | Not applicable. "Nạp mẫu gian" is not built (decision 13). |
| BUG-21 | Fixed. Company is required unless the booth is "Gian còn trống", in form, command and DB. |
| BUG-22 | Fixed. One code per event, checked as you type and in the command, with a field error. |
| BUG-23 | Fixed. One status registry; unknown imported statuses become valid ones and are reported. |
| BUG-24 | Fixed. The event is the URL; the event layout 404s a deleted or invisible event. |
| BUG-25 | Fixed. .xlsx through the kit, Vietnamese status labels, text cells, file name from `fileNameStem` and the VN date; the list's "Xuất Excel" exports the filtered rows. |
| BUG-26 | Fixed. Status filter added; search folds diacritics. Filters live in the page and reset on another event. |
| BUG-27 | Fixed. A4 landscape print routes for the seat chart and the floorplan. |
| BUG-28 | Fixed. One hall list renderer; `badgeText` became `vipZone`; dead state and the unused sidebar badge are gone. |
| BUG-29 | Fixed. No fixed minimum width; grids reflow; checked at 360 px (the page stays 360 px wide; only the shell's own sub-tab bar scrolls inside itself). |
| BUG-30 | Fixed. Seat and booth tiles are buttons with an `aria-label` naming code, occupant and status; kit Dialog; status in text; every zone field labelled. |
| BUG-31 | Fixed. One label per enum, one primary action per view, sentence case. |
| BUG-32 | Fixed on the venue side. `isVipSeat` reads the zone flag; name cards must use it (integration item 5). |
| BUG-33 | Fixed. Searchable picker, attending first, declined never offered, group, RSVP and current seat shown. |
| BUG-34 | Fixed. Selectors are pure; an event hall exists only after `setEventHall`. |
| BUG-35 | Fixed. The duty officer field starts blank. |
| BUG-36 | Fixed. One band per row, sorted by number. |
| BUG-37 | Fixed. Restore upserts the issued halls by id and keeps custom ones. Tested. |
| BUG-38 | Fixed. The three booth views are manifest sub-tabs with their own routes. |

## Product questions (m4b §7.3)

| Question | Resolution |
|---|---|
| Auto-assign keeps existing seats | Yes by default ("Chỉ xếp người chưa có ghế"); "Xếp lại toàn bộ" is the explicit alternative. |
| Overflow into the VIP zone | Never for a non-VIP guest. A VIP may overflow into other zones. A walk-in (`findFreeSeat`, decision 10) defaults to the first non-VIP zone with a free seat. VIP zones are used only for a VIP guest once the other zones are full, or when staff pick that zone. |
| VIP seat order by rank | Random within the zone, as today. Staff place protocol seats by hand; auto-assign keeps them. |
| Pending or declined seatable | Pending yes (listed under "Chưa xác nhận"); declined no. |
| Template edits propagate | No. Events keep their copy; the editor says so. |
| Officers add or remove zones per event | No. Per event: name, group, seat count and VIP flag. Structure changes go through the catalog and a hall change. |
| Booths only for `hoi_cho` | No restriction; the event is the URL. |
| Enterprise entity | Free-text company, as today. |
| `plannedBooths` target | Not stored. Planned is the booth count; an empty planned booth is a booth with status "Gian còn trống". |
| Subsidy tiers | 0, 50, 100 only (DB check). Wording kept from the form. |
| Who edits booths, status history | `venue.booths.write` by department (matrix). No history; the audit log records each change. |
| Shift dates | A date per shift plus a free-text time range; the state is computed. |
| Stage chips per hall | Static text under the stage bar. |
| Labels | Spec wording in sentence case (ui-rules 18). The manifest header titles stay as the foundation wrote them. |

## Foundation feedback

1. **`pnpm dev` exits when its stdin closes.** Started from a non-interactive shell it served a few requests and exited with code 0. `tail -f /dev/null | SCE_DEV_MEMORY=1 pnpm dev` keeps it up. Worth a line in `dev-runtime.md`.
2. **Console error on 404 pages.** "Encountered a script tag while rendering React component" appears on any not-found page (a progress `/events/<unknown>/plan` reproduces it). The source is the inline theme script of the root layout.
3. **No public read of profiles.** The duty officer cannot be picked from users (m4b BUG-19). Change request A.
4. **Legacy importers read earlier importers through their exports.** Venue takes its events from progress's `legacyImporter.plan`, as guests does. It takes guests from guests' `legacyGuestIndex`, and RSVP from guests' plan. Each dependent importer re-runs its upstream plan, which is cheap at legacy sizes.
5. **A no-op mutation must still audit.** `assignSeat` on a guest who keeps the seat, and `releaseGuestSeat` without a seat, write an audit row each, because the pipeline throws on a mutation without audit.
6. **`memoryDb` has no foreign keys.** `deleteHallTemplate` clears event-hall links itself so tests and dev match `ON DELETE SET NULL`; seat-to-guest FKs are not enforced in tests.
7. **Kit gaps.** `Badge` is no-wrap, so a long label overflows a phone (the zone chip is now a prefix badge plus text). There is no tone surface utility, so a seat tile carries its zone colour through a `Badge` only. `Combobox` opens only on typing or ArrowDown, not on focus or click, so the picker's hint says so.
8. **`findFreeSeat`'s contract comment** says "zone with assignedGroup = group, then 'all', then any zone". The implementation now follows decision 10 and takes an optional `preferredZone`. The m5 spec's "group first" walk-in order lost to the decision. Change request D.
10. **No transaction for multi-row writes.** A seat batch is delete-then-insert through the table API, with compensation in venue code. Change request F.
11. **Undo payloads come back from the client.** `restoreEventHall` re-checks every seat, but a seating writer can still send any valid zone list as `hall`, a structure change that `updateEventZones` refuses. Change request G.
9. **T3 preview tools** could not snapshot from this delegate (hidden tab, timeouts); verification used headless Chrome over CDP instead.

## Contract change requests

- **A. Real.** core: a read such as `listActiveProfiles(ctx): { id, fullname, department }[]`, so booth shifts can set `officerUserId` from a picker.
- **B. Avoidable, withdrawn.** guests exports `legacyGuestIndex` through `@/features/guests/server`. The venue importer uses it (finding 6a).
- **C. Avoidable, withdrawn.** progress exports `legacyImporter`. Venue reads the imported events from its plan (finding 6b).
- **D. Real.** `venue/contract.ts`: give `findFreeSeat` the optional fourth parameter and this comment: "Decision 10. `preferredZone` (a zone key, chosen by staff): its first free seat, a VIP zone included, else null. Without it: the first non-VIP zone with a free seat; a VIP guest falls back to VIP zones when the others are full." The stub signature becomes `findFreeSeat(hall, taken, group, preferredZone?: string)`.
- **E. New.** `venue/contract.ts`: `'venue.assignSeat': Sig<{ eventId; guestId; seatCode: SeatCode | 'auto'; preferredZone?: string; confirmVip?: boolean }, SeatAssignment | null>`. Then `'auto'` takes the staff's zone and keeps its one re-pick, and a non-VIP guest is refused a VIP zone unless `confirmVip`. This cannot be added outside the frozen contract, because a second `CommandMap` declaration of the same id must have the same type.
- **F. New.** core: an allowlisted SQL function per seat batch, so check and write share one transaction. `sce_tcsk_apply_seat_changes(p_event_id uuid, p_changes jsonb) returns setof sce_tcsk_seat_assignments`, where `p_changes` is `[{ "seat_code": text, "from_guest": uuid|null, "to_guest": uuid|null }]`. It runs with the caller's rights (RLS applies) and locks the event's seat rows (`select … for update`). It raises `conflict` when a seat does not hold `from_guest`. It deletes the vacated rows, inserts the new ones, and returns them. RpcMap entry: `{ args: { eventId: EventId; changes: ReadonlyArray<SeatChange> }; result: ReadonlyArray<SeatAssignment> }`. `commitSeatChanges` and its compensation would then go away, and `writeHall` would need a sibling `sce_tcsk_apply_hall_change(p_event_id uuid, p_version int, p_hall jsonb, p_changes jsonb)` for hall plus seats in one transaction.
- **G. New.** core: keep each inverse on the server and hand the client an opaque undo token, so `restoreEventHall` becomes undo-only by construction.
- **H. New.** core: the pipeline writes an audit entry carried by a thrown `CommandError` (guests change request 6). A seat batch that lost a seat (`commitSeatChanges`) then throws its entry. Until then it calls `sce_tcsk_audit_command` itself with `seating.perm`, the permission of every command that reaches it, since users can no longer execute the raw `sce_tcsk_write_audit` (core finding 2).

## Review fixes (PASS WITH FIXES)

- Finding 1 (high), hall undo evicted a guest seated meanwhile: `0d847e4`.
- Finding 2 (medium), seat batch raced between delete and insert; zone undo half-applied: `d8b7f68` (batch), `0d847e4` (hall put back).
- Finding 3 (medium), `restoreEventHall` bypassed seat rules on a direct call: `0d847e4`. The VIP rule applies to automatic placement only. A direct call may put a non-VIP guest in a VIP zone, as the seat dialog may (with its warning).
- Finding 4 (medium), two desks on `assignSeat 'auto'`: `cc67eea`.
- Finding 5, walk-in default against decision 10: `2b93e47`.
- Finding 6a to 6c, importer guest ids, event rule, declined seats: `d828682`. Finding 6d, harness deleted: `cb8f829`.
- Finding 7, surviving mutations (booth delete audit action, orphan filter in `reverse()`): `4c8d6f0`. Each new assertion failed under its mutation.
