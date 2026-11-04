'use server';

// The only server action in the app. Everything a client changes or queries
// goes through here and therefore through the pipeline.

import { loadRequestContext } from '@/core/auth/server';
import { featureServers } from '@/features/registry-server';
import type { CommandId, CommandResult, InputOf, OutputOf } from './index';
import { commandLookup, MESSAGES, runCommand } from './pipeline';

const lookup = commandLookup(featureServers);

export async function dispatch<K extends CommandId>(id: K, input: InputOf<K>): Promise<CommandResult<OutputOf<K>>> {
  const loaded = await loadRequestContext();
  if (!loaded.ok) return { ok: false, kind: 'gate', message: MESSAGES.gate[loaded.gate.kind] };
  return (await runCommand(loaded.ctx, lookup, id, input)) as CommandResult<OutputOf<K>>;
}
