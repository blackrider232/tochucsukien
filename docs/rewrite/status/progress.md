# Status: feature `progress` (M2, Tiến độ sự kiện)

Branch `t3/progress-module-rewrite`. The feature lives in `src/features/progress/`. Routes are `/events`, `/events/new`, `/events/[eventId]/plan`, `/events/[eventId]/plan/print` and `/events/summary` (both under `(print)`).

## What is built

- **Domain** (`domain/`). `schedule.ts` holds the deadline, step state, progress, countdown and daily-report window selectors, all derived and never stored. `dashboard.ts` holds the summaries, filters, diacritic-free search, KPI counts and pop-up lists. `schemas.ts` holds the zod schemas the forms and commands share. `instantiate.ts` and the generated `standard-templates.ts` hold the SCE process (hội nghị 7 groups and 32 steps, hội chợ 33 steps). `export.ts` holds the legacy export columns.
- **Server** (`server/`). `tables.ts`, `reads.ts` (`listEvents`, `readEvent`, `readEventPlan`, `listEventPlans`) and `commands.ts` hold 18 commands. Each one is audited with the legacy summary string and returns an inverse for undo. `legacy-importer.ts`, `dev-seed.ts` and `screen-data.ts` (per-event UI permissions) complete the folder.
- **Screens** (`components/`). The dashboard has KPI cards and the four pop-ups, filters, view modes and the event, group and step accordion. The event wizard serves create (page) and edit (dialog). The plan page is one event, fully open. The step, sub-task, link, note and group dialogs are there. The A4 plan and an A4 summary of all events print. Export goes to Excel (.xlsx) and CSV.
- **Slots**. The top-bar daily-report bell links to `/events?popup=daily`. The `eventActions` slot holds "In kế hoạch".
- **Tests** (`__tests__/`, 137). They cover the worked examples of m2 §3.2 and §3.4, holidays and làm bù, the T± labels, and the template diffed against the legacy generator run in Node. Every command is tested for denial twice: as an unrelated actor, where the emulated RLS answers first, and with RLS bypassed (`runWithoutRls` in `harness.ts`), where only the command's own `authorize` and checks can refuse. Both assert no write and no audit. There are also audit text and undo round trips, deadline order, percent rounding, search narrowing, id uniqueness, the importer fixture, XSS rendering and CSV formula injection.
- **Template regeneration**. Run `pnpm tsx src/features/progress/__tests__/generate-standard-templates.ts`. `standard-templates.test.ts` fails if the table drifts from `legacy/index.html`.

## Bugs (m2 §6)

36 fixed, 5 not applicable, 2 deferred.

| Bug | Result |
|---|---|
| BUG-01 | Fixed. Ids are `randomUUID` from the client. Template ids are uuid v5 of (event, key), so two events never share one. The importer scopes group and step ids by event and gives colliding event ids a `#2` key. Tests cover it. |
| BUG-02 | Fixed. Nothing seeds itself. An empty list is a valid state. The only fixture is `devSeed`, in dev memory mode. |
| BUG-03 | Fixed. Today and past use calendar days. The workday count is only for the label (`formatCountdown`). The window rule is `days ≥ 0 && workdays ≤ threshold`. The §3.4 table is a test. |
| BUG-04 | Fixed. `event_date` is NOT NULL. The importer takes a missing date from `created_at` (VN date) and reports it, or drops the event and reports that. |
| BUG-06 | Fixed. Every working-day count takes the `WorkCalendar` built from `sce_tcsk_holidays` (decision 1). |
| BUG-07 | Fixed. The window uses `settings.dailyReportThresholdDays`. The template text fills the guest and badge quota, the threshold and the field hours from settings, and the step_6a offset is the threshold. |
| BUG-08 | Fixed. Writes are per row with `expectedVersion`, and a sub-task or link edit is guarded by the version it just read. |
| BUG-09 | Fixed by the foundation. There is no backup per click. |
| BUG-10 | Fixed. `useCommand` toasts every failure. |
| BUG-11 | Not applicable. There is no offline mode and no localStorage data (decision 6). |
| BUG-12 | Fixed. "Đã hoàn thành" is derived: steps exist and all are done (decision 3). The readers fill `SceEvent.status` from the steps, and the stored column is ignored. |
| BUG-13 | Fixed. One `statusLabel` feeds the filter, the card and the export. |
| BUG-14 | Fixed. A blank event offers "Áp dụng quy trình chuẩn SCE" and "Thêm nhóm việc". Groups have create, edit and delete. The create toast now says what actually happened. |
| BUG-15 | Fixed. Delete is soft and child tables cascade by FK. The undo of a delete works only for an actor who can still read the event they deleted, which today is an admin acting in the deleter's own session. A dept_leader can delete but gets no undo, and no screen lists deleted events, until change request B lands. The confirm promises only "Có thể hoàn tác ngay sau khi xóa." |
| BUG-16 | Fixed by a default (Q5). A type change keeps every step and shows a hint. "Áp dụng quy trình chuẩn" adds the missing template groups. |
| BUG-17 | Fixed. The department options are exactly the ones the actor may create for. The default is the profile department only when it is one of them. |
| BUG-18 | Fixed. Everything renders as React text with no inline handlers. `templateKey` is restricted to `[A-Za-z0-9_-]`. A test checks this. |
| BUG-19 | Fixed. A link must parse as `SafeUrl` (http or https) in the form, the command, the row parse and the importer. A test checks this. |
| BUG-20 | Fixed. The matrix is checked in the command (`authorize`), in RLS, and in the UI for hiding. Every command has a denial test through RLS, and since the review fixes also one with RLS bypassed that proves the command's own check. Before that, denials were RLS-only: an unrelated actor got `not_found` from the emulated RLS before any command code ran. |
| BUG-21 | Fixed. The pop-up shows the event's own department. |
| BUG-22 | Fixed. The type chip comes from `EVENT_TYPES`. |
| BUG-23 | Fixed. Past events read "Đã diễn ra N ngày trước". |
| BUG-24 | Not applicable. The dead `step.dept` field is gone. |
| BUG-25 | Not applicable. The dead branch and id are gone. Focus uses `step-<uuid>`. |
| BUG-26 | Fixed. The heading reads "(T0 − {fieldPresenceHours}h đến T+N)", and the captions count real groups and steps. |
| BUG-27 | Fixed. `offsetLabel` prints T−n, T+n or T0 with its unit in rows, dialogs and print. |
| BUG-28 | Fixed. Every day count names its unit (ngày làm việc or ngày lịch). |
| BUG-29 | Fixed. The `(print)` route uses `PrintPage`, agency lines from settings and today's date. |
| BUG-30 | Fixed. "In tổng hợp" prints every visible event (`/events/summary`), per Q9. |
| BUG-31 | Fixed. A real .xlsx through the kit, plus CSV. File names carry the VN date. |
| BUG-32 | Fixed. View mode and search seed the open sets, and headers always toggle. |
| BUG-33 | Fixed. Offset hides for day-of steps. Create and edit have their own titles. The form resets per open. |
| BUG-34 | Not applicable. The hidden banner is removed (Q8). Its content is in KPI 2 and the bell. |
| BUG-35 | Fixed. Search folds diacritics, includes the department and sub-task names, and narrows to the matching groups and steps. Matches are not highlighted. |
| BUG-36 | Fixed. Kit `Dialog` handles focus trap and Esc, and every destructive action uses the same `confirm`. |
| BUG-37 | Not applicable. Tailwind v4 is built and uses kit tokens only. |
| BUG-38 | Fixed on the M2 side. `targetGuests` is the only field. The importer falls back to `expectedDelegates`. Consumers are other modules. |
| BUG-39 | Deferred to M6. `stepState` and `eventProgress` are exported for M6 to use instead of `isOverdue`. |
| BUG-40 | Fixed. The step dialog picks the form from a `Select` over `templateKeyOptions(catalog)`, and the step row resolves its key with `resolveTemplateKey(key, catalog)`, so an unknown key or a deleted custom template shows "Chưa gắn biểu mẫu" (see Foundation-B). |
| BUG-41 | Fixed. `toCsv` and the xlsx writer use `safeSpreadsheetText`. A test checks this. |
| BUG-42 | Fixed. `useToday` re-reads the VN date every minute. |
| BUG-43 | Fixed. Departments come from `DEPARTMENTS`, in one order. |
| BUG-44 | Fixed. Steps are ordered by deadline, ties by stored order, on screen and in print. |

## Product questions (m2 §7.4)

| Question | Resolution |
|---|---|
| Q1 holidays | Decision 1. |
| Q2 completed | Decision 3, derived. |
| Q3 sub-tasks | Decision 4. Sub-tasks never complete the step, and the dialog says so. |
| Q4 stored deadline | Derived (design). The importer drops `calculatedDeadline`. |
| Q5 type change | Default: keep the steps, show a hint, and let "Áp dụng quy trình chuẩn" add the missing groups. No per-event template version. |
| Q6 offline | Decision 6. |
| Q7 permissions | Decision 5, the matrix. Editing the event row is lead department only. Supporting departments work the plan. |
| Q8 banner | Removed. |
| Q9 "In tổng hợp" | One A4 landscape summary of every visible event. |
| Q10 demo events | Decision 13. Only the dev fixture, `[DEV] … (dữ liệu giả)`. |
| Q11 notify | Visual only (KPI, card, bell). No email or push. |
| Q12 sort | Default: upcoming events first, nearest T0 first, then past events, most recent first. |

## Foundation feedback

1. **Import cycle in `@/core/commands`.** A feature's server module that imports `defineCommands` or `CommandError` at runtime makes `pnpm check:contract` crash with `ReferenceError: Cannot access 'featureServers' before initialization`. The cause is that `index.ts` re-exports `dispatch`, and `dispatch.ts` reads `featureServers` at module top level, so the crash comes whenever `registry-server` is the entry point. `src/features/README.md` tells workers to use `defineCommands`. Workaround here: type-only imports (`CommandsOf<'progress'>`) and `DbError` for failures, which loses the specific Vietnamese messages. Change request A.
2. **Undoing a delete works for admins only.** RLS (and its `memoryDb` mirror) hides soft-deleted events from everyone but admin, so `progress.restoreEvent` fails for the dept_leader who deleted the event. `deleteEvent` now returns the undo only when the actor can still read the event, so a dept_leader gets none instead of one that fails. Change request B.
3. **Missing foundation pages.** The design lists `(app)/events/[eventId]/layout.tsx` (readEvent or notFound, switcher, sub-tab bar, `eventActions`) and `[eventId]/page.tsx` (redirect to plan), but neither exists. So there is no event header or sub-tab bar, the `eventActions` slot is never rendered, and `/events/<id>` is a 404. `(app)/page.tsx` renders "SCE" instead of redirecting to `/events`.
4. **Print routes need their own URL.** `(print)/events/[eventId]/plan/page.tsx` would resolve to the same URL as `(app)/events/[eventId]/plan/page.tsx`, which is a Next.js build error. This module uses `(print)/events/[eventId]/plan/print`. Document `<segment>/print` for the other workers.
5. **Contract stubs throw at runtime.** `contract.ts` functions throw "not implemented" until their owner merges. A worker who calls another feature's pure helper (here `resolveTemplateKey` and `templateHref`) breaks the page. Templates has merged, so the try/catch around that call is gone (Foundation-B item 1).
6. **Kit gaps.** The kit has no `Textarea`, no standalone controlled checkbox, no checkbox group or multi-select, and `Button` has no `href` or `aria-pressed`. `NumberInput` has no `disabled`, `KpiCard` has no tooltip, and `IconName` has no list-check, paperclip or layers icons. This module adds `TextArea` and `CheckToggle` in `components/fields.tsx` and deep-imports `useControl` and `controlClass` from the kit. These should move into the kit.
7. **The contract is narrower than the spec.** It declares five commands, while the spec needs step, sub-task, link, note, group and template commands. This module adds 13 verbs by augmenting `CommandMap` in its own `server/commands.ts`, which `check:contract` accepts. Say in the brief that this is allowed.
8. **`progress.create` is an event-scoped permission with no event.** It is authorized with a `resource` of the draft's lead department. The design could say so.
9. **`SceEvent.status` is a stored column, which contradicts decision 3.** The readers derive it.
10. **`DevSeedHelpers` has no settings or calendar.** The seed uses `DEFAULT_SETTINGS`.
11. **`memoryDb` has no FK cascade.** `deleteGroups` deletes steps explicitly so tests and dev match Postgres.
12. **Spec labels vs vocab.** Spec labels with emoji ("🏛️ Hội nghị / Tọa đàm") differ from `EVENT_TYPES`. This module follows the vocab (one label everywhere) and adds the "(Luồng 1/2)" suffix in the wizard only.

## Contract change requests

- **A.** Stop re-exporting `dispatch`, `useCommand` and `useUndo` from `@/core/commands/index.ts`, or build the lookup lazily inside `dispatch()`, so feature servers can import `defineCommands` and `CommandError`.
- **B.** Let an actor who holds `progress.delete` on the lead department read their department's soft-deleted events. Change `sce_read` on `sce_tcsk_events` and its mirror in `src/core/db/memory.ts`. Until then, undo of a delete works for admin only. The command already adapts: it offers the undo whenever the actor can read the event they deleted.
- **C.** Add `(app)/events/[eventId]/layout.tsx`, `(app)/events/[eventId]/page.tsx` (redirect to `./plan`) and the `(app)/page.tsx` redirect to `/events`.
- **D.** Add `Textarea`, a controlled `Checkbox` or `Toggle`, and the missing icons to the kit.

## Review fixes

An independent review returned PASS WITH FIXES. Each finding was reproduced with a failing test first.

| Finding | Fix | Commit |
|---|---|---|
| 1. Forged completion. `createStep` and `createGroups` took `completedAt` and `completedBy` from the client. | Step input carries `done` only. The server stamps the acting user and `ctx.now` (`stepInsertRow`). Undoing a step or group delete re-completes the step as the person who undoes it, not as the original completer, and the audit says "đánh dấu hoàn thành". Soft-deleting steps would need a migration, so it was not done. | `cabdb55` |
| 2. The confirm promised an admin restore that no screen offers, and a dept_leader's undo failed. | `deleteEvent` returns the restore inverse only when the actor can still read the event. The confirm says "Có thể hoàn tác ngay sau khi xóa." No deleted-events screen was built. | `7f3f52b` |
| 3. The importer let in `offset_days` 999 and `target_guests` 0. | Offsets above 365 are clamped to 365, guests outside 1 to 100000 become 150, and each change is an issue in the report. | `7f902a6` |
| 4. The wizard default department for an admin was Phòng Hành chính - Tổ chức. | The default is the profile department, else Phòng Xúc tiến đầu tư (m2 §1.7). | `fea2bde` |
| 5a. The commands' own permission checks were untested. | `runWithoutRls` runs the pipeline with an admin-like Db and a weak actor. Mutating the delete or restore permission, the lead-department scope, the department-change check or the create resource now fails a test. | `7927fc1` |
| 5b to 5d. Deadline order (BUG-44), `Math.round` and search narrowing (BUG-35) survived mutation. | `schedule.test.ts` and the new `dashboard.test.ts` cover them. Reversing the sort or its tie-break, `floor` or `ceil` for the percent, and dropping any search source or the narrowing now fails. | `7f9e8e8` |
| 6. Two overstated claims in this file. | BUG-15 and BUG-20 and the test summary above now say what holds. | this commit |

Known limit of finding 1: a completion restored by undo is stamped now by the person who undoes it, so the original completion time and name are lost. The alternative was to trust a stamp carried back from the client.

## Foundation-B (branch `t3/foundation-b-cron-identity-progress`, from `dev` at `8215cee`)

1. **Template picker and catalog (templates change requests C and D).** `PlanScreenData` has `templates` (id, code, title, origin of every template the actor can read). The three pages read it with `listTemplates(ctx)` from `@/features/templates/server` and `screenData(ctx, plans, templates)` hands it on. `StepDialog` shows "Mã Biểu Mẫu Liên Kết" as a `Select` over `templateKeyOptions(templates)` (built-ins first, then "Tùy chỉnh: …"), with "Chưa gắn biểu mẫu" as the empty choice. A legacy key (`form_giaymoi`) opens on the form it maps to (`form_giaymoi_vip`) and saves as that id. A key the library does not know stays as its own option, "Mã hiện tại (chưa gắn biểu mẫu): …", so opening the dialog and saving never blanks it silently. The step row calls `resolveTemplateKey(key, templates)` with no try/catch, so a step that points at a deleted custom template says "Chưa gắn biểu mẫu" instead of linking to a page that no longer exists. The kit `Select` on dev is the form `Select`; if foundation-A's standalone one lands, nothing here needs it (the dialog is a form). Tests: `step-template.test.tsx` (6; 4 fail before).
2. **The reports bell counts as reports and the T-n deadlines do.** `isInDailyReportWindow` counted working days in (today, T0]; reports' `workdaysToEvent` and `deadlineOf` count [today, T0). For a Sunday event with a threshold of 10 the bell opened at T-11 (Friday 6 Nov for Sunday 22 Nov); it now opens on the weekend before the T-10 Monday (Saturday 7 Nov), as reports' own screen does. A Saturday event, an event on a public holiday and a property over every T0 from 24 Aug to 13 Sep (a holiday in range) and thresholds 1, 3 and 10 agree with `deadlineOf`: in the window exactly from the day on which a weekend or holiday reads as the T-n working day. The countdown badge text ("Còn N ngày làm việc") still uses core's `countdown` over (today, T0], which is a separate vocabulary and was not changed. Tests: `schedule.test.ts` "the daily-report window opens where…" (4; all fail before).
