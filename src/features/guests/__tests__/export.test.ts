import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { Instant, IsoDate, Version } from '@/core/brand';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { COLUMNS, FIRST_DATA_ROW, SHEET_NAME, departmentHeadTitle, guestListFileName, guestListXlsx, type GuestListExport } from '../domain/export';
import { entry } from './roster-fixture';

// 09:05 on 4/11/2026 in Hà Nội is 02:05 UTC; a UTC date would already differ near midnight.
const NOW = '2026-11-04T02:05:00.000Z' as Instant;

function input(overrides: Partial<GuestListExport> = {}): GuestListExport {
  return {
    event: { name: 'Hội nghị XTĐT Hà Nội - Hàn Quốc 2026', eventDate: '2026-12-15' as IsoDate, eventTime: '08:30', location: 'Trung tâm Hội nghị Quốc gia', department: 'Phòng Xúc tiến đầu tư' },
    roster: [
      entry({ name: 'Lê Văn Một', group: 'VIP', title: 'Giám đốc', organization: 'Sở Ngoại vụ', phone: '0912.000.001', email: 'mot@hanoi.gov.vn', sendMethod: 'direct', inviteStatus: 'received', rsvpStatus: 'confirmed', hasBanquet: true, seatCode: 'A-01', notes: 'Đón cửa A' }),
      entry({ name: 'Kim Hai', group: 'QuocTe', organization: 'KOCHAM', sendMethod: 'email', inviteStatus: 'sent', rsvpStatus: 'substituted', substituteName: 'Park Ba' }),
      entry({ name: 'Trần Bốn', group: 'BaoChi', organization: 'Báo Hà Nội Mới', sendMethod: 'ems', rsvpStatus: 'declined', hasBanquet: true }),
    ],
    settings: { ...DEFAULT_SETTINGS, version: 1 as Version },
    author: { fullname: 'Nguyễn Cán Bộ', department: 'Phòng Phát triển doanh nghiệp' },
    now: NOW,
    ...overrides,
  };
}

async function readBack(i: GuestListExport) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await (await guestListXlsx(i)).arrayBuffer());
  return wb.getWorksheet(SHEET_NAME)!;
}

describe('guest-list xlsx export (m4c §1.6.1)', () => {
  it('has the legacy letterhead, title, event line, stats and headers, with agency names from settings', async () => {
    const ws = await readBack(input());
    expect(ws.getCell('A1').value).toBe('SỞ TÀI CHÍNH HÀ NỘI');
    expect(ws.getCell('J1').value).toBe('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM');
    expect(ws.getCell('A2').value).toBe('TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP HÀ NỘI');
    expect(ws.getCell('J2').value).toBe('Độc lập - Tự do - Hạnh phúc');
    expect(ws.getCell('A4').value).toBe('BẢNG DANH SÁCH ĐẠI BIỂU & KHÁCH MỜI THAM DỰ SỰ KIỆN');
    expect(ws.getCell('A5').value).toBe('Sự kiện: HỘI NGHỊ XTĐT HÀ NỘI - HÀN QUỐC 2026   |   Ngày tổ chức: 15/12/2026, khai mạc 08:30   |   Địa điểm: Trung tâm Hội nghị Quốc gia');
    expect(ws.getCell('A6').value).toBe('THỐNG KÊ: Tổng số 3 đại biểu  •  VIP: 1  •  Sở ngành: 0  •  Doanh nghiệp: 0  •  Quốc tế: 1  •  Báo chí: 1  •  Đã xác nhận (RSVP): 2/3 (67%)  •  Dự tiệc: 1  •  Đã xếp chỗ: 1');
    expect(COLUMNS.map((_, i) => ws.getRow(8).getCell(i + 1).value)).toEqual([
      'STT', 'Họ và Tên Đại Biểu', 'Chức Danh', 'Cơ Quan / Doanh Nghiệp', 'Nhóm Khách Mời', 'Số Điện Thoại', 'Địa Chỉ Email', 'Hình Thức Gửi Thư',
      'Trạng Thái Giấy Mời', 'Xác Nhận RSVP', 'Người Đi Thay (nếu có)', 'Dự Tiệc Chiêu Đãi', 'Vị Trí Ghế Ngồi', 'Ghi Chú Đón Tiếp',
    ]);
    expect(ws.model.merges).toEqual(expect.arrayContaining(['A1:E1', 'J1:N1', 'A2:E2', 'J2:N2', 'A4:N4', 'A5:N5', 'A6:N6']));
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 8 });
    expect(ws.autoFilter).toBe('A8:N8');
    expect(ws.pageSetup).toMatchObject({ paperSize: 9, orientation: 'landscape', fitToWidth: 1 });
    expect(ws.columns.map((c) => c.width)).toEqual(COLUMNS.map((c) => c.width));
  });

  it('writes one row per guest with Vietnamese labels from the registries and the legacy fills (commit 6463fbf)', async () => {
    const ws = await readBack(input());
    const row = (r: number) => Array.from({ length: 14 }, (_, i) => ws.getRow(r).getCell(i + 1).value);
    expect(row(FIRST_DATA_ROW)).toEqual([1, 'Lê Văn Một', 'Giám đốc', 'Sở Ngoại vụ', 'Đại biểu VIP (Lãnh đạo TP, Bộ ngành)', '0912.000.001', 'mot@hanoi.gov.vn', 'Đưa tận tay (VIP)', 'Đã nhận được thư', 'Tham dự chính thức', '', '✓ Có dự tiệc', 'A-01', 'Đón cửa A']);
    expect(row(FIRST_DATA_ROW + 1).slice(4, 13)).toEqual(['Khách Quốc tế / Ngoại giao', '', '', 'Thư điện tử (Email)', 'Đã phát hành', 'Cử người đi thay', 'Park Ba', 'Không', '-']);
    expect(row(FIRST_DATA_ROW + 2).slice(7, 12)).toEqual(['Bưu điện bảo đảm (EMS)', 'Chưa gửi', 'Báo vắng', '', 'Có (đã báo vắng)']);
    const fill = (addr: string) => (ws.getCell(addr).fill as { fgColor?: { argb?: string } }).fgColor?.argb;
    expect([fill(`E${FIRST_DATA_ROW}`), fill(`E${FIRST_DATA_ROW + 1}`), fill(`J${FIRST_DATA_ROW + 2}`), fill(`B${FIRST_DATA_ROW + 1}`)]).toEqual(['FFFEF3C7', 'FFF3E8FF', 'FFFEE2E2', 'FFF8FAFC']);
    expect(ws.getCell(`F${FIRST_DATA_ROW}`).numFmt).toBe('@');
    // exceljs reads font sizes back as integers, so 10.5 is not asserted.
    expect(ws.getCell(`B${FIRST_DATA_ROW}`).font).toMatchObject({ name: 'Arial', bold: true });
  });

  it('signs as the department head, dated in VN time, with the author named (commit 6463fbf, m4c B34)', async () => {
    const ws = await readBack(input());
    const footer = FIRST_DATA_ROW + 3 + 1;
    expect(ws.getCell(`J${footer}`).value).toBe('Hà Nội, ngày 04 tháng 11 năm 2026 (Xuất lúc 09:05)');
    expect([ws.getCell(`A${footer + 1}`).value, ws.getCell(`F${footer + 1}`).value, ws.getCell(`K${footer + 1}`).value]).toEqual(['NGƯỜI LẬP BIỂU', 'TRƯỞNG PHÒNG PHÁT TRIỂN DOANH NGHIỆP', 'LÃNH ĐẠO TRUNG TÂM PHÊ DUYỆT']);
    expect([ws.getCell(`A${footer + 2}`).value, ws.getCell(`K${footer + 2}`).value]).toEqual(['(Ký, ghi rõ họ tên)', '(Ký, đóng dấu và ghi rõ họ tên)']);
    expect(ws.getCell(`A${footer + 6}`).value).toBe('Nguyễn Cán Bộ');
    expect(ws.model.merges).toEqual(expect.arrayContaining([`J${footer}:N${footer}`, `A${footer + 1}:D${footer + 1}`, `F${footer + 1}:I${footer + 1}`, `K${footer + 1}:N${footer + 1}`]));
  });

  it('department head title: own department, else the event lead department for admin and Ban Giám đốc', () => {
    expect(departmentHeadTitle('Phòng Xúc tiến đầu tư', 'Phòng Phát triển doanh nghiệp')).toBe('TRƯỞNG PHÒNG XÚC TIẾN ĐẦU TƯ');
    expect(departmentHeadTitle(null, 'Phòng Phát triển doanh nghiệp')).toBe('TRƯỞNG PHÒNG PHÁT TRIỂN DOANH NGHIỆP');
    expect(departmentHeadTitle('Ban Giám đốc', 'Phòng Tư vấn doanh nghiệp')).toBe('TRƯỞNG PHÒNG TƯ VẤN DOANH NGHIỆP');
  });

  it('writes formula-looking text as it is, in a plain string cell, with no apostrophe prefix (m4a B49, m4c B6)', async () => {
    const payloads = ["=cmd|' /C calc'!A0", '+1+1', '-2+3', '@SUM(A1)', '\tTAB', '\rCR', '+84 912 345 678', '- đón tại sảnh', '=HYPERLINK("http://evil","x")'];
    const roster = payloads.map((v) => entry({ name: v, title: v, organization: v, phone: v, email: null, notes: v, substituteName: v, rsvpStatus: 'substituted' }));
    const ws = await readBack(input({ roster, event: { ...input().event, location: '=1+1' } }));
    payloads.forEach((v, i) => {
      const r = ws.getRow(FIRST_DATA_ROW + i);
      for (const col of [2, 3, 4, 6, 11, 14]) {
        const cell = r.getCell(col);
        expect(cell.type).toBe(ExcelJS.ValueType.String);
        // XML parsing turns a bare CR into LF on read-back; the leading character stays non-apostrophe either way.
        expect(cell.value).toBe(v.replace(/\r/g, '\n'));
      }
    });
    ws.eachRow((row) => row.eachCell((cell) => expect(cell.type).not.toBe(ExcelJS.ValueType.Formula)));
  });

  it('names the file by the VN date and keeps Vietnamese letters', () => {
    expect(guestListFileName('Hội nghị XTĐT 2026/11', NOW)).toBe('DS_KhachMoi_Hội_nghị_XTĐT_2026_11_20261104.xlsx');
    expect(guestListFileName('Hội nghị', '2026-11-04T18:30:00.000Z' as Instant)).toBe('DS_KhachMoi_Hội_nghị_20261105.xlsx');
  });
});
