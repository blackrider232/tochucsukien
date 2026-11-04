# Status: feature `core` (sign-in and administration)

Branch `t3/core-auth-admin-screens`, based on `dev` at `b64d86a`. The feature lives in `src/features/core/`. Routes are `/login`, `/register`, `/reset-password`, `/pending`, `/mfa`, `/mfa/enroll` and `/auth/callback` under `(auth)`, plus `/admin/users`, `/admin/settings`, `/admin/backups`, `/admin/audit` and `/profile` under `(app)`.

## What is built

- **SQL** (`supabase/migrations/202611041000_core_admin_functions.sql`, not applied to any real project). The settings singleton, holidays, profiles, backups and audit tables have no `version`/`created_*` columns, so `ctx.db.table()` cannot address them. Eight functions cover the core commands. `sce_tcsk_update_settings` takes a typed patch with a version guard. `sce_tcsk_replace_holidays` replaces one year and returns the rows it replaced. `sce_tcsk_update_profile_name` renames the caller only. `sce_tcsk_list_profiles`, `sce_tcsk_list_backups`, `sce_tcsk_list_audit` and `sce_tcsk_audit_facets` are the reads. `sce_tcsk_backup_data` is the download. All but the download run as the caller (security invoker), so the 0001 RLS policies and column grants decide, and each re-checks its permission first so a refusal is `forbidden`, not "0 rows". The download reads the ungranted `data` column, so it is security definer and audits itself. `pnpm verify:sql` applies every migration twice and adds 48 assertions: admin and non-admin, AAL1 and AAL2, the last-admin and self-lock rules, a restore round trip over events, settings and holidays, and append-only audit (admin can neither update nor delete).
- **Db port** (additive). The functions are allowlisted in `RpcMap`/`RPC_ALLOWLIST` and emulated in `memoryDb`. `memoryDb`'s backup and restore now match the SQL: the same table set (settings and holidays included), `created_by_email`, a pre-restore snapshot, and no restore of a legacy (format 1) backup.
- **Auth** (`src/core/auth/flows.ts`, `callback.ts`, `session-gate.ts`, new files). Sign-in, Google sign-in, sign-up, recovery, password change and TOTP run in the browser through `@supabase/ssr`, which keeps the session in cookies. They cannot be commands, because `dispatch` needs a finished session and `'use server'` is reserved to `dispatch.ts`. Every result is a Vietnamese message chosen in `flows.ts`, never the server's text. `currentGate()` gives the sign-in screens the gate of the request. Without Supabase configured, and outside dev memory mode, that gate is `login`. `exchangeAuthLink()` turns a PKCE `?code=` or a `?token_hash=&type=` link into the cookie session for `/auth/callback`.
- **Commands** (`server/commands.ts`, 11). They are `settings.update`, `holidays.replaceYear`, `users.create`, `users.setRole`, `users.setDepartment`, `users.setStatus`, `profile.updateName`, `backups.create`, `backups.restore`, `backups.download` (extra, a query) and `audit.list`. Each mutation audits a readable summary (names, labels, old → new). Settings, holidays, role, department, lock and name changes return an inverse, so Ctrl+Z works. Approving a pending account has no inverse. `audit.list` keeps the contract's filters. The screen reads through `readAuditPage` with entity, actor and event filters as well.
- **Screens** (`components/`). The sign-in screens (`auth-forms.tsx`, `totp.tsx`, `pending-screen.tsx`) live in an `(auth)` layout with its own `<main>` and `<h1>`. The admin screens are one users screen (`users-screen.tsx`), settings with the per-year holiday editor (`settings-screen.tsx`), backups (`backups-screen.tsx`), the audit viewer (`audit-screen.tsx`) and the profile page (`profile-screen.tsx`). `/admin` has sub-tabs for settings, backups and audit. Other features' `settingsSections` render at the bottom of `/admin/settings`.
- **Slots**. The `users` nav entry shows the count of pending accounts, and only to `core.users.manage` (B38).
- **Importer** (`server/legacy-importer.ts`). It maps `systemSettings` (six fields plus `googleClientId`), splits "… (SCE)" into name and short name, caps texts at the column limits, and reports out-of-range values, which keep their default. `departments` is dropped with an issue. `unitSenderEmails` is left to comms. Profiles, legacy audit rows and whole-blob backups are not blob keys. 0001 converts them in place (`is_active` → `status`, `''` department → null, old backups → `kind auto`, `format 1`). `scripts/import-legacy.ts` writes the pre-migration backup and demotes admins outside `--keep-admins`. The test runs the importer through that runner on `__tests__/fixtures/legacy-core.json`.
- **Tests** (`src/features/core/__tests__/`, 110). Every command is refused at command level with RLS bypassed (`runWithoutRls`), for each role the matrix denies and for admin at AAL1. Pending and locked accounts stop at the gate. Each refusal asserts no write and no audit. The other cases cover `screenRedirect` over `gateFor` for every session state on every sign-in screen (MFA included), `safeNext` against open redirects, settings ranges equal to `settingsPatchSchema`'s, conflict, unknown keys and no-op saves, holiday replace converging when repeated plus undo, last-admin and self-lock, the restore round trip with its pre-restore snapshot, refusal of a legacy backup, audit paging and filters with earlier rows unchanged, script-like payloads stored and rendered as text in the profile name, users list and audit log, the register form and the real `signUp` request never carrying a role, TOTP enrolment (QR, secret, wrong and right code) with mocked flows, and the importer fixture.

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
| B18 | Fixed. Every core mutation is audited, and the viewer filters and pages. The function rows of 0003 add a second row (see feedback 1). |
| B19 | Fixed by design. Undo runs inverse commands, and core supplies them for settings, holidays, role, department, lock and name. |
| B20 | Fixed. "Ghi nhớ đăng nhập" is gone. Sessions are Supabase cookies refreshed by the proxy (Q13). |
| B21 | Fixed. The shortcut links to `/admin/templates`. |
| B22 | Fixed. No auth modal, Supabase config modal or dead handlers. `departments` is dropped by the importer. |
| B23 | Fixed. "Tạo bản sao lưu" prompts for a note and creates it. |
| B24 | Fixed by design. The server reads the session per request. There is no data load in `onAuthStateChange`. Sign-out is a POST that clears the undo stack. |
| B25 | Fixed. The reset email links to `/auth/callback?next=/reset-password`, which sets a recovery session. `/reset-password` then asks for the new password, and it also listens for `PASSWORD_RECOVERY`. Not verified against a real Supabase. |
| B26 | Fixed. One users screen, every department including Ban Giám đốc, labels from `ROLES`. |
| B27 | Fixed. Role, department and status labels come from `ROLES`, `DEPARTMENTS` and `PROFILE_STATUS`. |
| B28 | Not applicable. React text everywhere, and `escapeHtml` is foundation's. |
| B29 | Fixed. Toasts, alerts and dialogs are text. Auth errors are mapped messages. Tests render script-like names and summaries as text. |
| B30 | Fixed. Kit primitives only. A keyboard pass confirmed the row menu opens and moves with arrows, the dialog takes focus, and Esc returns focus to the trigger. |
| B31 | Fixed. No "Bcrypt + JWT", checksum or "sce_v2_profiles" claims. "Không ai sửa hay xóa được" on the audit log is true and verified. |
| B32 | Not applicable. Core seeds nothing. |
| B33 | Not applicable here. The theme boot script is foundation's. |
| B34 | Not applicable here. The dependencies are npm-pinned by the foundation. |
| B35 | Not applicable here. The PWA is the foundation's. |
| B36 | Fixed. Sign-up reports by outcome: "Đã gửi thư xác nhận" when confirmation is on, `/pending` when signed in. Length is checked in the form. |
| B37 | Fixed. Each enrolment starts fresh on mount. The name is trimmed and required. A password change needs the current password (`current_password`). |
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
| Q8 | Default: manual snapshots kept forever, auto snapshots at most one a day and pruned after 30 days (SQL). The auto snapshot needs a scheduled caller, which is a lead decision, because the only cron route is comms'. A backup downloads as JSON. Restore from an uploaded file is not built: a legacy blob goes through `scripts/import-legacy.ts`. |
| Q9 | Unknown. Migrations are idempotent and converge from whatever exists. |
| Q10 | Default: open sign-up, every account pending until approved. No domain restriction. |
| Q11 | Decision 6. No offline writes. |
| Q12 | Decision 1. Admin and leader enter Tết, Giỗ Tổ, nghỉ bù and làm bù each year on `/admin/settings`. The screen says so. |
| Q13 | The remember-me box is removed and sessions persist as Supabase cookies. The 30-minute idle timeout is the shell's. |
| Q14 | Fixed list of five (`sce_tcsk_departments`), shown read-only on `/admin/settings`. |
| Q15 | Env only. No runtime config UI. |

## Not verified

The dev memory runtime has no Supabase Auth, and no real project was used. These were not run end to end: password sign-in, Google sign-in, sign-up with and without email confirmation, the `/auth/callback` code and token-hash exchange, password recovery, a password change with `current_password` (GoTrue rejection codes guessed from `error-codes.d.ts`), TOTP enrolment, challenge and unenrolment against GoTrue, session refresh by the proxy, `users.create` with the service role, and the SQL functions on real Postgres with Supabase's `auth.mfa_factors`. Only PGlite with the foundation stub ran the SQL. `/mfa` and `/mfa/enroll` redirect every dev identity, so their layout was not seen in a browser. The enrolment step is covered by a jsdom test with mocked flows.

## Foundation feedback

1. The pipeline requires a command-level audit row even when the SQL function writes its own. Role, department, status, backup and restore therefore log two rows each (the SQL row and the readable one). Suggest letting a mutation declare that its function audits.
2. `LinkTabs` puts the `sr-only` count inside a scrolling list. The absolute span escapes it and widened `/admin/settings` by 21 px at 360. The year tabs here drop `count`.
3. The kit `Form` sets no `method`. A submit before hydration is a native GET that puts the typed password in the URL (seen in a headless run). The core auth forms disable submit until hydrated (`use-hydrated.ts`). The kit should set `method="post"`, or gate submit itself.
4. `QrCode`'s accessible name is fixed to "Mã QR check-in" unless a caption is given. TOTP passes caption "TOTP". A `label` prop would help.
5. The account menu does not link to `/profile`. The profile is a nav entry ("Hồ sơ của tôi") for now.
6. `RequestContext` has the calendar but not the holiday list, and `translatePgError` has no conflict code. Holidays return their previous rows from SQL instead, and a stale settings version comes back as null.
7. Three frozen tests pin snapshot facts (34 permissions, the admin nav ids, core verbs `['users.create']`), so any module that adds a permission or nav entry edits them.
8. In dev memory mode the actor's profile is fixed, so a renamed profile shows on `/admin/users` but not in the sidebar. The MFA screens are unreachable there.
9. `next dev` blocks HMR for `127.0.0.1`. Use `localhost` for scripted checks.

## Contract change requests (made on this branch, for the lead to accept)

1. `src/core/db`: eight new `RpcMap` entries with `BackupRow`, `AuditQuery` and `AuditLogRow`, their `RPC_ALLOWLIST` mapping, and `memoryDb` emulation. Additive, but memory backup and restore changed to match the SQL.
2. Permission `core.profile.edit` (every role) guards `/profile`. `0004_permissions_seed.sql` is regenerated. `permissions.test.ts`, `registry.test.ts` and `check-contract.test.ts` are updated for the new counts.
3. New files `src/core/auth/flows.ts`, `callback.ts` and `session-gate.ts`. `@/core/auth/server` also exports `currentGate` and `exchangeAuthLink`.
4. `scripts/verify-sql.mjs`: core cases appended. `src/core/legacy/legacy.test.ts` and `scripts/import-legacy.test.ts`: import path `server/legacy` → `server/legacy-importer`.
5. `(auth)/auth/signout/route.ts` redirects to `/login?notice=signed_out`, which shows "Đã đăng xuất an toàn".

## Screenshots

`/private/tmp/claude-501/-Users-ngotuananh-ProjectCode-SEC-tochucsukien/f9cf2612-e9a6-4262-826e-d594e5255aff/scratchpad/core/`, at 360 and 1440 px, light and dark. They cover users (admin, leader, dept_leader), settings, backups (admin, leader), audit, profile, login (empty, invalid, failed), register (empty, invalid), reset, pending, locked, and the flow states (settings invalid, holiday dialog, backup prompt, restore confirm, after restore, audit filtered, last-admin menu, role dialog, create-account errors).
