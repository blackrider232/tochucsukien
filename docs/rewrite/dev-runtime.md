# Dev memory runtime

`SCE_DEV_MEMORY=1 pnpm dev` runs the whole app without Supabase, so a module worker can open its screens in a real browser. It is on only when `SCE_DEV_MEMORY=1` and `NODE_ENV !== 'production'`. Every entry point in `src/core/dev/runtime.ts` throws otherwise, and `/dev/*` is a 404 in a production build.

With it on:

- `requestContext()` returns a signed-in actor picked by the `sce_dev_role` cookie (admin when the cookie is missing or unreadable). Admin and leader count as AAL2 with TOTP, so no MFA gate applies.
- `ctx.db` is a `memoryDb` on one process-wide database. It lives on `globalThis`, so editing code and hot reload keep the data. Its RLS is the same emulation the tests use. It reads `permissionMatrix()` and the `register_table` policies in `supabase/migrations`, so a feature's new table is covered once its migration exists.
- Settings are the defaults of `0001_foundation.sql`. Holidays are the fixed-date public holidays of 2026 and 2027 (1/1, 30/4, 1/5, 2/9), as `0005_reference_seed.sql` seeds them.
- The proxy runs the usual gate and route guard against the dev actor. A pending actor lands on `/pending`, and a chuyên viên opening `/admin/users` is sent to `/events?denied=1`.
- `useEventChanges()` subscribes to nothing and reports `connected: false`.
- Sign-out clears the role cookie, so the next page is admin again.

## Adding fixtures for your feature

Export `devSeed` from `src/features/<key>/server/index.ts`. `registry-server.ts` picks it up with no further edit.

```ts
import type { DevSeed } from '@/core/dev/runtime';
import { eventsTable } from './tables';

export const devSeed: DevSeed = async (db, { id, as }) => {
  await db.table(eventsTable).insertMany([
    { id: id('Event', 'hn-xtdt'), name: 'Hội nghị XTĐT 2026', type: 'hoi_nghi', eventDate: '2026-12-15', department: 'Phòng Xúc tiến đầu tư', supportingDepartments: [] },
  ]);
  // Rows a chuyên viên created: write through their Db.
  await as('user').table(eventsTable).insert({ ... });
};
```

- `db` acts as the dev admin. Writes go through RLS, NOT NULL, defaults and unique keys, the same as in the app.
- `id(entity, key)` gives the same uuid after every reset, so a URL such as `/events/<id>/guests` stays valid.
- `as(role, department?)` and `actor(role, department?)` act as another dev identity.
- Seeds run once, on the first request, in registry order (`core`, `progress`, `templates`, `guests`, `venue`, `directory`, `comms`, `live`, `reports`). A seed can rely on rows that earlier features seed. Read them with `db.table(...).list()` or derive their ids with the same `id(...)` call.
- A seed that throws fails the request with `devSeed of feature "<key>" failed`. The next request starts over from an empty database.
- Keep fixtures small and realistic. Product decision 13 (no automatic demo data) still holds for the real app. This only runs in dev.

## Switching role

Open `/dev/role`. Choose admin, leader (Ban Giám đốc), dept_leader, user, pending or locked. For dept_leader, user, pending and locked, also choose a department (default Phòng Xúc tiến đầu tư). The form sets the cookie and opens `/`.

From a script, set the cookie directly. The value is the role, optionally followed by `:` and a department code (`HCTC`, `PTDN`, `XTDT`, `TVDN`):

```sh
curl -b 'sce_dev_role=dept_leader:PTDN' http://localhost:3000/
```

Each identity has a fixed user id, so `created_by` and audit rows stay attributable after a switch. Only the six default identities have a row in `sce_tcsk_profiles`. A department variant such as `user:PTDN` acts normally but is missing from user lists.

## Resetting data

`GET /dev/reset` drops every row, runs the seeds again and answers `200 {"reset":true}`. The button on `/dev/role` POSTs there and returns to `/`. Restarting `pnpm dev` resets as well.

## What it does not prove

- **RLS and SQL.** The policies are emulated in TypeScript. CHECK constraints, foreign keys and cascades, triggers other than the managed columns, and SQL functions beyond the RPCs in `src/core/db/memory.ts` are not run. `pnpm verify:sql` and an integration run against a local Supabase remain the proof.
- **Auth.** There is no login, sign-up, password reset, MFA enrolment or challenge, session expiry or `auth.users`. `core.users.create` needs the service role and fails here.
- **Realtime.** No change from another tab or user reaches the page. Reload to see it.
- **Persistence and concurrency.** Data lives in one Node process and disappears on restart. Two browsers share it, but nothing is serialised the way Postgres does.
