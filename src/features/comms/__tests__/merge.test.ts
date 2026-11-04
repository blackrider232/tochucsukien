import { describe, expect, it } from 'vitest';
import type { Email, GuestId, HHmm, IsoDate, SafeUrl, SeatCode } from '@/core/brand';
import { DEFAULT_SETTINGS, orgIdentity } from '@/core/settings';
import { parseRecipientList } from '../domain/addresses';
import { EMAIL_TEMPLATES } from '../domain/email-templates';
import { buildMatchIndex, matchResponse, type MatchTarget } from '../domain/matching';
import { checkTags, honorificOf, renderMail, type MergeData } from '../domain/merge';

const data = (over: Partial<MergeData['recipient']> = {}, rest: Partial<MergeData> = {}): MergeData => ({
  event: { name: 'Hội nghị Xúc tiến Đầu tư 2026', eventDate: '2026-12-15' as IsoDate, eventTime: '08:30' as HHmm, location: 'Hà Nội', targetGuests: 150 },
  recipient: { name: 'Nguyễn Văn An', title: 'Giám đốc', organization: 'Công ty A', group: 'DoanhNghiep', seatCode: 'A-01' as SeatCode, checkinCode: 'X7K2QF', ...over },
  sender: { displayName: 'Ban Tổ chức', email: 'btc@example.com' },
  officerName: 'Cán bộ Lễ tân',
  contactPhone: '0912.345.678',
  formUrl: 'https://forms.gle/abc' as SafeUrl,
  org: orgIdentity({ ...DEFAULT_SETTINGS, version: 1 as never }),
  ...rest,
});

describe('renderMail', () => {
  it('reads the real fields: event date and time, the roster seat, the target, the officer, the form link', () => {
    const m = renderMail({ subject: '{ten_su_kien}', html: '<p>{thoi_gian}|{so_ghe}|{so_dai_bieu}|{can_bo_lien_he}|{sdt_lien_he}|{link_google_form}|{ma_checkin}</p>' }, data());
    expect(m.text).toBe('08:30 ngày 15/12/2026|A-01|150|Cán bộ Lễ tân|0912.345.678|https://forms.gle/abc|X7K2QF');
    expect(m.subject).toBe('Hội nghị Xúc tiến Đầu tư 2026');
  });

  it('never invents a seat or a venue', () => {
    const m = renderMail({ subject: '', html: '<p>{so_ghe}|{dia_diem}</p>' }, data({ seatCode: null }, { event: { ...data().event, location: '' } }));
    expect(m.text).toBe('Ban Tổ chức sẽ thông báo|Theo thông báo của Ban Tổ chức');
  });

  it('escapes merge values in the body, so a guest name cannot add markup or a link', () => {
    const evil = '<img src=x onerror=alert(1)><a href="javascript:alert(2)">x</a> & "q"';
    const m = renderMail({ subject: '{ho_ten}', html: '<p>{ho_ten}</p><a href="{co_quan}">link</a>' }, data({ name: evil, organization: 'javascript:alert(3)' }));
    expect(m.html).not.toMatch(/<img|<a [^>]*javascript/);
    expect(m.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(m.text).toContain(evil);
    expect(m.subject).toBe(evil);
  });

  it('sanitizes the template itself: a pasted <script> or handler never reaches the body', () => {
    const m = renderMail({ subject: '', html: '<p onclick="steal()">Kính gửi</p><script>alert(1)</script><iframe src="//evil"></iframe>' }, data());
    expect(m.html).toBe('<p>Kính gửi</p>');
  });

  it('flattens line breaks in the subject so a value cannot open a new header', () => {
    expect(renderMail({ subject: 'Mời {ho_ten}', html: '' }, data({ name: 'An\r\nBcc: v@evil.com' })).subject).toBe('Mời An Bcc: v@evil.com');
  });

  it('reports unknown tags and tags with no value for the recipient', () => {
    const check = checkTags({ subject: '{ho_ten} {abc}', html: '{link_google_form}{sdt_lien_he}{ma_checkin}' }, data({ checkinCode: null }, { formUrl: null, contactPhone: '' }));
    expect(check).toEqual({ unknown: ['abc'], missing: ['link_google_form', 'sdt_lien_he', 'ma_checkin'] });
  });

  it('takes the agency names from settings in every template (decision 18)', () => {
    const renamed = data({}, { org: { parentAgency: 'CƠ QUAN CHA', agencyName: 'ĐƠN VỊ MỚI', agencyShortName: 'DVM', city: 'Hà Nội' } });
    const invitation = renderMail(EMAIL_TEMPLATES[0]!, renamed).text;
    expect(invitation).toContain('ĐƠN VỊ MỚI (DVM) trực thuộc CƠ QUAN CHA');
    for (const t of EMAIL_TEMPLATES) expect(`${t.subject}${t.html}`).not.toMatch(/SCE|Sở Tài chính|15\/11\/2026|08:30|NCC/);
    for (const t of EMAIL_TEMPLATES) expect(checkTags(t, data()).unknown).toEqual([]);
  });

  it.each([
    [{ group: 'VIP' as const, title: '' }, 'Đồng chí'],
    [{ group: 'DoanhNghiep' as const, title: 'Phó Giám đốc' }, 'Đồng chí'],
    [{ group: 'DoanhNghiep' as const, title: 'Chuyên viên' }, 'Đồng chí'],
    [{ group: 'DoanhNghiep' as const, title: 'Tổng thư ký hiệp hội' }, 'Quý Ông/Bà'],
    [{ group: 'QuocTe' as const, title: 'Ambassador' }, 'Quý Ông/Bà'],
  ])('honorific %j', (over, expected) => {
    expect(honorificOf(data(over).recipient)).toBe(expected);
  });
});

describe('parseRecipientList', () => {
  it('reads commas, semicolons, newlines, Name <addr> and quoted names with commas', () => {
    const r = parseRecipientList('a@x.vn; Nguyễn An <AN@Y.VN>\n"Trần, Bình" <binh@z.vn>,  c@w.vn ');
    expect(r.valid).toEqual([
      { email: 'a@x.vn', name: '' },
      { email: 'an@y.vn', name: 'Nguyễn An' },
      { email: 'binh@z.vn', name: 'Trần, Bình' },
      { email: 'c@w.vn', name: '' },
    ]);
    expect(r.invalid).toEqual([]);
  });
  it('treats regex characters in an address as text and dedupes case-insensitively', () => {
    const r = parseRecipientList('a.b+tag@x.vn, A.B+TAG@x.vn, khong-phai-email, x@y');
    expect(r.valid.map((v) => v.email)).toEqual(['a.b+tag@x.vn']);
    expect(r.duplicates).toEqual(['a.b+tag@x.vn']);
    expect(r.invalid).toEqual(['khong-phai-email', 'x@y']);
  });
  it('refuses an address carrying a header break', () => {
    expect(parseRecipientList('"a@x.vn\rBcc: v@evil.com"').valid).toEqual([]);
  });
});

describe('matchResponse', () => {
  const g = (id: string, over: Partial<MatchTarget>): MatchTarget => ({ id: id as GuestId, name: '', organization: '', email: null, phone: '', ...over });
  const guests = [
    g('1', { name: 'Nguyễn Văn An', organization: 'Công ty A', email: 'an@a.vn' as Email, phone: '0912.345.678' }),
    g('2', { name: 'Trần Bình', organization: 'Sở X', phone: '0987654321' }),
    g('3', { name: 'Lê Cường', organization: 'Công ty C' }),
    g('4', { name: 'Lê Cường', organization: 'Công ty D' }),
    g('5', { name: 'Phạm Dũng', organization: 'Báo E', phone: '0900000001' }),
    g('6', { name: 'Phạm Dung', organization: 'Báo F', phone: '0900000001' }),
  ];
  const index = buildMatchIndex(guests);
  it.each([
    ['email, case-insensitive', { name: 'X', organization: '', email: 'AN@A.VN' as Email, phone: '' }, { kind: 'email', guestId: '1' }],
    ['phone +84 to 0', { name: 'X', organization: '', email: null, phone: '+84 987 654 321' }, { kind: 'phone', guestId: '2' }],
    ['phone without last-8 guessing', { name: 'X', organization: '', email: null, phone: '0287654321' }, { kind: 'none' }],
    ['name with the organisation', { name: 'le cuong', organization: 'CÔNG TY C', email: null, phone: '' }, { kind: 'name', guestId: '3' }],
    ['namesakes without organisation are ambiguous', { name: 'Lê Cường', organization: 'Công ty Z', email: null, phone: '' }, { kind: 'ambiguous', candidates: ['3', '4'] }],
    ['one shared phone, two guests', { name: '', organization: '', email: null, phone: '0900000001' }, { kind: 'ambiguous', candidates: ['5', '6'] }],
    ['unknown email falls to the phone tier', { name: '', organization: '', email: 'new@a.vn' as Email, phone: '0912345678' }, { kind: 'phone', guestId: '1' }],
    ['nobody', { name: 'Khách mới', organization: 'Mới', email: 'moi@x.vn' as Email, phone: '' }, { kind: 'none' }],
  ])('%s', (_, response, expected) => {
    expect(matchResponse(index, response)).toEqual(expected);
  });

  it('stays linear: 5000 responses against 5000 guests in well under a second', () => {
    const many = Array.from({ length: 5000 }, (_, i) => g(`g${i}`, { name: `Khách ${i}`, organization: `Đơn vị ${i}`, email: `k${i}@x.vn` as Email, phone: `09${String(i).padStart(8, '0')}` }));
    const started = performance.now();
    const idx = buildMatchIndex(many);
    for (let i = 0; i < 5000; i += 1) matchResponse(idx, { name: `Khách ${i}`, organization: '', email: null, phone: `09${String(i).padStart(8, '0')}` });
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
