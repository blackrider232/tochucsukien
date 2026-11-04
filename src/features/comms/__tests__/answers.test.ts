// The phrasings people really type into a Form's RSVP answer, each read as
// typed and without diacritics. The rule under test: only a clear answer
// changes a guest. Anything unsure, contradictory or asked back is null, and
// null never frees a seat.

import { describe, expect, it } from 'vitest';
import { parseRsvpAnswer, parseYesNo } from '../domain/answers';

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
/** [answer, reading, reading without diacritics when it differs]: "vâng" (yes), "vắng" (absent) and "hông" (no) lose their meaning typed plain. */
const both = (rows: ReadonlyArray<readonly [string, unknown, unknown?]>) =>
  rows.flatMap(([raw, v, ...p]) => (plain(raw) === raw ? [[raw, v] as const] : [[raw, v] as const, [plain(raw), p.length ? p[0] : v] as const]));

const RSVP = [
  // Yes.
  ['Có', 'confirmed'],
  ['Có ạ', 'confirmed'],
  ['Có, tôi sẽ tham dự', 'confirmed'],
  ['Có tham dự', 'confirmed'],
  ['Tham dự', 'confirmed'],
  ['Chắc chắn tham dự', 'confirmed'],
  ['Xác nhận', 'confirmed'],
  ['Có, không ăn tiệc', 'confirmed'],
  ['Tôi xác nhận tham dự, không ăn tiệc', 'confirmed'],
  ['Tôi không ăn tiệc nhưng sẽ tham dự', 'confirmed'],
  ['Tham dự, không có nhu cầu ăn tiệc', 'confirmed'],
  ['Xin xác nhận sẽ tham dự cùng Ban Giám đốc', 'confirmed'],
  ['Tôi sẽ tham dự, không có gì thay đổi', 'confirmed'],
  ['Không có gì thay đổi, tôi sẽ tham dự', 'confirmed'],
  ['Em xác nhận tham dự, không cử người đi thay', 'confirmed'],
  ['Tham dự, không có người đi thay', 'confirmed'],
  ['Không cử người thay, tôi tự đi', 'confirmed'],
  ['Không ai đi thay, tôi tham dự', 'confirmed'],
  ['Tham dự hội nghị, không tham dự tiệc', 'confirmed'],
  ['Đồng ý tham gia', 'confirmed'],
  ['Tôi tham gia', 'confirmed'],
  ['Sẽ đến đúng giờ', 'confirmed'],
  ['Tôi sẽ đi dự', 'confirmed'],
  ['Có mặt', 'confirmed'],
  ['Tôi sẽ có mặt đúng giờ', 'confirmed'],
  ['Có tham dự. Không cần xe đưa đón', 'confirmed'],
  ['Dạ có', 'confirmed'],
  ['OK', 'confirmed'],
  ['Yes', 'confirmed'],
  ['Yes, I will attend', 'confirmed'],
  ['Attending', 'confirmed'],
  ['Vâng', 'confirmed', null],
  ['Vâng ạ', 'confirmed', null],
  ['Xin vâng', 'confirmed', null],
  ['Dạ vâng', 'confirmed', null],
  ['Vâng, tôi sẽ tham dự', 'confirmed', null],
  // No.
  ['Không', 'declined'],
  ['Không ạ', 'declined'],
  ['Dạ không', 'declined'],
  ['Không, cảm ơn', 'declined'],
  ['Không tham dự', 'declined'],
  ['Không tham dự được', 'declined'],
  ['Không tham gia được', 'declined'],
  ['Rất tiếc không tham dự được', 'declined'],
  ['Không có mặt', 'declined'],
  ['Không, tôi bận', 'declined'],
  ['Tôi bận công tác', 'declined'],
  ['Bận lịch, không tham dự', 'declined'],
  ['Bận', 'declined'],
  ['Xin phép vắng mặt', 'declined'],
  ['vắng mặt', 'declined'],
  ['em xin phép vắng', 'declined'],
  ['Báo vắng', 'declined'],
  ['Trùng lịch, xin phép vắng', 'declined'],
  ['Tôi không thể tham dự', 'declined'],
  ['Tôi không thể tới tham dự', 'declined'],
  ['Tôi xác nhận không tham dự', 'declined'],
  ['Rất tiếc, tôi sẽ không tham dự', 'declined'],
  ['Không tham dự được vì bận công tác', 'declined'],
  ['Tôi tham dự không được', 'declined'],
  ['Tham dự ko được', 'declined'],
  ['Từ chối', 'declined'],
  ['ko tham dự', 'declined'],
  ['k tham dự', 'declined'],
  ['kg tham dự', 'declined'],
  ['khg tham dự', 'declined'],
  ['kh tham dự', 'declined'],
  ['hok tham dự', 'declined'],
  ['khôg tham dự', 'declined'],
  ['hông tham dự', 'declined', null],
  ['Ko', 'declined'],
  ['No', 'declined'],
  ['Declined', 'declined'],
  ['I cannot attend', 'declined'],
  ['I won’t attend', 'declined'],
  ['Unable to attend', 'declined'],
  // A substitute goes.
  ['Cử người đi thay', 'substituted'],
  ['Sẽ cử người thay', 'substituted'],
  ['Không tham dự, cử người đi thay', 'substituted'],
  ['Tôi bận, cử cán bộ đi thay', 'substituted'],
  ['Cử đại diện tham dự', 'substituted'],
  // No answer: unsure, contradictory, asked back, or not an answer at all.
  ['Có thể', null],
  ['Có thể tham dự', null],
  ['Chưa chắc', null],
  ['Chưa chắc tham dự được', null],
  ['Không chắc có tham dự được không', null],
  ['Không biết có tham dự được không', null],
  ['Có lẽ tham dự', null],
  ['Có, nhưng không chắc', null],
  ['Nếu sắp xếp được sẽ tham dự', null],
  ['Tham dự nếu không bận', null],
  ['Sẽ cố gắng tham dự', null],
  ['Đang cân nhắc', null],
  ['Phân vân', null],
  ['Chưa xác định', null],
  ['Sẽ báo lại sau', null],
  ['Tham dự hay không tôi báo sau', null],
  ['Maybe', null],
  ['Not sure', null],
  ['Có, nhưng không tham dự được', null],
  ['Không, Có', null],
  ['Có, Không', null],
  ['Có / Không', null],
  ['không thể không tham dự', null],
  ['Có tham dự không', null],
  ['Tham dự được không', null],
  ['Không có gì thay đổi tôi sẽ tham dự', null],
  ['Tôi không thể sắp xếp thời gian để tham dự', null],
  ['Tôi đi thay Giám đốc', null],
  ['Không cử người thay', null],
  ['K', null],
  ['vang', null],
  ['Ban Giám đốc', null],
  ['Hanoi', null],
  ['Cơ quan tôi', null],
  ['', null],
] as const;

const BANQUET = [
  ['Có', true],
  ['Có dự tiệc', true],
  ['Tôi tham dự tiệc, không cần xe đưa đón', true],
  ['Dự tiệc, không ăn cay', true],
  ['Vâng', true, null],
  ['Không', false],
  ['Không ạ', false],
  ['Không dự tiệc', false],
  ['Không tham dự tiệc', false],
  ['ko dự tiệc', false],
  ['Có, không ăn tiệc', null],
  ['Có lẽ', null],
  ['Có thể', null],
  ['Cơ quan', null],
  ['', null],
] as const;

describe('answers', () => {
  it('the RSVP table is a corpus of at least 90 phrasings', () => {
    expect(RSVP.length).toBeGreaterThanOrEqual(90);
  });

  it.each(both(RSVP))('RSVP %j -> %s', (raw, expected) => {
    expect(parseRsvpAnswer(raw)).toBe(expected);
  });

  it.each(both(BANQUET))('banquet %j -> %s', (raw, expected) => {
    expect(parseYesNo(raw)).toBe(expected);
  });
});
