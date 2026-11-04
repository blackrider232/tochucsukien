// The issued hall catalog (legacy DEFAULT_HALL_TEMPLATES, m4b §2 seed table).
// Reference data, not demo data: the migration seeds these rows once, and
// "Khôi phục mặc định" upserts them by id. The migration is generated from this
// table (__tests__/generate-hall-seed.ts) and a test fails when they drift.

import type { HallZone } from '../contract';

export interface DefaultHall {
  /** Legacy id; the row id is the uuid v5 the legacy importer derives from it, so both converge. */
  legacyId: 'hall_ncc' | 'hall_ubnd_tang3' | 'hall_sce_tang2';
  name: string;
  location: string;
  description: string;
  zones: ReadonlyArray<HallZone>;
}

const zone = (key: string, name: string, seatCount: number, color: HallZone['color'], assignedGroup: HallZone['assignedGroup']): HallZone => ({
  key, name, prefix: `${key}-`, seatCount, color, assignedGroup, vipZone: assignedGroup === 'VIP',
});

export const DEFAULT_HALL_TEMPLATES: ReadonlyArray<DefaultHall> = [
  {
    legacyId: 'hall_ncc',
    name: 'Trung tâm Hội nghị Quốc gia (NCC)',
    location: 'Đại lộ Thăng Long, Mễ Trì, Nam Từ Liêm, Hà Nội',
    description: 'Hội trường đa năng cấp quốc tế, âm thanh ánh sáng và bàn ghế tiêu chuẩn cao cấp',
    zones: [
      zone('A', 'Khu A: Đại biểu VIP (Bố trí Biển tên chữ A)', 18, 'red', 'VIP'),
      zone('B', 'Khu B: Lãnh đạo các Ban, Bộ, Sở ngành & Quận/Huyện', 36, 'blue', 'SoNganh'),
      zone('C', 'Khu C: Khách Ngoại giao, Đại sứ quán & Quốc tế', 24, 'emerald', 'QuocTe'),
      zone('D', 'Khu D: Doanh nghiệp, Hiệp hội & Báo chí', 36, 'slate', 'DoanhNghiep'),
    ],
  },
  {
    legacyId: 'hall_ubnd_tang3',
    name: 'Hội trường Tầng 3 UBND Thành phố',
    location: 'Số 12 Lê Lai, Hoàn Kiếm, Hà Nội',
    description: 'Hội trường giao ban và hội nghị kinh tế đối ngoại UBND Thành phố Hà Nội',
    zones: [
      zone('A', 'Khu A: Đoàn Chủ tịch & Lãnh đạo Thành phố VIP', 12, 'red', 'VIP'),
      zone('B', 'Khu B: Giám đốc các Sở, Ban, Ngành & Đại diện Quận Huyện', 18, 'blue', 'SoNganh'),
      zone('C', 'Khu C: Doanh nghiệp tiêu biểu, Hiệp hội & Báo chí', 24, 'slate', 'DoanhNghiep'),
    ],
  },
  {
    legacyId: 'hall_sce_tang2',
    name: 'Hội trường Đa năng Tầng 2 Trung tâm SCE',
    location: 'Tòa nhà Liên cơ quan Sở ngành, Võ Chí Công, Tây Hồ, Hà Nội',
    description: 'Phòng hội thảo chuyên đề kết nối đầu tư, hỗ trợ doanh nghiệp và xúc tiến thương mại',
    zones: [
      zone('A', 'Khu A: Bàn Chủ tọa & Khách mời VIP', 10, 'red', 'VIP'),
      zone('B', 'Khu B: Khối Sở ban ngành & Tổ chức Quốc tế', 16, 'blue', 'SoNganh'),
      zone('C', 'Khu C: Đại diện Doanh nghiệp & Nhà đầu tư', 16, 'emerald', 'DoanhNghiep'),
    ],
  },
];
