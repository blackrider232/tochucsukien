// The styled guest-list workbook of m4c §1.6.1: the legacy layout cell for
// cell, with the fixes. Labels come from the vocab registries (m4c B60, m4a
// B44), agency lines from orgIdentity(settings) (B36), the date is VN local
// (B34), every group is counted and filled (B35), and every text cell goes
// through safeSpreadsheetText (B6). No HTML fallback (B66).

import type { Borders, Cell, Fill, Font, Workbook } from 'exceljs';
import type { Instant, IsoDate } from '@/core/brand';
import { formatVNDate, formatVNTime, todayVN } from '@/core/dates';
import { orgIdentity, type SystemSettings } from '@/core/settings';
import { safeSpreadsheetText } from '@/core/text';
import { DEPARTMENTS, GUEST_GROUPS, INVITE, RSVP, SEND_METHOD, isAttending, type DepartmentName, type GuestGroup, type InviteStatus, type RsvpStatus, type SendMethod } from '@/core/vocab';
import type { RosterEntry } from '../contract';
import { isBanquetGuest } from './roster';

export interface GuestListExport {
  event: { name: string; eventDate: IsoDate; eventTime: string; location: string; department: DepartmentName };
  roster: ReadonlyArray<RosterEntry>;
  settings: SystemSettings;
  /** The exporting user: "Người lập biểu" and the department whose head signs. */
  author: { fullname: string; department: DepartmentName | null };
  now: Instant;
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const SHEET_NAME = 'Danh Sách Khách Mời';

export const COLUMNS: ReadonlyArray<{ header: string; width: number }> = [
  { header: 'STT', width: 7 },
  { header: 'Họ và Tên Đại Biểu', width: 28 },
  { header: 'Chức Danh', width: 24 },
  { header: 'Cơ Quan / Doanh Nghiệp', width: 34 },
  { header: 'Nhóm Khách Mời', width: 20 },
  { header: 'Số Điện Thoại', width: 16 },
  { header: 'Địa Chỉ Email', width: 30 },
  { header: 'Hình Thức Gửi Thư', width: 17 },
  { header: 'Trạng Thái Giấy Mời', width: 18 },
  { header: 'Xác Nhận RSVP', width: 20 },
  { header: 'Người Đi Thay (nếu có)', width: 24 },
  { header: 'Dự Tiệc Chiêu Đãi', width: 16 },
  { header: 'Vị Trí Ghế Ngồi', width: 16 },
  { header: 'Ghi Chú Đón Tiếp', width: 28 },
];
/** First data row; rows 1-8 are the letterhead, title, event line, stats and column headers. */
export const FIRST_DATA_ROW = 9;

/**
 * The department head who signs (commit 6463fbf): the exporter's department, or the event's lead department when the
 * exporter has none that chairs events (admin, Ban Giám đốc).
 */
export function departmentHeadTitle(author: DepartmentName | null, eventDepartment: DepartmentName): string {
  const chairs = (d: DepartmentName | null): d is DepartmentName => d !== null && DEPARTMENTS.some((x) => x.name === d && x.canChairEvents);
  const dept = chairs(author) ? author : chairs(eventDepartment) ? eventDepartment : null;
  if (!dept) return 'TRƯỞNG PHÒNG PHỤ TRÁCH';
  const upper = dept.trim().toUpperCase();
  return dept.trim().toLowerCase().startsWith('phòng ') ? `TRƯỞNG ${upper}` : `TRƯỞNG PHÒNG ${upper}`;
}

/** 'DS_KhachMoi_{name}_{YYYYMMDD}.xlsx': Vietnamese letters kept, anything else '_', 40 characters, VN date. */
export function guestListFileName(eventName: string, now: Instant): string {
  const safe = (eventName || 'SuKien_SCE').replace(/[^a-zA-Z0-9À-ỹ]/g, '_').slice(0, 40);
  return `DS_KhachMoi_${safe}_${todayVN(now).replace(/-/g, '')}.xlsx`;
}

const ARIAL = 'Arial';
const font = (size: number, extra: Partial<Font> = {}): Partial<Font> => ({ name: ARIAL, size, ...extra });
const solid = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const color = (argb: string) => ({ argb });
const thin = (argb: string) => ({ style: 'thin' as const, color: color(argb) });
const medium = (argb: string) => ({ style: 'medium' as const, color: color(argb) });
const center = { horizontal: 'center', vertical: 'middle' } as const;
const left = { horizontal: 'left', vertical: 'middle' } as const;
const GRID: Partial<Borders> = { top: thin('FFCBD5E1'), left: thin('FFCBD5E1'), bottom: thin('FFCBD5E1'), right: thin('FFCBD5E1') };

/** Legacy font colours per value; fills of the groups come from the registry. */
const GROUP_FONT: Readonly<Record<GuestGroup, Partial<Font>>> = {
  VIP: font(9.5, { bold: true, color: color('FF92400E') }),
  SoNganh: font(9.5, { bold: true, color: color('FF5B21B6') }),
  DoanhNghiep: font(9.5, { color: color('FF0369A1') }),
  QuocTe: font(9.5, { color: color('FF6B21A8') }),
  BaoChi: font(9.5, { color: color('FF166534') }),
};
const SEND_STYLE: Readonly<Record<SendMethod, { fill?: string; font: Partial<Font> }>> = {
  direct: { fill: 'FFFEF3C7', font: font(9.5, { bold: true, color: color('FF92400E') }) },
  ems: { fill: 'FFF1F5F9', font: font(9.5, { color: color('FF334155') }) },
  email: { font: font(9.5, { color: color('FF2563EB') }) },
};
const INVITE_STYLE: Readonly<Record<InviteStatus, { fill: string; font: Partial<Font> }>> = {
  received: { fill: 'FFDCFCE7', font: font(9.5, { bold: true, color: color('FF15803D') }) },
  sent: { fill: 'FFE0F2FE', font: font(9.5, { color: color('FF0369A1') }) },
  pending: { fill: 'FFFEF9C3', font: font(9.5, { color: color('FF854D0E') }) },
};
const RSVP_STYLE: Readonly<Record<RsvpStatus, { fill: string; font: Partial<Font> }>> = {
  confirmed: { fill: 'FFDCFCE7', font: font(9.5, { bold: true, color: color('FF15803D') }) },
  declined: { fill: 'FFFEE2E2', font: font(9.5, { bold: true, color: color('FFB91C1C') }) },
  substituted: { fill: 'FFEDE9FE', font: font(9.5, { bold: true, color: color('FF6D28D9') }) },
  pending: { fill: 'FFFEF9C3', font: font(9.5, { color: color('FF854D0E') }) },
};

/** Every value that came from a person is text, never a formula, whatever it starts with. */
const text = (v: string) => safeSpreadsheetText(v);

function statsLine(roster: ReadonlyArray<RosterEntry>): string {
  const n = roster.length;
  const of = (g: GuestGroup) => roster.filter((x) => x.group === g).length;
  const attending = roster.filter((g) => isAttending(g.rsvpStatus)).length;
  const pct = n > 0 ? Math.round((attending / n) * 100) : 0;
  return [
    `THỐNG KÊ: Tổng số ${n} đại biểu`,
    ...(Object.keys(GUEST_GROUPS) as GuestGroup[]).map((g) => `${GUEST_GROUPS[g].short}: ${of(g)}`),
    `Đã xác nhận (RSVP): ${attending}/${n} (${pct}%)`,
    `Dự tiệc: ${roster.filter(isBanquetGuest).length}`,
    `Đã xếp chỗ: ${roster.filter((g) => g.seatCode !== null).length}`,
  ].join('  •  ');
}

export async function buildGuestWorkbook(input: GuestListExport): Promise<Workbook> {
  const mod = await import('exceljs');
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const { event, roster, settings, author, now } = input;
  const org = orgIdentity(settings);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = org.agencyName;
  workbook.lastModifiedBy = author.fullname || 'Cán bộ Lễ tân';
  workbook.created = new Date(now);
  workbook.modified = new Date(now);

  const ws = workbook.addWorksheet(SHEET_NAME, {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 8, topLeftCell: 'A9', activeCell: 'A9' }],
    properties: { tabColor: { argb: 'FF1E3A8A' } },
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      showGridLines: true,
      margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
  });
  ws.columns = COLUMNS.map((c) => ({ width: c.width }));

  const merged = (range: string, value: string, style: { font: Partial<Font>; fill?: Fill; border?: Partial<Borders> }) => {
    ws.mergeCells(range);
    const cell = ws.getCell(range.split(':')[0]!);
    cell.value = value;
    cell.font = style.font;
    cell.alignment = center;
    if (style.fill) cell.fill = style.fill;
    if (style.border) cell.border = style.border;
  };

  merged('A1:E1', org.parentAgency.toUpperCase(), { font: font(10, { bold: true, color: color('FF1E3A8A') }) });
  merged('J1:N1', 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { font: font(10, { bold: true, color: color('FF0F172A') }) });
  ws.getRow(1).height = 20;
  merged('A2:E2', org.agencyName.toUpperCase(), { font: font(9.5, { bold: true, color: color('FF0F766E') }) });
  merged('J2:N2', 'Độc lập - Tự do - Hạnh phúc', { font: font(10, { bold: true, italic: true, underline: true, color: color('FF0F172A') }) });
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 10;

  merged('A4:N4', 'BẢNG DANH SÁCH ĐẠI BIỂU & KHÁCH MỜI THAM DỰ SỰ KIỆN', {
    font: font(15, { bold: true, color: color('FF1E3A8A') }),
    fill: solid('FFEBF4FF'),
    border: { top: medium('FF93C5FD'), bottom: medium('FF93C5FD'), left: thin('FF93C5FD'), right: thin('FF93C5FD') },
  });
  ws.getRow(4).height = 34;

  const when = `${formatVNDate(event.eventDate)}${event.eventTime ? `, khai mạc ${event.eventTime}` : ''}`;
  merged('A5:N5', text(`Sự kiện: ${(event.name || 'Sự kiện').toUpperCase()}   |   Ngày tổ chức: ${when}   |   Địa điểm: ${event.location || 'Theo thông báo'}`), {
    font: font(10.5, { bold: true, italic: true, color: color('FF334155') }),
    fill: solid('FFF8FAFC'),
    border: { bottom: thin('FFE2E8F0') },
  });
  ws.getRow(5).height = 24;
  merged('A6:N6', statsLine(roster), { font: font(9.5, { bold: true, color: color('FF1E293B') }), fill: solid('FFF1F5F9'), border: { bottom: thin('FFCBD5E1') } });
  ws.getRow(6).height = 24;
  ws.getRow(7).height = 8;

  const header = ws.getRow(8);
  header.height = 30;
  COLUMNS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = font(10, { bold: true, color: color('FFFFFFFF') });
    cell.fill = solid('FF1E3A8A');
    cell.alignment = { ...center, wrapText: true };
    cell.border = { top: medium('FF1E3A8A'), bottom: medium('FF1E3A8A'), left: thin('FF60A5FA'), right: thin('FF60A5FA') };
  });
  ws.autoFilter = 'A8:N8';

  roster.forEach((g, index) => {
    const row = ws.getRow(FIRST_DATA_ROW + index);
    row.height = 25;
    const zebra = index % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF';
    const put = (col: number, value: string | number, align: typeof center | typeof left, style: { font?: Partial<Font>; fill?: string } = {}): Cell => {
      const cell = row.getCell(col);
      cell.value = value;
      cell.alignment = align;
      cell.font = style.font ?? font(9.5);
      cell.fill = solid(style.fill ?? zebra);
      cell.border = GRID;
      return cell;
    };
    put(1, index + 1, center);
    put(2, text(g.name), left, { font: font(10.5, { bold: true, color: color('FF0F172A') }) });
    put(3, text(g.title), left);
    put(4, text(g.organization), left);
    put(5, GUEST_GROUPS[g.group].label, center, { font: GROUP_FONT[g.group], fill: GUEST_GROUPS[g.group].exportFill });
    // Text format keeps a leading 0; the value is a string cell either way.
    put(6, text(g.phone), center).numFmt = '@';
    put(7, text(g.email ?? ''), left, { font: font(9.5, { color: color('FF2563EB') }) });
    put(8, SEND_METHOD[g.sendMethod].label, center, SEND_STYLE[g.sendMethod]);
    put(9, INVITE[g.inviteStatus].label, center, INVITE_STYLE[g.inviteStatus]);
    put(10, RSVP[g.rsvpStatus].label, center, RSVP_STYLE[g.rsvpStatus]);
    put(11, text(g.rsvpStatus === 'substituted' ? g.substituteName : ''), left, { font: font(9.5, { italic: true }) });
    if (g.hasBanquet) put(12, g.rsvpStatus === 'declined' ? 'Có (đã báo vắng)' : '✓ Có dự tiệc', center, { fill: 'FFCCFBF1', font: font(9.5, { bold: true, color: color('FF0F766E') }) });
    else put(12, 'Không', center, { font: font(9.5, { color: color('FF94A3B8') }) });
    put(13, g.seatCode ?? '-', center, { font: g.seatCode ? font(10, { bold: true, color: color('FF1E3A8A') }) : font(9.5, { color: color('FF94A3B8') }) });
    put(14, text(g.notes), left, { font: font(9, { italic: true, color: color('FF64748B') }) });
  });

  const footer = FIRST_DATA_ROW + roster.length + 1;
  const [y, m, d] = todayVN(now).split('-');
  const sign = (range: string, value: string, f: Partial<Font>) => {
    ws.mergeCells(range);
    const cell = ws.getCell(range.split(':')[0]!);
    cell.value = value;
    cell.font = f;
    cell.alignment = center;
  };
  sign(`J${footer}:N${footer}`, `${org.city}, ngày ${d} tháng ${m} năm ${y} (Xuất lúc ${formatVNTime(now)})`, font(9.5, { italic: true, color: color('FF475569') }));
  ws.getRow(footer).height = 20;
  const titles = footer + 1;
  const titleFont = font(10.5, { bold: true, color: color('FF0F172A') });
  sign(`A${titles}:D${titles}`, 'NGƯỜI LẬP BIỂU', titleFont);
  sign(`F${titles}:I${titles}`, departmentHeadTitle(author.department, event.department), titleFont);
  sign(`K${titles}:N${titles}`, 'LÃNH ĐẠO TRUNG TÂM PHÊ DUYỆT', titleFont);
  ws.getRow(titles).height = 22;
  const notes = titles + 1;
  const noteFont = font(9, { italic: true, color: color('FF64748B') });
  sign(`A${notes}:D${notes}`, '(Ký, ghi rõ họ tên)', noteFont);
  sign(`F${notes}:I${notes}`, '(Ký, ghi rõ họ tên)', noteFont);
  sign(`K${notes}:N${notes}`, '(Ký, đóng dấu và ghi rõ họ tên)', noteFont);
  ws.getRow(notes).height = 18;
  for (const r of [notes + 1, notes + 2, notes + 3]) ws.getRow(r).height = 16;
  const name = notes + 4;
  sign(`A${name}:D${name}`, text(author.fullname || 'Cán bộ Lễ tân'), font(10, { bold: true, color: color('FF0F172A') }));
  ws.getRow(name).height = 22;

  return workbook;
}

/** The .xlsx file as bytes, for downloadBlob and for tests that read it back. */
export async function guestListXlsx(input: GuestListExport): Promise<Blob> {
  const buffer = await (await buildGuestWorkbook(input)).xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_TYPE });
}
