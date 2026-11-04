# Status: feature `comms` (M4c, thư mời, Google Form RSVP, hòm thư gửi)

Branch `t3/bb67c139` (from dev @ 8695afe, on the salvaged `t3/comms-gmail-invites-rsvp-sync-1` @ 322821a). The feature lives in `src/features/comms/`. Routes are `/events/[eventId]/invitations` (compose and send), `/events/[eventId]/invitations/log` (delivery log), `/events/[eventId]/invitations/form` (Google Form), the mailboxes section of `/admin/settings` (a settings slot) and `GET /api/cron/rsvp-sync`. Migration `202611041200_comms_delivery_evidence_and_sync_state.sql`.

## What is built

- **Sending model.** Gmail is called from the browser with a Google Identity Services token kept in memory (design.md, open question on Gmail). The token belongs to the Google account the officer signs in to on the compose card, not the app account, and the card says so. A unit mailbox can be the From only when it is the account signed in (m4a B29). There is no sandbox (decision 16). "Gửi thử cho tôi" really sends one message to the officer signed in to the app.
- **Campaigns and the no-double-send rule.** A campaign is one message: its id is derived on the server from the event and the subject and body templates. Before a run the browser claims every address with `comms.startCampaign` (the row becomes `queued`). An address that already received that message, after a reload, from a second tab or from the log's "Gửi lại thư lỗi", is refused, and another officer's fresh claim (under 30 minutes) is left alone. `comms.recordDeliveries` completes only claimed rows: `sent` with Gmail's message id (a DB check), `error` with Gmail's reason, and a later failure never erases a success. `comms.releaseDeliveries` frees what a stopped run did not use. The browser loop is the pure `runCampaign` (`domain/campaign.ts`) over `dispatch` (spacing 1.2 s, retry with backoff on 429/5xx/network, stop on 401 and daily quota, stop when a result cannot be recorded).
- **Ports and fakes.** Every external call goes through an interface with a fake. `GmailTransport` (`domain/transport.ts`) has `gmailTransport` and `fakeTransport`. `GoogleIdentity` (`components/google-identity.ts`) has `gisIdentity` and the test fake. `SheetSource` (`server/sheet-source.ts`) has the guarded Google fetch and `fakeSheetSource`. Under `SCE_DEV_MEMORY=1` the page uses the fake transport and never loads GIS, and the registered commands read the dev fixture sheet (`server/dev-sheets.ts`) without opening a connection. Tests build the commands with `createCommands({ sheets })` and never reach Google.
- **Sheet fetch (SSRF guard).** It fetches only a URL `toSheetCsvUrl` wrote (https, `docs.google.com`, the export or publish endpoint, `gid` kept). It follows redirects by hand, each to https `docs.google.com` or `<label>.googleusercontent.com` on port 443 with no credentials. IP literals, private and metadata addresses, http and look-alike hosts are refused before any request. The body is capped at 5 MB and the fetch at 10 s, and an HTML answer (a sheet that is not shared) is an error.
- **Form sync.** `comms.syncForm` stores responses keyed by row hash, so it is idempotent. Columns are detected by scoring or set by staff (`comms.saveColumnMap`). Answers are read as whole phrases. A response matches by email, then phone, then name with organisation. Two candidates are parked for review. A definite answer goes through `guests.applyRsvp`, which applies only answers newer than the guest's last RSVP change. Auto-add (per event, default off) goes through `guests.upsertMany`. `comms.resolveResponse` matches, creates, dismisses or reopens. The cron route runs `comms.syncForm` through the pipeline for every form with auto-sync on.
- **Mail merge and MIME.** One merge-field registry reads the real fields. Values are HTML-escaped where they land, and the template is sanitised before and after the merge (`sanitizeRichHtml` from `@/core/text`). The preview renders through the kit's `RichHtml`. The MIME builder refuses CR/LF in every header, writes RFC 2047 encoded-words, folds lines at 76/78 characters and caps the message at the 5 MiB JSON body.
- **Audit.** Every command is audited by the pipeline. Five paths that can throw after a write stuck write their own row first with `sce_tcsk_audit_command` under their own permission: `startCampaign`, `recordDeliveries`, `releaseDeliveries`, `syncForm` and `resolveResponse` (create). A `guests.markInvited` refusal no longer fails a recorded send. The audit names the invitations to fix by hand.
- **Secrets.** The Gmail token sits only in a ref. It is sent only in the `Authorization` header, never stored (a test spies on `Storage.setItem`), and revoked on sign-out, on a sender change and when Google will not name its account. A popup answered after the sender changed is revoked, not kept. `CRON_SECRET` is compared as equal-length SHA-256 digests and never echoed. Nothing in comms calls `console`.
- **Tests** (`src/features/comms/__tests__/`, 245 in 14 files). They cover parsing, merge, MIME, the dispatcher, the transport, the SSRF guard, the sheet sources, the cron auth, every command (permissions denied with RLS bypassed, other departments), claims and releases with the lease, partial-failure audits through a fault-injecting Db (`failingWrites`), the token hook, rendering of hostile text, and the legacy importer. `e2e-dev.test.ts` runs the real registry, dev seeds and registered commands in the dev memory runtime with any network call failing the test. It invites, sends through the fake mailbox, reads the delivery log, syncs the dev sheet so `guests.applyRsvp` sets confirmed and declined, and checks the audit. It also checks that a second run of the same message mails only the address that failed, that a rate limit is retried by itself, and that an expired token stops the run, releases the unsent claims and resumes without re-sending.

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
| m4a B17, m4c B23 | Fixed. Whole-phrase answers on folded text; "Có, không ăn tiệc" is yes; a named substitute gives substituted; unclear is no answer and changes nothing. |
| m4a B19, m4c B24 | Fixed. Email, then exact normalised phone, then name with organisation; anything else is parked for review. |
| m4a B20, m4c B43 | Fixed. `gid` is kept. |
| m4a B21, m4c B30 | Fixed. Responses are stored per event. |
| m4a B22, m4c B31 | **Deferred** (change request 1). The cron route syncs every auto-sync form on the server and is tested, but production has no service identity to run it as, so it answers 503. Dev memory runs it as the dev admin. |
| m4a B24, m4c B15, B16, B17 | Fixed. `{thoi_gian}` is event time and VN date, `{so_ghe}` the roster seat, `{can_bo_lien_he}` the profile name, `{sdt_lien_he}` typed per send, neutral fallbacks. |
| m4a B25, m4c B18 | Fixed. `{link_google_form}` is the event's form link, with a warning when unset. `{ma_checkin}` is the guest's DB check-in code. |
| m4a B27, m4c B33 | Fixed. Claims, results and releases are audited with exact counts and the event. |
| m4a B28, m4c B45 | Fixed in the browser loop: backoff with Retry-After on 429/5xx/network, stop on 401 and quota, the token checked per message. A server-side queue is not built (product question m4c Q7). |
| m4a B29, m4c B46 | Fixed. The From must be the signed-in account. The token is bound to the sender, and a late popup is revoked. |
| m4a B30, m4c B47 | Fixed for size: the whole encoded message is capped before sending and the QR attachment is encoded once. Files picked by the user are not built (change request 2). |
| m4a B31, m4c B40 | Fixed. One message per address across guests and typed addresses; a tokenizer, not a RegExp built from the address. The server claim refuses a second copy. |
| m4a B32, m4c B64 | Fixed. Nothing is preselected; templates suggest a filter. |
| m4a B33 | Fixed. A recorded send calls `guests.markInvited`; the recipient list shows the last delivery. |
| m4a B49 | Fixed. Responses export as xlsx through the kit (plain string cells). |
| m4a B56, m4c B63 | Fixed. "Gửi thử cho tôi" goes to the app officer's address, no prompt. |
| m4a B58 | Fixed. The `export?format=csv` endpoint, not gviz. |
| m4c B14 | Fixed. The emailed QR is `encodeCheckinPayload(eventId, guestId)` (decision 20). |
| m4c B21 | Fixed. Only definite answers are applied, through `guests.applyRsvp`, which ignores answers not newer than the guest's last RSVP change. |
| m4c B32 | Not applicable. Tables, not a per-event array. |
| m4c B41 | Not applicable. The dead title field was not ported. |
| m4c B42 | Fixed. Response time is parsed as Hà Nội time to an Instant; an unreadable time is `no_time` and never applied on its own. |
| m4c B44 | Fixed. The QR PNG comes from the kit's awaited `qrPngDataUrl`. |
| m4c B48 | Fixed. React state; no full re-render per message. |
| m4c B49 | Fixed. The send panel is derived from the run state. |
| m4c B56, B57 | Fixed. The sender resolves from data; one client-id rule (`resolveGoogleClientId`: mailbox, else settings). |

Product questions. m4a Q3 and m4c Q6: decision 16; nothing preselected; a send sets invite sent and method email. m4a Q6 and m4c Q2: admin only. m4a Q9: the contact phone is typed per send, nothing stores it. m4a Q11: every delivery is kept per campaign; typed addresses live in the session and in the log. m4c Q7: browser OAuth per the design; server-side refresh tokens remain a product decision. m4c Q8: auto-add is per event, default off, and a response never overrides a newer staff change.

## Fixed in this pass (audit of the inherited code)

| # | Finding | Fix |
|---|---|---|
| 1 | The sheet fetch was called directly. Tests swapped it with `vi.mock`, and dev memory fetched the real `docs.google.com` unless a local fixture origin was set. | `SheetSource` port; registered commands use Google outside dev memory and the fixture under it; the harness always injects a fake. f7db4f9. |
| 2 | A reload, second tab or retry could send the same message twice: each page load made a new random campaign id and nothing was claimed before sending. | Deterministic campaign id, server claim before send, release after; tests and e2e. ecd8b0c. |
| 3 | No partial-failure audits: a sync that stopped after applying RSVPs, a record batch that stopped part-way, a create whose response could not be marked. | Audit row before the throw on five paths, through `auditPartial`. ecd8b0c. |
| 4 | A `guests.markInvited` refusal failed `recordDeliveries`, so the browser stopped as "not recorded" after the row was written. | The record stands; the audit and the send log name the invitation to fix. ecd8b0c. |
| 5 | GIS and userinfo were inline in the hook with no tests. A popup answered after the sender changed signed the new sender in with the old account. | `GoogleIdentity` port, the token lifecycle tested, the late token revoked. 27233aa. |
| 6 | Card copy "bằng tài khoản Google đang đăng nhập" could be read as the app account. | It says the Google account signed in on the card, not the app account. 27233aa. Verified against the design (browser GIS token) and decision 16 (the test mail goes to the app officer). |

## Mutation pass

25 mutations of critical logic, run against the comms tests (script outside the repo). 22 were killed by the existing tests. 2 survived: an unanchored `googleusercontent.com` host pattern, and `<` for `<=` at the token expiry boundary. 1 was an invalid mutant (syntax error) and was redone. After two tests were added (0891846), all 25 are killed: claim of an already-sent address, lease comparison, own-claim reclaim, unclaimed result accepted, success overwritten, campaign id ignoring the body, markInvited refusal failing the record, three partial audits dropped (startCampaign, syncForm, resolveResponse create), recordDeliveries partial audit dropped, release removing a recorded row, runCampaign sending to unclaimed recipients, runCampaign not releasing, SSRF (http hop, look-alike host, redirect follow), dev memory reading Google, late popup token kept, sender change keeping the token, expiry margin ignored, expiry boundary, fake ids outside dev, merge values unescaped, cron secret skipped. Survivors: none.

## Contract change requests

1. **Service identity for the cron route** (core, `src/core/auth`). `cronSystemContext` has no production actor, so `/api/cron/rsvp-sync` answers 503 outside dev memory (m4a B22, m4c B31). Ask: a `systemRequestContext()` for route handlers, with an actor holding `comms.rsvp.manage` and `guests.write` on every event, audited as "Hệ thống (đồng bộ tự động)". The same caller would serve core's scheduled backups (core status Q8).
2. **Kit file input** (components). User attachments in invitations (legacy "File đính kèm", m4a B30) need a file picker. This is the same request as guests change request 3 and directory change request 1. The MIME builder already takes attachments, encodes each once and caps the total.
3. **Audit on a thrown `CommandError`** (core, `src/core/commands`). This is guests change request 6. Comms writes the row itself at five sites (`auditPartial` in `server/command-kit.ts`). Once core takes an audit entry on the error, those sites throw it instead.
4. **`contract.ts` is behind the tables** (frozen). `RsvpResponse.match` lacks `'manual'` and the contract has no `applyStatus`. `EmailDelivery` lacks `recipientName`, `providerMessageId` and `imported`. `resolveGoogleClientId` in the contract still throws `not implemented`; the index exports the real one from `domain/client-id.ts`. Ask: align the contract types with `server/tables.ts` and re-export the function.

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
- The real `sce_tcsk_email_deliveries` constraints and the `unique (campaign_id, email)` race between two claims, on Postgres rather than memoryDb (verify:sql covers the migration, not the race).
- The deliveries lease uses the row's `updated_at` against the server clock. memoryDb stamps wall-clock time. Postgres stamps transaction time.
