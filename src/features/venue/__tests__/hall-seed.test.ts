import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hallTemplateDraftSchema } from '../domain/schemas';
import { DEFAULT_HALL_TEMPLATES } from '../domain/default-halls';
import { HALL_SEED_MIGRATION, renderHallSeedSql } from './hall-seed-sql';

describe('hall catalog seed', () => {
  it('the migration is the rendering of DEFAULT_HALL_TEMPLATES (run generate-hall-seed.ts after editing it)', () => {
    expect(readFileSync(HALL_SEED_MIGRATION, 'utf8')).toBe(renderHallSeedSql());
  });

  it('every default hall passes the same schema the admin form uses', () => {
    for (const t of DEFAULT_HALL_TEMPLATES) expect(hallTemplateDraftSchema.parse(t)).toMatchObject({ name: t.name, zones: t.zones });
  });
});
