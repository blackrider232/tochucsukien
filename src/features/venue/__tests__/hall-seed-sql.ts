// Renders the hall catalog seed migration from DEFAULT_HALL_TEMPLATES, so the
// SQL and the typed table cannot drift (hall-seed.test.ts compares them).

import { DEFAULT_HALL_TEMPLATES } from '../domain/default-halls';
import { defaultHallId } from '../server/default-hall-ids';

export const HALL_SEED_MIGRATION = 'supabase/migrations/202611040900_venue_hall_templates_seed.sql';

const literal = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function renderHallSeedSql(): string {
  const rows = DEFAULT_HALL_TEMPLATES.map((t) =>
    `  (${[defaultHallId(t.legacyId), t.legacyId, t.name, t.location, t.description].map(literal).join(', ')}, ${literal(JSON.stringify(t.zones))}::jsonb)`,
  );
  return [
    '-- 202611040900_venue_hall_templates_seed.sql',
    '-- Generated from src/features/venue/domain/default-halls.ts by',
    '-- `pnpm tsx src/features/venue/__tests__/generate-hall-seed.ts`. Do not edit by hand.',
    '-- The issued hall catalog: reference data, not demo data (m4b §2, decision 13).',
    '-- Ids are the uuid v5 the legacy importer derives from the legacy ids, so an',
    '-- import of hallTemplates converges on these rows. Rows that exist are kept.',
    'insert into public.sce_tcsk_hall_templates (id, legacy_id, name, location, description, zones) values',
    `${rows.join(',\n')}`,
    'on conflict do nothing;',
    '',
  ].join('\n');
}
