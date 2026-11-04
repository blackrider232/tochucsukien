import { describe, expect, it } from 'vitest';
import { guestIdentityKey } from '@/features/guests';
import { mapHeaders, parseBanquetCell, parseGroupCell, previewContactImport, type ImportOptions } from '../domain/csv-import';

const opts = (over: Partial<ImportOptions> = {}): ImportOptions => ({ defaultGroup: 'DoanhNghiep', existingKeys: new Set(), ...over });
const HEADER = 'Họ Và Tên,Nhóm Đối Tượng,Cơ Quan / Doanh Nghiệp,Số Điện Thoại,Email,Tiệc VIP';

describe('header mapping', () => {
  it('reads the export headers, the legacy form labels and plain English', () => {
    const m = mapHeaders(['STT', 'Mã Định Danh', 'Nhóm Đối Tượng', 'Họ Và Tên', 'Chức Danh', 'Cơ Quan / Doanh Nghiệp', 'Số Điện Thoại', 'Email', 'Địa Chỉ', 'Mã Số Thuế / Ngành', 'Tiệc VIP', 'Ghi Chú Lễ Tân']);
    expect(m.fields).toEqual({ group: 2, name: 3, title: 4, organization: 5, phone: 6, email: 7, address: 8, taxCode: 9, hasBanquet: 10, notes: 11 });
    expect(m.unknown).toEqual([]);
    expect(mapHeaders(['name', 'organization', 'phone']).fields).toEqual({ name: 0, organization: 1, phone: 2 });
    expect(mapHeaders(['Họ và Tên Đại Biểu / Đầu Mối *', 'Hộp Thư Điện Tử (Email)', 'Cơ quan']).fields).toEqual({ name: 0, email: 1, organization: 2 });
  });
  it('names the missing required columns and the columns it did not understand', () => {
    const m = mapHeaders(['Họ tên', 'Sở thích']);
    expect(m.missing).toEqual(['Cơ quan / doanh nghiệp']);
    expect(m.unknown).toEqual(['Sở thích']);
  });
  it('prefers a header that is exactly a field name over one that only starts with it, and says which column it left out', () => {
    const m = mapHeaders(['Tên doanh nghiệp', 'Họ và tên', 'Đơn vị']);
    expect(m.fields).toEqual({ name: 1, organization: 2 });
    expect(m.unused).toEqual(['"Tên doanh nghiệp" (đã lấy cột "Họ và tên" làm Họ và tên)']);
    expect(m.conflicts).toEqual([]);
  });
  it('names a conflict when two columns are equally good for one field', () => {
    const m = mapHeaders(['Họ tên', 'Tên', 'Cơ quan']);
    expect(m.conflicts).toEqual(['Họ và tên: "Họ tên", "Tên"']);
  });
});

describe('a preview never reads a column silently in place of another (m4c B22)', () => {
  it('reads the person from "Họ và tên", not from "Tên doanh nghiệp", and warns about the column it skipped', () => {
    const p = previewContactImport('Tên doanh nghiệp,Họ và tên,Đơn vị\nCông ty A,Nguyễn Văn B,Sở C', opts());
    expect(p.error).toBeNull();
    expect(p.rows[0]!.draft).toMatchObject({ name: 'Nguyễn Văn B', organization: 'Sở C' });
    expect(p.unusedColumns).toEqual(['"Tên doanh nghiệp" (đã lấy cột "Họ và tên" làm Họ và tên)']);
  });
  it('refuses a file where two columns are equally the name', () => {
    const p = previewContactImport('Họ tên,Tên,Cơ quan\nAn,Bình,Sở A', opts());
    expect(p.error).toBe('Có nhiều cột cùng nghĩa: Họ và tên: "Họ tên", "Tên". Đổi tên hoặc xóa bớt cột rồi dán lại.');
    expect(p.rows).toEqual([]);
  });
});

describe('cells', () => {
  it.each([
    ['VIP', 'VIP'], ['vip', 'VIP'], ['Sở ngành', 'SoNganh'], ['SoNganh', 'SoNganh'], ['Khối Sở ban ngành & Quận huyện', 'SoNganh'],
    ['Doanh nghiệp', 'DoanhNghiep'], ['Doanh nghiệp & HTX', 'DoanhNghiep'], ['Quốc tế', 'QuocTe'], ['Khách Quốc tế / Ngoại giao', 'QuocTe'], ['Báo chí', 'BaoChi'], ['Báo chí, Truyền hình', 'BaoChi'],
  ])('group %s', (raw, expected) => expect(parseGroupCell(raw)).toBe(expected));
  it('rejects an unknown group', () => expect(parseGroupCell('Khác')).toBeNull());
  it.each([['Có', true], ['có', true], ['x', true], ['1', true], ['Không', false], ['0', false], ['-', false], ['', null], ['  ', null], ['có thể', undefined]])('banquet %j', (raw, expected) =>
    expect(parseBanquetCell(raw)).toBe(expected));
});

describe('previewContactImport', () => {
  it('counts new rows, duplicates of the directory, duplicates inside the file and invalid rows apart', () => {
    const existing = guestIdentityKey({ name: 'Cũ', organization: 'Sở A', email: null, phone: '' });
    const text = [
      HEADER,
      'Mới Một,VIP,Sở Mới,0912345678,mot@example.com,Có',
      'Cũ,Sở ngành,Sở A,,,',
      'Mới Một Bản Sao,VIP,Sở Mới,0900000000,MOT@example.com,',
      'Thiếu cơ quan,VIP,,,,',
      'Email xấu,VIP,Sở B,,khong-phai-email,',
      'Nhóm lạ,Khác,Sở C,,,',
      'Có tiệc lạ,VIP,Sở D,,,có thể',
      'Điện thoại xấu,VIP,Sở E,abc,,',
    ].join('\n');
    const p = previewContactImport(text, opts({ existingKeys: new Set([existing]) }));
    expect(p.error).toBeNull();
    expect(p.counts).toEqual({ total: 8, created: 1, duplicateExisting: 1, duplicateInFile: 1, invalid: 5 });
    expect(p.rows.map((r) => r.status)).toEqual(['new', 'duplicate_existing', 'duplicate_in_file', 'invalid', 'invalid', 'invalid', 'invalid', 'invalid']);
  });

  it('says what is wrong with each invalid row, with its line number', () => {
    const p = previewContactImport([HEADER, 'A,VIP,,,,', 'B,Khác,Sở,,,', 'C,VIP,Sở,,xấu,'].join('\n'), opts());
    expect(p.rows.map((r) => r.errors)).toEqual([
      ['Dòng 2: Cơ quan / doanh nghiệp: Nhập cơ quan / doanh nghiệp'],
      ['Dòng 3: Nhóm đối tượng: "Khác" không có trong danh mục (VIP, Sở ngành, Doanh nghiệp, Quốc tế, Báo chí)'],
      ['Dòng 4: Email: Email không hợp lệ (ví dụ daibieu@domain.vn)'],
    ]);
    expect(p.rows.every((r) => r.draft === null)).toBe(true);
  });

  it('uses the default group for an empty group cell and the group default for an empty banquet cell', () => {
    const p = previewContactImport(['Họ tên,Cơ quan,Nhóm,Tiệc', 'A,Sở 1,,', 'B,Sở 2,VIP,', 'C,Sở 3,Báo chí,Có'].join('\n'), opts({ defaultGroup: 'QuocTe' }));
    expect(p.rows.map((r) => [r.draft?.group, r.draft?.hasBanquet])).toEqual([['QuocTe', false], ['VIP', true], ['BaoChi', true]]);
  });

  it('reads a leading-zero phone as text and a guarded cell back without its apostrophe', () => {
    const p = previewContactImport(['Họ tên,Cơ quan,Điện thoại,Ghi chú', "A,Sở,0912345678,'=SUM(1)", "B,Sở 2,'+84 912 345 678,"].join('\n'), opts());
    expect(p.rows.map((r) => [r.draft?.phone, r.draft?.notes])).toEqual([['0912345678', '=SUM(1)'], ['+84 912 345 678', '']]);
  });

  it('refuses a file with no header, a missing required column, no rows, or too many rows', () => {
    expect(previewContactImport('', opts()).error).toContain('Chưa có dữ liệu');
    expect(previewContactImport('Họ tên\nA', opts()).error).toContain('Thiếu cột bắt buộc: Cơ quan');
    expect(previewContactImport('Họ tên,Cơ quan', opts()).error).toContain('chưa có đối tượng');
    const big = ['Họ tên,Cơ quan', ...Array.from({ length: 2001 }, (_, i) => `A${i},Sở`)].join('\n');
    expect(previewContactImport(big, opts()).error).toContain('tối đa 2000');
    expect(previewContactImport('a,"b\n1,2', opts()).error).toContain('chưa được đóng');
  });

  it('keeps a hostile cell as plain text and reports unknown columns', () => {
    const p = previewContactImport(['Họ tên,Cơ quan,Sở thích', '<img src=x onerror=alert(1)>,<script>x</script>,tennis'].join('\n'), opts());
    expect(p.rows[0]!.draft).toMatchObject({ name: '<img src=x onerror=alert(1)>', organization: '<script>x</script>' });
    expect(p.unknownColumns).toEqual(['Sở thích']);
  });

  it('gives every row its own id', () => {
    const p = previewContactImport(['Họ tên,Cơ quan', 'A,Sở 1', 'B,Sở 2'].join('\n'), opts());
    expect(new Set(p.rows.map((r) => r.id)).size).toBe(2);
  });

  it('stores the lowercased email', () => {
    expect(previewContactImport(['Họ tên,Cơ quan,Email', 'A,Sở,An@Example.COM'].join('\n'), opts()).rows[0]!.draft?.email).toBe('an@example.com');
  });
});
