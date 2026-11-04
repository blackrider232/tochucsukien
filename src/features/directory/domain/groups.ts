// How a group looks in the directory: its label and tone come from the shared
// registry (m4c B60); the icon is the kit's glyph for the legacy emoji.

import type { IconName } from '@/components/ui';
import { GUEST_GROUPS, enumOptions, type GuestGroup } from '@/core/vocab';

export const GROUP_ICON: Readonly<Record<GuestGroup, IconName>> = {
  VIP: 'star',
  SoNganh: 'landmark',
  DoanhNghiep: 'briefcase',
  QuocTe: 'globe',
  BaoChi: 'newspaper',
};

export const GROUP_OPTIONS = enumOptions(GUEST_GROUPS).map((o) => ({ value: o.value, label: o.label }));
