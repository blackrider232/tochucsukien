# Status: feature `venue` (M4b, Hội trường, Sơ đồ chỗ ngồi, Gian hàng Hội chợ)

Branch `t3/venue-halls-seating-booths`. The feature lives in `src/features/venue/`. Routes are `/admin/halls`, `/events/[eventId]/seating` (sub-tab of Khách mời), `/events/[eventId]/booths`, `/booths/list` and `/booths/schedule` (sub-tabs of Gian hàng Hội chợ), and the print pages `/events/[eventId]/seating/print` and `/events/[eventId]/booths/print`. `/events/[eventId]/seating/harness` is a dev-only fixture page (404 outside the dev memory runtime).

## What is built

- **Domain** (`domain/`). `halls.ts` is the one hall/zone/seat model (decision 19): `seatCodes`, `hallCapacity` (a sum, never stored), `zoneOfSeat`, `isVipSeat` (from the `vipZone` flag), `findFreeSeat`, `orphanSeats`, `zoneOccupancy`, `remapSeats`, `nextZone`, and the zone colour and target-group registries. `auto-assign.ts` is the seeded, pure auto-assign. `booths.ts` holds the booth status, subsidy and shift-state registries, the KPI formulas, the row layout and the filter. `schemas.ts` holds the zod schemas the forms and the commands share. `default-halls.ts` is the issued catalog as a typed table.
- **Data**. `202611040900_venue_hall_templates_seed.sql` seeds the three issued halls once (`on conflict do nothing`), rendered from `DEFAULT_HALL_TEMPLATES` with the importer's uuid v5 ids; `hall-seed.test.ts` fails when they drift (regenerate with `pnpm tsx src/features/venue/__tests__/generate-hall-seed.ts`). No other migration: the 0002 tables already carry the constraints.
- **Server** (`server/`). `tables.ts`, `reads.ts` (`listHallTemplates`, `hallTemplateUsage`, `readEventHall`, `readSeating`, `readBooths`, `readBoothShifts`), `upstream.ts` (the guests adapter), `screen-data.ts`, and `commands.ts` with 19 commands: the contract's `assignSeat` and `releaseGuestSeat`, plus `applySeats`, `autoAssign`, `clearSeats`, `releaseOrphans`, `setEventHall`, `updateEventZones`, `restoreEventHall`, four hall-template commands, three booth and three shift commands. Every mutation audits; every reversible one returns its inverse. A swap is one `applySeats` with two changes.
- **Seat writes**. Seats change only through `(seatCode, from, to)` changes. The command refuses a change when the seat no longer holds `from`, and when a guest being seated holds another seat that the same changes do not vacate. So a double-assigned seat, a second seat per guest and a silent eviction cannot happen, and the undo of any seat command is the reversed changes.
- **Screens** (`components/`). Admin halls (KPIs, one list, editor with labelled zone rows, delete confirm naming the events that use the template, restore that keeps custom halls). Seating (zones of seat buttons in their zone colour, legend, counter, orphan alert with release, seat dialog with a searchable roster, change-hall and zone dialogs with seat counts, auto-assign with a mode and a per-zone result, clear-all, guest finder, print). Booths (KPIs, floorplan by row, list with search and filters and .xlsx export, duty schedule, booth and shift dialogs, print).
- **Legacy importer** (`server/legacy-importer.ts`) for `hallTemplates`, `eventHallConfig`, `eventSeating`, `eventBooths`, tested on `__tests__/fixtures/legacy-venue.json`.
- **Dev seed** (`server/dev-seed.ts`). The issued catalog as the migration seeds it, one `[DEV]` hall on the progress dev event, three booths and two shifts.
- **Tests** (`__tests__/`, 104). Capacity and seat-code math, zone validation and uniqueness, `findFreeSeat`, `zoneOccupancy`, `zoneOfSeat`, remap, auto-assign (seated guests kept, group zones first, VIP zone VIP-only, determinism, no double use), booth KPIs and filters. Commands through the real pipeline on `memoryDb`: every event command is denied to another department twice, through the emulated RLS and with RLS bypassed (`runWithoutRls`), writing nothing; hall templates denied to leader, dept_leader and user. Audit text and undo round trips, stale `from` conflicts, the not-ready path, the importer fixture, and XSS payloads in hall, zone, guest, company and booth names on every screen. A mutation that swaps the seating permission for a global read makes 18 of these fail.

## Guests dependency

`readRoster` (feature `guests`) still throws `not implemented` on this base. `server/upstream.ts` turns that error, and only that one, into `{ ready: false }`. Seating then shows the Alert "Danh sách khách mời chưa sẵn sàng", seat buttons are disabled, occupied seats read "đã xếp" without a name, and every command that seats a guest answers "Danh sách khách mời chưa sẵn sàng, nên chưa xếp chỗ được…" before any other check. `releaseGuestSeat`, the hall commands and every booth command work without guests. Unit tests mock `@/features/guests/server` with `__tests__/guest-fixture.ts`, which reads guest rows the tests insert into `sce_tcsk_guests`.

What remains to integrate when guests lands:

1. Nothing in venue code changes: the adapter returns the roster. Then delete `server/harness-fixture.ts`, the `seatingHarness` export and `(app)/events/[eventId]/seating/harness`.
2. Walk seating end to end in the browser with real guests: assign, move, swap, release, auto-assign both modes, clear-all and their undo. Today the browser shows these dialogs and their warnings on fixture guests, and saving shows the not-ready toast; the writes themselves are proven by the command tests only.
3. Guests must call `venue.releaseGuestSeat` on every path that sets RSVP to declined (m4b BUG-06). Delete is covered by the FK cascade in Postgres.
4. The guest list's seat chip and "Chưa xếp" link should open `/events/<id>/seating`, or use `findFreeSeat` the same way `SeatingView` does.
5. Name cards use `isVipSeat(hall, code)` for `isNamecardGuest` (m4b BUG-32).
6. The legacy guest id mapping must match (contract change request B).

## Bugs (m4b §6)

36 fixed, 1 not applicable, 1 partly deferred.

| Bug | Result |
|---|---|
| BUG-01 | Fixed. Zone group labels are one module registry (`ZONE_GROUPS`); nothing is global. |
| BUG-02 | Fixed. Nothing seeds itself; empty booth and hall states say so. The importer skips demo booths, demo guests' seats and demo events. |
| BUG-03 | Fixed. Auto-assign defaults to "Chỉ xếp người chưa có ghế"; "Xếp lại toàn bộ" says it clears hand-placed VIPs and walk-ins. Tested. |
| BUG-04 | Fixed. Prefix and key are unique per hall, case-insensitive, in the shared schema; "Thêm khu vực" takes the first unused letter; the importer renames duplicates and reports them. |
| BUG-05 | Fixed. A hall change offers keep-by-position or release with both counts; a zone shrink needs a confirm; orphan seats are listed with a release action; the importer reports them. |
| BUG-06 | Fixed on the venue side. One seat table with unique (event, seat) and (event, guest); the roster's `seatCode` is a join. `releaseGuestSeat` exists for guests to call on decline (integration item 3). |
| BUG-07 | Fixed. React text everywhere, handlers bound in components. Tested with payloads. |
| BUG-08 | Fixed. Kit dialogs and toasts are text-only. |
| BUG-09 | Fixed. "Xếp chỗ" from the finder preselects the guest on `findFreeSeat`'s seat, never an occupied one; the dialog says who moves or loses a seat; the command checks `from`. |
| BUG-10 | Fixed. Group zones fill before "all" zones, overflow never puts a non-VIP guest in a VIP zone, and the result counts each zone's final seats. |
| BUG-11 | Fixed. Capacity is the sum of the event's zones. A hall whose template is gone reads "Hội trường riêng của sự kiện (mẫu gốc không còn trong danh mục)". |
| BUG-12 | Fixed. The delete confirm names how many events use the template; their link is cleared (as the FK does) and they keep their zones. A stored name snapshot would need a column; the label above replaces it. |
| BUG-13 | Fixed. Name required, prefix `^[A-Z0-9]{1,4}-$`, seat count integer 1..500, in the form and the command. |
| BUG-14 | Fixed. One colour registry, each colour a kit Tone. |
| BUG-15 | Fixed. KPIs are counted from the catalog; numbers use `vi-VN`; the restore text names the three issued halls. |
| BUG-16 | Fixed. `/admin/halls` and the four template commands need `venue.halls.admin` (proxy, command, RLS). Tested for leader, dept_leader and user. |
| BUG-17 | Fixed. Per-row writes, version guards on halls, booths and shifts, and the `from` guard on seats. |
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
| Overflow into the VIP zone | Never for a non-VIP guest. A VIP may overflow into other zones. `findFreeSeat` follows the same rule. |
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
4. **Legacy importers cannot see what earlier importers planned.** Venue mirrors progress's rules for which events are imported (first of each id, dated, not demo) so its rows do not break the FK. Change request C.
5. **A no-op mutation must still audit.** `assignSeat` on a guest who keeps the seat, and `releaseGuestSeat` without a seat, write an audit row each, because the pipeline throws on a mutation without audit.
6. **`memoryDb` has no foreign keys.** `deleteHallTemplate` clears event-hall links itself so tests and dev match `ON DELETE SET NULL`; seat-to-guest FKs are not enforced in tests.
7. **Kit gaps.** `Badge` is no-wrap, so a long label overflows a phone (the zone chip is now a prefix badge plus text). There is no tone surface utility, so a seat tile carries its zone colour through a `Badge` only. `Combobox` opens only on typing or ArrowDown, not on focus or click, so the picker's hint says so.
8. **`findFreeSeat`'s contract comment** says "then any zone"; decision 10 and m4b §3.4 exclude VIP zones for non-VIP guests, which the implementation does. Change request D.
9. **T3 preview tools** could not snapshot from this delegate (hidden tab, timeouts); verification used headless Chrome over CDP instead.

## Contract change requests

- **A.** core: a read such as `listActiveProfiles(ctx): { id, fullname, department }[]`, so booth shifts can set `officerUserId` from a picker.
- **B.** guests: export or agree the legacy guest id. Venue's importer writes `guest_id = ids.idFor('Guest', legacyGuestId, legacyEventId)`; the guests importer must derive the same id or seats will not join.
- **C.** core/legacy: pass the planned event ids (or earlier batches) to dependent importers, replacing the mirrored rules in item 4.
- **D.** `venue/contract.ts`: change the `findFreeSeat` comment to "…then any zone; a VIP zone only for a VIP guest".
