// pnpm tsx src/features/venue/__tests__/generate-hall-seed.ts
import { writeFileSync } from 'node:fs';
import { HALL_SEED_MIGRATION, renderHallSeedSql } from './hall-seed-sql';

writeFileSync(HALL_SEED_MIGRATION, renderHallSeedSql());
console.log(`wrote ${HALL_SEED_MIGRATION}`);
