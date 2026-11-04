# Status: feature `directory` (M4c, CSDL khách mời & doanh nghiệp)

Branch `t3/directory-crm-contacts`. The feature lives in `src/features/directory/`. The one route is `/admin/directory`. The comms half of m4c (Gmail sender, Google Form sync) and the guest-list Excel export are not here.

## What is built

- **Domain** (`domain/`). `search.ts` holds the one search: `searchTextOf` (the folded text of the `search_text` column), `buildIndex` (one fold per contact) and `rankContacts` (all tokens must match; rank 0 name starts with the query, 1 every token starts a name word, 2 name contains it, 3 name+title+organization, 4 phone or email only; then VIP first, name, id; limit, offset, total). `csv.ts` is the parser (RFC 4180 quotes, `""`, quoted newlines, CRLF/LF/CR, BOM, `,` `;` tab, unterminated quote is an error) and the writer (through `toCsv` from `@/core/text`). `csv-import.ts` maps headers by folded words (a header that is exactly a field's name beats one that only starts with it; a column that loses is listed, and two equally good columns for one field stop the preview) and turns text into a preview with a status and error list per row. `chunks.ts` splits a large import or bulk delete into chunks of at most 500 rows and 600 KB. `to-guest.ts` converts a contact into a guest draft or the guest form fields, and plans a copy into an event. `schemas.ts` holds the zod field rules the form and the commands share (a subset of guests' rules, so every contact converts to a valid guest). `sample-contacts.ts` holds eight plainly fake contacts.
- **Server** (`server/`). `tables.ts`, `reads.ts` (`listContacts`, `searchContacts`), `commands.ts` with 11 commands, `legacy-importer.ts`, `dev-seed.ts`.
- **Commands.** `search` (query, `directory.read`). Admin only (`directory.admin`): `create`, `update`, `delete`, `deleteMany`, `restore` (the undo of both deletes), `importCsv`, `loadSample`, `resetAll`. Open to whoever may read the directory and use the event: `eventMatches` (query) and `importToEvent`, which calls `guests.upsertMany` and writes no guest row itself. Every mutation audits with what it did (counts come from the writes, not the request); a batch's audit row names its first 20 ids and `(+N)` for the rest. Undo: create, update, delete, deleteMany, restore, importCsv and loadSample return an inverse. `resetAll` and `importToEvent` do not (below). importCsv and loadSample count and undo only rows they inserted: a client id that is taken, or repeated in the batch, gets a new server id, because `insertMany` hands back the row that already holds an id instead of failing. importCsv, deleteMany and restore take at most 500 rows.
- **Screens** (`components/`). `DirectoryScreen`: `FilterBar` (search, group with counts) + `DataTable` (ranked list, 100 rows then "Hiển thị thêm", selection across filters, "Chọn cả N kết quả"), add/edit dialog, CSV import with a validation preview and per-row errors (sent in chunks, each its own command and undo, with progress; a refused chunk stops the rest and says how many went in), CSV export, bulk delete behind a confirm (chunked the same way, sized by what each chunk's undo carries back), "Nhập N vào sự kiện" (event picker, then `BatchImportDialog`), and a "…" menu with "Nạp dữ liệu mẫu (giả)" and "Xóa toàn bộ CSDL" (a dialog that asks for the typed phrase `xóa toàn bộ`). Exported for guests: `ContactSuggest` (kit `Combobox`, ARIA), `ContactPickerDialog`, `ContactLookup` (both with the "Tra cứu CSDL" button), `BatchImportDialog`, `guestFieldsFromContact`, `contactToGuestDraft`, `planEventImport`.
- **Manifest.** The route and the nav entry now need `directory.read` (was `directory.admin`). A reader gets a read-only list, search, export and the copy into an event; every edit control is hidden and every write command refuses without `directory.admin`.
- **Tests** (`__tests__/`, 210). Search ranking and Vietnamese folding tables, parser/serializer tables (quotes, newlines, BOM, leading zeros, `= + - @ TAB CR` guards, `;` and tab delimiters, unterminated quote), the export-then-import round trip, import preview counts (new, existing, repeated in file, invalid), every command with audit text and undo, a refused stale version that writes nothing, a bulk delete stopped by one stale row, the reset phrase, permission denials of every admin verb for four non-admin actors through RLS and with RLS bypassed (`runWithoutRls`), `directory.read` and `guests.write` withheld by a stub of `can` (every role holds them), a copy into another department's event refused, a copy into an event through the real `guests.upsertMany` with the plan's counts equal to the result over random selections, the importer fixture, XSS payloads (name, title, organization, address, phone, notes) in the list, the CSV preview, the batch dialog, the suggest dropdown and the picker, and timing guards. The review fixes added: the B27 repro (a contact copied with only a phone, then given an email, is not copied twice) in both features, an import whose client id is taken (count and undo leave the older contact alone), 2000 worst-case rows (every field at its maximum, three-byte letters) chunked under 700 KB per request and per undo, 1200-row import and delete each sent as three commands, a refused chunk that stops the rest, a double click on Nhập, the copy dialog after a failed match check, the reset dialog's own phrase check, the header ranking, the bulk-delete count against a racing delete, and the sample count in the confirm. Measured here: 100 queries over 5000 contacts 144 ms, previewing 2000 CSV rows 26 ms, importing 2000 into 3000 existing 745 ms, a stored search over 5000 contacts 1.1 s; the bounds in the tests are several times larger. Mutating `adminOnly` to `directory.read` makes 32 of the 50 permission tests fail.
- **Browser** (`SCE_DEV_MEMORY=1 pnpm dev`, headless Chrome over CDP, because the T3 preview timed out on screenshots). Admin and `user:XTDT`, 360 and 1440 px, light and dark, no horizontal scroll in any of them. Walked: list, tone-less search, add with validation errors, edit and undo, delete and undo, CSV preview and commit, CSV export (BOM, CRLF, `'+84…` and `'=HYPERLINK…` guarded), copy of three contacts into the dev event (12 guests afterwards, a second copy says 3 already there and adds 0), reset with a wrong then the right phrase, then the sample button. As a `user`: no add, edit, CSV import or menu, search and export work, the suggest dropdown works and shows `<img onerror>` as text. Screenshots are in `/private/tmp/claude-501/-Users-ngotuananh-ProjectCode-SEC-tochucsukien/f9cf2612-e9a6-4262-826e-d594e5255aff/scratchpad/directory/`. The suggest and picker were shown on a throwaway page (deleted) because guests has not mounted them yet. The review fixes (chunked import and delete with their progress labels, the unused-column warning, the copy dialog after a failed match check) are covered by jsdom tests only and were not walked in a browser.

## Bugs (m4c §6)

20 fixed, 9 not applicable to this feature (fixed by guests or venue, or dead code), 38 deferred to comms.

| Bug | Result |
|---|---|
| B6 | Fixed. The CSV goes through `toCsv`; cells starting `= + - @ TAB CR` get a leading apostrophe. The import strips that apostrophe back, so an export re-imports as it was (test). |
| B8 | Fixed. Every write is `directory.admin`, checked by the command (and by RLS). The list needs `directory.read`. Tests deny each verb to four other actors with RLS bypassed. |
| B12 | Fixed. No string handlers. Rows act through React callbacks keyed by id. |
| B25 | Fixed. A copied contact is pending and uninvited (guests' defaults), `rsvpSource` import. The send method is direct for VIP or no email, else email (§3.4 "see B32" means this rule). |
| B26 | Fixed. The default skips an existing guest. The option "Bổ sung thông tin còn trống" fills only title, phone, email, notes and the master link, through `guests.upsertMany`. Group, banquet and RSVP are never touched. |
| B27 | Fixed. A guest linked to the contact (`masterContactId`) is that contact's guest, whatever its fields say now: `existingContactIds` and `guests.upsertMany` look the link up first, then `guestIdentityKey`. So a contact copied with only a phone and later given an email is skipped (or filled) on the next copy, not added twice. The identity key still rules the CSV import and duplicate warnings, where there is no link. A record with an email and the same person without one are different identities (guests' rule). The first version matched on the key only; the review found the repro. |
| B28 | Fixed. Create and update refuse a contact that duplicates another unless "Vẫn lưu" (`allowDuplicate`); the screen asks first, the command enforces it. |
| B29 | Fixed. Nothing reseeds. The importer skips the legacy seed ids unless an admin edited them. Starter data is only the labelled button. |
| B38 | Fixed. Every count is derived, including the sample-data confirm (`SAMPLE_CONTACTS.length`, which was hard-coded as 8 until the review). |
| B39 | Fixed by honesty. The button and the file are "CSV". No xlsx was asked for here. |
| B50 | Fixed. One fold per contact (`search_text`, the screen's index), the query is deferred, 100 rows render. |
| B51 | Fixed. `downloadBlob` from the kit. |
| B53 | Fixed. One row per contact with a version; every edit is version-checked. |
| B55 | Fixed by removal. There is no `isDefaultVip`. |
| B58, B59 | Fixed. One `rankContacts` and one `FilterBar` for the screen, the batch dialog, the picker and the suggest. |
| B60 | Fixed. Labels and tones come from `GUEST_GROUPS`; icons are the kit glyphs. |
| B61 | Fixed. The suggest is the kit `Combobox` (ARIA, arrows, Enter, Esc); dialogs are the kit `Dialog`. |
| B62 | Fixed. Token classes only. |
| B67 | Fixed. A new contact's banquet box follows its group (VIP on) until the person ticks it. |
| B7, B34, B35, B36, B52, B66 | Not applicable here. The guest-list export is guests' (see its status). |
| B37, B65 | Not applicable here. Booth CSV is venue's. |
| B54 | Not applicable. Routes `/events/[id]/guests` exist; modules link to them. |
| B1-B5, B9-B11, B13-B24, B30-B33, B40-B49, B56, B57, B63, B64 | Deferred to comms (Gmail, Google Form, mailboxes). On the directory side an email is checked by `parseEmail` (no CR/LF, no display name, B5) in the form, the commands, the CSV import and the importer. |

## Product questions (m4c §7.3)

| Q | Resolution |
|---|---|
| Q1 | The 41 legacy records (real officials) are not shipped. The importer drops them unless `--include-demo`. An admin button adds eight fake ones (every name says "giả" or "mẫu", emails `example.com`). |
| Q2 | Admin only edits (the matrix: `directory.admin`). Everyone who can read the directory may look people up, export and copy them into their events. |
| Q3 | A guest created from a contact keeps `masterContactId`. Nothing writes back to the directory and edits do not propagate to guests. |
| Q4 | By group: VIP on, the rest off. |
| Q5, Q6, Q7, Q8, Q9 | Guests or comms. |
| Q10 | CSV import is built. The kit has no file input, so the admin pastes the CSV (see change request 1). |

## Choices to know

- **Reset.** `resetAll` needs the phrase twice (the dialog, and the command compares it tone- and case-insensitively, a deliberate choice because a backup is made first; both checks are tested), creates a core backup first and refuses if that fails, then deletes. It has no undo, because the undo stack cannot hold a whole directory. The audit names the backup. Restore is in Quản trị, Sao lưu.
- **Delete.** Guests linked to a deleted contact keep all their data and lose the link (the FK sets null). Undoing the delete re-creates the contact with the same id and does not relink them.
- **Copy into an event** has no undo: guests has no bulk delete, so no single inverse exists. The dialog shows the expected counts first, and the result shows what was done.
- **Bulk delete** reads every row of a chunk and compares versions before the first delete; one stale row stops that chunk and the ones after it. The deletes themselves are not guarded per row (`removeWhere`), so a write racing the batch can still lose. The audited count is what `removeWhere` reports; the undo still carries every row the chunk read, so a row another admin deleted in that instant comes back on undo (`restore` skips rows that are there).
- **Search** loads the contacts and ranks in memory over `search_text`. At 5000 contacts a stored search is about a second. `Table` has no `ilike`, so there is no database-side filter. The screen ships the whole list to the browser.
- **Duplicates** in the CSV: the first row wins, later ones are skipped and counted.
- **The CSV the admin imports** holds up to 2000 rows and about 4 MB per paste. The dialog sends it in chunks of at most 500 rows and 600 KB, because Next refuses a server-action body over 1 MB. Each chunk is one audited command with its own undo, so undoing a 2000-row import takes four undos. Bulk delete is chunked the same way, sized by the full rows each chunk's undo carries back. A chunk the server refuses stops the rest. After the list refreshes, the preview offers only the rows still missing, so "Nhập" again continues.
- **CSV headers.** A header exactly equal to a field name wins over one that only starts with it ("Họ và tên" beats "Tên doanh nghiệp" for the name). The column that loses is listed in a warning. Two columns equally good for one field ("Họ tên" and "Tên") stop the preview until one is renamed or removed.

## Integration items

1. **Guests form.** Mount `ContactLookup` with `name="masterContactId"` and, in `onPick`, set each field of `guestFieldsFromContact(c)` on the form. The picked contact's id becomes the field value, which is `guestFields.masterContactId`.
2. **Guests toolbar "Nhập từ CSDL Master".** Either link to `/admin/directory` or mount `BatchImportDialog` with `listContacts(ctx)` from `@/features/directory/server` (props `eventId`, `contacts`, `onClose`). The directory screen already offers the copy with an event picker.

## Contract change requests

1. **Kit file input.** CSV import needs a file picker (the m4c "import formats" wish). Without one the admin pastes the text. Ask: a kit `FileInput` that returns text.
2. **Query without refresh.** `useCommand` calls `router.refresh()` on every success and is the only client path to a query command, so each suggest search (and the event-match query) refreshes the page behind it. Ask: a `useQuery` or a `refresh: false` run option in `@/core/commands`. `ContactSuggest` caches per query to limit it.
3. **`contract.ts` is unchanged.** The extra commands are declared in `server/commands.ts`.
4. **Server-action body size (core, `next.config.ts`).** Next 16.4.5 refuses a server-action body over 1 MB (`action-handler.js`, `defaultBodySizeLimit`), and `next.config.ts` sets no `serverActions.bodySizeLimit`. Directory now sends imports and bulk deletes in chunks of at most 500 rows and 600 KB (`domain/chunks.ts`), so it no longer needs more. Ask: set `experimental.serverActions.bodySizeLimit` (or `serverActions.bodySizeLimit`, whichever this Next reads) to a stated value such as `'2mb'`, so a feature's largest command has headroom and the limit is a decision written down, not a default. Every other feature's bulk command (guests `upsertMany` with 2000 items) has the same cap today.

## Foundation feedback

1. The kit `Combobox` keeps only results whose label matches the typed text, so `itemLabel` must carry every searched field (name, title, organization, phone, email), which is also what the input shows after a pick. A separate `inputLabel` would be cleaner. It also cannot show a custom empty message ("Chưa có trong CSDL").
2. `removeWhere` needs a condition, so "delete all" is `group in (all five)`. A `clear()` on `Table` would say it.
3. `DataTable` selection toggles only the rows it was given, so a paged list needs its own "select all results" button.
4. `Blob.text()` drops a BOM, so a BOM test decodes the bytes with `ignoreBOM`.
5. The T3 preview timed out on screenshots here too. A 60-line CDP driver over headless Chrome did the browser walk (playwright is not installed).
6. memoryDb `insertMany` was not a problem at 2000 rows (about 0.7 s for the whole import command).
