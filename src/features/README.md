# Features

One directory per feature key. A module worker owns `src/features/<key>/**` (except `contract.ts`), the route dirs listed in its `manifest.ts`, and migration files named `*_<key>_*.sql`. Everything else is frozen; see "Parallel-work contract" in `docs/architecture/design.md`.

1. Fill `manifest.ts` (nav, sub-tabs, permissions, routes, tables, legacy blob keys).
2. Describe each owned table with `defineTable` and use it through `ctx.db.table(def)`. Never import `@supabase/*`.
3. Every write is a command in `server/commands.ts` (`defineCommands('<key>', {...})`). Import `defineCommands`, `CommandError` and the command types from `@/core/commands`, never from another `@/core/commands/*` path. Throw `CommandError(kind, 'Vietnamese message')` for a business-rule failure; the client shows that message unchanged. Never write `'use server'`.
4. Pages are server components that call `requestContext()`. Client components mutate with `useCommand()`.
5. Read other features through `@/features/<other>` or `@/features/<other>/server`. Change them only with `ctx.call('<other>.<verb>', input)`.
6. Build UI from `@/components/ui`.

## Print pages

A print page cannot share its app page's URL: `(app)/events/[eventId]/guests` and `(print)/events/[eventId]/guests` both resolve to `/events/<id>/guests`, and Next.js refuses to build. Put the page one segment deeper, at `src/app/(print)/<segment>/print/page.tsx` (for example `src/app/(print)/events/[eventId]/guests/print/page.tsx`, served at `/events/<id>/guests/print`). Keep the manifest route as it is (`(print)/events/[eventId]/guests`). It covers the `print` child, and the proxy guards it with the same permission. Link to it with the kit ``<PrintLink href={`/events/${eventId}/guests/print`} />`` and render it with `<PrintPage>`.

## Commands beyond your contract

You may add commands that `contract.ts` does not list. Declare each one in a file of your own (`contract.ts` is frozen), in this exact form, which `check:contract` parses:

```ts
declare module '@/core/commands' {
  interface CommandMap {
    'guests.mergeDuplicates': Sig<{ eventId: EventId; keepId: GuestId; dropIds: ReadonlyArray<GuestId> }, Guest>;
  }
}
```

`check:contract` enforces two rules. Every id starts with `<key>.`. Every verb in your server `commands` record is declared as `'<key>.<verb>'` in a `CommandMap` block somewhere under `src/features/<key>/` (test files do not count). By convention the verb is camelCase and names what it does (`mergeDuplicates`, `restoreEvent`). `defineCommands('<key>', …)` then requires an implementation for every declared verb, the extra ones included.

## Reading a feature that is not implemented yet

Until its owner merges, another feature's read functions and selectors throw `new Error('not implemented')`. Some throw synchronously, before any promise exists. Call each one you need through a small adapter in your own feature, inside `try { await … }`. The adapter turns that error, and only that error, into an explicit state:

```ts
// src/features/live/server/upstream.ts
export type Upstream<T> = { ready: true; value: T } | { ready: false };

export async function rosterOf(ctx: RequestContext, eventId: EventId): Promise<Upstream<ReadonlyArray<RosterEntry>>> {
  try {
    return { ready: true, value: await readRoster(ctx, eventId) };
  } catch (e) {
    if (e instanceof Error && e.message === 'not implemented') return { ready: false };
    throw e;
  }
}
```

On `ready: false`, render a Vietnamese "chưa sẵn sàng" state, for example `<EmptyState icon="users" title="Danh sách khách mời chưa sẵn sàng" />`. Never show it as an empty list, zero counts or a success toast. A command that depends on it throws `CommandError('conflict', 'Chức năng … chưa sẵn sàng.')`.

## Audit rows for partial failures

The pipeline writes a command's audit row when `run()` returns, and also when `run()` throws a `CommandError` that carries an `AuditEntry`. Commands have no transaction, so `run()` can throw after a write has already stuck: a decline saved before venue refused to free the seat, or a seat batch that could not put back a seat someone else took. Put what really happened in the error.

1. Throw `new CommandError(kind, message, undefined, entry)`. The pipeline writes `entry` under the `authorize.perm` of the command whose `run()` threw it, as the signed-in actor, before it returns the failure. Inside a command reached by `ctx.call`, that is the inner command, and the outer command writes no second row.
2. No feature writes an audit row itself. The pipeline writes every row through a writer that feature code never receives, and the database refuses a row whose permission the actor lacks on the event's departments, or whose action or entity is core's.
3. Say in the summary what stuck, what did not, and what a person must do. The message names the same loss.
4. Carry the entry only on a path that throws after something stuck. A failure that changed nothing, or was rolled back completely, throws without one. A path that returns gets its row from the pipeline.

```ts
async function releaseSeat(ctx: CommandContext, eventId: EventId, guestId: GuestId, seat: SeatCode, saved: AuditEntry) {
  try {
    await ctx.call('venue.releaseGuestSeat', { eventId, guestId });
  } catch {
    throw new CommandError('conflict', `Đã ghi nhận báo vắng nhưng chưa giải phóng được ghế ${seat}. Vui lòng giải phóng ghế này thủ công ở sơ đồ chỗ ngồi.`, undefined, {
      ...saved,
      summary: `${saved.summary}; chưa giải phóng được ghế ${seat}, cần giải phóng thủ công`,
    });
  }
}
```

A test asserts the failure kind and that the last audit row names the loss, as `src/features/guests/__tests__/rsvp.test.ts` does. When the database refuses the entry, the server log keeps it and the user still gets the error.

The same holds on success. When the row of a command that returned cannot be written, the change stands, the server log keeps the entry, and `useCommand` shows "Đã lưu thay đổi nhưng chưa ghi được nhật ký hệ thống…" as a warning in place of your success text. The result still carries the value and the inverse.

comms writes its partial-failure rows itself at five places on its branch. Its owner migrates them to a thrown entry before merging, because the direct writer is gone.

## What memoryDb does not read from your migration

Tests and `SCE_DEV_MEMORY=1` run on `memoryDb`, which reads tables, defaults, unique keys, foreign keys, `register_table` policies and simple `security_invoker` views from the migrations. It cannot run your CHECK constraints, restrictive policies or triggers. When a test depends on one, mirror that one rule on the test's seed with `declareGuard(seed, 'sce_tcsk_<table>', ({ op, row, before, actor }) => …)` from `@/core/db/memory`, and throw `new DbError('constraint', { table, constraint: '<its SQL name>' })` as Postgres would. Keep the real check in SQL and prove it on PGlite, as `src/features/reports/__tests__/sql.test.ts` does.
