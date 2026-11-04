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
  return (Object.keys(registry) as K[]).map((value) => ({ value, ...registry[value] }));
}

export type Role = 'admin' | 'leader' | 'dept_leader' | 'user';
export const ROLES: EnumRegistry<Role> & {
  readonly [P in Role]: EnumEntry & { optionLabel: string; requiresMfa: boolean; rank: number };
} = {
  admin: { label: 'Quản trị viên (Admin)', short: 'Admin', tone: 'purple', optionLabel: 'Quản trị viên (Toàn quyền)', requiresMfa: true, rank: 4 },
  leader: { label: 'Ban Giám đốc', short: 'BGĐ', tone: 'amber', optionLabel: 'Ban Giám đốc (Xem toàn Trung tâm)', requiresMfa: true, rank: 3 },
  dept_leader: { label: 'Lãnh đạo Phòng', short: 'Lãnh đạo Phòng', tone: 'blue', optionLabel: 'Lãnh đạo Phòng (Xem trong phòng)', requiresMfa: false, rank: 2 },
  user: { label: 'Chuyên viên', short: 'Chuyên viên', tone: 'slate', optionLabel: 'Chuyên viên thực hiện', requiresMfa: false, rank: 1 },
};

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
/** Mirrors the seed of sce_tcsk_departments in 0001_foundation.sql, in its sort order. */
export const DEPARTMENTS: ReadonlyArray<Department> = [
  { name: 'Phòng Hành chính - Tổ chức', code: 'HCTC', shortName: 'P. Hành chính - Tổ chức', duty: 'Hậu cần, xe VIP, tài liệu & con dấu', selfRegisterable: true, canChairEvents: true },
  { name: 'Phòng Phát triển doanh nghiệp', code: 'PTDN', shortName: 'P. Phát triển doanh nghiệp', duty: 'Mời DN, kết nối giao thương & gian hàng', selfRegisterable: true, canChairEvents: true },
  { name: 'Phòng Xúc tiến đầu tư', code: 'XTDT', shortName: 'P. Xúc tiến đầu tư', duty: 'Chủ trì sự kiện đầu tư, đón tiếp VIP, MOU', selfRegisterable: true, canChairEvents: true },
  { name: 'Phòng Tư vấn doanh nghiệp', code: 'TVDN', shortName: 'P. Tư vấn doanh nghiệp', duty: 'Tọa đàm, hỗ trợ pháp lý & đối thoại', selfRegisterable: true, canChairEvents: true },
  { name: 'Ban Giám đốc', code: 'BGD', shortName: 'Ban Giám đốc', duty: 'Xem và chỉ đạo toàn bộ các sự kiện', selfRegisterable: false, canChairEvents: false },
];
export function departmentByName(name: DepartmentName): Department {
  const found = DEPARTMENTS.find((d) => d.name === name);
  if (!found) throw new Error(`unknown department ${name}`);
  return found;
}
export function isDepartmentName(raw: unknown): raw is DepartmentName {
  return DEPARTMENTS.some((d) => d.name === raw);
}

export type EventType = 'hoi_nghi' | 'hoi_cho';
export const EVENT_TYPES: EnumRegistry<EventType> = {
  hoi_nghi: { label: 'Hội nghị / Hội thảo / Tọa đàm', short: 'Hội nghị', tone: 'blue' },
  hoi_cho: { label: 'Hội chợ / Triển lãm', short: 'Hội chợ', tone: 'emerald' },
};

export type GuestGroup = 'VIP' | 'SoNganh' | 'DoanhNghiep' | 'QuocTe' | 'BaoChi';
export const GUEST_GROUPS: EnumRegistry<GuestGroup> & {
  readonly [P in GuestGroup]: EnumEntry & { icon: string; exportFill: string; masterIdPrefix: string };
} = {
  VIP: { label: 'Đại biểu VIP (Lãnh đạo TP, Bộ ngành)', short: 'VIP', tone: 'amber', icon: '⭐', exportFill: 'FFFEF3C7', masterIdPrefix: 'mdb_vip' },
  SoNganh: { label: 'Khối Sở ban ngành & Quận huyện', short: 'Sở ngành', tone: 'blue', icon: '🏛️', exportFill: 'FFEDE9FE', masterIdPrefix: 'mdb_sn' },
  DoanhNghiep: { label: 'Doanh nghiệp & HTX', short: 'Doanh nghiệp', tone: 'emerald', icon: '💼', exportFill: 'FFE0F2FE', masterIdPrefix: 'mdb_dn' },
  QuocTe: { label: 'Khách Quốc tế / Ngoại giao', short: 'Quốc tế', tone: 'purple', icon: '🌐', exportFill: 'FFF3E8FF', masterIdPrefix: 'mdb_qt' },
  BaoChi: { label: 'Báo chí, Truyền hình', short: 'Báo chí', tone: 'rose', icon: '📰', exportFill: 'FFDCFCE7', masterIdPrefix: 'mdb_bc' },
};

export type RsvpStatus = 'pending' | 'confirmed' | 'substituted' | 'declined';
export const RSVP: EnumRegistry<RsvpStatus> = {
  pending: { label: 'Chưa phản hồi', short: 'Chờ trả lời', tone: 'slate' },
  confirmed: { label: 'Tham dự chính thức', short: 'Tham dự', tone: 'emerald' },
  substituted: { label: 'Cử người đi thay', short: 'Người thay', tone: 'amber' },
  declined: { label: 'Báo vắng', short: 'Báo vắng', tone: 'rose' },
};
/** confirmed + substituted. The one definition of "attending" (m4a §3.1, m6 BUG-40). */
export function isAttending(status: RsvpStatus): boolean {
  return status === 'confirmed' || status === 'substituted';
}

export type InviteStatus = 'pending' | 'sent' | 'received';
export const INVITE: EnumRegistry<InviteStatus> = {
  pending: { label: 'Chưa gửi', short: 'Chưa gửi', tone: 'slate' },
  sent: { label: 'Đã phát hành', short: 'Đã phát hành', tone: 'blue' },
  received: { label: 'Đã nhận được thư', short: 'Đã nhận', tone: 'emerald' },
};

export type SendMethod = 'direct' | 'ems' | 'email';
export const SEND_METHOD: EnumRegistry<SendMethod> = {
  direct: { label: 'Đưa tận tay (VIP)', short: 'Tận tay', tone: 'amber' },
  ems: { label: 'Bưu điện bảo đảm (EMS)', short: 'EMS Bưu điện', tone: 'blue' },
  email: { label: 'Thư điện tử (Email)', short: 'Thư điện tử', tone: 'indigo' },
};
