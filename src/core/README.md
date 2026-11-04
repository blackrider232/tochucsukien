# src/core

Frozen foundation code. Module workers import it and never edit it. Every file below is currently a type sketch whose function bodies throw `not implemented`; the core and kit workers replace the bodies without changing a signature.

| Design file (`docs/architecture/types/`) | Repo path | Import as |
|---|---|---|
| `core/brand.ts` | `src/core/brand.ts` | `@/core/brand` |
| `core/vocab.ts` | `src/core/vocab.ts` | `@/core/vocab` |
| `core/auth.ts` | `src/core/auth/index.ts` | `@/core/auth` |
| `core/checkin-code.ts` | `src/core/checkin-code/index.ts` | `@/core/checkin-code` |
| `core/commands.ts` | `src/core/commands/index.ts` | `@/core/commands` |
| `core/dates.ts` | `src/core/dates/index.ts` | `@/core/dates` |
| `core/db.ts` | `src/core/db/index.ts` | `@/core/db` |
| `core/legacy.ts` | `src/core/legacy/index.ts` | `@/core/legacy` |
| `core/permissions.ts` | `src/core/permissions/index.ts` | `@/core/permissions` |
| `core/registry.ts` | `src/core/registry/index.ts` | `@/core/registry` |
| `core/settings.ts` | `src/core/settings/index.ts` | `@/core/settings` |
| `core/text.ts` | `src/core/text/index.ts` | `@/core/text` |
| `ui/kit.ts` | `src/components/ui/kit.types.ts` (re-exported by `src/components/ui/index.ts`) | `@/components/ui` |
| `features/<key>.ts` | `src/features/<key>/contract.ts` | `@/features/<key>` (client-safe), `@/features/<key>/server` |
| `sql/000N_*.sql` (copies) | `supabase/migrations/000N_*.sql` | |
| `scripts/verify-sql.mjs` | `scripts/verify-sql.mjs` | `pnpm verify:sql` |

Directories reserved with a `.gitkeep` and no sketch yet: `src/core/export/`, `src/core/prefs/` (the only place `localStorage` is allowed), `src/components/shell/`.

`src/features/<key>/index.ts` and `server/index.ts` re-export `contract.ts` for now. The owning worker splits client-safe and server-only exports when it implements the feature.

`docs/architecture/types/usage/live-feature-example.ts` type-checks against these paths after rewriting `../core/X` to `@/core/X` and `../features/X` to `@/features/X`.
