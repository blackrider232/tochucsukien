import { describe, expect, it } from 'vitest';
import type { ContactId, Email } from '@/core/brand';
import type { GuestGroup } from '@/core/vocab';
import type { MasterContact } from '../contract';
import { buildIndex, groupCounts, matchRank, rankContacts, searchTextOf, indexContact } from '../domain/search';

let n = 0;
const contact = (name: string, over: Partial<MasterContact> = {}): MasterContact =>
  ({ id: `c${String(++n).padStart(3, '0')}` as ContactId, name, group: 'DoanhNghiep' as GuestGroup, title: '', organization: 'Công ty X', phone: '', email: null, address: '', taxCode: '', notes: '', hasBanquet: false, updatedAt: '' as never, version: 1 as never, ...over });
const names = (list: MasterContact[], q: string, opts = {}) => rankContacts(buildIndex(list), q, opts).items.map((c) => c.name);

describe('Vietnamese folding in search', () => {
  const people = [contact('Nguyễn Đức Thắng'), contact('Đặng Thị Hồng'), contact('Ông Hoàng Văn Ủy', { organization: 'Ủy ban Quận' })];
  it.each([
    ['nguyen duc thang', 'Nguyễn Đức Thắng'],
    ['NGUYỄN ĐỨC', 'Nguyễn Đức Thắng'],
    ['dang thi', 'Đặng Thị Hồng'],
    ['đặng', 'Đặng Thị Hồng'],
    ['uy ban', 'Ông Hoàng Văn Ủy'],
    ['  hoang   van ', 'Ông Hoàng Văn Ủy'],
    ['hong', 'Đặng Thị Hồng'],
  ])('%s finds %s', (q, expected) => {
    expect(names(people, q)).toEqual([expected]);
  });
  it('finds nothing for a word that is nowhere', () => expect(names(people, 'zzz')).toEqual([]));
  it('requires every token, in any order', () => {
    expect(names(people, 'thang nguyen')).toEqual(['Nguyễn Đức Thắng']);
    expect(names(people, 'nguyen hong')).toEqual([]);
  });
  it('finds a phone typed with dots or as digits, and an email', () => {
    const list = [contact('A', { phone: '0913.210.001', email: 'a.b@sở.vn' as Email }), contact('B', { phone: '024 3846 3000' })];
    expect(names(list, '0913.210')).toEqual(['A']);
    expect(names(list, '0913210001')).toEqual(['A']);
    expect(names(list, '02438463000')).toEqual(['B']);
    expect(names(list, 'a.b@so.vn')).toEqual(['A']);
  });
});

describe('ranking (m4c §3.2)', () => {
  const list = [
    contact('Lê Văn Nam', { organization: 'Công ty An Phát' }),
    contact('Trần Văn An'),
    contact('An Bình'),
    contact('Phạm Hoài An Khang'),
    contact('Vũ Thanh', { title: 'Giám đốc An ninh' }),
    contact('Đỗ Mai', { phone: '0912 000 an', email: null }),
    contact('Anh Tuấn'),
    contact('An Vip', { group: 'VIP' }),
  ];
  it('puts a name that starts with the query first, VIP before the rest, then alphabetical', () => {
    expect(names(list, 'an').slice(0, 3)).toEqual(['An Vip', 'An Bình', 'Anh Tuấn']);
  });
  it('then names with a word that starts with it, then names containing it, then organization or title, then phone', () => {
    const ranked = names(list, 'an');
    expect(ranked.indexOf('Phạm Hoài An Khang')).toBeLessThan(ranked.indexOf('Lê Văn Nam'));
    expect(ranked.indexOf('Trần Văn An')).toBeLessThan(ranked.indexOf('Lê Văn Nam'));
    expect(ranked.indexOf('Lê Văn Nam')).toBeGreaterThan(-1);
  });
  it('gives the five ranks to the right matches', () => {
    const rank = (c: MasterContact, q: string) => matchRank(indexContact(c, searchTextOf(c)), q.split(' '));
    expect(rank(contact('An Bình'), 'an')).toBe(0);
    expect(rank(contact('Trần Văn An'), 'an')).toBe(1);
    expect(rank(contact('Lê Văn Banh'), 'an')).toBe(2);
    expect(rank(contact('Vũ Hoa', { organization: 'Công ty An Phát' }), 'an')).toBe(3);
    expect(rank(contact('Đỗ Mai', { phone: '0912 000 123' }), '123')).toBe(4);
  });
  it('is the same on every call and breaks ties by id', () => {
    const twins = [contact('Hà'), contact('Hà'), contact('Hà')];
    expect(rankContacts(buildIndex(twins), 'ha').items.map((c) => c.id)).toEqual(twins.map((c) => c.id));
    expect(rankContacts(buildIndex([...twins].reverse()), 'ha').items.map((c) => c.id)).toEqual(twins.map((c) => c.id));
  });
  it('lists everything for an empty query, VIP first then alphabetical', () => {
    expect(names([contact('Bình'), contact('Ánh', { group: 'VIP' }), contact('An')], '')).toEqual(['Ánh', 'An', 'Bình']);
  });
  it('filters by group, pages with limit and offset, and reports the total', () => {
    const many = Array.from({ length: 25 }, (_, i) => contact(`Khách ${String(i).padStart(2, '0')}`, { group: i % 5 === 0 ? 'BaoChi' : 'DoanhNghiep' }));
    const index = buildIndex(many);
    expect(rankContacts(index, '', { group: 'BaoChi' }).total).toBe(5);
    const page = rankContacts(index, 'khach', { limit: 10, offset: 10 });
    expect(page.total).toBe(25);
    expect(page.items.map((c) => c.name)).toEqual(many.map((c) => c.name).sort().slice(10, 20));
  });
  it('counts contacts per group', () => {
    expect(groupCounts([contact('a', { group: 'VIP' }), contact('b'), contact('c')])).toEqual({ all: 3, VIP: 1, SoNganh: 0, DoanhNghiep: 2, QuocTe: 0, BaoChi: 0 });
  });
});
