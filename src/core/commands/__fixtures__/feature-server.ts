// A feature server entry written the way module workers write theirs: a
// runtime import of defineCommands and CommandError from @/core/commands.
// dispatch.test.ts mounts it as the progress server record.

import { z } from 'zod';
import type { EventId } from '@/core/brand';
import { CommandError, defineCommands, type CommandsOf } from '@/core/commands';
import type { LegacyImporter } from '@/core/legacy';

export const NOT_DELETED = 'Sự kiện "HN XTĐT" chưa bị xóa nên không cần khôi phục.';

const specs: Partial<CommandsOf<'progress'>> = {
  restoreEvent: {
    kind: 'mutation',
    input: z.object({ id: z.string().transform((v) => v as EventId) }),
    authorize: { perm: 'progress.delete', event: (i) => i.id },
    async run() {
      throw new CommandError('conflict', NOT_DELETED);
    },
  },
};

export const commands = defineCommands('progress', specs as CommandsOf<'progress'>);
export const legacyImporter: LegacyImporter | null = null;
