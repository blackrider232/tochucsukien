// Server records of the nine features: commands for dispatch, importers for
// scripts/import-legacy.ts, and the optional devSeed the dev memory runtime
// runs. Server-only by construction (feature server code).

import type { CommandsOf } from '@/core/commands';
import type { FeatureKey } from '@/core/registry';
import type { DevSeed } from '@/core/dev/runtime';
import type { LegacyImporter } from '@/core/legacy';
import * as comms from './comms/server';
import * as core from './core/server';
import * as directory from './directory/server';
import * as guests from './guests/server';
import * as live from './live/server';
import * as progress from './progress/server';
import * as reports from './reports/server';
import * as templates from './templates/server';
import * as venue from './venue/server';

export interface FeatureServer<F extends FeatureKey> {
  commands: Partial<CommandsOf<F>>;
  legacyImporter: LegacyImporter | null;
  /** Fixtures for SCE_DEV_MEMORY=1 (docs/rewrite/dev-runtime.md). Never runs in production. */
  devSeed?: DevSeed;
}

export const featureServers: { readonly [F in FeatureKey]: FeatureServer<F> } = {
  core,
  progress,
  templates,
  guests,
  venue,
  directory,
  comms,
  live,
  reports,
};
