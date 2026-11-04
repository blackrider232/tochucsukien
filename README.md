# SCE event-management tool

Vietnamese event-management tool for the Trung tâm Xúc tiến đầu tư và Hỗ trợ doanh nghiệp Hà Nội. This is a Next.js (App Router, TypeScript strict, Tailwind 4) rewrite of the legacy single-file app, on the same Supabase project. Architecture, contracts and ownership rules: [docs/architecture/design.md](docs/architecture/design.md).

```
pnpm install
cp .env.example .env.local   # fill in the Supabase values
pnpm dev                     # http://localhost:3000
pnpm build
pnpm test                    # vitest
pnpm typecheck && pnpm lint
pnpm verify:sql              # applies supabase/migrations twice on PGlite and checks RLS
```

## Folder map

- `src/app/` routes: `(auth)`, `(app)` shell, `(print)` print pages, `api/cron`
- `src/core/` frozen foundation: db, commands, auth, permissions, registry, dates, text, settings, vocab (see `src/core/README.md`)
- `src/components/ui/` the shared UI kit; `src/components/shell/` the app shell
- `src/features/<key>/` one directory per feature, owned by one worker (see `src/features/README.md`)
- `src/features/registry.ts` the single list of features
- `supabase/migrations/` SQL migrations, applied in file order
- `scripts/` `verify-sql.mjs`, `check-contract.ts` and the import and seed tooling
- `public/icons/` app icons
- `legacy/` frozen reference copy of the old app, do not edit
- `docs/architecture/` design, type sketches and SQL sources
- `docs/rewrite/spec/` per-module specs with the known legacy bugs
