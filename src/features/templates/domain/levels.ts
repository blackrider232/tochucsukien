// The three issuing levels, the two template kinds and the three origins, once.
// Labels are derived from these at render and never stored on a template (m3 B03).

import type { IconName } from '@/components/ui';
import type { Nd30HeaderProps } from '@/components/ui';
import type { EnumRegistry } from '@/core/vocab';
import type { DocumentTemplate, TemplateKind, TemplateLevel } from '../contract';

export const TEMPLATE_LEVEL_VALUES = ['cap_ubnd', 'cap_stc', 'cap_trungtam'] as const satisfies ReadonlyArray<TemplateLevel>;
export const TEMPLATE_KIND_VALUES = ['doc', 'grid'] as const satisfies ReadonlyArray<TemplateKind>;

export const TEMPLATE_LEVELS: EnumRegistry<TemplateLevel> & {
  readonly [P in TemplateLevel]: { label: string; short: string; tone: 'blue' | 'amber' | 'purple'; icon: IconName; issuer: Nd30HeaderProps['issuer'] };
} = {
  cap_ubnd: { label: '1. Cấp UBND Thành phố Hà Nội', short: 'Cấp UBND TP', tone: 'blue', icon: 'landmark', issuer: 'ubnd' },
  cap_stc: { label: '2. Cấp Sở Tài chính', short: 'Cấp Sở Tài chính', tone: 'amber', icon: 'building', issuer: 'so_tai_chinh' },
  cap_trungtam: { label: '3. Cấp Trung tâm (SCE)', short: 'Cấp Trung tâm (SCE)', tone: 'purple', icon: 'briefcase', issuer: 'trung_tam' },
};

export const TEMPLATE_KINDS: EnumRegistry<TemplateKind> & { readonly [P in TemplateKind]: { optionLabel: string; adminShort: string } } = {
  doc: { label: 'Văn bản Word A4', short: 'Văn bản Word A4', tone: 'blue', optionLabel: 'Văn bản hành chính A4 (Word/PDF)', adminShort: 'Văn bản' },
  grid: { label: 'Bảng tính Excel', short: 'Bảng tính Excel', tone: 'emerald', optionLabel: 'Bảng tính / Biểu mẫu số liệu (Excel/Word)', adminShort: 'Bảng tính' },
};

export const TEMPLATE_ORIGINS: EnumRegistry<DocumentTemplate['origin']> = {
  builtin: { label: 'Mẫu gốc SCE', short: 'Mẫu gốc SCE', tone: 'slate' },
  override: { label: 'Đã sửa bởi Admin', short: 'Đã sửa bởi Admin', tone: 'amber' },
  custom: { label: 'Admin tạo mới', short: 'Admin tạo mới', tone: 'indigo' },
};

/** Shown where legacy printed the group's code chip for a template without a symbol. */
export const NO_CODE_LABEL = 'Biểu mẫu nội bộ';
