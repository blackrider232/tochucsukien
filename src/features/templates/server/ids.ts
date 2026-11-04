// Deterministic row ids, so saving an override twice (a retry, or the importer
// after a manual save) addresses one row instead of two. Server-only: uuid v5 needs node:crypto.

import { deterministicIds } from '@/core/legacy';

/** The row that holds the override of one built-in. */
export const overrideRowId = (builtinId: string): string => deterministicIds.idFor('TemplateOverride', builtinId);
