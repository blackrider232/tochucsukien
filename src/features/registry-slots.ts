// Placeholder written by the UI-kit worker so the shell compiles before core lands. The core worker owns
// this file and replaces it with the nine slots imports; the shell reads only this record.

import type { FeatureKey, FeatureSlots } from '@/core/registry';

export const featureSlots: { readonly [F in FeatureKey]: FeatureSlots } = {
  core: {}, progress: {}, templates: {}, guests: {}, venue: {}, directory: {}, comms: {}, live: {}, reports: {},
};
