# Status: feature `guests` (M4a, Khách mời)

Branch `t3/guests-module-rewrite`. The feature lives in `src/features/guests/`. Routes are `/events/[eventId]/guests` (list), `/events/[eventId]/guests/namecards` (print studio) and `/events/[eventId]/guests/print` (under `(print)`).

## What is built

- **Domain** (`domain/`). `roster.ts` holds every selector: `guestKpis`, `quotaProgress`, `printSets`, `isNamecardGuest`, `isBanquetGuest`, `guestIdentityKey` (the one identity rule), `filterGuests` and `rsvpTransition`. `guestQuota` (decision 2) is re-exported from `@/core/settings` as the one quota. `schemas.ts` holds the zod field rules the form and the commands share. `export.ts` builds the styled guest-list workbook. `print.ts` holds the print themes, sizes and URLs.
- **Server** (`server/`). `tables.ts` and `reads.ts` hold `readRoster`, `readRosterEntry` and `readLegacyGuestIds`. `commands.ts` holds create, update, delete, restore, applyRsvp, upsertMany, markInvited and `undoRsvp` (the inverse of a decline that freed a seat, declared beside the contract's commands). Every mutation is audited, and those a person can take back return an inverse. `legacy-importer.ts` imports `eventGuests` and exports `legacyGuestIndex`, `legacyCheckins` and `legacyEmailStatuses` for venue, live and comms. `dev-seed.ts` adds fake guests to progress's dev event. `screen-data.ts` builds what the screens get.
- **Screens** (`components/`). The guest page has four KPI cards and their four pop-ups, a filtered and sortable table, the RSVP and delete row menu (confirm, then undo), the add/edit dialog and the xlsx export. The print studio previews table tents and QR badges. The print sheets print A4 at true size, one tent per landscape sheet and four badges per portrait sheet, with a theme picker that never prints.
- **Tests** (`__tests__/`, 99). They cover quota rounding (9 cases for the shared function, and the feature's own `quotaProgress` where ceil, round and floor differ), KPI and print-set selectors, identity, search, every command with audit text and undo round trips, and seat release and re-seating through a stand-in venue that can also refuse a release. Every command is refused to an actor who may read but not write (a stub of `can`, because every role holds both grants), `upsertMany` is timed (2000 items into 3000 guests under 1 s) and compared with a pairwise key comparison on random imports, and `applyRsvp` is tested on both sides of its staleness boundary. Every verb is denied to an outsider twice: once through RLS, and once with RLS bypassed (`runWithoutRls`), so the command's own `authorize` is what refuses. There are also the importer fixture, the xlsx read back with exceljs (layout, labels, signature, and `=`/`+`/`-`/`@`/TAB/CR cells as plain string cells with no apostrophe), XSS rendering, and the QR round trip through `parseScannedCode`.
- **Browser** (`SCE_DEV_MEMORY=1 pnpm dev`, headless Chrome). Checked at 1440 and 360 px, light and dark, as admin, `user:XTDT` and `user:PTDN`. The run covered add with validation errors, edit, RSVP, delete then undo, the four pop-ups and the xlsx download read back. The print sheets were rendered to PDF: 2 tents gave 2 landscape pages, 6 badges gave 2 portrait pages. A chuyên viên of another department gets 404 on the list and on the print sheet.

## Bugs (m4a §6)

30 fixed, 5 not applicable, 24 deferred to their owners.

| Bug | Result |
|---|---|
| B01 | Deferred to comms (Google Form responses table). Guests render every field as React text. |
| B02 | Fixed on the guests side: guest names, titles, organizations and emails render as text on every guest screen (test). The recipient list and the token storage are comms. |
| B03 | Deferred to comms (mail merge). |
| B04 | Fixed on the guests side: a guest email must pass `parseEmail` (no CR/LF, no display name) in the form, the commands and the importer. Composing `To:` is comms. |
| B05, B06, B07, B08 | Deferred to comms (dispatch log, Google profile, sender mailboxes, Gmail token). |
| B09 | Fixed. There are no string handlers. Rows act through React callbacks keyed by uuid. |
| B10 | Fixed. Nothing seeds a guest. An empty list is a valid state. The only fixture is `devSeed` in dev memory mode (decision 13). |
| B11 | Fixed by removal. There is no "Nạp mẫu chuẩn" (decision 13). |
| B12 | Deferred to comms (sandbox send, decision 16). |
| B13 | Fixed. The badge QR is `encodeCheckinPayload(eventId, guestId)` from `@/core/checkin-code`. A test decodes it with `parseScannedCode` and compares the drawn matrix. |
| B14 | Deferred to comms (simulated responses). |
| B15 | Fixed in `guests.applyRsvp`. A response not strictly newer than `rsvpAt` (a staff edit or an earlier response, or one made at the same instant) is ignored, and banquet changes only when the response answers it. |
| B16 | Deferred to comms (column mapping). |
| B17 | Fixed on the guests side: `applyRsvp` turns confirmed with a named substitute into substituted, and refuses substituted when no substitute is named (in the response or already on the guest). Parsing the answer text is comms. |
| B18 | Fixed. One `rsvpTransition` serves `guests.update`, `guests.undoRsvp` and `guests.applyRsvp`; the form and the row menu go through `update`. A decline saves the guest first and only then asks `venue.releaseGuestSeat`. If venue refuses, the decline stays applied and audited, and the command fails with a message naming the seat to release by hand. |
| B19, B20, B21, B22 | Deferred to comms (form matching, gid, cache, scheduled sync). `guestIdentityKey` is the rule to match with. |
| B23 | Fixed. The target is `event.targetGuests`. The quota is `guestQuota` at `settings.guestQuotaPercent` (decision 2). |
| B24, B25 | Deferred to comms (merge tags). The roster gives `seatCode`, and the event gives `eventDate` and `eventTime`. |
| B26 | Not applicable. `honorific`, `danhXung` and `qrCode` are not in the model. |
| B27 | Fixed. Every guest mutation writes one audit row (test). Bulk-send audit is comms. |
| B28, B29, B30, B31, B32 | Deferred to comms (Gmail queue, From check, attachments, manual recipients, preselection). |
| B33 | Fixed. `guests.markInvited` sets pending to sent and the send method, never moves received back, and is for comms to call after a send. |
| B34 | Fixed. The QR is a vector from the kit with no timer. Emailed PNGs use the kit's awaited `qrPngDataUrl`. |
| B35 | Fixed. The encoder is bundled and there is no fake fallback. |
| B36 | Fixed. The printed code is the DB `checkin_code` (Crockford, case-insensitive, `parseCheckinCode`). |
| B37 | Fixed. The `(print)` route has `@page` per sheet and millimetre sizes. A PDF showed one tent per landscape page. |
| B38 | Fixed. `printSets` feeds KPI 3, the pop-up, the studio and the print route. VIP means group VIP or a seat in a `vipZone` (venue), never `'A-'`. Nobody gets both a tent and a badge. |
| B39 | Fixed. Banquet counts exclude declined guests. The flag is kept, so an undone decline restores it. |
| B40 | Fixed. A new guest is pending, uninvited and without banquet. |
| B41 | Fixed. There is one identity rule, `guestIdentityKey` (folded email, else phone digits, else folded name and organization), and `upsertMany` looks guests up by it in maps (linear). Two records are the same person exactly when their keys are equal, so a record with an email and the same person recorded without one are different identities. `upsertMany` fills blanks only and keeps `masterContactId`. It looks an item up by `masterContactId` first, then by key, so a contact copied in again after it gained an email is still the guest it made (m4c B27, found by the directory review); a match by link can also fill phone or email. |
| B42 | Fixed. Ids are client uuids. The importer gives colliding legacy ids a `#2` key. |
| B43 | Fixed. "Ghế đã xếp" counts roster guests with a seat. |
| B44 | Fixed. Labels and tones come from `@/core/vocab` on every surface, the xlsx included. |
| B45 | Fixed. One `filterGuests` (tone-folded, all tokens) serves the table and every pop-up. |
| B46 | Not applicable. Guest pages are per event, and an absent event is a 404. |
| B47 | Fixed. Agency names come from `orgIdentity(settings)` and `agencyShortName`. |
| B48 | Not applicable. The dead code was not ported. |
| B49 | Deferred to comms (responses export). The guest xlsx writes every person-supplied value as a plain string cell, which Excel never evaluates, with no apostrophe (that prefix is for CSV only). Test. |
| B50 | Fixed. The kit gives Dialog, button KPI cards, labelled icon buttons and the row menu, and RSVP is text in a badge. |
| B51 | Fixed. The table becomes a card list under md. 360 px had no horizontal scroll in the browser. |
| B52 | Deferred. A custom background needs a file input and image storage the kit lacks (change request 3). The four built-in themes ship. |
| B53 | Not applicable here (directory). |
| B54 | Fixed. Each guest is a row with `version`, and every write is guarded. |
| B55 | Fixed on the guests side: `substituteName` is only the attending substitute. The importer moves the legacy walk-in text into notes. |
| B56, B58 | Deferred to comms (test send, gviz CSV). |
| B57 | Fixed. There is one seat table with an FK cascade. Undo of a delete re-creates the guest and asks venue for the seat back. Undo of a decline does the same through `guests.undoRsvp`, with the seat read from the database when the decline released it. The audit says when the seat is gone. |
| B59 | Not applicable. There is no starter data. |

From m4c §6, for the guest-list export: B6 (formula injection), B7 and B66 (no HTML fallback), B34 (VN date, event time), B35 (every group counted and filled), B36 (settings agency names), B52 (ExcelJS from npm) and B60 (registry labels) are fixed.

## Review fixes (independent review, PASS WITH FIXES)

| # | Finding | Fix |
|---|---|---|
| 1 | A decline freed the seat before the version-checked save, so a stale version left a confirmed guest without a seat. | Guest first, seat after, in `update`, `undoRsvp` and `applyRsvp`. A venue refusal keeps the decline, audits it and fails with the seat to release by hand. Commit 75d083e. |
| 2 | Undoing a decline did not give the seat back. | The inverse is `guests.undoRsvp`, carrying the seat read from the database. A taken seat leaves the RSVP undone and the audit says the seat is no longer free. Commit 75d083e. |
| 3 | The xlsx prefixed `+ - = @` cells with an apostrophe. | String cells as typed; the apostrophe stays CSV-only. Commit 6042a41. |
| 4 | `upsertMany` was quadratic (2000 into 3000 took 5.2 s). | Key maps, one fold per record. 2000 items into 3000 guests is under 1 s in vitest; a pairwise reference agrees on random imports. Commit 310fa61. |
| 5 | `guestIdentityKey` and `sameGuest` disagreed. | `sameGuest` is deleted; `guestIdentityKey` decides everywhere. Commit 310fa61. Consequence to know: an import row without an email no longer matches a guest recorded with one (and the reverse), so it adds a guest instead of filling blanks. |
| 6 | `applyRsvp` accepted substituted without a name and had its own transition logic. | It goes through `rsvpTransition` (new `needsSubstitute`) and refuses with a Vietnamese message. Commit 75d083e. |
| 7 | Surviving mutations. | Tests for `quotaProgress` rounding, the `applyRsvp` staleness boundary (equal time is ignored) and the write permission of every command, each shown to fail when its fix is reverted. Commit 828d71f. |

## Product questions (m4a §7.4)

| Q | Resolution |
|---|---|
| Q1 | No sample data. The dev fixture uses plainly fake names. |
| Q2 | Decision 2: the quota is `ceil(targetGuests × guestQuotaPercent / 100)`, shown on KPI 1. `badgeQuotaPercent` is not used here, and badges count the printable guests. |
| Q3 | Comms (decision 16). |
| Q4 | New and imported guests start pending, uninvited and without banquet. A send through comms calls `markInvited`, which sets sent and the method. |
| Q5 | The latest timestamp wins. A staff change stamps `rsvpAt = now`, and an older form response is ignored and audited as skipped. |
| Q6 | Comms (`comms.mailboxes.admin`, admin only). |
| Q7 | Group VIP, or seated in a zone venue flags `vipZone`. |
| Q8 | The tent drops the national motto. It carries title, name and organization. |
| Q9 | Comms. |
| Q10 | Yes. A decline releases the seat and drops out of banquet counts. |
| Q11 | Comms. |
| Q12 | Yes. A named substitute makes the response substituted. |
| Q13 | Phones are free text with 8 to 15 digits (Vietnamese and foreign forms). Email is `parseEmail`. |
| Q14 | Not built (change request 3). |

Other choices. Declined guests get no tent or badge. The xlsx signature title uses the exporter's department, or the event's lead department for an admin or Ban Giám đốc. Field labels keep the spec's words in sentence case (ui-rules 18), and the xlsx column headers keep the legacy text. Inline RSVP moved to the row menu because the kit `Select` works only inside a form. "Substituted" from the menu prompts for the substitute's name. The master-directory suggest and picker are mounted since Foundation-B (below).

## Contract change requests

1. **memoryDb views.** `readRoster` should read `sce_tcsk_guest_roster`, but memoryDb (tests and dev) does not emulate views. It therefore performs the view's left join itself, over read-only shapes of `sce_tcsk_seat_assignments` (venue) and `sce_tcsk_checkins` (live) in `server/tables.ts`, each under its owner's RLS. Ask: emulate that view in memoryDb, after which `readRoster` becomes one `TableDef` on the view.
2. **Sub-tab.** `src/core/registry/registry.test.ts` pins the guests sub-tab ids, so the print studio could not be a sub-tab. It is reached from a "Biển tên VIP & thẻ QR" button and KPI 3 instead. Ask: allow `{ id: 'namecards', order: 15, label: 'Biển tên VIP & thẻ QR', segment: 'guests/namecards' }`.
3. **Kit file input and print assets.** A custom tent or badge background (legacy theme 6, B52, Q14) and the Đông Sơn motif need a kit file picker and somewhere to keep an image. The four tone-based tent themes and five badge themes ship. The legacy gradients need print palette tokens if the exact look is wanted.
4. **Walk-in substitute (B55).** Live's walk-in needs `substitutesForGuestId`, which `GuestDraft` does not have.
5. **Legacy event id.** Live's `matchScan` keys legacy badges by `legacyScanKey(legacyEvent, legacyGuest)`. `readLegacyGuestIds` gives the guest half, but progress does not expose an event's `legacy_id`.
6. **Audit on a thrown `CommandError`.** core (`src/core/commands`): `CommandError` takes an optional `audit: AuditEntry`, and when `run()` throws one that carries it, the pipeline writes it through `sce_tcsk_audit_command` with `spec.authorize.perm` before it returns the failure. A decline whose seat venue could not release (`releaseSeat` in `server/commands.ts`) then throws its entry, and the feature no longer names its permission a second time. Until then it calls `sce_tcsk_audit_command` itself with `writeOnEvent.perm`, the row the pipeline would write. The raw `sce_tcsk_write_audit` it used before is no longer executable by users (core finding 2).

## Foundation feedback

1. `DraftOf<Row>` makes DB-defaulted columns such as `checkin_code` required, so every insert casts. A `defaulted` list on `defineTable` would remove the casts.
2. memoryDb has no FK cascade. Tests remove a deleted guest's seat by hand, as Postgres would.
3. memoryDb stamps `created_at` per millisecond and Postgres per transaction, so ties are common. Default orders need a tie-break (guests: name).
4. A value exported from a `'use client'` module is a client reference in a server page. `KPI_POPUPS.includes` crashed until it moved to `domain/`. Worth a line in `src/features/README.md`.
5. The kit `Select` has no controlled mode outside a form, and `Icon` has no accessible label.
6. exceljs reads font sizes back as integers, so a read-back test cannot assert 10.5.
7. The T3 preview tool timed out on screenshots in this session. Headless Chrome through playwright-core did the browser checks.
8. memoryDb's `insertMany` is quadratic (each row scans the table for its id, its uniques and its read policy), so an import test with thousands of new rows times the test double, not the command. The `upsertMany` timing test imports mostly existing guests for that reason.

## Foundation-B: wiring to venue and directory (branch `t3/foundation-b-cron-identity-progress`)

Through public entries only; no frozen contract changed. Tests: `wiring.test.tsx` (10), `screen-data.test.ts` (2).

- **Seat to the seating chart (venue).** The seat code in the list and in the KPI pop-ups links to `/events/<id>/seating` when `GuestScreenData.canSeeSeating` (`venue.seating.read` on the event) is true; otherwise it stays text. The link opens the chart, not the seat: highlighting a seat needs a query parameter that venue's `SeatingView` does not read (an ask to venue: `?seat=<code>`).
- **Directory lookup in the add form.** `ContactLookup` (`name="masterContactId"`) sits at the top of "Thêm khách mời mới" when `canReadDirectory`. Picking a contact sets every field of `guestFieldsFromContact(c)` (marked dirty) and the link `masterContactId`, so `upsertMany`'s link-first match (B27) finds it later. It is not offered when editing a guest, because a pick would overwrite what staff typed. The suggest runs `directory.search` through `useCommand`, so each search refreshes the route behind it (directory change request 2 is still open).
- **"Nhập từ CSDL Master".** The toolbar button (for `guests.write` and `directory.read`) goes to `?import=1`. The page then calls `guestScreenData(ctx, id, { contacts: true })`, which adds `listContacts(ctx)` as `directoryContacts`, and `GuestsPage` (keyed on that) mounts directory's `BatchImportDialog`. The directory is therefore not shipped with every visit of the list (it is read in full: 5000 contacts is a large payload). Closing the dialog replaces the URL with the plain list. Directory's own copy flow (with an event picker) is unchanged.
- **New fields of `GuestScreenData`** (`domain/screen.ts`, not frozen): `canSeeSeating`, `canReadDirectory`, `directoryContacts`.
- **Not done.** A browser walk of the three flows (jsdom only). Linking a guest row to the directory record it came from (`masterContactId` has no screen). A seat deep link (above).
