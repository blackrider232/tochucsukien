// Public server entry: read functions (re-exported from the contract), the
// commands record dispatch runs, and the legacy importer. Stubs until the
// owning worker implements them; a missing command answers "chưa sẵn sàng".

import type { CommandsOf } from '@/core/commands';
import type { LegacyImporter } from '@/core/legacy';

export * from '../contract';

export const commands: Partial<CommandsOf<'progress'>> = {};
export const legacyImporter: LegacyImporter | null = null;
