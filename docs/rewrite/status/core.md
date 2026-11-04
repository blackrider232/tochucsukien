# Status: feature `core` (sign-in and administration)

Branch `t3/core-auth-admin-screens`, based on `dev` at `b64d86a`. The feature lives in `src/features/core/`. Routes are `/login`, `/register`, `/reset-password`, `/pending`, `/mfa`, `/mfa/enroll` and `/auth/callback` under `(auth)`, plus `/admin/users`, `/admin/settings`, `/admin/backups`, `/admin/audit` and `/profile` under `(app)`.

## What is built

- **SQL** (`supabase/migrations/202611041000_core_admin_functions.sql`, `202611041100_core_audit_in_functions.sql`, `202611041200_core_holidays_guard.sql`, `202611041300_core_table_privileges.sql`, `202611041310_core_audit_append_only.sql` and `202611041320_core_audit_writer.sql`, none applied to any real project). The settings singleton, holidays, profiles, backups and audit tables have no `version`/`created_*` columns, so `ctx.db.table()` cannot address them. `sce_tcsk_update_settings` takes a typed patch with a version guard. `sce_tcsk_replace_holidays(year, holidays, expected)` replaces one year only while it still holds the list the editor saw, and returns the rows it replaced (null on a stale list). `sce_tcsk_update_profile_name` renames the caller only. `sce_tcsk_admit_profile` sets role, department and approval of a new account. `sce_tcsk_list_profiles`, `sce_tcsk_list_backups`, `sce_tcsk_list_audit` and `sce_tcsk_audit_facets` are the reads (security invoker, so RLS decides). `sce_tcsk_backup_data` is the download. Every function that changes data checks its permission first, so a refusal is `forbidden`, and writes the one audit row of the change itself, with names and labels. Settings, holidays and the profile name run with owner rights, and `authenticated` lost its direct INSERT/UPDATE/DELETE on those tables, so the audited function is the only write path. `sce_tcsk_write_audit` runs only inside owner-rights functions. `sce_tcsk_audit_command` writes the row of another feature's command. Only the service role may execute it, and the command pipeline calls it on the server with the actor id, the actor's AAL and the command key. It re-checks that the actor is active, the command is outside core, the permission belongs to the command's own feature (an allowlist, plus `directory.importToEvent` under `guests.write`), the actor's role holds it on the event's departments with the event existing (or globally when there is no event), and AAL. Action and entity are NFKC-normalised, stripped of invisible characters and whitespace-collapsed before a case-folded comparison with core's actions and entities. The audit table refuses UPDATE, DELETE and TRUNCATE by trigger for every role, the owner and the service role included. `authenticated` holds no TRUNCATE, REFERENCES or TRIGGER on any table, and the default privileges of the migration role no longer grant them on later tables. Manual and auto backups both need `core.backups.create`. `pnpm verify:sql` applies every migration twice on a stub that now carries Supabase's default privileges. It has 161 assertion call sites (`assert.*`, `denied`, `refusedRow`, `writtenRow`; helpers and loops repeat some). They cover admin and non-admin, AAL1 and AAL2, the last-admin and self-lock rules, a restore round trip over events, settings and holidays that leaves accounts untouched, the append-only audit log, exactly one readable row per core change, the command audit writer case by case (with spelling variants of core actions and entities), the backup refusals, the holiday guard, a privilege matrix over every `sce_tcsk_` table and view, and no `public` function executable by `anon`.
- **Db port** (additive). The functions are allowlisted in `RpcMap`/`RPC_ALLOWLIST` and emulated in `memoryDb`. The command audit writer is not an RPC: it is an `AuditWriter` (`supabaseAuditWriter` over the service-role client, `memoryAuditWriter` over a memoryDb's store, check for check with the SQL) that dispatch passes to `runCommand` beside the context. `memoryDb`'s backup and restore now match the SQL: the same table set (settings and holidays included), `created_by_email`, a pre-restore snapshot, and no restore of a legacy (format 1) backup.
- **Auth** (`src/core/auth/flows.ts`, `callback.ts`, `session-gate.ts`, new files). Sign-in, Google sign-in, sign-up, recovery, password change and TOTP run in the browser through `@supabase/ssr`, which keeps the session in cookies. They cannot be commands, because `dispatch` needs a finished session and `'use server'` is reserved to `dispatch.ts`. Every result is a Vietnamese message chosen in `flows.ts`, never the server's text. A password change first signs in with the current password on a throwaway supabase-js client that keeps no session and writes no cookie or storage, ends that sign-in, and only then calls `updateUser` with both passwords. `currentGate()` gives the sign-in screens the gate of the request. Without Supabase configured, and outside dev memory mode, that gate is `login`. `exchangeAuthLink()` turns a PKCE `?code=` or a `?token_hash=&type=` link into the cookie session for `/auth/callback`.
- **Commands** (`server/commands.ts`, 12). They are `settings.update`, `holidays.saveYear` (extra, guarded), `holidays.replaceYear` (fills an empty year only), `users.create`, `users.setRole`, `users.setDepartment`, `users.setStatus`, `profile.updateName`, `backups.create`, `backups.restore`, `backups.download` (extra, a query) and `audit.list`. Each mutation calls one SQL function, which writes the change's one readable audit row (names, labels, old → new), and returns `audit: 'sql'` so the pipeline adds none. Settings, holidays, role, department, lock and name changes return an inverse, so Ctrl+Z works. A holiday undo expects the list it saved, so it conflicts after someone else's edit. Approving a pending account has no inverse. `audit.list` keeps the contract's filters. The screen reads through `readAuditPage` with entity, actor and event filters as well.
- **Screens** (`components/`). The sign-in screens (`auth-forms.tsx`, `totp.tsx`, `pending-screen.tsx`) live in an `(auth)` layout with its own `<main>` and `<h1>`. The admin screens are one users screen (`users-screen.tsx`), settings with the per-year holiday editor (`settings-screen.tsx`), backups (`backups-screen.tsx`), the audit viewer (`audit-screen.tsx`) and the profile page (`profile-screen.tsx`). `/admin` has sub-tabs for settings, backups and audit. Other features' `settingsSections` render at the bottom of `/admin/settings`.
- **Slots**. The `users` nav entry shows the count of pending accounts, and only to `core.users.manage` (B38).
- **Importer** (`server/legacy-importer.ts`). It maps `systemSettings` (six fields plus `googleClientId`), splits "… (SCE)" into name and short name, caps texts at the column limits, and reports out-of-range values, which keep their default. `departments` is dropped with an issue. `unitSenderEmails` is left to comms. Profiles, legacy audit rows and whole-blob backups are not blob keys. 0001 converts them in place (`is_active` → `status`, `''` department → null, old backups → `kind auto`, `format 1`). `scripts/import-legacy.ts` writes the pre-migration backup and demotes admins outside `--keep-admins`. The test runs the importer through that runner on `__tests__/fixtures/legacy-core.json`.
- **Tests** (`src/features/core/__tests__/`, 138). Every command is refused at command level with RLS bypassed (`runWithoutRls`), for each role the matrix denies and for admin at AAL1. Pending and locked accounts stop at the gate. Each refusal asserts no write and no audit. The other cases cover `screenRedirect` over `gateFor` for every session state on every sign-in screen (MFA included), `safeNext` against open redirects, settings ranges equal to `settingsPatchSchema`'s, conflict, unknown keys and no-op saves, holiday replace converging when repeated plus undo, last-admin and self-lock, the restore round trip with its pre-restore snapshot, refusal of a legacy backup, audit paging and filters with earlier rows unchanged, script-like payloads stored and rendered as text in the profile name, users list and audit log, the register form and the real `signUp` request never carrying a role, TOTP enrolment (QR, secret, wrong and right code) with mocked flows, the importer fixture, `/reset-password` for every session state, one audit row per mutation, a restore that leaves accounts untouched, and holiday saves and undos over a foreign edit. `src/core/auth/flows.test.ts` pins the current-password check on a non-persisting client before `updateUser`, and `current_password` on the request. `src/core/auth/session-gate.test.ts` pins that recovery proof comes from the verified claims, not the cookie session.

## Bugs (core §6)

33 fixed, 9 not applicable, 0 deferred. "Fixed by design" means the foundation's structure removes it and this feature relies on it.

| Bug | Result |
|---|---|
| B1 | Fixed. No email pattern anywhere. Admin is a DB role, set only by `sce_tcsk_set_profile_role` or `tcsk.bootstrap_first_admin`. The import demotes admins not kept. |
| B2 | Fixed. The trigger creates `user`/`pending` and ignores metadata role. The register form and the real `signUp` call carry only name and department (tests). |
| B3 | Fixed by design. `tcsk.actor_role()` requires `status = 'active'`. `gateFor` sends pending and locked to `/pending`, which reads the status from the session, not the URL. |
| B4 | Fixed. Admin and leader must enroll (`/mfa/enroll`), and a verified factor at AAL1 must pass `/mfa`. Enrolment removes stale unverified factors first. The profile page loads the real status and offers "Tắt" unless the role requires TOTP. Not verified against a real Supabase. |
| B5 | Fixed by design (0001). `verify-sql` adds that audit rows cannot be updated or deleted, backup data is not readable directly, and a user cannot write its own role. |
| B6 | Fixed. Every core command has its own `authorize`. RLS and the route guard check again. The UI shows actions only to holders. |
| B7 | Fixed by design. The users list is RLS-scoped: dept_leader sees its own department, user only itself (`verify-sql`). |
| B8 | Fixed. `users.create` uses the service-role `createAuthUser` on the server, then the profile functions as the admin. Not verified against a real Supabase. |
| B9 | Not applicable. No client store, no whole-document save. |
| B10 | Fixed by design. Per-row writes. Settings carry a version guard, and a stale save is a conflict. |
| B11 | Not applicable. No data in browser storage (decision 6). |
| B12 | Fixed. Settings update is a typed patch of named columns, and mailboxes live in comms' table (`verify-sql`: keys outside the patch are kept). |
| B13 | Fixed for core. Every value is a column read through `ctx.settings`/`useSettings()`, and the form edits exactly those. Consumers are each module's work. |
| B14 | Fixed by design. No demo mode, and `requestContext()` refuses without an active profile. |
| B15 | Fixed. Every save toasts success or failure (`useCommand`). A no-op save says "Chưa có thay đổi nào để lưu." |
| B16 | Fixed. No backup per edit. Manual snapshots are never pruned, and the list shows 50. The once-a-day auto snapshot exists in SQL, but no caller is scheduled yet (see Q8). |
| B17 | Fixed. Restore is one SQL transaction, admin + AAL2, takes a "Trước khi khôi phục #N" snapshot first, is audited, and `router.refresh()` re-renders everything. The confirm says what is replaced and what is kept. |
| B18 | Fixed. Every core change writes exactly one readable audit row inside the SQL function that makes it, so a direct RPC call is audited too, and settings, holidays and the profile name cannot be written past their function. No signed-in user can write a row: neither writer is executable by `authenticated`. Other features' command rows are written by the server's service role through `sce_tcsk_audit_command`, which re-checks the actor the server names (see SQL above). Before the second review, any active user could execute that function and forge rows under any permission it held, a read permission included (fixed on `t3/core-security-review-fixes-3`). The viewer filters and pages (`verify-sql`, command tests). |
| B19 | Fixed by design. Undo runs inverse commands, and core supplies them for settings, holidays, role, department, lock and name. |
| B20 | Fixed. "Ghi nhớ đăng nhập" is gone. Sessions are Supabase cookies refreshed by the proxy (Q13). |
| B21 | Fixed. The shortcut links to `/admin/templates`. |
| B22 | Fixed. No auth modal, Supabase config modal or dead handlers. `departments` is dropped by the importer. |
| B23 | Fixed. "Tạo bản sao lưu" prompts for a note and creates it. |
| B24 | Fixed by design. The server reads the session per request. There is no data load in `onAuthStateChange`. Sign-out is a POST that clears the undo stack. |
| B25 | Fixed in the UI. The reset email links to `/auth/callback?next=/reset-password`, which exchanges the link for a session. `/reset-password` reads the verified JWT's `amr` claim (`getClaims()`) and offers a new password without the old one only to a session opened from a recovery link (`recovery`, or `otp` in GoTrue versions that file email links under it) in the last 15 minutes. Any other signed-in session gets the form that requires the current password, pending and locked sessions go to `/pending`, and MFA sessions to their gate with `next=/reset-password`. Nothing in the URL or the browser picks the view. The `amr` claim was chosen over a callback cookie because GoTrue signs it, so no secret of ours is needed. The signed-in form re-checks the current password before `updateUser` (B37). GoTrue itself still accepts `updateUser({ password })` from any session that calls it directly until the project requires the current password (Before go-live, item 1). Not verified against a real Supabase. |
| B26 | Fixed. One users screen, every department including Ban Giám đốc, labels from `ROLES`. |
| B27 | Fixed. Role, department and status labels come from `ROLES`, `DEPARTMENTS` and `PROFILE_STATUS`. |
| B28 | Not applicable. React text everywhere, and `escapeHtml` is foundation's. |
| B29 | Fixed. Toasts, alerts and dialogs are text. Auth errors are mapped messages. Tests render script-like names and summaries as text. |
| B30 | Fixed. Kit primitives only. A keyboard pass confirmed the row menu opens and moves with arrows, the dialog takes focus, and Esc returns focus to the trigger. |
| B31 | Fixed. No "Bcrypt + JWT", checksum or "sce_v2_profiles" claims. "Không ai sửa hay xóa được" on the audit log was true only for signed-in users until the second review: the table owner and the service role could still edit, delete or truncate rows. Triggers now refuse UPDATE, DELETE and TRUNCATE for every role, and `verify-sql` runs all three as the service role and as the owner. A superuser can still disable triggers, which no app path does. |
| B32 | Not applicable. Core seeds nothing. |
| B33 | Not applicable here. The theme boot script is foundation's. |
| B34 | Not applicable here. The dependencies are npm-pinned by the foundation. |
| B35 | Not applicable here. The PWA is the foundation's. |
| B36 | Fixed. Sign-up reports by outcome: "Đã gửi thư xác nhận" when confirmation is on, `/pending` when signed in. Length is checked in the form. |
| B37 | Fixed in the app. Each enrolment starts fresh on mount. The name is trimmed and required. The password-change form (profile, and `/reset-password` without recovery proof) verifies the current password by signing in with it on a non-persisting client, and changes nothing when that fails (tests). It also sends `current_password`. A session that calls GoTrue's `updateUser` directly is refused only once the project requires the current password (Before go-live, item 1). |
| B38 | Fixed. The pending badge, banner and every action render only for `core.users.manage`. |
| B39 | Fixed. The form renders from the DB row and is keyed by `version`, so it refills after any save. |
| B40 | Not applicable here. `profile.fullname` is on `useAppContext()`, and comms must use it. |
| B41 | Fixed. No personal email in the source. The first admin comes from `tcsk.bootstrap_first_admin`. |
| B42 | Not applicable here. The idle guard with its 28-minute warning is in the foundation shell. |

## Product questions (core §7.6)

| Q | Resolution |
|---|---|
| Q1 | Decision 5 and the design matrix. Lead or supporting department, and dept_leader may delete its lead events. |
| Q2 | Yes. `pending`, `active` and `locked` are distinct, with "Duyệt", "Khóa" and "Mở khóa" actions. |
| Q3 | Decision 12. TOTP is mandatory for admin and leader, who cannot turn it off. Others may turn it on and off. A password change requires the current password. |
| Q4 | Decision 13. Nothing is seeded. |
| Q5 | Admin only creates, approves and assigns. The first admin comes from `tcsk.bootstrap_first_admin(email)`. |
| Q6 | Foundation matrix. Template, hall and directory admin are admin only. |
| Q7 | Not core's. The label is in live's manifest. |
| Q8 | Default: manual snapshots kept forever, auto snapshots at most one a day and pruned after 30 days (SQL). An auto snapshot needs `core.backups.create` like a manual one, so a scheduled caller needs a session holding it or a service-role path, which is not built. The caller is a lead decision, because the only cron route is comms'. A backup downloads as JSON. Restore from an uploaded file is not built: a legacy blob goes through `scripts/import-legacy.ts`. |
| Q9 | Unknown. Migrations are idempotent and converge from whatever exists. |
| Q10 | Default: open sign-up, every account pending until approved. No domain restriction. |
| Q11 | Decision 6. No offline writes. |
| Q12 | Decision 1. Admin and leader enter Tết, Giỗ Tổ, nghỉ bù and làm bù each year on `/admin/settings`. The screen says so. |
| Q13 | The remember-me box is removed and sessions persist as Supabase cookies. The 30-minute idle timeout is the shell's. |
| Q14 | Fixed list of five (`sce_tcsk_departments`), shown read-only on `/admin/settings`. |
| Q15 | Env only. No runtime config UI. |

## Not verified

The dev memory runtime has no Supabase Auth, and no real project was used. These were not run end to end (see Before go-live): password sign-in, Google sign-in, sign-up with and without email confirmation, the `/auth/callback` code and token-hash exchange, password recovery and its `amr` method, a password change with `current_password` (GoTrue rejection codes guessed from `error-codes.d.ts`), TOTP enrolment, challenge and unenrolment against GoTrue, session refresh by the proxy, `users.create` with the service role, and the SQL functions on real Postgres with Supabase's `auth.mfa_factors`. Only PGlite with the foundation stub ran the SQL. `/mfa` and `/mfa/enroll` redirect every dev identity, so their layout was not seen in a browser. The enrolment step is covered by a jsdom test with mocked flows.

## Foundation feedback

1. Resolved on this branch (change request 6): a mutation whose SQL function audits returns `audit: 'sql'`, and each core change logs one row.
2. `LinkTabs` puts the `sr-only` count inside a scrolling list. The absolute span escapes it and widened `/admin/settings` by 21 px at 360. The year tabs here drop `count`.
3. The kit `Form` sets no `method`. A submit before hydration is a native GET that puts the typed password in the URL (seen in a headless run). The core auth forms disable submit until hydrated (`use-hydrated.ts`). The kit should set `method="post"`, or gate submit itself.
4. `QrCode`'s accessible name is fixed to "Mã QR check-in" unless a caption is given. TOTP passes caption "TOTP". A `label` prop would help.
5. The account menu does not link to `/profile`. The profile is a nav entry ("Hồ sơ của tôi") for now.
6. `RequestContext` has the calendar but not the holiday list, and `translatePgError` has no conflict code. Holidays return their previous rows from SQL instead, and a stale settings version or holiday list comes back as null.
7. Three frozen tests pin snapshot facts (34 permissions, the admin nav ids, core verbs `['users.create']`), so any module that adds a permission or nav entry edits them.
8. In dev memory mode the actor's profile is fixed, so a renamed profile shows on `/admin/users` but not in the sidebar. The MFA screens are unreachable there.
9. `next dev` blocks HMR for `127.0.0.1`. Use `localhost` for scripted checks.

## Contract change requests (made on this branch, for the lead to accept)

1. `src/core/db`: eight new `RpcMap` entries with `BackupRow`, `AuditQuery` and `AuditLogRow`, their `RPC_ALLOWLIST` mapping, and `memoryDb` emulation. Additive, but memory backup and restore changed to match the SQL.
2. Permission `core.profile.edit` (every role) guards `/profile`. `0004_permissions_seed.sql` is regenerated. `permissions.test.ts`, `registry.test.ts` and `check-contract.test.ts` are updated for the new counts.
3. New files `src/core/auth/flows.ts`, `callback.ts` and `session-gate.ts`. `@/core/auth/server` also exports `currentGate` and `exchangeAuthLink`.
4. `scripts/verify-sql.mjs`: core cases appended. `src/core/legacy/legacy.test.ts` and `scripts/import-legacy.test.ts`: import path `server/legacy` → `server/legacy-importer`.
5. `(auth)/auth/signout/route.ts` redirects to `/login?notice=signed_out`, which shows "Đã đăng xuất an toàn".
6. `src/core/commands`: `CommandOutcome.audit` may be `'sql'` (the SQL function wrote the row; the pipeline writes none). The pipeline writes every other row through `sce_tcsk_audit_command` with `spec.authorize.perm`. A feature's command whose permission the caller holds only on other departments' events than the audited `eventId` loses that row: the change stands, the server log keeps the entry and the result carries `unaudited` (item 17). Pipeline tests added.
7. `src/core/db`: `RpcMap` drops `sce_tcsk_write_audit` (no longer executable by `authenticated`) and adds `sce_tcsk_audit_command` and `sce_tcsk_admit_profile`; `sce_tcsk_replace_holidays` takes `expected` and returns `Holiday[] | null`. `memoryDb` emulates the in-function audit rows word for word, the narrow audit check and the holiday guard, and auto backups need `core.backups.create`. `memory.test.ts` and `supabase.test.ts` follow the rename.
8. `src/core/auth`: `request-context.ts` exports `cookieClient`; `session-gate.ts` adds `lastRecoveryAt` and `recoveryProofAge`, exported from `@/core/auth/server`; `flows.ts` drops `onPasswordRecovery` (the browser no longer picks the recovery view); new `flows.test.ts`.
9. `src/features/core/contract.ts` (frozen, not edited): give `core.holidays.replaceYear` the `expected` list of `core.holidays.saveYear` and delete `saveYear`, or delete `replaceYear`. Until then `replaceYear` fills an empty year only.
10. Any other feature's SQL function that calls `sce_tcsk_write_audit` must be security definer, since `authenticated` can no longer execute it. None does on `dev` at `5f9a64a`.
11. Second review. `src/core/commands`: `runCommand(ctx, lookup, id, input, audit?)` takes the `AuditWriter` as its own argument, never on the context. Without one it uses a memoryDb's store, and on any other Db a mutation refuses to run, so the feature harnesses need no change. `CommandError` takes an optional fourth argument, the `AuditEntry` of a partial failure, which the pipeline writes under the command's own permission. Only `core.*` commands may return `audit: 'sql'`. An audit row of an event-scoped permission must name an existing event, and one with no event needs a global permission granted to the role as a whole.
12. Second review. `src/core/db`: `RpcMap` drops `sce_tcsk_audit_command`. New exports are `AuditWriter`, `CommandAuditRow`, `supabaseAuditWriter` and `memoryAuditWriter`. `src/core/auth/admin.ts` keeps the service-role client private and exports `commandAuditWriter`, which only `dispatch.ts` may call (`audit-guards.test.ts`).
13. Second review. `scripts/check-contract.ts` refuses `audit: 'sql'` in feature source outside core. `scripts/verify-sql.mjs` applies Supabase's default privileges in its stub.
14. Second review. `sanitizeRichHtml` keeps only allowlisted CSS declarations and `tpl-*` classes. HTML stored before this change is re-sanitized on render, so a template whose style used another property or a function loses that declaration on screen. The built-in templates are unaffected (their tests pass).
15. For directory (change request): `directory.importToEvent` audits under `guests.write`, the one cross-feature pair on the writer's allowlist. Authorizing it with a directory permission would let the allowlist go.
16. For comms (change request): its five direct partial-failure audit writes must become a thrown `CommandError` entry before comms merges, because the RPC is gone and `audit-guards.test.ts` refuses the name under `src/features`.

17. Third review. `src/core/commands`: `CommandResult`'s success carries an optional `unaudited` message when the change was saved but an audit row was not written (the server log keeps the entry). `useCommand` and `useUndo` show it as a warning in place of the success text. A row the writer refuses after `run()` no longer turns a saved change into a failure. `commandAuditWriter` returns null without `SUPABASE_SERVICE_ROLE_KEY`, so mutations are refused before they run.

## Before go-live (real Supabase checklist)

None of this ran against a real project. Each item needs a person with dashboard access.

1. Require the current password for a password change: GoTrue `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=true` (the dashboard's current-password option under Authentication, where the project offers it). `SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION` ("Secure password change") is a different setting: it asks for an emailed nonce and does not check the password. Then confirm GoTrue rejects `updateUser({ password })` from an ordinary session without `current_password`, and still accepts it from a fresh recovery session. Until then the app checks the current password itself (B37), but a stolen session can call GoTrue directly. Someone must switch it on.
2. Password sign-in and Google sign-in, with a first Google sign-in landing on `/pending`.
3. Sign-up with email confirmation on and with it off (B36).
4. `/auth/callback` with a PKCE `?code=` and with `?token_hash=&type=` from a custom email template.
5. Recovery end to end: the emailed link, the `amr` method GoTrue writes for it (`recovery` or `otp`; `/reset-password` accepts both), the new-password form within 15 minutes, the current-password form after.
6. TOTP enrol, challenge and unenrol, and that unenrol and a password change on an account with a verified factor require AAL2.
7. The `aal` claim and `auth.mfa_factors` on real Postgres behind `tcsk.aal_ok()`.
8. `users.create` with the service role (`SUPABASE_SERVICE_ROLE_KEY` on the server only) and `sce_tcsk_admit_profile`. The key is required for every mutation: the pipeline writes command audit rows through the service role. Without the key `commandAuditWriter` is null and every mutation is refused before it runs ("Đã xảy ra lỗi khi xử lý"), while queries still work. With the key, a row the database refuses after the change committed is logged on the server with the whole entry, and the user sees "Đã lưu thay đổi nhưng chưa ghi được nhật ký hệ thống. Vui lòng báo quản trị viên, không thực hiện lại." Confirm a guests or progress command writes its row on the project, and that the server log is kept somewhere an admin reads.
9. No EXECUTE for `anon` on any `public` function: Supabase's default privileges grant it on creation, and every migration revokes it. Run the `verify-sql` query (`has_function_privilege('anon', …)`) on the project.
10. Leaked-password protection and the auth rate limits (sign-in, sign-up, recovery email).
11. Cookie settings of the `@supabase/ssr` browser client (`Secure`, `SameSite`, lifetime) on the production domain.
12. Privileges and triggers on the real project: run the `verify-sql` privilege query (`has_table_privilege` for `anon` and `authenticated` over every `sce_tcsk_` table and view) and check that `authenticated` holds no TRUNCATE, REFERENCES or TRIGGER. The migration revokes them and changes the default privileges of the role that runs it. Tables created later by another role (`supabase_admin`) would still get Supabase's defaults. Also check that `sce_tcsk_audit_logs` has both append-only triggers. Run the sequence query too (`has_sequence_privilege` for `anon` and `authenticated` over every `sce_tcsk_` sequence): neither may hold USAGE, SELECT or UPDATE (202611041360). A sequence another role creates later gets Supabase's defaults again.
13. `has_function_privilege` on the project: `sce_tcsk_audit_command` executable by `service_role` only, `sce_tcsk_write_audit` by nobody but its owner. `has_table_privilege('service_role', 'sce_tcsk_audit_logs', …)` is false for INSERT, UPDATE, DELETE and TRUNCATE (202611041370).
14. The audit writer folds case with `lower()`, which follows the database's ctype. Supabase uses `en_US.UTF-8`, and PGlite `C.UTF-8` folded Vietnamese in `verify-sql`. Confirm `select lower('PHÂN QUYỀN')` on the project.

## Second review findings (branch `t3/core-security-review-fixes-3`)

Each fix has a test that fails with the fix reverted.

| Finding | Commits |
|---|---|
| 1. Forged audit rows through `sce_tcsk_audit_command` (MEDIUM) | `10d9808` (service-role writer, actor from the pipeline, allowlist, normalised names, memory parity, guard test) |
| 2. Password change enforced only in the UI (MEDIUM) | `b0c22bf` (current password re-checked on a non-persisting client before `updateUser`) |
| 3. `audit: 'sql'` from any feature (LOW) | `83aefed` (pipeline refuses it outside `core.*`, `check:contract` rule) |
| 4. Audit log append-only only through grants (LOW) | `6fb8437` (UPDATE/DELETE/TRUNCATE triggers) |
| 5. TRUNCATE, REFERENCES and TRIGGER for `authenticated` (LOW) | `3f5d255` (revoked, default privileges changed, privilege matrix) |
| 6. Commands not atomic (accepted) | `4c2f6b4` (`CommandError` carries the partial failure's `AuditEntry`; guests and venue migrated) |
| 7. Sanitizer let CSS escapes, `image-set` and overlays through | `6039c8d` (CSS property and value allowlist, `tpl-*` classes only, no negative margins) |
| 8. Surviving mutations | `10d9808` (`aal_ok` of the writer), `0f50257` (`getClaims` → `getSession`) |
| 9. Status docs | this commit |

## Reviewer findings (PASS WITH FIXES)

| Finding | Commits |
|---|---|
| 1. Recovery mode from the URL (MEDIUM) | `e956779` failing test, `45b2c7d` fix (`amr` claim, gates) |
| 2. Audit bypass, forged rows, auto backups (MEDIUM) | `e3eb77b` failing tests, `e0daf1f` fix (`202611041100_core_audit_in_functions.sql`), `df1c2e8` pipeline tests |
| 3. Restore scope untested (LOW) | `2315508` (fails with the profile exclusion removed, in SQL and memoryDb) |
| 4. Holidays without a version guard (LOW) | `de5b20d` failing tests, `db717c6` fix (`202611041200_core_holidays_guard.sql`) |
| 5. Holidays move existing deadlines (note) | `d932fd3` failing test, `8ac08e4` alert |
| 6. Status docs | this commit |

## Screenshots

`/private/tmp/claude-501/-Users-ngotuananh-ProjectCode-SEC-tochucsukien/f9cf2612-e9a6-4262-826e-d594e5255aff/scratchpad/core/`, at 360 and 1440 px, light and dark. They cover users (admin, leader, dept_leader), settings, backups (admin, leader), audit, profile, login (empty, invalid, failed), register (empty, invalid), reset, pending, locked, and the flow states (settings invalid, holiday dialog, backup prompt, restore confirm, after restore, audit filtered, last-admin menu, role dialog, create-account errors).
