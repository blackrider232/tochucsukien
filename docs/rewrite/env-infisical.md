# Environment variables with Infisical

Secrets live in the Infisical project `SEC-INTERNAL` (id `034b21d4-5b66-4893-b1f5-b0db33181a8b`), environments `dev`, `staging`, `prod`. `.infisical.json` pins the project, so no `infisical init` is needed. Never put real values in the repo.

| Variable | Where it is used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser and server | Public. Project URL of the Supabase project for that environment. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser and server | Public (anon). Row Level Security protects the data. |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Bypasses RLS. Used by `core.users.create` and `scripts/import-legacy.ts`. Never `NEXT_PUBLIC_`. |
| `CRON_SECRET` | `api/cron/rsvp-sync` | Any long random string. Callers send `Authorization: Bearer <value>`. |

## Daily use

```
infisical login                 # once per machine
pnpm check:env [dev|staging|prod]   # lists missing or empty names, never values
pnpm dev:env                    # next dev with the dev secrets injected
infisical run --env=prod -- pnpm build
```

`pnpm dev` with `SCE_DEV_MEMORY=1` needs no secrets (in-memory runtime, development only).

## Current setup (2026-11-04)

`dev`, `staging` and `prod` all point to one Supabase project, `SEC-INTERNAL` (ref `dvgcfuqnvmzvoyqlciau`). The project owner chose this. It means a staging test writes to the same database as prod. Each environment has its own `CRON_SECRET`. Migrations `0001` to `0005` were applied on 2026-11-04 to the empty project: 30 tables, all with RLS, 97 policies, and the public key is denied on every table. No admin exists yet: after the first sign-up, run `select tcsk.bootstrap_first_admin('<email>')` once.

## Keep environments apart

Point `dev` at a Supabase project or branch that holds no production data. `scripts/import-legacy.ts` writes with the service role key, so run it with the `staging` environment first and with `prod` only after the dry run report is reviewed.
