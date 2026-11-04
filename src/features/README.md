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

The pipeline writes a command's audit row only when `run()` returns. Commands have no transaction, so `run()` can throw after a write has already stuck: a decline saved before venue refused to free the seat, or a seat batch that could not put back a seat someone else took. Record what really happened before you throw.

1. Never call `sce_tcsk_write_audit`. It is not in `RpcMap`, and users cannot execute it.
2. Write the row with `ctx.db.rpc('sce_tcsk_audit_command', …)`, the writer the pipeline itself uses. Pass the `perm` of the `authorize` rule of the command whose `run()` you are in, through its constant, never a literal. Inside a command reached by `ctx.call`, that is the inner command's permission. The database refuses the row when the caller lacks that permission on the event's departments, and it refuses core actions and entities.
3. Say in the summary what stuck, what did not, and what a person must do.
4. Write it only on the path that throws. A path that returns gets its row from the pipeline, so writing one there too logs the change twice. A failure that changed nothing, or was rolled back completely, writes no row.
5. Then throw `CommandError` with a message that names the same loss.

```ts
const writeOnEvent = { perm: 'guests.write', event: (i: { eventId: EventId }) => i.eventId } as const;

async function releaseSeat(ctx: CommandContext, eventId: EventId, guestId: GuestId, seat: SeatCode, saved: AuditEntry) {
  try {
    await ctx.call('venue.releaseGuestSeat', { eventId, guestId });
  } catch {
    await ctx.db.rpc('sce_tcsk_audit_command', {
      ...saved,
      perm: writeOnEvent.perm,
      summary: `${saved.summary}; chưa giải phóng được ghế ${seat}, cần giải phóng thủ công`,
    });
    throw new CommandError('conflict', `Đã ghi nhận báo vắng nhưng chưa giải phóng được ghế ${seat}. Vui lòng giải phóng ghế này thủ công ở sơ đồ chỗ ngồi.`);
  }
}
```

A test asserts the failure kind and that the last audit row names the loss, as `src/features/guests/__tests__/rsvp.test.ts` does. A change request (guests status, change request 6) asks core to take an audit entry on `CommandError` and write it in the pipeline. Once that lands, throw the entry instead and delete the direct call.
