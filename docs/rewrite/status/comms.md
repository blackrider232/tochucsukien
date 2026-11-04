# Status: feature `comms` (M4c, thư mời, Google Form RSVP, hòm thư gửi)

Branch `t3/comms-invites-rsvp-sync` (from dev @ 8695afe, on the salvaged `t3/comms-gmail-invites-rsvp-sync-1` @ 322821a), then the review fixes on `t3/55a39c4b` (on 215ed78). The feature lives in `src/features/comms/`. Routes are `/events/[eventId]/invitations` (compose and send), `/events/[eventId]/invitations/log` (delivery log), `/events/[eventId]/invitations/form` (Google Form), the mailboxes section of `/admin/settings` (a settings slot) and `GET /api/cron/rsvp-sync`. Migrations `202611041200_comms_delivery_evidence_and_sync_state.sql`, `202611041300_comms_delivery_claim_token.sql`, `202611041310_comms_email_campaigns.sql`, `202611041320_comms_deliveries_imported_only_by_import.sql` and `202611041330_comms_delivery_unknown_status.sql`.

## What is built

- **Sending model.** Gmail is called from the browser with a Google Identity Services token kept in memory (design.md, open question on Gmail). The token belongs to the Google account the officer signs in to on the compose card, not the app account, and the card says so. A unit mailbox can be the From only when it is the account signed in (m4a B29). There is no sandbox (decision 16). "Gửi thử cho tôi" really sends one message to the officer signed in to the app.
- **Campaigns and the no-double-send rule.** A campaign is one message: its id is derived on the server from the event and the subject and body templates, which `comms.startCampaign` keeps with the QR choice in `sce_tcsk_email_campaigns`, so "Gửi lại thư lỗi" reopens exactly that message. Every press of a send button is one run with a random token. Before it sends, the run claims every address with `comms.startCampaign`: the row becomes `queued` under its token. An address that already received the message is refused. One that another run holds is left alone: `inFlight` for another officer, `ownInFlight` for another tab or the page before a reload of the same officer. Only the explicit "Tiếp quản phiên gửi" (behind a warning) takes the officer's own claims over. A claim untouched for 30 minutes is a dead run's and any run may take it. A live run calls `comms.renewClaims` before a message once 5 minutes have passed, and stops as `claim_lost` if its claims were taken. `comms.recordDeliveries` completes only rows that are `queued` under the caller's token: `sent` with Gmail's message id (a DB check), `error` with Gmail's reason, `unknown` when Gmail's answer was lost, and a later result never erases a success. `comms.releaseDeliveries` frees only the run's own unused claims. The browser loop is the pure `runCampaign` (`domain/campaign.ts`) over `dispatch` (spacing 1.2 s, retry with backoff on 429/5xx, stop on 401, daily quota, a lost answer, and when a result cannot be recorded).
- **A send whose answer was lost.** A network error or a 200 without a message id may mean Gmail sent the message. It is never retried. The row becomes `unknown`, the run stops, and no run claims that address again. The log shows "Không rõ đã gửi" and says to check the Sent folder; `comms.markNotSent` (behind a confirm) turns it into an error that can be sent again.
- **Ports and fakes.** Every external call goes through an interface with a fake. `GmailTransport` (`domain/transport.ts`) has `gmailTransport` and `fakeTransport`. `GoogleIdentity` (`components/google-identity.ts`) has `gisIdentity` and the test fake. `SheetSource` (`server/sheet-source.ts`) has the guarded Google fetch and `fakeSheetSource`. Under `SCE_DEV_MEMORY=1` the page uses the fake transport and never loads GIS, and the registered commands read the dev fixture sheet (`server/dev-sheets.ts`) without opening a connection. Tests build the commands with `createCommands({ sheets })` and never reach Google.
- **Sheet fetch (SSRF guard).** It fetches only a URL `toSheetCsvUrl` wrote (https, `docs.google.com`, the export or publish endpoint, `gid` kept). It follows redirects by hand, each to https `docs.google.com` or `<label>.googleusercontent.com` on port 443 with no credentials. IP literals, private and metadata addresses, http and look-alike hosts are refused before any request. The body is capped at 5 MB and the fetch at 10 s, and an HTML answer (a sheet that is not shared) is an error.
- **Form sync.** `comms.syncForm` stores responses keyed by a hash of who answered when (timestamp, email, phone, name; the answers too when there is no timestamp), so it is idempotent, and a column added to the sheet or a corrected answer is not a new response. Columns are detected by scoring or set by staff (`comms.saveColumnMap`). Answers are read against the Form's choice labels first ("Có", "Không", "Bận"), then the opening clause, then as phrases with negation ("không tham dự", "không cử người đi thay"). An answer with both a yes and a no, or an unsure one, is no answer and changes nothing. Timestamps follow the sheet's own date order (a day above 12 tells dd/mm from mm/dd; a sheet with nothing to tell is read as Vietnamese), and a time after the server's clock is kept for review. A response matches by email, then phone, then name with organisation. Two candidates are parked for review. A definite answer goes through `guests.applyRsvp`, which applies only answers newer than the guest's last RSVP change. Auto-add (per event, default off) creates the guest through `guests.upsertMany` with no RSVP, then applies the answer through `guests.applyRsvp` at the response's own time. `comms.resolveResponse` matches, creates, dismisses or reopens. The cron route runs `comms.syncForm` through the pipeline for every form with auto-sync on. The Form screen offers auto-sync only when `serverSyncReady()` (a system identity and `CRON_SECRET`); until change request 1 lands it is disabled and labelled "chưa hoạt động".
- **Mail merge and MIME.** One merge-field registry reads the real fields. Values are HTML-escaped where they land, and the template is sanitised before and after the merge (`sanitizeRichHtml` from `@/core/text`). The preview renders through the kit's `RichHtml`. The MIME builder refuses CR/LF in every header, writes RFC 2047 encoded-words, folds lines at 76/78 characters and caps the message at the 5 MiB JSON body.
- **Audit.** Every command is audited by the pipeline. Six paths that can throw after a write stuck write their own row first with `sce_tcsk_audit_command` under their own permission: `startCampaign`, `recordDeliveries`, `releaseDeliveries`, `markNotSent`, `syncForm` and `resolveResponse` (create). A `guests.markInvited` refusal no longer fails a recorded send. The audit names the invitations to fix by hand.
- **Secrets.** The Gmail token sits only in a ref. It is sent only in the `Authorization` header, never stored (a test spies on `Storage.setItem`), and revoked on sign-out, on a sender change and when Google will not name its account. A popup answered after the sender changed is revoked, not kept. `CRON_SECRET` is compared as equal-length SHA-256 digests and never echoed. Nothing in comms calls `console`.
- **Tests** (`src/features/comms/__tests__/`, 380 in 16 files). They cover parsing (a table of Vietnamese answers, typed with and without diacritics), merge, MIME, the dispatcher, the transport, the SSRF guard, the sheet sources, the cron auth, every command (permissions denied with RLS bypassed, other departments), claims, tokens, take-over, renewal and releases with the lease (Date pinned to the command clock, since memoryDb stamps rows from Date), partial-failure audits through a fault-injecting Db (`failingWrites`), the token hook, rendering of hostile text and of every send-panel and log state, and the legacy importer. `sql.test.ts` applies every migration on PGlite and checks the deliveries policies and checks on Postgres. `e2e-dev.test.ts` runs the real registry, dev seeds and registered commands in the dev memory runtime with any network call failing the test. It invites, sends through the fake mailbox, reads the delivery log, syncs the dev sheet so `guests.applyRsvp` sets confirmed and declined, and checks the audit. It also checks that a second run of the same message mails only the address that failed, that a rate limit is retried by itself, that an expired token stops the run and resumes without re-sending, that a second tab of the same officer sends nothing the first holds, that a crash between Gmail's answer and the record does not re-send (only an explicit take-over does), that a run 36 minutes long keeps its tail by renewing, that a lost answer is not re-sent until marked, and that mixed yes/no answers never decline a confirmed guest.

## Bugs (m4a §6 and m4c §6 items deferred to comms)

m4a: 28 items deferred here by `status/guests.md`. 27 fixed, 1 deferred, 0 not applicable.
m4c: 38 items deferred here by `status/directory.md`. 35 fixed, 1 deferred, 2 not applicable.

| Bug | Result |
|---|---|
| m4a B01, m4c B1 | Fixed. Form responses render as React text (rendering test with script payloads; the e2e keeps a markup name as data). |
| m4a B02, m4c B2 | Fixed. Recipient names, titles, organisations and emails render as text. Nothing is preselected. The token never touches storage. |
| m4a B03, m4c B3 | Fixed. Merge values are escaped where they land; the template is sanitised before and after; the preview is sanitised HTML through `RichHtml`. Mutation "values not escaped" is killed. |
| m4a B04, m4c B5 | Fixed. Every address passes `parseEmail`; the MIME builder refuses CR/LF in any header and encodes display names and the subject. |
| m4a B05, m4c B4 | Fixed. The send log is React text. |
| m4a B06, m4c B10, B11 | Fixed. No Google profile picture is shown; the account address and attachment names are text. |
| m4a B07, m4c B9 | Fixed. Mailboxes are `comms.mailboxes.admin` (admin only) in the command and in RLS, edited only in the admin settings slot. |
| m4a B08, m4c B13 | Fixed. Token in memory only, expiry with a 60 s margin, revoked on sign-out and on sender change (tests, mutations killed). |
| m4a B12, m4c B19 | Fixed. No sandbox (decision 16). A `sent` row needs a Gmail id and time (DB check). Fake-transport ids are refused outside the dev runtime. Legacy rows are flagged "Đã gửi (phần mềm cũ)". |
| m4a B14, m4c B20 | Fixed. No simulated responses. The only fixture sheet is the dev runtime's. |
| m4a B16, m4c B22 | Fixed. Scored column detection ("dự tiệc" is banquet, "Tên cơ quan" is organisation) plus a saved per-event column map. |
| m4a B17, m4c B23 | Fixed. The Form's choice labels first, then the opening clause, then phrases with negation on folded text; "Có, không ăn tiệc" is yes; a named substitute gives substituted; both yes and no, or unsure, is no answer and changes nothing. (Until 5f9e71a an answer with both a yes and a no word was declined, freeing the seat.) |
| m4a B19, m4c B24 | Fixed. Email, then exact normalised phone, then name with organisation; anything else is parked for review. |
| m4a B20, m4c B43 | Fixed. `gid` is kept. |
| m4a B21, m4c B30 | Fixed. Responses are stored per event. |
| m4a B22, m4c B31 | **Deferred** (change request 1). The cron route syncs every auto-sync form on the server and is tested, but production has no service identity to run it as, so it answers 503. Dev memory runs it as the dev admin. The Form screen says so: the auto-sync switch is disabled and labelled "chưa hoạt động" until `serverSyncReady()`. |
| m4a B24, m4c B15, B16, B17 | Fixed. `{thoi_gian}` is event time and VN date, `{so_ghe}` the roster seat, `{can_bo_lien_he}` the profile name, `{sdt_lien_he}` typed per send, neutral fallbacks. |
| m4a B25, m4c B18 | Fixed. `{link_google_form}` is the event's form link, with a warning when unset. `{ma_checkin}` is the guest's DB check-in code. |
| m4a B27, m4c B33 | Fixed. Claims, results and releases are audited with exact counts and the event. |
| m4a B28, m4c B45 | Fixed in the browser loop: backoff with Retry-After on 429/5xx, stop on 401 and quota, the token checked per message. A lost answer (network) is not retried but recorded as unknown. A server-side queue is not built (product question m4c Q7). |
| m4a B29, m4c B46 | Fixed. The From must be the signed-in account. The token is bound to the sender, and a late popup is revoked. |
| m4a B30, m4c B47 | Fixed for size: the whole encoded message is capped before sending and the QR attachment is encoded once. Files picked by the user are not built (change request 2). |
| m4a B31, m4c B40 | Fixed. One message per address across guests and typed addresses; a tokenizer, not a RegExp built from the address. The server claim, held by one run's token, refuses a second copy. |
| m4a B32, m4c B64 | Fixed. Nothing is preselected; templates suggest a filter. |
| m4a B33 | Fixed. A recorded send calls `guests.markInvited`; the recipient list shows the last delivery. |
| m4a B49 | Fixed. Responses export as xlsx through the kit (plain string cells). |
| m4a B56, m4c B63 | Fixed. "Gửi thử cho tôi" goes to the app officer's address, no prompt. |
| m4a B58 | Fixed. The `export?format=csv` endpoint, not gviz. |
| m4c B14 | Fixed. The emailed QR is `encodeCheckinPayload(eventId, guestId)` (decision 20). |
| m4c B21 | Fixed. Only definite answers are applied, through `guests.applyRsvp`, which ignores answers not newer than the guest's last RSVP change. |
| m4c B32 | Not applicable. Tables, not a per-event array. |
| m4c B41 | Not applicable. The dead title field was not ported. |
| m4c B42 | Fixed. Response time is parsed as Hà Nội time to an Instant, in the sheet's own date order; an unreadable or future time is `no_time` and never applied on its own. |
| m4c B44 | Fixed. The QR PNG comes from the kit's awaited `qrPngDataUrl`. |
| m4c B48 | Fixed. React state; no full re-render per message. |
| m4c B49 | Fixed. The send panel is derived from the run state. |
| m4c B56, B57 | Fixed. The sender resolves from data; one client-id rule (`resolveGoogleClientId`: mailbox, else settings). |

Product questions. m4a Q3 and m4c Q6: decision 16; nothing preselected; a send sets invite sent and method email. m4a Q6 and m4c Q2: admin only. m4a Q9: the contact phone is typed per send, nothing stores it. m4a Q11: every delivery is kept per campaign; typed addresses live in the session and in the log. m4c Q7: browser OAuth per the design; server-side refresh tokens remain a product decision. m4c Q8: auto-add is per event, default off, and a response never overrides a newer staff change.

## Fixed in this pass (audit of the inherited code)

| # | Finding | Fix |
|---|---|---|
| 1 | The sheet fetch was called directly. Tests swapped it with `vi.mock`, and dev memory fetched the real `docs.google.com` unless a local fixture origin was set. | `SheetSource` port; registered commands use Google outside dev memory and the fixture under it; the harness always injects a fake. f7db4f9. |
| 2 | A reload, second tab or retry could send the same message twice: each page load made a new random campaign id and nothing was claimed before sending. | Deterministic campaign id, server claim before send, release after; tests and e2e. ecd8b0c. The claim still exempted the officer's own claims, so the same officer's second tab did send twice until the run tokens of dc1b68f (H1 below). |
| 3 | No partial-failure audits: a sync that stopped after applying RSVPs, a record batch that stopped part-way, a create whose response could not be marked. | Audit row before the throw on five paths, through `auditPartial`. ecd8b0c. |
| 4 | A `guests.markInvited` refusal failed `recordDeliveries`, so the browser stopped as "not recorded" after the row was written. | The record stands; the audit and the send log name the invitation to fix. ecd8b0c. |
| 5 | GIS and userinfo were inline in the hook with no tests. A popup answered after the sender changed signed the new sender in with the old account. | `GoogleIdentity` port, the token lifecycle tested, the late token revoked. 27233aa. |
| 6 | Card copy "bằng tài khoản Google đang đăng nhập" could be read as the app account. | It says the Google account signed in on the card, not the app account. 27233aa. Verified against the design (browser GIS token) and decision 16 (the test mail goes to the app officer). |

## Fixed after the independent review at 215ed78

Each fix has a test that failed on the code before it.

| # | Finding | Fix |
|---|---|---|
| H1 | A second tab of the same officer, or a reload while a sent message was not yet recorded, re-claimed every queued address (own claims were exempt), so both runs mailed it. | Per-run claim token on the row (`claim_token`); reclaim only by the same run, after the lease, or by an explicit take-over; record and release need the token. dc1b68f. |
| H2 | An answer with both a yes and a no word was declined and freed the seat ("Tôi xác nhận tham dự, không ăn tiệc", "… cùng Ban Giám đốc"). | Choice labels, opening clause, phrases with negation; both is no answer; bare "ban" is no longer a no word. 5f9e71a. |
| M1 | The 30-minute lease was never renewed, so a colleague took over a long run's unsent tail and both sent. | `comms.renewClaims` every 5 minutes before a message; `claim_lost` stops the run. 55f59bc. |
| M2 | "Gửi lại thư lỗi" loaded the default template, so the retry was a different message. | Templates kept per campaign (`sce_tcsk_email_campaigns`) and prefilled on retry. bef2cab. |
| M3 | The Form screen promised a server sync that answers 503 in production. | Disabled and labelled until `serverSyncReady()`. fdb1a66. |
| L-a | `\b` around Vietnamese letters filed "Sở Tài chính" and "Ủy ban nhân dân" as DoanhNghiep. | Folded words. 0e6b76a. |
| L-b | "11/4/2026 10:00:00" from a US-locale sheet was read as 11 April. | The sheet's date order from all its rows; a future time is not applied. baa6ca0. |
| L-c | The row key was every cell, so a new column re-inserted every response. | Key on timestamp, email, phone and name. c4b185c. |
| L-d | The sync report carried raw `e.message` ("unavailable"). | `failureReason`. e2fd5e7. |
| L-e | "Gửi thử cho tôi" was enabled for an officer without the send permission. | `canTest`; the preview hides its test button. 1b4dd30. |
| L-f | The log's campaign label was one recipient's merged subject, with their name. | The subject template. 8387a4e. |
| L-g | With failures and an unsent tail, only "Gửi lại thư lỗi" was offered. | Both actions. 761eb26. |
| L-h | Anyone with comms.send could write a delivery row with `imported = true`, which skips the evidence check. | Restrictive RLS policies: authenticated users write only `imported = false` (the import script is the service role). a3d41e6. |
| L-i | Network errors were retried, so a message Gmail had accepted could be sent twice. | Not retried; status `unknown`; `comms.markNotSent` after a check of the Sent folder. 187d942. |
| N1 | Found while fixing L-b: a guest made from a Form response got `rsvpAt` = the sync time, so the same person's later answer (sent before the sync) was stale. Hidden because the test clock stood before the sheet's answers. | The guest is created with no RSVP and the answer applied at the response's own time. 00295ee. |

## Mutation pass

25 mutations of critical logic, run against the comms tests (script outside the repo). 22 were killed by the existing tests. 2 survived: an unanchored `googleusercontent.com` host pattern, and `<` for `<=` at the token expiry boundary. 1 was an invalid mutant (syntax error) and was redone. After two tests were added (0891846), those 25 were killed. The independent review then found four more survivors, so "Survivors: none" was not true: the `Bearer ` prefix check in the cron auth (M02), "substituted without a name is no answer" (M12), `row.eventId !== eventId` in `resolveResponse` (M21) and the CR/LF/tab cleanup of the merged subject (M24, hidden by the space collapse for CRLF). Tests added in 47b06ac kill all four; each mutant was applied and its test file failed. The own-claim reclaim mutant of the first pass no longer applies: own claims are no longer exempt (H1).

## Contract change requests

1. **Service identity for the cron route** (core, `src/core/auth`). `cronSystemContext` has no production actor, so `/api/cron/rsvp-sync` answers 503 outside dev memory (m4a B22, m4c B31). Ask: a `systemRequestContext()` for route handlers, with an actor holding `comms.rsvp.manage` and `guests.write` on every event, audited as "Hệ thống (đồng bộ tự động)". The same caller would serve core's scheduled backups (core status Q8).
2. **Kit file input** (components). User attachments in invitations (legacy "File đính kèm", m4a B30) need a file picker. This is the same request as guests change request 3 and directory change request 1. The MIME builder already takes attachments, encodes each once and caps the total.
3. **Audit on a thrown `CommandError`** (core, `src/core/commands`). This is guests change request 6. Comms writes the row itself at five sites (`auditPartial` in `server/command-kit.ts`). Once core takes an audit entry on the error, those sites throw it instead.
4. **`contract.ts` is behind the tables** (frozen). `RsvpResponse.match` lacks `'manual'` and the contract has no `applyStatus`. `EmailDelivery` lacks `recipientName`, `providerMessageId`, `imported` and `claimToken`, and `DeliveryStatus` lacks `'unknown'`. The campaign message (`sce_tcsk_email_campaigns`) has no contract type. `resolveGoogleClientId` in the contract still throws `not implemented`; the index exports the real one from `domain/client-id.ts`. Ask: align the contract types with `server/tables.ts` and re-export the function.
5. **memoryDb parity for table checks and restrictive policies** (core, `src/core/db/memory.ts`). memoryDb emulates the permissive RLS policies, NOT NULL and unique keys, but not CHECK constraints (`sent_has_evidence`, `queued_has_token`, `unknown_has_text`) or restrictive policies (`imported` only by the import script). The comms commands never write such rows, and `sql.test.ts` checks them on PGlite, but a feature bug that did would pass in tests and dev memory and fail only on Postgres. Ask: emulate CHECK constraints and restrictive policies from the SQL catalog, or document that they are Postgres-only.

## Integration to-dos

1. Set `CRON_SECRET` (16+ characters) and schedule `GET /api/cron/rsvp-sync` with `Authorization: Bearer …` every 5 minutes, after change request 1.
2. Google Cloud: a web OAuth client whose authorised JavaScript origins are the deployed domains. Put its id in settings `googleClientId` or per mailbox. Get the `gmail.send` scope verified for the unit accounts (design.md open question).
3. Each unit mailbox must be a Google account the officers can sign in to (or a verified send-as alias, which is not supported yet: the From must equal the signed-in address).
4. The CSP in `next.config.ts` already allows `accounts.google.com/gsi/client`, `gmail.googleapis.com`, `www.googleapis.com` and the GIS frame. Keep it in step if the scopes change.
5. Responses sheets must be shared "Bất kỳ ai có đường liên kết đều có thể xem". The screen says so when a fetch is refused.
6. Run `scripts/import-legacy.ts`: comms imports `unitSenderEmails`, the form settings per event and email results (flagged as imported).
7. Dev: `SCE_DEV_SHEET_ORIGIN` is gone. The dev event's sheet is served by the fake sheet source, and any other sheet answers "Môi trường phát triển không đọc Google Sheet thật".

## Not verified against real services

- Gmail `users/me/messages/send`: the request shape, the error reasons mapped to auth/quota/rate (`dailyLimitExceeded`, `userRateLimitExceeded`, `insufficientPermissions`), Retry-After handling, and the 5 MiB JSON body limit (inferred from Google's API limits, not measured).
- Gmail's handling of a From that is a send-as alias of the signed-in account (refused here).
- Google Identity Services: the popup flow, `error_callback` types, `expires_in`, `revoke`, and the `userinfo` response with the `openid email` scopes.
- Google Sheets: the `export?format=csv&gid=` and `pub?output=csv` redirects to `*.googleusercontent.com`, the status and content type of an unshared sheet, and Vietnamese CSV encoding.
- The `unique (campaign_id, email)` and version races between two claims or a claim and a renewal, on Postgres rather than memoryDb (`sql.test.ts` checks the constraints and policies on PGlite, not concurrent transactions).
- The deliveries lease uses the row's `updated_at` against the server clock. memoryDb stamps wall-clock time. Postgres stamps transaction time.
- Whether Gmail can accept a message and still answer with a network error or a 200 without an id often enough to matter (treated as unknown either way).
