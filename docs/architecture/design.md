# Foundation design, candidate A

The rewrite target is the SCE event-management tool (legacy `code/index.html`, 22,715 lines) as a Next.js App Router + TypeScript strict + Tailwind app on the same Supabase project. Seven module workers build features in parallel after one foundation worker builds this design.

Files in this package:

- `types/` is the type sketch. 23 files, `tsc --noEmit --strict` exit 0 (TypeScript 7.0.2, `tsconfig.json` here). `types/usage/live-feature-example.ts` is a module worker's code written against the contracts. A negative probe (deleted after the run) confirmed that an unknown command id, a missing input field, a raw string where an `EventId` belongs, and an undeclared command verb each fail to compile.
- `sql/0001`-`0005` are idempotent migrations with RLS. `scripts/verify-sql.mjs` applies them twice on PGlite with a Supabase stub and asserts 23 RLS and function behaviors. Last run printed `applied 5 migrations twice: idempotent` and `all RLS and function checks passed`.

## Problem

The legacy app keeps all state in one JSON row (`sce_tcsk_app_data`, id 1). Every click upserts the whole document and inserts a whole-document backup. RBAC lives only in the client, and admin rights come from an email pattern. Demo data seeds itself into real events. Each module re-derives dates, quotas, labels, QR payloads and seat layouts in its own way. The eight specs record 383 bugs, and most of them trace back to five root causes. Those are shared mutable state, no server authority, no single registry per concept, HTML strings built by hand, and seeding during render.

The rewrite has three constraints that make its shape non-obvious.

1. Seven workers build in parallel in separate worktrees, so every shared file is a merge conflict and every shared concept is a drift risk.
2. The deployed schema is unknown (core Q9), and nobody here can run SQL against production. Migrations must be idempotent files that converge from whatever exists. The data move is a one-time, re-runnable script.
3. Feature parity comes first, so every legacy blob key needs a home and an import path. That includes the fields stored on the wrong owner, such as Google Form settings on the event and check-in state on the guest.

## Usage (caller's view)

This is the quickstart a module worker reads first (`src/features/README.md`).

> You own `src/features/<key>/` and the route dirs your manifest lists. Never edit anything else. The steps are:
> 1. Fill `manifest.ts`. It holds nav entries, sub-tabs, permission grants, owned routes, owned tables and legacy blob keys. The sidebar, top bar, sub-tab bars, proxy guard, users screen and SQL permission seed all derive from it.
> 2. Describe each owned table once with `defineTable`, then read and write it through `ctx.db.table(def)`. You never import `@supabase/*`.
> 3. Every write is a command in `server/commands.ts` (`defineCommands('<key>', {...})`). You get input parsing, gate, permission, audit, undo, toast and refresh for free. You cannot write `'use server'`.
> 4. Pages are server components. They call `requestContext()` and then read functions from `@/features/<other>/server`. Client components mutate with `useCommand()`.
> 5. Need another feature's data? Read it through its public read function or the roster view. Need to change another feature's data? Call its command with `ctx.call('<other>.<verb>', input)`.
> 6. Use the kit (`@/components/ui`) for every dialog, toast, table, form field, KPI card, badge, tab bar, print page and download.

Call site 1 is a server page that reads three owners' data.

```tsx
// src/app/(app)/events/[eventId]/live/page.tsx   (owned by live)
export default async function LivePage({ params }: { params: Promise<{ eventId: EventId }> }) {
  const { eventId } = await params;
  const ctx = await requestContext();              // redirects unless active + AAL ok
  const [roster, hall, checkins] = await Promise.all([
    readRoster(ctx, eventId),                       // @/features/guests/server
    readEventHall(ctx, eventId),                    // @/features/venue/server
    readCheckIns(ctx, eventId),                     // own
  ]);
  return <CheckInDesk eventId={eventId} roster={roster} hall={hall} checkins={checkins} />;
}
```

Call site 2 is a client mutation with conflict handling, undo and toast.

```tsx
const run = useCommand();
const onDecline = (g: RosterEntry) =>
  run('guests.update', { eventId, id: g.id, version: g.version, patch: { rsvpStatus: 'declined' } },
      { success: `Đã cập nhật: ${g.name}` });
// Conflict -> toast "Dữ liệu đã được người khác cập nhật. Đang tải lại…" and router.refresh().
// Success -> inverse pushed on the undo stack; Ctrl+Z runs it through the same pipeline.
```

Call site 3 is a command that asks other owners (walk-in).

```ts
async run(ctx, input) {
  await ctx.call('guests.create', { eventId: input.eventId, id: input.guestId, draft });       // guests' rules
  await ctx.call('venue.assignSeat', { eventId: input.eventId, guestId: input.guestId, seatCode: 'auto' });
  return ctx.call('live.checkIn', { eventId: input.eventId, guestId: input.guestId, desk: input.desk });
}
// Client-generated ids make each step an idempotent upsert, so a retry after a partial failure converges.
```

The full, type-checked version is `types/usage/live-feature-example.ts`.

## Shape

### Data first

- **Event is the root aggregate.** `sce_tcsk_events` carries `department` (chủ trì) and `supporting_departments` (phối hợp). Every event-scoped table has `event_id` with `ON DELETE CASCADE`, which removes the orphan class (m2 BUG-15). Event delete is soft (`deleted_at`), restorable by the owner's undo, and hard-purged only by an admin.
- **Normalized per-entity tables, one owner each.** There are 22 domain tables (see the schema summary below). Each has `id uuid`, `version`, `created_*` and `updated_*`. The `tcsk.stamp()` trigger maintains these managed columns, so no client can forge `updated_by` or skip a version bump.
- **Facts written by different actors live in different tables, merged at read.** This follows the separate-before-serializing-shared-state principle.
  - Check-ins go in `sce_tcsk_checkins`, unique (event, guest). Several desks write without touching the guest row (m5 BUG-05/08).
  - Seats go in `sce_tcsk_seat_assignments`, unique (event, seat) and unique (event, guest). This is the only seat relation (m4b BUG-06).
  - Form responses go in `sce_tcsk_rsvp_responses`, and email results in `sce_tcsk_email_deliveries`.
  - The read boundary is the `security_invoker` view `sce_tcsk_guest_roster`, which joins guests + seat + check-in. Each joined table's RLS applies to the reader.
- **Derived values are not stored.** Step deadline comes from `deadlineOf(cal, eventDate, step)`. Hall capacity is the sum of `zones[].seatCount`. Incident code is `'SC-' + pad2(seq)`. The roster's `seatCode` comes from the join. Event progress, countdowns and quotas come from pure selectors. A stale copy cannot drift because no copy exists (m2 Q4, m4b BUG-11, m6 BUG-05).
- **Shared vocabulary is one registry per enum** (`src/core/vocab.ts`). It covers roles, departments, guest groups, RSVP, invite status, send method and event type. Each entry carries the label, short label and tone, and every badge, select, export cell and filter reads it.
- **Branded primitives** (`types/core/brand.ts`). These are the ids, `IsoDate` (plain VN date), `Instant`, `HHmm`, `Vnd`, `Email`, `SafeUrl`, `SeatCode` and `SanitizedHtml`. Values are parsed once at a boundary (row parse, form schema, URL param) and trusted afterwards. This follows boundary-discipline and type-system-discipline.

### The three deep modules

1. **`Db` / `Table<Row>`** (`types/core/db.ts`). It has 8 methods. It hides supabase-js, snake/camel mapping, zod row parsing, `expectedVersion` optimistic concurrency, error translation (`conflict | not_found | forbidden | constraint | unavailable`) and the choice of client. There are two implementations behind it. `supabaseDb` is the production one, a user-scoped cookie client where Postgres enforces RLS. `memoryDb` is for tests only and emulates RLS from `permissionMatrix()`. ESLint forbids `@supabase/*` outside `src/core/db`, so there is no third way to touch data.
2. **Commands** (`types/core/commands.ts`). There is one server action, `dispatch(id, input)`, and the single `'use server'` file in the repo. The pipeline is parse input (the zod schema the form also uses) → gate → `authorize` (perm + event or resource) → `run` → audit (mandatory for mutations; the pipeline hands the row to a service-role audit writer that feature code never receives, which calls `sce_tcsk_audit_command` with the actor's id and assurance level, and that function re-checks the actor's permission on the event's departments before it inserts) → result with an optional `inverse`. On the client, `useCommand()` adds toasts, conflict refresh, the undo stack and `router.refresh()`. `CommandMap` is augmented per feature by declaration merging, so ids and payloads are typed end to end without a shared list. `defineCommands` requires every declared verb to have an implementation. Undo is "run the inverse command", so undo goes through the same permission and audit path (core §3.6 intended, B19).
3. **Registry** (`types/core/registry.ts`). Each feature has one pure-data `manifest.ts` and one `slots.tsx`. These produce the sidebar, top-bar metadata, sub-tab bars, proxy route guard, legacy tab-id redirects, nav badges, header actions, settings sections, event-header actions, the permission matrix and the generated SQL seed. `src/features/registry.ts` imports the nine features once. The foundation writes it and nobody edits it again.

### Auth and RBAC, enforced in three places from one matrix

- **Identity.** A trigger on `auth.users` inserts a profile with `role 'user'` and `status 'pending'`. Metadata is used for the display name and a self-registerable department only. Role, department and status change only through `sce_tcsk_set_profile_*` SQL functions. Each one re-checks `core.users.manage`, refuses to remove the last active admin, and writes an audit row. The first admin is bootstrapped by hand once with `tcsk.bootstrap_first_admin(email)`. No email pattern exists anywhere (core B1/B2/B41).
- **Gate.** `gateFor()` is a pure function used by the proxy (UX redirect) and by `requestContext()` (enforcement). It maps the session to one of login, pending (`/pending`), locked, `mfa_enroll` (admin/leader without TOTP), `mfa_challenge` (verified TOTP at AAL1), or ok. `requestContext()` is the only way to get a `Db`, so a page that forgets a guard still cannot read data.
- **Matrix.** Each manifest declares `PermissionDef { scope: 'event' | 'global', grants: Record<Role, 'all' | 'department' | 'none'>, requiresAal2? }`. `scripts/gen-permissions-sql.ts` emits `sql/0004_permissions_seed.sql` from the merged matrix, and `check:contract` fails when that file is stale. Postgres policies call `tcsk.has_perm(perm)` and `tcsk.has_event_perm(perm, event_id)`, which read that table. `can(actor, perm, resource)` mirrors the same rules for UI hiding. Server, RLS and UI all read one matrix.
- **AAL2.** `tcsk.aal_ok()` is false at AAL1 for any user with a verified factor and for admin/leader without one. Every policy goes through it. Verified by `verify-sql.mjs`, where an admin at AAL1 sees 0 events and at AAL2 sees all.

### Dates, settings and other shared helpers (foundation-owned, frozen)

- `src/core/dates` does plain-date arithmetic on `'YYYY-MM-DD'`, and "today" is `Asia/Ho_Chi_Minh`. Every working-day function takes a `WorkCalendar` built from `sce_tcsk_holidays`, and no weekend-only variant exists to call by mistake. It provides `countdown()` and `formatCountdown()` (one vocabulary), `formatVNDate`, `formatNd30Date`, `combineVN` and `fileDateStamp` (local, never UTC).
- `SystemSettings` is a singleton row with typed, range-checked columns and a version. Every pure function that needs a threshold, quota or agency name takes `settings` as a parameter, and `orgIdentity(settings)` feeds every letterhead. Unit mailboxes moved to their own comms-owned table, so saving settings cannot wipe them (core B12).
- `src/core/checkin-code` encodes the single payload format `SCE-CHK:<eventId>:<guestId>`. The printed human code is the guest's DB-generated `checkin_code`. Legacy payloads are accepted when scanning only.
- `src/core/text` provides `foldVi`/`matchesQuery` (one search normalizer), `escapeHtml` (all 5 characters, falsy-zero fixed), the `html` tagged template, `sanitizeRichHtml` (DOMPurify on save and on render), `parseEmail`, `parseSafeUrl`, `parseVnd`/`formatVnd`, `safeSpreadsheetText` and `toCsv`.
- Ids come from `crypto.randomUUID()`, generated on the client for creates so retries are idempotent.

### What the system deliberately does not do

- No client-side data store and no offline writes. The PWA caches the shell and shows "Ngoại tuyến", and writes need the network (core Q11).
- No generic API routes. The only route handlers are `api/cron/rsvp-sync` (comms, `CRON_SECRET`) and the Supabase auth callback.
- No runtime Supabase config UI. Config comes from env (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, server-only `SUPABASE_SERVICE_ROLE_KEY` used only by `core.users.create` and the import script).
- No auto-seeded data. Demo fixtures exist only as `scripts/seed-demo.ts` for local dev. In production they exist only behind admin "Nạp dữ liệu mẫu" actions that target a new event the admin names.
- No `.docx` generation. Word export stays Word-HTML `.doc`, labelled honestly (m3 Q1).

## Synthesis decision

Single candidate. The project owner restricted delegates to opus and sonnet and dropped the second runner for cost, so no second shape was compared. The lead screened this design against `design-red-flags.md` and adopted it unchanged. Foundation work is split into a scaffold unit, then core and UI kit in parallel, then the seven module units.

## Tradeoffs accepted

- We accept a 22-table schema and 9 importers in exchange for per-row concurrency, real RLS, and no whole-blob writes. A phase-1 document-per-key model would have been smaller and would have kept B10 inside each key.
- We accept a single generic `dispatch` server action (one RPC endpoint keyed by command id) in exchange for one enforced pipeline. Next.js per-action endpoint encryption is not used for per-command isolation, because every command re-checks permission anyway.
- We accept `router.refresh()` after every mutation (server components re-render the route) in exchange for having no client cache to keep consistent. Large lists (300 guests) re-fetch per toggle, which is fine at this scale. Live check-in adds realtime refresh.
- We accept RLS helper functions that look up the event per row (`has_event_perm`) in exchange for a single policy shape. Row counts are hundreds per event.
- We accept that supporting departments get full child-table write access in exchange for one simple scoping rule (core Q1 default). Finer per-feature assignment would need an event-members table.
- We accept that legacy events are imported with all four departments as supporting departments, which keeps today's "everyone sees everything" behavior for old events. New events default to none.
- We accept no offline writes. The field desk at a venue with poor network sees "Ngoại tuyến" and cannot check in (core Q11, m5).
- We accept Word-HTML `.doc` instead of `.docx`.
- We accept soft delete on events only. Other entities hard delete, with an undo inverse that re-creates them.

## Alternatives considered

- **Document-per-key store** (`key, event_id, data jsonb, version`), as suggested in core §7.2 for phase 1. It is a smaller interface, but every feature then re-implements partial-update merge inside JSON. RLS cannot see fields. Seat, check-in and guest still share one document per event, so concurrent desks conflict all day. It lost on concurrency and on RLS depth.
- **Client store with sync** (a typed slice store, `commit(slice, mutator)`, optimistic UI, background persistence), as sketched in core §7.1. It is good for snappy UI and undo. But it recreates the legacy failure modes (load-before-save ordering, stale copies, merge on reconnect), and it needs a second authority check on the server anyway. It lost because it exposes sync complexity to every feature.
- **Per-feature server actions instead of one dispatcher.** This is idiomatic Next.js. But each feature would have to remember parse, gate, permission and audit itself, and the shortest path that compiles skips one of them. It lost on "two ways to do one task".
- **Codegen of the registry from a glob.** No hand-listed file at all, but a build step every worker must run and a generated file that conflicts on merge. A fixed nine-entry file plus a check is simpler, because the feature set is known up front.

## Open questions and risks

- Is the Q1 default right? Can `user` and `dept_leader` see only events where their department leads or supports? Do legacy events open to all four departments? Answer this before go-live, because it changes what staff see on day one.
- Should TOTP be mandatory for admin and leader? Users without MFA today must enroll on first login after cutover. Is that acceptable for the Ban Giám đốc?
- Is `reports.issue` restricted to dept_leader and above, matching the department-head signature in commit 6463fbf? Or can chuyên viên issue?
- Who enters lunar holidays and compensatory days each year? Before the first entry, working-day counts around Tết will be off by up to 5 days.
- Does the deployed project already have a trigger on `auth.users` from /quanlydauthau that conflicts? The trigger name is unique, but every new user of the sibling app now also gets a pending SCE profile. Is that acceptable?
- Gmail sending stays in the browser (GIS token in memory) unless product chooses server-side refresh tokens (m4a §7.3). Does the Google OAuth app need verification for the `gmail.send` scope either way?
- `memoryDb` RLS emulation can drift from SQL policies. Mitigation is that `verify-sql.mjs` runs in CI against the real SQL, and features' integration tests run against local Supabase before merge.
- PGlite is not Supabase. `auth.uid()`/`auth.jwt()`, roles and the realtime publication were stubbed. The real `supabase_realtime` publication and `auth.mfa_factors` columns must be re-checked on a local `supabase start`.
- Next.js 16 renamed `middleware.ts` to `proxy.ts`. If the pinned version is 15, use `middleware.ts` with the same body.

## Next implementation step

The foundation worker starts with `src/core/db` (`supabaseDb`, `memoryDb`) and `src/core/commands/dispatch.ts` against the `0001`-`0005` migrations on a local `supabase start`. Everything else in the parallel contract hangs off those two.

## Directory skeleton

```
next.config.ts                 F  redirects /code/index.html -> /, CSP, Serwist
eslint.config.mjs              F  boundary rules (below)
package.json, tsconfig.json    F
supabase/migrations/           F  0001-0005 from sql/; modules add <yyyymmddhhmm>_<feature>_<desc>.sql
scripts/                       F  import-legacy.ts, gen-permissions-sql.ts, check-contract.ts, verify-sql.mjs, seed-demo.ts
legacy/index.html              F  frozen copy of the old app, reference only
public/icons/                  F
src/
  proxy.ts                     F  session refresh + gateFor + registry route guard + legacy tab redirects
  app/
    layout.tsx manifest.ts sw.ts globals.css not-found.tsx error.tsx      F
    (auth)/login register reset-password mfa mfa/enroll pending auth/callback   F
    (app)/layout.tsx           F  shell: sidebar, top bar, dialogs/toast host, undo keys, idle timer
    (app)/page.tsx             F  -> /events
    (app)/go/[nav]/page.tsx    F  event-scoped nav without an event -> last event (cookie) or picker
    (app)/admin/settings|users|backups|audit/         core (F)
    (app)/events/page.tsx, events/new/                progress
    (app)/events/[eventId]/layout.tsx                 F  readEvent or notFound, EventSwitcher, sub-tab bar, eventActions slot
    (app)/events/[eventId]/page.tsx                   F  -> ./plan
    (app)/events/[eventId]/plan/**                    progress
    (app)/events/[eventId]/guests/**                  guests
    (app)/events/[eventId]/invitations/**             comms (sub-tabs under guests: Gửi thư mời, Google Form)
    (app)/events/[eventId]/seating/**                 venue (sub-tab under guests)
    (app)/events/[eventId]/booths/**                  venue
    (app)/events/[eventId]/live/**                    live
    (app)/events/[eventId]/reports/**                 reports
    (app)/templates/**                                templates
    (app)/admin/templates/**                          templates
    (app)/admin/halls/**                              venue
    (app)/admin/directory/**                          directory
    (print)/layout.tsx         F  no shell, @page CSS, auto window.print()
    (print)/events/[eventId]/<segment>/**             owner of <segment>
    (print)/templates/**                              templates
    api/cron/rsvp-sync/route.ts                       comms
  core/                        F  frozen: auth/ commands/ db/ permissions/ registry/ dates/ text/ checkin-code/ settings/ legacy/ export/
  components/ui/               F  frozen kit (signatures in types/ui/kit.ts)
  components/shell/            F
  features/
    registry.ts                F  frozen: imports all nine manifests, slots, server command records, legacy importers
    README.md                  F
    core/                      F
    progress/ templates/ guests/ venue/ directory/ comms/ live/ reports/
      manifest.ts              owner (F writes the first version with nav, perms, routes, tables)
      slots.tsx                owner
      contract.ts              F writes from types/features/<key>.ts; signature changes need the lead
      index.ts                 owner; public client-safe entry, re-exports contract
      server/index.ts          owner; public server entry (reads, commands record, legacy importer)
      server/**  domain/**  components/**  __tests__/**   owner, internal
```

Worker to feature map. M2 owns `progress`. M3 owns `templates`. M4a owns `guests` (list, form, KPIs, print studio, guest-list xlsx export). M4b owns `venue` (hall catalog, event hall, seating, booths, booth duty shifts). M4c owns `directory` and `comms` (bulk email, Google Form RSVP, sender mailboxes). M5 owns `live`. M6 owns `reports`. This settles the M4a/M4c overlap on email and forms in favour of M4c.

## Parallel-work contract

1. **Frozen for module workers.** Everything marked F above. That is `src/core/**`, `src/components/**`, `src/app/` outside owned route dirs, `src/features/registry.ts`, every `contract.ts`, `supabase/migrations/000*`, `scripts/**`, config files, and `package.json` (a dependency request goes to the lead).
2. **Owned.** `src/features/<key>/**` except `contract.ts`, the route dirs listed in its manifest `routes[]`, and migration files named `*_<key>_*.sql`.
3. **Registering a route, nav entry or permission.** Edit your own `manifest.ts` only. `NavEntry` covers sidebar section, order, label, tooltip, icon, accent, href, permission, legacy tab ids and header title/subtitle/badge. `SubTab` can attach under any parent nav id. `RouteSpec` declares owned app dirs, and `permissions` declares keys that must start with `<key>.`. Augment `PermissionMap` and `CommandMap` in your own files.
4. **Event-scoped queries.** Use `defineTable({ name, owner, eventScoped: true, row })` and `ctx.db.table(def).list({ eventId })`. RLS scopes by event department automatically, because `tcsk.register_table(..., 'event', read, write)` created the policies.
5. **Cross-feature access.** Reading is done through `@/features/<other>` (types, pure selectors, client components) or `@/features/<other>/server` (read functions), or through the roster view. Writing is done through `ctx.call('<other>.<verb>')` only.
6. **Shared chrome.** Use `slots.tsx` for nav badges, the top-bar badge, header actions, settings sections and event actions. The shell never imports a feature directly.
7. **Schema changes.** Add a migration file named for your feature. It may create or alter only tables whose comment is `sce:owner=<key>`. New tables must call `tcsk.register_table`. A new RPC goes through a request to the lead.
8. **Enforcement.** `npm run check:contract` runs in CI and in each worker's `npm test`. It fails when:
   - a `src/features/*` dir is missing from `registry.ts`, or the reverse;
   - an `app/**/page.tsx` is not covered by exactly one manifest route, or by an F-owned path;
   - a permission key or command id prefix differs from its feature key;
   - the generated `0004_permissions_seed.sql` differs from the matrix;
   - a table's `sce:owner=` comment (parsed from migrations) differs from its manifest `tables`;
   - a module migration touches another owner's table.
9. **ESLint boundaries** (`no-restricted-imports` + `no-restricted-syntax`) make importable internals fail the build. They block:
   - `@/features/*/!(server)/**` from outside that feature;
   - `@supabase/*` outside `src/core/db` and `src/core/auth`;
   - `'use server'` outside `src/core/commands/dispatch.ts`;
   - any `@/core/commands/*` path except `@/core/commands/pipeline` (tests), and, inside `@/core/commands` itself, any static import of dispatch, the registry or `next/headers`, because feature server code imports that entry at runtime;
   - `dangerouslySetInnerHTML` except with a `SanitizedHtml` value through the kit's `<RichHtml>`;
   - `localStorage` outside `src/core/prefs` (UI prefs only, cleared on sign-out);
   - `Date.prototype.toISOString().slice` and `new Date('YYYY-MM-DD')` patterns (use `core/dates`).
10. **Merge order.** Foundation merges first, with stub manifests, contracts whose read functions are implemented (they are mechanical `ctx.db` calls over tables F created), placeholder pages and the kit. All seven module branches then merge in any order, because their paths are disjoint. Last comes an integration pass by the lead (e2e smoke per role).

### UI kit signatures (full list in `types/ui/kit.ts`)

| Primitive | Props (abridged) |
|---|---|
| `Dialog` | `open, onClose, title, subtitle?, icon?, accent?, size?, dirty?, footer?, children` |
| `useDialogs()` | `confirm({title, text?, confirmLabel?, cancelLabel?, tone?}) => Promise<boolean>`, `prompt({...label, defaultValue?, required?}) => Promise<string\|null>`, `alert` |
| `useToast()` | `success\|info\|warning\|error(text: string)`, top-end, 2 s, plain text |
| `KpiCard` | `label, value, icon, accent, ofTotal?, caption?, progress?{value,max}, badge?{text,tone,pulse?}, highlight?, onClick?\|href?` |
| `LinkTabs` / `Tabs` | `items[{id,label,count?,icon?,href}]`, `activeId`, `variant: pill\|underline\|segmented` |
| `DataTable<Row>` | `rows, columns[{id,header,cell,align?,width?,sortValue?,hideOnMobile?}], rowKey, empty, numbered?, stickyHeader?, maxHeight?, minWidth?, rowTone?, selection?, toolbar?` |
| `FilterBar` | `search{value,onChange,placeholder}, filters[], trailing?` |
| `FormField` + controls | `label, name, required?, hint?, suffix?`, plus `TextInput`, `NumberInput`, `MoneyInput`, `DateInput{showHolidays?}`, `TimeInput`, `Select<K>`, `Combobox<T>{search,itemKey,itemLabel,onPick}`, `Checkbox`. Forms use one `useZodForm(schema)` with the command's schema |
| `EmptyState` | `icon, title, text?, action?` |
| `StatusBadge<K>` / `Badge` | `registry, value, size?, pulse?` / `tone, pulse?, icon?, children` |
| `ProgressBar` | `value, max, tone?, label?` |
| `SectionCard` | `title, subtitle?, icon?, accent?, actions?, children` |
| Print | `PrintPage{size A4\|A5, orientation, margins nd30\|none}`, `Nd30Header{issuer, documentNumber?, date?}`, `SignatureBlock{left?, right, recipients?}`, `PrintLink{href}` |
| `QrCode` / `qrPngDataUrl` | `payload` (from `encodeCheckinPayload`), `size`, `caption?` |
| Files | `downloadBlob(blob, name)`, `downloadXlsx(name, sheets)` with `xlsxSheet<Row>(spec)`, `downloadWordHtml({fileName,title,body: SanitizedHtml})`, `toCsv(rows, columns)` |
| Hooks | `useAppContext`, `useSettings`, `useCalendar`, `useCommand`, `useUndo`, `useEventChanges(eventId, tables)`, `useBeep` |

## State ownership table

| Persisted state | Owner | Other features' access |
|---|---|---|
| `sce_tcsk_profiles` | core | Read your own row via `requestContext().actor`. Users list via core screen only. |
| `sce_tcsk_system_settings`, `sce_tcsk_holidays`, `sce_tcsk_departments` | core | Read `ctx.settings`, `ctx.calendar`, `useSettings()`, `DEPARTMENTS` |
| `sce_tcsk_role_permissions` | core (generated) | `can()` |
| `sce_tcsk_backups`, `sce_tcsk_audit_logs` | core | Audit written by the dispatcher for every mutation. Nobody reads the tables directly. |
| `sce_tcsk_app_data` (legacy blob) | core | Read-only, admin only, import source |
| `sce_tcsk_events` | progress | `readEvent`, `listEvents`, `readEventPlan`, selectors. Write via `progress.*` |
| `sce_tcsk_task_groups`, `sce_tcsk_steps` | progress | `readEventPlan`, `eventProgress`, `deadlineOf`, `stepState` |
| `sce_tcsk_templates` | templates | `listTemplates`, `renderTemplate`, `resolveTemplateKey`, `templateHref` |
| `sce_tcsk_guests` | guests | `readRoster`, `guestKpis`, `isNamecardGuest`. Write via `guests.applyRsvp`, `guests.upsertMany`, `guests.create`, `guests.markInvited` |
| `sce_tcsk_guest_roster` (view) | guests | Read model for venue, live, reports, comms |
| `sce_tcsk_hall_templates`, `sce_tcsk_event_halls`, `sce_tcsk_seat_assignments` | venue | `readEventHall`, `readSeating`, `seatCodes`, `zoneOfSeat`, `findFreeSeat`, `zoneOccupancy`. Write via `venue.assignSeat`, `venue.releaseGuestSeat` |
| `sce_tcsk_booths`, `sce_tcsk_booth_shifts` | venue | `readBooths`, `boothKpis` |
| `sce_tcsk_master_contacts` | directory | Query `directory.search`. Import into an event via `guests.upsertMany` |
| `sce_tcsk_sender_mailboxes`, `sce_tcsk_rsvp_forms`, `sce_tcsk_rsvp_responses`, `sce_tcsk_email_deliveries` | comms | Own UI only. Guest effects go through guests commands |
| `sce_tcsk_checkins`, `sce_tcsk_duty_staff`, `sce_tcsk_incidents` | live | `readCheckIns`, roster view |
| `sce_tcsk_media_clippings`, `sce_tcsk_bidding_packages`, `sce_tcsk_daily_reports`, `sce_tcsk_press_releases` | reports | Own UI only |
| Undo/redo stacks (session memory) | core (`useUndo`) | none |
| Selected event, sub-tab, filters | URL (path `[eventId]`, `?tab=`, `?q=`) | Shared by link. The `sce_last_event` cookie (core) backs `/go/[nav]` |
| `localStorage` prefs: `theme`, `sce_sidebar_collapsed`, `sce_beep` | core `src/core/prefs` | Hooks only. Cleared of user data on sign-out (none stored) |
| Gmail access token | comms, in memory only | none (m4a B08) |

## RBAC matrix to enforce

`D` means own department (event lead or supporting department, or the profile's department). `aal2` means AAL2 is required regardless of role. Admin and leader always need AAL2 because they must enroll TOTP.

| Permission | admin | leader | dept_leader | user |
|---|---|---|---|---|
| progress.read, progress.write, progress.create | all | all | D | D |
| progress.delete (soft) | all | all | D | none |
| hard purge of an event | all | none | none | none |
| templates.read / templates.admin | all / all | all / none | all / none | all / none |
| guests.read, guests.write | all | all | D | D |
| venue.seating.*, venue.booths.* | all | all | D | D |
| venue.halls.read / venue.halls.admin | all / all | all / none | all / none | all / none |
| directory.read / directory.admin | all / all | all / none | all / none | all / none |
| comms.read, comms.send, comms.rsvp.manage | all | all | D | D |
| comms.mailboxes.read / comms.mailboxes.admin | all / all | all / none | all / none | all / none |
| live.read, live.checkin, live.manage | all | all | D | D |
| reports.read, reports.write | all | all | D | D |
| reports.issue | all | all | D | none |
| core.settings.edit, core.holidays.edit | all | all | none | none |
| core.users.read | all | all | D | none |
| core.users.manage | all | none | none | none |
| core.backups.create, core.audit.read | all | all | none | none |
| core.backups.restore | all (aal2) | none | none | none |
| own profile (name, password, TOTP) | yes | yes | yes | yes |
| pending or locked | Sees only `/pending`. RLS returns nothing (status check inside `tcsk.actor_role()`) | | | |

Editing the event row itself (date, department, delete) is lead-department only. Supporting departments can work every event-scoped child table. Verified by `verify-sql.mjs` ("supporting department cannot edit the event row").

A soft-deleted event is readable only by holders of `progress.delete` in scope (admin and leader all, dept_leader of the lead department), so they can undo the delete (`0006_core_soft_delete_visibility.sql`). The child rows of a soft-deleted event stay readable by admin only. Verified by `verify-sql.mjs` and mirrored by `memoryDb`.

## Table schema summary

All domain tables have `id uuid pk`, `version int`, `created_at`, `created_by`, `updated_at` and `updated_by`. The event-scoped ones also have `event_id` (FK cascade, deferrable). Most also carry `legacy_id`.

| Table | Key columns and constraints |
|---|---|
| sce_tcsk_events | name, type, event_date date, event_time time, location, department FK, supporting_departments text[], lead_person, budget_vnd bigint, target_guests, status, note, deleted_at |
| sce_tcsk_task_groups | phase, name, lead_person, note, sort. unique(event_id, id) |
| sce_tcsk_steps | group_id (composite FK with event_id), name, requirement, offset_days ≥ 0, day_type, target_phase, completed_at/by, assignee, template_key, sub_tasks jsonb[], links jsonb[], sort |
| sce_tcsk_templates | template_key unique, base_builtin_key, level, code, title, kind, description, content_html (sanitized) |
| sce_tcsk_guests | name, guest_group, title, organization, phone, email, send_method, invite_status, rsvp_status, rsvp_source, rsvp_at, substitute_name, has_banquet, notes, checkin_code (DB default, unique per event), master_contact_id |
| sce_tcsk_hall_templates | name, location, description, zones jsonb (non-empty) |
| sce_tcsk_event_halls | event_id unique, template_id, zones jsonb |
| sce_tcsk_seat_assignments | seat_code (pattern-checked), guest_id. unique(event, seat), unique(event, guest), composite FK to guests |
| sce_tcsk_booths | code unique per event, size, company (required unless available), products, subsidy_percent ∈ {0,50,100}, status, contact, staff |
| sce_tcsk_booth_shifts | shift_date, shift_label, officer_name, officer_user_id, department, phone, zone |
| sce_tcsk_master_contacts | name, guest_group, title, organization, phone, email, address, tax_code, notes, has_banquet, search_text (folded) |
| sce_tcsk_sender_mailboxes | display_name, email unique, client_id, is_default (partial unique: one default) |
| sce_tcsk_rsvp_forms | event_id unique, form_url, sheet_csv_url (https), auto_sync, auto_add_new_guests, column_map, last_sync_at |
| sce_tcsk_rsvp_responses | row_hash unique per event, responded_at, parsed fields, raw jsonb, matched_guest_id, match, applied_at |
| sce_tcsk_email_deliveries | campaign_id, guest_id, email, subject, sender_email, status, sent_at, error. unique(campaign, email) |
| sce_tcsk_checkins | guest_id unique per event, checked_in_at, checked_in_by, desk, gift_given_at |
| sce_tcsk_duty_staff | name, user_id, department, desk 1..4, role_label, checked_in_at |
| sce_tcsk_incidents | seq (trigger, per event, advisory lock), location, description, urgency, assignee, status, reported_at, resolved_at (consistent with status), resolution_note |
| sce_tcsk_media_clippings | outlet, title, published_on, media_type, url (http/https) |
| sce_tcsk_bidding_packages | code unique per event, name, department, budget_vnd, winning_price_vnd, contractor, status |
| sce_tcsk_daily_reports | report_date unique per event, workdays_to_event, progress_percent, highlight, blockers, signatory, document_number, figures jsonb, issued_at/by. Immutable (no update/delete policy) |
| sce_tcsk_press_releases | title, timing, contact, content |
| core | sce_tcsk_profiles (+status), sce_tcsk_system_settings (singleton), sce_tcsk_holidays, sce_tcsk_departments, sce_tcsk_role_permissions, sce_tcsk_backups (+kind, format), sce_tcsk_audit_logs (+event_id, entity, entity_id), sce_tcsk_app_data (+migrated_at, read-only) |

SQL functions callable by the app are listed in `RpcMap`. They are `sce_tcsk_create_backup`, `sce_tcsk_restore_backup`, `sce_tcsk_set_profile_role|department|status`, `sce_tcsk_update_profile_name`, `sce_tcsk_update_settings`, `sce_tcsk_replace_holidays`, `sce_tcsk_admit_profile` and `sce_tcsk_ensure_profile`. Audit rows are not among them: users cannot execute `sce_tcsk_write_audit` or `sce_tcsk_audit_command`, and only the pipeline's service-role audit writer (`commandAuditWriter`, called by `dispatch` alone) writes a command's row. Backups snapshot every table whose comment is `sce:owner=…` (derived from the catalog, so new tables are included without edits). Restore runs in one transaction with deferred constraints, takes a "before restore" snapshot first, and writes an audit row.

## Migration plan from the legacy blob

1. **Rehearse (no production access needed).** Export the blob with the legacy "Tải File JSON Về Máy" button, or have the operator run `select data from sce_tcsk_app_data where id = 1`. Run `supabase start` locally and apply `0001`-`0005`. Then run `npx tsx scripts/import-legacy.ts --source file --path export.json --dry-run`. Review the report, which lists counts per table, skipped demo rows, coerced values, orphans and admins to demote.
2. **Cutover.** Apply the migrations on production (SQL editor or `supabase db push`). `0001` drops every existing policy on the four legacy tables and makes the blob read-only, so the legacy app stops writing at this moment. That ends the dual-writer window. The profiles trigger keeps `is_active` in step with `status` while legacy tabs are still open.
3. **Import.** Run `scripts/import-legacy.ts --source database --keep-admins <emails>` with the service role. It copies the blob verbatim into `sce_tcsk_backups` (`kind 'pre_migration'`, `format 1`). It then runs each feature's pure `LegacyImporter` in dependency order and upserts on deterministic uuid v5 ids. It demotes admins not listed, because they may come from the B1 email backdoor, and sets `sce_tcsk_app_data.migrated_at`. Re-running converges.
4. **Bootstrap.** If no admin was kept, run `select tcsk.bootstrap_first_admin('<email>')`.
5. **Deploy.** Deploy the Next.js app. `/code/index.html` redirects to `/`, and the service worker version bumps so installed PWAs pick up the new shell.
6. **Verify.** Compare the import report against row counts, then run the role smoke test (admin, leader, dept_leader, user, pending).
7. **Rollback.** The blob is untouched and the pre-migration backup exists. Rolling back means re-creating the legacy permissive policies by hand and serving `legacy/index.html`. That reopens core B5, so it is an emergency path only.

Key mapping, implemented by the owning feature's importer.

| Legacy key or field | New home |
|---|---|
| `events` (or `programs` when `events` is empty) | sce_tcsk_events. `expectedDelegates`/`date` are dropped (never written). `budget` goes through `parseVnd`, and unparseable values become null with an issue. `groups`/`steps` go to the child tables. `calculatedDeadline` is dropped (derived). `isOverdue` is dropped |
| event `googleFormUrl…formResponsesCount` | sce_tcsk_rsvp_forms |
| `eventGuests[e]` | sce_tcsk_guests. `seatCode`/`assignedSeat` are dropped in favour of `eventSeating`, with disagreements reported. `isCheckedIn`/`checkInTime`/`hasGiftPackage`/`checkInStaff` go to sce_tcsk_checkins, with `'HH:MM:SS'` combined with the event date and flagged `coerced`. `emailStatus…` goes to sce_tcsk_email_deliveries under one synthetic legacy campaign |
| `eventSeating[e]` | sce_tcsk_seat_assignments. Codes absent from the event hall are kept and reported as orphans |
| `eventHallConfig[e]`, `hallTemplates` | sce_tcsk_event_halls, sce_tcsk_hall_templates. `totalSeats` is dropped. Duplicate prefixes are renamed and reported |
| `eventBooths[e]` | sce_tcsk_booths. Duplicate codes get a suffix and are reported |
| `eventDutyRoster[e]`, `eventIncidents[e]` | sce_tcsk_duty_staff (desk parsed from "Bàn n"), sce_tcsk_incidents (seq from "SC-NN") |
| `masterGuestDb` | sce_tcsk_master_contacts |
| `systemSettings` (6 fields), `.unitSenderEmails`, `.googleClientId` | settings row; sce_tcsk_sender_mailboxes; settings `google_client_id` |
| `systemTemplates` | sce_tcsk_templates. Only entries that differ from the built-in, plus custom ones |
| `eventMediaClippings`, `eventBiddingPackages`, `dailyReports` | reports tables |
| `departments` | dropped (dead, core B22) |

Demo detection skips rows unless `--include-demo` is passed. This covers the sample event names from `initDefaultSampleEvents`, guest ids `gst_vip_01…gst_bc_04`, booth ids `bth_01…16`, `duty_01…04`, `sc_01/02`, `media_01…04`, `bid_01…03`, `rpt_*` and `GF-SIM-01`. Each is reported with its event.

## Where each legacy bug class is eliminated structurally

| Bug class | Structural fix | Spec ids |
|---|---|---|
| Email/metadata admin, client-chosen role | Profile created by DB trigger as user/pending. Role changes only in SQL functions that check `core.users.manage` | core B1, B2, B41; m3 B06 |
| Approval and lock cosmetic | `status` is checked inside `tcsk.actor_role()`, so every policy denies pending/locked | core B3, B38 |
| 2FA never enforced | `gateFor` + `tcsk.aal_ok()` in every policy, and TOTP is mandatory for admin/leader | core B4 |
| RLS open, anon reads blob | All legacy policies dropped. No anon grants. Per-perm policies on every table | core B5; m4b BUG-16 |
| Client-only RBAC, unguarded tabs | One matrix used by proxy, `requestContext`, the dispatcher and RLS | core B6, B14; m2 BUG-20; m3 B05; m4a B07; m4c B8, B9; m5 BUG-41 |
| No department scoping | `has_event_perm` department grant over lead + supporting departments | core B7 |
| Admin create hijacks session | `core.users.create` uses service-role `auth.admin.createUser` on the server | core B8 |
| Save before/after failed load, sample overwrite | No client store, no whole-document save. Every write is a per-row command | core B9; m5 BUG-42 |
| Whole-blob last-write-wins | Per-entity rows with `version` and an `expectedVersion` guard. Per-actor fact tables | core B10; m2 BUG-08; m4a B54; m4b BUG-17; m4c B53; m5 BUG-05 |
| Write-only localStorage, PII after sign-out | No data in browser storage. ESLint bans `localStorage` outside prefs | core B11; m2 BUG-10, BUG-11; m3 B41; m6 BUG-41 |
| Settings save wipes mailboxes | Mailboxes in their own table. Settings update is a typed patch | core B12 |
| Settings never consumed | Pure functions take `settings`, and `orgIdentity` is the only letterhead source | core B13; m2 BUG-07; m3 B15, B37; m4a B47; m4c B36; m5 BUG-18 |
| Silent save failures | `useCommand` always toasts failures. Success toasts are explicit per call | core B15; m2 BUG-10; m3 B23 |
| Backup per click, unbounded | At most one auto snapshot per day (unique index), 30-day prune, manual kept | core B16; m2 BUG-09; m5 BUG-43 |
| Restore stale/unaudited | One SQL transaction, admin + AAL2, pre-restore snapshot, audit, `router.refresh` | core B17; m6 BUG-42 |
| Audit nearly empty, missing recorder | Audit is mandatory in the `MutationSpec` return type. Profile functions self-audit | core B18; m3 B24; m4a B27; m4c B33 |
| Whole-blob undo | Undo runs the inverse command through the pipeline. Session-scoped | core B19 |
| Dead/duplicate screens and code | One users screen, no runtime config modal, registry-derived nav | core B21-B23, B26; m3 B07 |
| Inconsistent labels/enums | One registry per enum in `core/vocab` | core B27; m4a B44; m4b BUG-31; m6 BUG-30 |
| HTML injection | React text by default. `SanitizedHtml` brand is the only raw-HTML input. `html` tag escapes. Toasts and dialogs are text-only | core B28, B29; m2 BUG-18; m3 B01, B02, B29-B31; m4a B01-B06, B09; m4b BUG-07, BUG-08; m4c B1-B4, B7, B10-B12; m5 BUG-12-14; m6 BUG-25, BUG-26 |
| `javascript:` links | `SafeUrl` brand plus DB check constraints on url columns | m2 BUG-19; m6 BUG-25 |
| CSV formula injection | `toCsv` applies `safeSpreadsheetText`. Xlsx writes text cells | m2 BUG-41; m4a B49; m4c B6 |
| Auto-seeded demo data | No seeding code path in production. Import skips demo rows | core B32; m2 BUG-02; m4a B10, B11, B42; m4b BUG-02, BUG-20; m4c B29; m5 BUG-01, BUG-02; m6 BUG-01 |
| Id collisions | Client `randomUUID()`, uuid PKs | m2 BUG-01; m4a B42 |
| Orphans on delete | FK cascade from events and guests | m2 BUG-15; m4a B57 |
| Weekend/holiday/UTC date math | `core/dates` with a `WorkCalendar` parameter, VN "today", `fileDateStamp` | m2 BUG-03, BUG-04, BUG-06, BUG-31, BUG-42; m3 B13, B14; m6 BUG-31, BUG-48; m5 BUG-29 |
| Field-name drift (`expectedDelegates`, `date`, `assignedSeat`, `isOverdue`) | One typed model. Importer maps the legacy names once | m2 BUG-38, BUG-39; m4a B23, B24; m4c B15, B16; m5 BUG-03; m6 BUG-02, BUG-05 |
| Two seat sources, hard-coded zones, `'A-'` VIP heuristic | One seat table, hall zones with a `vipZone` flag, `findFreeSeat` | m4b BUG-04-06, BUG-32; m5 BUG-19, BUG-21 |
| QR format mismatch, unsafe matching, toggle on rescan | One encoder, `matchScan` outcomes, idempotent `live.checkIn` | m4a B13, B35, B36; m4c B14; m5 BUG-06-09 |
| Form sync overwrites, global cache | Responses table keyed by row hash. `guests.applyRsvp` applies only newer responses | m4a B14-B22; m4c B19-B24, B30, B31 |
| Fabricated report figures | `reportFigures()` from owners' read models. Issued reports are immutable snapshots | m6 BUG-02-08, BUG-12, BUG-13, BUG-38, BUG-40 |
| Money parsing, savings clamp | `parseVnd`, signed `biddingSavingsPercent` | m6 BUG-34, BUG-35 |
| Print prints the app | `(print)` route group with `PrintPage` and `@page` | m2 BUG-29; m4a B37; m4b BUG-27; m5 BUG-32; m6 BUG-44 |
| Inaccessible modals | `Dialog` primitive (role, focus trap, Esc, return focus), zoom allowed, no `select-none` | core B30; m2 BUG-36; m5 BUG-37; m6 BUG-45 |
| Misleading claims, fake counts | Counts derived from data. Copy reviewed in kit stories | core B31; m3 B25, B26; m4c B38; m4b BUG-15, BUG-18 |
| CDN/Tailwind hygiene, PWA offline gaps | npm-pinned deps, Tailwind build, Serwist precache with build id, update prompt | core B34, B35; m2 BUG-37; m6 BUG-47 |
| Idle/session lifecycle, recovery | Shell idle timer with a warning at 28 min. `/reset-password` handles `PASSWORD_RECOVERY`. One auth listener | core B20, B24, B25, B36, B37, B42 |

## Design red-flags screen

- **Shallow module.** `Db`, the dispatcher and the registry each hide a lot behind a small surface. One risk remains. `Table` exposes `insertMany`, `upsertOn` and `removeWhere` beside CRUD. Each serves a real access pattern (bulk import, idempotent set, clear-all), and none forces the caller to coordinate several calls.
- **Information leakage.** Snake case, PostgREST error codes and supabase-js types stay inside `src/core/db`. Commands return domain types. One known leak is accepted. Table names (`'sce_tcsk_checkins'`) appear in manifests and in `useEventChanges`, because realtime subscriptions are per table.
- **Temporal decomposition.** None. Modules follow domain ownership. The import is per-feature importers, not one load/transform/save script that knows every shape.
- **Pass-through.** `index.ts` re-exporting `contract.ts` is an entry point, not a layer. `ctx.call` adds the target's permission and audit, so it is a policy boundary.
- **Split ownership.** Every table has one writer. Guest RSVP from forms goes through `guests.applyRsvp`, seats through venue, and check-ins through live. The roster view is a read across owners, merged at read on purpose.
- **Two ways to do one task.** There is one write path (dispatch), one data path (`Db`), one date module, one QR encoder, one escape/sanitize pair, one download helper, and one dialog/toast API. ESLint makes the alternatives fail to build.
- **Importable internals.** ESLint blocks deep imports into other features and into `@supabase/*`.
- **Hand-synced list.** The TS/SQL permission matrix is generated. Feature dirs, routes, tables and command prefixes are checked by `check:contract`. The backup table list is derived from catalog comments. One hand list remains. `src/features/registry.ts` lists the nine features, and `check:contract` compares it to the directory listing.
