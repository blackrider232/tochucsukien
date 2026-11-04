// A few plainly fake contacts. They load only when an admin presses "Nạp dữ
// liệu mẫu" on the directory screen, and as the dev fixture of
// SCE_DEV_MEMORY=1. Nothing in the app creates them by itself (decision 13);
// the legacy 41 records named real officials and are not carried over.

import type { Email } from '@/core/brand';
import type { ContactDraft } from './schemas';

type Sample = Omit<ContactDraft, 'email'> & { email: string | null };

const sample = (s: Sample): ContactDraft => ({ ...s, email: s.email as Email | null });

export const SAMPLE_CONTACTS: ReadonlyArray<ContactDraft> = [
  sample({ name: 'Đại biểu Mẫu A (giả)', group: 'VIP', title: 'Lãnh đạo (giả)', organization: 'Cơ quan Mẫu Một', phone: '0900.000.001', email: 'dai.bieu.a@example.com', address: 'Địa chỉ mẫu, Hà Nội', taxCode: '', notes: 'Dữ liệu mẫu: đón tại phòng VIP', hasBanquet: true }),
  sample({ name: 'Đại biểu Mẫu B (giả)', group: 'VIP', title: 'Đại sứ (giả)', organization: 'Đại sứ quán Mẫu', phone: '0900.000.002', email: null, address: '', taxCode: '', notes: 'Dữ liệu mẫu', hasBanquet: true }),
  sample({ name: 'Cán bộ Mẫu C (giả)', group: 'SoNganh', title: 'Giám đốc (giả)', organization: 'Sở Mẫu', phone: '0900.000.003', email: 'can.bo.c@example.com', address: 'Địa chỉ mẫu', taxCode: '', notes: '', hasBanquet: false }),
  sample({ name: 'Cán bộ Mẫu D (giả)', group: 'SoNganh', title: 'Trưởng phòng (giả)', organization: 'Ủy ban nhân dân Quận Mẫu', phone: '', email: 'can.bo.d@example.com', address: '', taxCode: '', notes: '', hasBanquet: false }),
  sample({ name: 'Doanh nhân Mẫu E (giả)', group: 'DoanhNghiep', title: 'Tổng Giám đốc (giả)', organization: 'Công ty Mẫu Một', phone: '0900.000.005', email: 'doanh.nhan.e@example.com', address: 'Khu công nghiệp Mẫu', taxCode: '0100000001', notes: '', hasBanquet: false }),
  sample({ name: 'Doanh nhân Mẫu F (giả)', group: 'DoanhNghiep', title: 'Chủ tịch HĐQT (giả)', organization: 'Hợp tác xã Mẫu', phone: '0900.000.006', email: null, address: '', taxCode: '0100000002', notes: 'Dữ liệu mẫu', hasBanquet: true }),
  sample({ name: 'Test Guest G (fake)', group: 'QuocTe', title: 'Country Director (fake)', organization: 'Example International Org', phone: '+81 3 0000 0007', email: 'guest.g@example.org', address: '', taxCode: '', notes: '', hasBanquet: true }),
  sample({ name: 'Phóng viên Mẫu H (giả)', group: 'BaoChi', title: 'Phóng viên (giả)', organization: 'Báo Mẫu', phone: '0900.000.008', email: 'phong.vien.h@example.com', address: '', taxCode: '', notes: '', hasBanquet: false }),
];
