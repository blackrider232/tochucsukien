# Features

One directory per feature key. A module worker owns `src/features/<key>/**` (except `contract.ts`), the route dirs listed in its `manifest.ts`, and migration files named `*_<key>_*.sql`. Everything else is frozen; see "Parallel-work contract" in `docs/architecture/design.md`.

1. Fill `manifest.ts` (nav, sub-tabs, permissions, routes, tables, legacy blob keys).
2. Describe each owned table with `defineTable` and use it through `ctx.db.table(def)`. Never import `@supabase/*`.
3. Every write is a command in `server/commands.ts` (`defineCommands('<key>', {...})`). Import `defineCommands`, `CommandError` and the command types from `@/core/commands`, never from another `@/core/commands/*` path. Throw `CommandError(kind, 'Vietnamese message')` for a business-rule failure; the client shows that message unchanged. Never write `'use server'`.
4. Pages are server components that call `requestContext()`. Client components mutate with `useCommand()`.
5. Read other features through `@/features/<other>` or `@/features/<other>/server`. Change them only with `ctx.call('<other>.<verb>', input)`.
6. Build UI from `@/components/ui`.
