import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, orgIdentity } from '@/core/settings';
import { agencyName, KNOWN_AGENCIES } from '../domain/agency-name';
import { dailyReportDocument } from '../domain/report';
import { SETTINGS } from './fixtures';

/** Every org name the docs, the legacy app, the dev seed and the settings defaults carry, as stored (capitals) and as the text prints it. */
const KNOWN: ReadonlyArray<readonly [string, string]> = [
  ['SỞ TÀI CHÍNH HÀ NỘI', 'Sở Tài chính Hà Nội'],
  ['SỞ TÀI CHÍNH THÀNH PHỐ HÀ NỘI', 'Sở Tài chính Thành phố Hà Nội'],
  ['SỞ TÀI CHÍNH', 'Sở Tài chính'],
  ['TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP HÀ NỘI', 'Trung tâm Xúc tiến đầu tư và Hỗ trợ doanh nghiệp Hà Nội'],
  ['TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP', 'Trung tâm Xúc tiến đầu tư và Hỗ trợ doanh nghiệp'],
  ['TRUNG TÂM XÚC TIẾN ĐẦU TƯ, THƯƠNG MẠI VÀ DU LỊCH HÀ NỘI', 'Trung tâm Xúc tiến đầu tư, Thương mại và Du lịch Hà Nội'],
  ['TRUNG TÂM SCE HÀ NỘI', 'Trung tâm SCE Hà Nội'],
  ['TRUNG TÂM SCE', 'Trung tâm SCE'],
  ['ỦY BAN NHÂN DÂN THÀNH PHỐ HÀ NỘI', 'Ủy ban nhân dân Thành phố Hà Nội'],
  ['UBND THÀNH PHỐ HÀ NỘI', 'UBND Thành phố Hà Nội'],
  ['UBND TP HÀ NỘI', 'UBND TP Hà Nội'],
  ['UBND TP. HÀ NỘI', 'UBND TP. Hà Nội'],
  ['HĐND THÀNH PHỐ HÀ NỘI', 'HĐND Thành phố Hà Nội'],
  ['ĐOÀN ĐBQH THÀNH PHỐ HÀ NỘI', 'Đoàn ĐBQH Thành phố Hà Nội'],
  ['BAN QUẢN LÝ CÁC KHU CÔNG NGHIỆP VÀ CHẾ XUẤT HÀ NỘI', 'Ban Quản lý các khu công nghiệp và chế xuất Hà Nội'],
  ['SỞ KẾ HOẠCH VÀ ĐẦU TƯ', 'Sở Kế hoạch và Đầu tư'],
  ['SỞ KẾ HOẠCH VÀ ĐẦU TƯ HÀ NỘI', 'Sở Kế hoạch và Đầu tư Hà Nội'],
  ['SỞ KH&ĐT HÀ NỘI', 'Sở KH&ĐT Hà Nội'],
  ['BỘ KẾ HOẠCH VÀ ĐẦU TƯ', 'Bộ Kế hoạch và Đầu tư'],
  ['TỔNG CỤC THỐNG KÊ', 'Tổng cục Thống kê'],
  ['CỤC THUẾ TP. HÀ NỘI', 'Cục Thuế TP. Hà Nội'],
  ['CỤC THUẾ THÀNH PHỐ HÀ NỘI', 'Cục Thuế Thành phố Hà Nội'],
];

describe('agency names in running text (decision 18, CCR 3)', () => {
  it.each(KNOWN)('%s -> %s', (raw, expected) => {
    expect(agencyName(raw)).toBe(expected);
  });

  it('the table lists exactly the names above, and each entry spells its key in capitals (no typo can hide in a value)', () => {
    expect(Object.entries(KNOWN_AGENCIES).sort()).toEqual([...KNOWN].sort());
    for (const [key, value] of Object.entries(KNOWN_AGENCIES)) expect(value.toLocaleUpperCase('vi')).toBe(key);
  });

  it('reads the older tone placement and stray spacing as the same name', () => {
    expect(agencyName('UỶ BAN NHÂN DÂN THÀNH PHỐ HÀ NỘI')).toBe('Ủy ban nhân dân Thành phố Hà Nội');
    expect(agencyName('  SỞ   TÀI CHÍNH  ')).toBe('Sở Tài chính');
    expect(agencyName('SỞ TÀI CHÍNH HÀ NỘI'.normalize('NFD'))).toBe('Sở Tài chính Hà Nội');
  });

  it('an unknown name prints unchanged, capitals as stored, instead of a guessed casing', () => {
    expect(agencyName('CỤC HẢI QUAN THÀNH PHỐ HÀ NỘI')).toBe('CỤC HẢI QUAN THÀNH PHỐ HÀ NỘI');
    expect(agencyName('TRUNG TÂM XÚC TIẾN ĐẦU TƯ, THƯƠNG MẠI VÀ DU LỊCH TỈNH X')).toBe('TRUNG TÂM XÚC TIẾN ĐẦU TƯ, THƯƠNG MẠI VÀ DU LỊCH TỈNH X');
    expect(agencyName('  CỤC   THUẾ  ')).toBe('CỤC THUẾ');
    expect(agencyName('')).toBe('');
  });

  it('keeps a name that is already in mixed case', () => {
    expect(agencyName('Sở Tài chính Hà Nội')).toBe('Sở Tài chính Hà Nội');
    expect(agencyName('Trung tâm XTĐT&HTDN')).toBe('Trung tâm XTĐT&HTDN');
  });

  it('the printed Kính gửi reads the default settings in proper case', () => {
    const doc = dailyReportDocument(
      { reportDate: '2026-12-08', eventDate: '2026-12-15', workdaysToEvent: 5, eventName: 'HN', keyHighlight: '', blockers: '', signatory: '', signatoryTitle: '', documentNumber: null, figures: {} } as never,
      orgIdentity({ ...DEFAULT_SETTINGS, version: SETTINGS.version }),
    );
    expect(doc.recipients).toEqual([
      'Ủy ban nhân dân Thành phố Hà Nội;',
      'Sở Tài chính Hà Nội;',
      'Ban Giám đốc Trung tâm Xúc tiến đầu tư và Hỗ trợ doanh nghiệp Hà Nội.',
    ]);
  });
});
