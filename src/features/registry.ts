// Placeholder written by the UI-kit worker so the shell compiles. The core worker owns this file
// (design.md, "F: frozen") and replaces it with the nine-feature import list; the shell only needs
// the slot objects, keyed by feature.

import type { FeatureKey, FeatureSlots } from '@/core/registry';

export const featureSlots: ReadonlyArray<{ key: FeatureKey; slots: FeatureSlots }> = [];
