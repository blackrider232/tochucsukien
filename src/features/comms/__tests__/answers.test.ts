// The phrasings people really type into a Form's RSVP answer, each read as
// typed and without diacritics. The rule under test: an answer changes a
// guest only when it is, as a whole, a Form label or one of the canonical
// answers. Everything else is 'review', and review never changes a guest.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CANONICAL_ANSWERS, normalizeAnswer, parseYesNo, readRsvpAnswer, substituteName } from '../domain/answers';
import { REVIEWER } from './rsvp-corpus';

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
/** [answer, reading, reading without diacritics when it differs]. */
const both = (rows: ReadonlyArray<readonly [string, unknown, unknown?]>) =>
  rows.flatMap(([raw, v, ...p]) => (plain(raw) === raw ? [[raw, v] as const] : [[raw, v] as const, [plain(raw), p.length ? p[0] : v] as const]));

// The 116 phrasings of the earlier reader, relabelled: exact canonical answers apply, the rest wait for a person.
const RSVP = [
  ['Có', 'confirmed'],
  ['Có ạ', 'confirmed'],
  ['Có, tôi sẽ tham dự', 'review'],
  ['Có tham dự', 'confirmed'],
  ['Tham dự', 'confirmed'],
  ['Chắc chắn tham dự', 'review'],
  ['Xác nhận', 'confirmed'],
  ['Có, không ăn tiệc', 'review'],
  ['Tôi xác nhận tham dự, không ăn tiệc', 'review'],
  ['Tôi không ăn tiệc nhưng sẽ tham dự', 'review'],
  ['Tham dự, không có nhu cầu ăn tiệc', 'review'],
  ['Xin xác nhận sẽ tham dự cùng Ban Giám đốc', 'review'],
  ['Tôi sẽ tham dự, không có gì thay đổi', 'review'],
  ['Không có gì thay đổi, tôi sẽ tham dự', 'review'],
  ['Em xác nhận tham dự, không cử người đi thay', 'review'],
  ['Tham dự, không có người đi thay', 'review'],
  ['Không cử người thay, tôi tự đi', 'review'],
  ['Không ai đi thay, tôi tham dự', 'review'],
  ['Tham dự hội nghị, không tham dự tiệc', 'review'],
  ['Đồng ý tham gia', 'review'],
  ['Tôi tham gia', 'review'],
  ['Sẽ đến đúng giờ', 'review'],
  ['Tôi sẽ đi dự', 'review'],
  ['Có mặt', 'review'],
  ['Tôi sẽ có mặt đúng giờ', 'review'],
  ['Có tham dự. Không cần xe đưa đón', 'review'],
  ['Dạ có', 'confirmed'],
  ['OK', 'review'],
  ['Yes', 'review'],
  ['Yes, I will attend', 'review'],
  ['Attending', 'review'],
  ['Vâng', 'confirmed', 'review'],
  ['Vâng ạ', 'confirmed', 'review'],
  ['Xin vâng', 'confirmed', 'review'],
  ['Dạ vâng', 'confirmed', 'review'],
  ['Vâng, tôi sẽ tham dự', 'review'],
  ['Không', 'declined'],
  ['Không ạ', 'declined'],
  ['Dạ không', 'declined'],
  ['Không, cảm ơn', 'review'],
  ['Không tham dự', 'declined'],
  ['Không tham dự được', 'declined'],
  ['Không tham gia được', 'review'],
  ['Rất tiếc không tham dự được', 'review'],
  ['Không có mặt', 'review'],
  ['Không, tôi bận', 'review'],
  ['Tôi bận công tác', 'review'],
  ['Bận lịch, không tham dự', 'review'],
  ['Bận', 'review'],
  ['Xin phép vắng mặt', 'declined', 'review'],
  ['vắng mặt', 'declined', 'review'],
  ['em xin phép vắng', 'review'],
  ['Báo vắng', 'review'],
  ['Trùng lịch, xin phép vắng', 'review'],
  ['Tôi không thể tham dự', 'declined'],
  ['Tôi không thể tới tham dự', 'review'],
  ['Tôi xác nhận không tham dự', 'review'],
  ['Rất tiếc, tôi sẽ không tham dự', 'review'],
  ['Không tham dự được vì bận công tác', 'review'],
  ['Tôi tham dự không được', 'review'],
  ['Tham dự ko được', 'review'],
  ['Từ chối', 'declined'],
  ['ko tham dự', 'declined'],
  ['k tham dự', 'declined'],
  ['kg tham dự', 'review'],
  ['khg tham dự', 'declined'],
  ['kh tham dự', 'review'],
  ['hok tham dự', 'declined'],
  ['khôg tham dự', 'review'],
  ['hông tham dự', 'review'],
  ['Ko', 'declined'],
  ['No', 'review'],
  ['Declined', 'review'],
  ['I cannot attend', 'review'],
  ['I won’t attend', 'review'],
  ['Unable to attend', 'review'],
  ['Cử người đi thay', 'substituted'],
  ['Sẽ cử người thay', 'review'],
  ['Không tham dự, cử người đi thay', 'review'],
  ['Tôi bận, cử cán bộ đi thay', 'review'],
  ['Cử đại diện tham dự', 'substituted'],
  ['Có thể', 'review'],
  ['Có thể tham dự', 'review'],
  ['Chưa chắc', 'review'],
  ['Chưa chắc tham dự được', 'review'],
  ['Không chắc có tham dự được không', 'review'],
  ['Không biết có tham dự được không', 'review'],
  ['Có lẽ tham dự', 'review'],
  ['Có, nhưng không chắc', 'review'],
  ['Nếu sắp xếp được sẽ tham dự', 'review'],
  ['Tham dự nếu không bận', 'review'],
  ['Sẽ cố gắng tham dự', 'review'],
  ['Đang cân nhắc', 'review'],
  ['Phân vân', 'review'],
  ['Chưa xác định', 'review'],
  ['Sẽ báo lại sau', 'review'],
  ['Tham dự hay không tôi báo sau', 'review'],
  ['Maybe', 'review'],
  ['Not sure', 'review'],
  ['Có, nhưng không tham dự được', 'review'],
  ['Không, Có', 'review'],
  ['Có, Không', 'review'],
  ['Có / Không', 'review'],
  ['không thể không tham dự', 'review'],
  ['Có tham dự không', 'review'],
  ['Tham dự được không', 'review'],
  ['Không có gì thay đổi tôi sẽ tham dự', 'review'],
  ['Tôi không thể sắp xếp thời gian để tham dự', 'review'],
  ['Tôi đi thay Giám đốc', 'review'],
  ['Không cử người thay', 'review'],
  ['K', 'review'],
  ['vang', 'review'],
  ['Ban Giám đốc', 'review'],
  ['Hanoi', 'review'],
  ['Cơ quan tôi', 'review'],
  ['', 'empty'],
] as const;


// Every canonical whole answer, as the reader accepts it. Adding one is a product decision: it changes this list.
const EXPECTED_CANONICAL = {
  confirmed: ['có', 'vâng', 'dạ', 'dạ có', 'dạ vâng', 'xin vâng', 'xác nhận', 'tham dự', 'sẽ tham dự', 'có tham dự', 'xác nhận tham dự', 'xin xác nhận tham dự', 'tôi sẽ tham dự', 'tôi tham dự'],
  declined: [
    'không', 'dạ không', 'không tham dự', 'không thể tham dự', 'không tham dự được', 'tôi không tham dự', 'tôi không thể tham dự', 'xin vắng', 'xin phép vắng', 'vắng mặt',
    'xin vắng mặt', 'xin phép vắng mặt', 'từ chối',
  ],
  substituted: ['cử người thay', 'cử người đi thay', 'sẽ cử người đi thay', 'cử đại diện', 'cử đại diện tham dự', 'ủy quyền'],
};

describe('readRsvpAnswer', () => {
  it('the relabelled table keeps its 116 phrasings', () => {
    expect(RSVP.length).toBe(116);
  });

  it.each(both(RSVP))('RSVP %j -> %s', (raw, expected) => {
    expect(readRsvpAnswer(raw)).toBe(expected);
  });

  it.each(REVIEWER.flatMap((r) => (plain(r) === r ? [r] : [r, plain(r)])))('%j waits for a person', (raw) => {
    expect(readRsvpAnswer(raw)).toBe('review');
  });

  it('the canonical answers are exactly the listed ones', () => {
    expect(CANONICAL_ANSWERS).toEqual(EXPECTED_CANONICAL);
  });

  it.each([
    ['Có!', 'confirmed'], ['  có  ạ.  ', 'confirmed'], ['CÓ THAM DỰ', 'confirmed'], ['Không nhé', 'declined'], ['Không tham dự nha!', 'declined'], ['Xin vắng ạ', 'declined'],
    ['ko', 'declined'], ['hok', 'declined'], ['khg tham du', 'declined'], ['ko the tham du', 'declined'], ['dạ ko', 'declined'], ['co tham du', 'confirmed'],
    ['xin phep vang', 'review'], ['xin vang', 'review'], ['Uỷ quyền', 'substituted'], ['uy quyen', 'substituted'], ['Có ạ ạ', 'confirmed'],
  ] as const)('%j -> %s (case, spaces, trailing particles and punctuation, shorthand for "không")', (raw, expected) => {
    expect(readRsvpAnswer(raw)).toBe(expected);
  });

  it('a Form label is read by identity first, and only as a whole answer', () => {
    const labels = { [normalizeAnswer('Có, tôi sẽ tham dự')]: 'confirmed', [normalizeAnswer('Rất tiếc, tôi bận')]: 'declined', [normalizeAnswer('Có')]: 'declined' } as const;
    expect(readRsvpAnswer('Có, tôi sẽ tham dự', labels)).toBe('confirmed');
    expect(readRsvpAnswer('rất tiếc, tôi bận.', labels)).toBe('declined');
    expect(readRsvpAnswer('Có', labels)).toBe('declined');
    expect(readRsvpAnswer('Có, tôi sẽ tham dự nhưng muộn', labels)).toBe('review');
    expect(readRsvpAnswer('Không', labels)).toBe('declined');
  });
});

describe('readRsvpAnswer: a line break, a hesitation or an ellipsis is for a person to read', () => {
  const all = Object.values(EXPECTED_CANONICAL).flat();

  it.each(['\n', '\r\n', '\u2028', '\u2029', '\u0085', '\v', '\f', ' \n '])('two lines are review whatever they say, joined by %j', (sep) => {
    // "Có\ntham dự" used to confirm and "Không\ntham dự" to decline, because a line break collapses to a space.
    expect(readRsvpAnswer(`Có${sep}tham dự`)).toBe('review');
    expect(readRsvpAnswer(`Không${sep}tham dự`)).toBe('review');
    for (const first of all) for (const second of ['có', 'không', 'tham dự']) expect(readRsvpAnswer(`${first}${sep}${second}`), JSON.stringify(`${first}${sep}${second}`)).toBe('review');
    // Even a saved Form choice is matched only as one line.
    expect(readRsvpAnswer(`rất tiếc${sep}tôi bận`, { 'rất tiếc tôi bận': 'declined' })).toBe('review');
  });

  it('a line break around the answer, not inside it, changes nothing', () => {
    expect(readRsvpAnswer('Có\n')).toBe('confirmed');
    expect(readRsvpAnswer('\r\nKhông tham dự\r\n')).toBe('declined');
    expect(readRsvpAnswer('Có tham dự')).toBe('confirmed');
    expect(readRsvpAnswer('Có\u00a0tham dự')).toBe('confirmed');
  });

  it.each(['Không à', 'Không ah', 'Có à', 'Có ah', 'khong a?', 'Không...', 'Không…', 'Có…', 'Có..', 'Không tham dự...', 'Có ạ…', 'Không . . .', 'Không ......', 'Không…\n'])(
    '%j is review: hesitation is not an answer',
    (raw) => {
      expect(readRsvpAnswer(raw)).toBe('review');
    },
  );

  it.each([['Không.', 'declined'], ['Có!', 'confirmed'], ['Không tham dự.', 'declined'], ['Có ạ.', 'confirmed'], ['Không ạ', 'declined'], ['Có nhé!', 'confirmed']] as const)(
    '%j stays canonical',
    (raw, expected) => {
      expect(readRsvpAnswer(raw)).toBe(expected);
    },
  );

  it('the status doc lists every canonical answer', () => {
    const doc = readFileSync(join(process.cwd(), 'docs', 'rewrite', 'status', 'comms.md'), 'utf8');
    const missing = all.filter((a) => !doc.includes(`\`${a}\``));
    expect(missing).toEqual([]);
  });
});

/**
 * A corpus built around every canonical answer and label: each with a clause, a scope word, a question, a hedge, a
 * shorthand or a second line added. A phrase is applied only when it normalises to a canonical answer; every other
 * one is review. This is the invariant that a sentence is never read for its meaning.
 */
describe('readRsvpAnswer: a phrase that is not a whole canonical answer is review', () => {
  const canonical = new Set([...Object.values(EXPECTED_CANONICAL).flat()]);
  const before = ['', 'tôi ', 'em ', 'mình ', 'rất muốn ', 'đã ', 'định ', 'chắc ', 'có thể ', 'nếu được ', 'không ', 'chưa ', 'ko ', 'k ', 'xin lỗi, '];
  const after = [
    '', ' nhưng bận', ' nhưng không thể', ' đc', ' dc', ' được không', ' không?', ' ko?', '?', ' buổi chiều', ' phần khai mạc', ' đầy đủ', ' nếu không bận', ', không ăn tiệc',
    ' cùng Ban Giám đốc', ' đột xuất', ' n/a', ' 👍', '\nkhông', '\ncó', ' (muộn)', ' - cử phó giám đốc', ' but cannot', ' rồi', ' luôn', ' hết', ' sau',
  ];
  const corpus = [...new Set([...canonical].flatMap((c) => before.flatMap((b) => after.flatMap((a) => [b + c + a, plain(b + c + a)]))))];

  it('the corpus is large', () => {
    expect(corpus.length).toBeGreaterThan(10_000);
  });

  it('every phrase not exactly canonical reads as review', () => {
    const wrong = corpus.filter((p) => {
      const reading = readRsvpAnswer(p);
      if (reading === 'review') return false;
      return !canonical.has(normalizeAnswer(p)) && !canonicalPlain(p);
    });
    expect(wrong).toEqual([]);
  });

  // A plain-typed phrase is canonical when it is one of the plain forms of the list (never one that loses vâng/vắng).
  const plainForms = new Set([...canonical].filter((c) => !/vâng|vắng/.test(c)).map((c) => plain(c)));
  const shorthand = (s: string) => s.replace(/\b(ko|k|hok|khg)\b/g, 'không');
  function canonicalPlain(p: string): boolean {
    const n = normalizeAnswer(p);
    return plainForms.has(n) || canonical.has(shorthand(n)) || plainForms.has(plain(shorthand(n)));
  }
});

const BANQUET = [
  ['Có', true],
  ['Có dự tiệc', true],
  ['Tôi tham dự tiệc, không cần xe đưa đón', null],
  ['Dự tiệc, không ăn cay', null],
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
  ['Không dự tiệc buổi tối, chỉ dự khai mạc', null],
  ['', null],
] as const;

describe('parseYesNo (banquet)', () => {
  it.each(both(BANQUET))('banquet %j -> %s', (raw, expected) => {
    expect(parseYesNo(raw)).toBe(expected);
  });
});

describe('substituteName', () => {
  it.each([
    'Không', 'không có', 'Không có ai', 'ko', 'K', '-', '—', 'n/a', 'N/A', 'none', 'x', '0', '  ', 'Không ai cả', 'chưa có', 'Không có người đi thay', 'Không rõ', 'Tự đi', 'None', 'Không.',
  ])('%j names nobody', (raw) => {
    expect(substituteName(raw)).toBe('');
  });
  it.each([['Trần Văn Bình', 'Trần Văn Bình'], ['  Ông Khổng Minh ', 'Ông Khổng Minh'], ['Phó GĐ Nguyễn Khoa', 'Phó GĐ Nguyễn Khoa']])('%j is a name', (raw, name) => {
    expect(substituteName(raw)).toBe(name);
  });
});
