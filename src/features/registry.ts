// The nine features, listed once. Pure data, safe in the proxy. Slots and
// server records are listed in registry-slots.ts and registry-server.ts so the
// proxy never bundles components or server code. check:contract compares all
// three lists with the directories under src/features.

import type { FeatureKey, FeatureManifest } from '@/core/registry';
import { commsManifest } from './comms/manifest';
import { coreManifest } from './core/manifest';
import { directoryManifest } from './directory/manifest';
import { guestsManifest } from './guests/manifest';
import { liveManifest } from './live/manifest';
import { progressManifest } from './progress/manifest';
import { reportsManifest } from './reports/manifest';
import { templatesManifest } from './templates/manifest';
import { venueManifest } from './venue/manifest';

type ManifestsByKey = { readonly [F in FeatureKey]: FeatureManifest<F> };

/** A function, not a constant: manifests import @/core/registry, which reads this list lazily. */
export function featureManifests(): ReadonlyArray<FeatureManifest> {
  const byKey: ManifestsByKey = {
    core: coreManifest,
    progress: progressManifest,
    templates: templatesManifest,
    guests: guestsManifest,
    venue: venueManifest,
    directory: directoryManifest,
    comms: commsManifest,
    live: liveManifest,
    reports: reportsManifest,
  };
  return Object.values(byKey) as ReadonlyArray<FeatureManifest>;
}
