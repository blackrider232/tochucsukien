// Public server entry of feature `core`: the commands record dispatch runs and
// the legacy importer (settings).

import type { CommandsOf } from '@/core/commands';
import type { LegacyImporter } from '@/core/legacy';
import { coreCommands } from './commands';
import { coreLegacyImporter } from './legacy';

export * from '../contract';

export const commands: Partial<CommandsOf<'core'>> = coreCommands;
export const legacyImporter: LegacyImporter | null = coreLegacyImporter;
