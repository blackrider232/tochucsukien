// Shared vocabulary. One registry per enum; every label, chip, select option,
// export cell and badge color reads from here (core B27, m4a B44, m4b BUG-31).
// Foundation-owned and frozen: five or more features read each of these.

export type Tone = 'slate' | 'blue' | 'indigo' | 'purple' | 'amber' | 'emerald' | 'rose' | 'red' | 'teal' | 'cyan' | 'sky';

export interface EnumEntry {
  /** Full label for forms and dialogs. */
  label: string;
  /** Compact label for badges and table cells. */
  short: string;
  tone: Tone;
}
export type EnumRegistry<K extends string> = { readonly [P in K]: EnumEntry };

/** Stored values only. Unknown legacy values are rejected at the import boundary, not here. */
export function enumOptions<K extends string>(registry: EnumRegistry<K>): ReadonlyArray<{ value: K } & EnumEntry> {
  throw new Error('not implemented');
}

export type Role = 'admin' | 'leader' | 'dept_leader' | 'user';
export declare const ROLES: EnumRegistry<Role> & {
  readonly [P in Role]: EnumEntry & { optionLabel: string; requiresMfa: boolean; rank: number };
};
// admin: 'Quản trị viên (Admin)' / 'Admin' / optionLabel 'Quản trị viên (Toàn quyền)' / requiresMfa true
// leader: 'Ban Giám đốc' / 'BGĐ' / 'Ban Giám đốc (Xem toàn Trung tâm)' / requiresMfa true
// dept_leader: 'Lãnh đạo Phòng' / 'Lãnh đạo Phòng' / 'Lãnh đạo Phòng (Xem trong phòng)' / false
// user: 'Chuyên viên' / 'Chuyên viên' / 'Chuyên viên thực hiện' / false

export type DepartmentCode = 'HCTC' | 'PTDN' | 'XTDT' | 'TVDN' | 'BGD';
/** Stored value is the Vietnamese name, matching legacy rows and sce_tcsk_departments.name. */
export type DepartmentName =
  | 'Phòng Hành chính - Tổ chức'
  | 'Phòng Phát triển doanh nghiệp'
  | 'Phòng Xúc tiến đầu tư'
  | 'Phòng Tư vấn doanh nghiệp'
  | 'Ban Giám đốc';
export interface Department {
  name: DepartmentName;
  code: DepartmentCode;
  /** 'P. Xúc tiến đầu tư' */
  shortName: string;
  duty: string;
  /** Ban Giám đốc is admin-assigned only. */
  selfRegisterable: boolean;
  /** Can chair (chủ trì) an event. False for Ban Giám đốc. */
  canChairEvents: boolean;
}
export declare const DEPARTMENTS: ReadonlyArray<Department>;
export function departmentByName(name: DepartmentName): Department {
  throw new Error('not implemented');
}

export type EventType = 'hoi_nghi' | 'hoi_cho';
export declare const EVENT_TYPES: EnumRegistry<EventType>;

export type GuestGroup = 'VIP' | 'SoNganh' | 'DoanhNghiep' | 'QuocTe' | 'BaoChi';
export declare const GUEST_GROUPS: EnumRegistry<GuestGroup> & {
  readonly [P in GuestGroup]: EnumEntry & { icon: string; exportFill: string; masterIdPrefix: string };
};

export type RsvpStatus = 'pending' | 'confirmed' | 'substituted' | 'declined';
export declare const RSVP: EnumRegistry<RsvpStatus>;
/** confirmed + substituted. The one definition of "attending" (m4a §3.1, m6 BUG-40). */
export function isAttending(status: RsvpStatus): boolean {
  throw new Error('not implemented');
}

export type InviteStatus = 'pending' | 'sent' | 'received';
export declare const INVITE: EnumRegistry<InviteStatus>;

export type SendMethod = 'direct' | 'ems' | 'email';
export declare const SEND_METHOD: EnumRegistry<SendMethod>;
