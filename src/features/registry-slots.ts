// Slots of the nine features, for the shell. Kept apart from registry.ts so the
// proxy does not bundle components.

import type { FeatureKey, FeatureSlots } from '@/core/registry';
import { commsSlots } from './comms/slots';
import { coreSlots } from './core/slots';
import { directorySlots } from './directory/slots';
import { guestsSlots } from './guests/slots';
import { liveSlots } from './live/slots';
import { progressSlots } from './progress/slots';
import { reportsSlots } from './reports/slots';
import { templatesSlots } from './templates/slots';
import { venueSlots } from './venue/slots';

export const featureSlots: { readonly [F in FeatureKey]: FeatureSlots } = {
  core: coreSlots,
  progress: progressSlots,
  templates: templatesSlots,
  guests: guestsSlots,
  venue: venueSlots,
  directory: directorySlots,
  comms: commsSlots,
  live: liveSlots,
  reports: reportsSlots,
};
