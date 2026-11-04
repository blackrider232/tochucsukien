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
