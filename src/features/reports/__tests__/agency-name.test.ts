import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, orgIdentity } from '@/core/settings';
import { agencyName } from '../domain/agency-name';
import { dailyReportDocument } from '../domain/report';
import { SETTINGS } from './fixtures';

describe('agency names in running text (decision 18, CCR 3)', () => {
  it.each([
    ['SỞ TÀI CHÍNH HÀ NỘI', 'Sở Tài chính Hà Nội'],
    ['TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP HÀ NỘI', 'Trung tâm Xúc tiến đầu tư và Hỗ trợ doanh nghiệp Hà Nội'],
    ['TRUNG TÂM SCE HÀ NỘI', 'Trung tâm SCE Hà Nội'],
    ['SỞ KẾ HOẠCH VÀ ĐẦU TƯ', 'Sở Kế hoạch và Đầu tư'],
    ['  SỞ   TÀI CHÍNH  ', 'Sở Tài chính'],
  ])('%s -> %s', (raw, expected) => {
    expect(agencyName(raw, 'Hà Nội')).toBe(expected);
  });

  it('keeps a name that is already in mixed case', () => {
    expect(agencyName('Sở Tài chính Hà Nội', 'Hà Nội')).toBe('Sở Tài chính Hà Nội');
    expect(agencyName('Trung tâm XTĐT&HTDN', 'Hà Nội')).toBe('Trung tâm XTĐT&HTDN');
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
