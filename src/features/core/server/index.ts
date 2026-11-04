// Public server entry of feature `core`: the commands record dispatch runs and
// the legacy importer (settings).

import type { CommandsOf } from '@/core/commands';
import type { LegacyImporter } from '@/core/legacy';
import { coreCommands } from './commands';

export * from '../contract';

export const commands: Partial<CommandsOf<'core'>> = coreCommands;
export const legacyImporter: LegacyImporter | null = null;
