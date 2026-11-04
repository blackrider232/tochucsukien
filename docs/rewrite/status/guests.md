# Status: feature `guests` (M4a, Khách mời)

Branch `t3/3df3975e`. The feature lives in `src/features/guests/`. Routes are `/events/[eventId]/guests` (list), `/events/[eventId]/guests/namecards` (print studio) and `/events/[eventId]/guests/print` (under `(print)`).

## What is built

- **Domain** (`domain/`). `roster.ts` holds every selector: `guestKpis`, `quotaProgress`, `printSets`, `isNamecardGuest`, `isBanquetGuest`, `guestIdentityKey`, `sameGuest`, `filterGuests` and `rsvpTransition`. `guestQuota` (decision 2) is re-exported from `@/core/settings` as the one quota. `schemas.ts` holds the zod field rules the form and the commands share. `export.ts` builds the styled guest-list workbook. `print.ts` holds the print themes, sizes and URLs.
- **Server** (`server/`). `tables.ts` and `reads.ts` hold `readRoster`, `readRosterEntry` and `readLegacyGuestIds`. `commands.ts` holds create, update, delete, restore, applyRsvp, upsertMany and markInvited. Every mutation is audited, and those a person can take back return an inverse. `legacy-importer.ts` imports `eventGuests` and exports `legacyGuestIndex`, `legacyCheckins` and `legacyEmailStatuses` for venue, live and comms. `dev-seed.ts` adds fake guests to progress's dev event. `screen-data.ts` builds what the screens get.
- **Screens** (`components/`). The guest page has four KPI cards and their four pop-ups, a filtered and sortable table, the RSVP and delete row menu (confirm, then undo), the add/edit dialog and the xlsx export. The print studio previews table tents and QR badges. The print sheets print A4 at true size, one tent per landscape sheet and four badges per portrait sheet, with a theme picker that never prints.
- **Tests** (`__tests__/`, 72). They cover quota rounding (9 cases), KPI and print-set selectors, identity, search, every command with audit text and undo round trips, and seat release and re-seating through a stand-in venue. Every verb is denied to an outsider twice: once through RLS, and once with RLS bypassed (`runWithoutRls`), so the command's own `authorize` is what refuses. There are also the importer fixture, the xlsx read back with exceljs (layout, labels, signature, `=`/`+`/`-`/`@`/TAB cells), XSS rendering, and the QR round trip through `parseScannedCode`.
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
| B15 | Fixed in `guests.applyRsvp`. A response older than `rsvpAt` (a staff edit or an earlier response) is ignored, and banquet changes only when the response answers it. |
| B16 | Deferred to comms (column mapping). |
| B17 | Fixed on the guests side: `applyRsvp` turns confirmed with a named substitute into substituted. Parsing the answer text is comms. |
| B18 | Fixed. One `rsvpTransition` serves the form, the row menu and `applyRsvp`. A decline asks `venue.releaseGuestSeat`. |
| B19, B20, B21, B22 | Deferred to comms (form matching, gid, cache, scheduled sync). `guestIdentityKey` and `sameGuest` are the rules to match with. |
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
| B41 | Fixed. There is one identity rule. `upsertMany` fills blanks only and keeps `masterContactId`. |
| B42 | Fixed. Ids are client uuids. The importer gives colliding legacy ids a `#2` key. |
| B43 | Fixed. "Ghế đã xếp" counts roster guests with a seat. |
| B44 | Fixed. Labels and tones come from `@/core/vocab` on every surface, the xlsx included. |
| B45 | Fixed. One `filterGuests` (tone-folded, all tokens) serves the table and every pop-up. |
| B46 | Not applicable. Guest pages are per event, and an absent event is a 404. |
| B47 | Fixed. Agency names come from `orgIdentity(settings)` and `agencyShortName`. |
| B48 | Not applicable. The dead code was not ported. |
| B49 | Deferred to comms (responses export). The guest xlsx writes formula-safe text cells (test). |
| B50 | Fixed. The kit gives Dialog, button KPI cards, labelled icon buttons and the row menu, and RSVP is text in a badge. |
| B51 | Fixed. The table becomes a card list under md. 360 px had no horizontal scroll in the browser. |
| B52 | Deferred. A custom background needs a file input and image storage the kit lacks (change request 3). The four built-in themes ship. |
| B53 | Not applicable here (directory). |
| B54 | Fixed. Each guest is a row with `version`, and every write is guarded. |
| B55 | Fixed on the guests side: `substituteName` is only the attending substitute. The importer moves the legacy walk-in text into notes. |
| B56, B58 | Deferred to comms (test send, gviz CSV). |
| B57 | Fixed. There is one seat table with an FK cascade. Undo re-creates the guest and asks venue for the seat back, and the audit says when it is gone. |
| B59 | Not applicable. There is no starter data. |

From m4c §6, for the guest-list export: B6 (formula injection), B7 and B66 (no HTML fallback), B34 (VN date, event time), B35 (every group counted and filled), B36 (settings agency names), B52 (ExcelJS from npm) and B60 (registry labels) are fixed.

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

Other choices. Declined guests get no tent or badge. The xlsx signature title uses the exporter's department, or the event's lead department for an admin or Ban Giám đốc. Field labels keep the spec's words in sentence case (ui-rules 18), and the xlsx column headers keep the legacy text. Inline RSVP moved to the row menu because the kit `Select` works only inside a form. "Substituted" from the menu prompts for the substitute's name. The master-directory suggest and picker in the form wait for `directory.search`.

## Contract change requests

1. **memoryDb views.** `readRoster` should read `sce_tcsk_guest_roster`, but memoryDb (tests and dev) does not emulate views. It therefore performs the view's left join itself, over read-only shapes of `sce_tcsk_seat_assignments` (venue) and `sce_tcsk_checkins` (live) in `server/tables.ts`, each under its owner's RLS. Ask: emulate that view in memoryDb, after which `readRoster` becomes one `TableDef` on the view.
2. **Sub-tab.** `src/core/registry/registry.test.ts` pins the guests sub-tab ids, so the print studio could not be a sub-tab. It is reached from a "Biển tên VIP & thẻ QR" button and KPI 3 instead. Ask: allow `{ id: 'namecards', order: 15, label: 'Biển tên VIP & thẻ QR', segment: 'guests/namecards' }`.
3. **Kit file input and print assets.** A custom tent or badge background (legacy theme 6, B52, Q14) and the Đông Sơn motif need a kit file picker and somewhere to keep an image. The four tone-based tent themes and five badge themes ship. The legacy gradients need print palette tokens if the exact look is wanted.
4. **Walk-in substitute (B55).** Live's walk-in needs `substitutesForGuestId`, which `GuestDraft` does not have.
5. **Legacy event id.** Live's `matchScan` keys legacy badges by `legacyScanKey(legacyEvent, legacyGuest)`. `readLegacyGuestIds` gives the guest half, but progress does not expose an event's `legacy_id`.

## Foundation feedback

1. `DraftOf<Row>` makes DB-defaulted columns such as `checkin_code` required, so every insert casts. A `defaulted` list on `defineTable` would remove the casts.
2. memoryDb has no FK cascade. Tests remove a deleted guest's seat by hand, as Postgres would.
3. memoryDb stamps `created_at` per millisecond and Postgres per transaction, so ties are common. Default orders need a tie-break (guests: name).
4. A value exported from a `'use client'` module is a client reference in a server page. `KPI_POPUPS.includes` crashed until it moved to `domain/`. Worth a line in `src/features/README.md`.
5. The kit `Select` has no controlled mode outside a form, and `Icon` has no accessible label.
6. exceljs reads font sizes back as integers, so a read-back test cannot assert 10.5.
7. The T3 preview tool timed out on screenshots in this session. Headless Chrome through playwright-core did the browser checks.
