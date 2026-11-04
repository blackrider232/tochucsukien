// Row id of an issued hall: the uuid v5 the legacy importer derives from its
// legacy id, so the seed migration, "Khôi phục mặc định" and an import converge.

import type { HallTemplateId } from '@/core/brand';
import { deterministicIds } from '@/core/legacy';

export const defaultHallId = (legacyId: string): HallTemplateId => deterministicIds.idFor('HallTemplate', legacyId);
