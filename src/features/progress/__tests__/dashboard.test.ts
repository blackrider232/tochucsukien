import { describe, expect, it } from 'vitest';
import type { EventId, GroupId, Instant, IsoDate, StepId, Version } from '@/core/brand';
import { buildWorkCalendar } from '@/core/dates';
import type { DepartmentName } from '@/core/vocab';
import type { EventPlan, Step } from '../contract';
import { filterSummaries, NO_FILTER, summarize, type PlanFilter } from '../domain/dashboard';
import { SETTINGS } from './harness';

const today = '2026-11-04' as IsoDate;
const cal = buildWorkCalendar([]);
const at = '2026-11-01T00:00:00.000Z' as Instant;

let n = 0;
const uuid = (prefix: string) => `${prefix}0000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function step(name: string, over: Partial<Step> = {}): Step {
  return {
    id: uuid('a') as StepId, eventId: '' as EventId, groupId: '' as GroupId, name, requirement: '', offsetDays: 3, dayType: 'calendar', targetPhase: 'before',
    completedAt: null, completedBy: null, assignee: '', templateKey: '', subTasks: [], links: [], sort: 0, version: 1 as Version, ...over,
  };
}

function plan(name: string, department: DepartmentName, groups: Array<{ name: string; steps: Step[] }>, over: Partial<EventPlan['event']> = {}): EventPlan {
  const id = uuid('e') as EventId;
  return {
    event: {
      id, name, type: 'hoi_nghi', eventDate: '2026-12-15' as IsoDate, eventTime: '08:30' as EventPlan['event']['eventTime'], location: '', department, supportingDepartments: [],
      leadPerson: '', budget: null, targetGuests: 150, status: 'preparing', note: '', deletedAt: null, version: 1 as Version, createdAt: at, createdBy: null, updatedAt: at, ...over,
    },
    groups: groups.map((g, sort) => ({ id: uuid('b') as GroupId, eventId: id, phase: 'phase_prepare', name: g.name, leadPerson: '', note: '', sort, version: 1 as Version, steps: g.steps })),
  };
}

const rows = [
  plan('Hội nghị Hàn Quốc', 'Phòng Xúc tiến đầu tư', [
    { name: 'Nhóm 1: Khách mời', steps: [step('Lập danh sách khách', { subTasks: [{ id: '1', name: 'Đại sứ quán', completed: false }] }), step('Gửi giấy mời')] },
    { name: 'Nhóm 2: Hậu cần', steps: [step('Đặt hoa'), step('Thuê xe đưa đón')] },
  ]),
  plan('Hội chợ OCOP', 'Phòng Tư vấn doanh nghiệp', [{ name: 'Nhóm 1: Gian hàng', steps: [step('Bố trí gian hàng')] }], { type: 'hoi_cho' }),
].map((p) => summarize(cal, p, today, SETTINGS));

const search = (q: string, over: Partial<PlanFilter> = {}) => filterSummaries(rows, { ...NO_FILTER, q, ...over });
const shown = (q: string, over: Partial<PlanFilter> = {}) => search(q, over).map((v) => ({ event: v.summary.plan.event.name, groups: v.groups.map((g) => ({ name: g.name, steps: g.steps.map((s) => s.name) })) }));

describe('dashboard search (m2 BUG-35)', () => {
  it('shows everything for an empty or blank query', () => {
    expect(search('')).toHaveLength(2);
    expect(search('   ')).toHaveLength(2);
  });

  it('folds diacritics and case, on both sides', () => {
    expect(shown('HOI NGHI han quoc').map((v) => v.event)).toEqual(['Hội nghị Hàn Quốc']);
    expect(shown('hội chợ').map((v) => v.event)).toEqual(['Hội chợ OCOP']);
  });

  it('keeps every group and step when the event itself matches', () => {
    const [only] = search('han quoc');
    expect(only!.groups.map((g) => g.steps.length)).toEqual([2, 2]);
  });

  it('matches the lead department by its full name and by its short name', () => {
    expect(shown('xuc tien dau tu').map((v) => v.event)).toEqual(['Hội nghị Hàn Quốc']);
    expect(shown('P. Tư vấn').map((v) => v.event)).toEqual(['Hội chợ OCOP']);
  });

  it('matches the full department name, which the short name does not repeat', () => {
    expect(shown('phong xuc tien').map((v) => v.event)).toEqual(['Hội nghị Hàn Quốc']);
  });

  it('lets one query span the event and a step', () => {
    expect(shown('han quoc dat hoa')).toEqual([{ event: 'Hội nghị Hàn Quốc', groups: [{ name: 'Nhóm 2: Hậu cần', steps: ['Đặt hoa'] }] }]);
  });

  it('narrows to the groups and steps that match, dropping the rest', () => {
    expect(shown('thue xe')).toEqual([{ event: 'Hội nghị Hàn Quốc', groups: [{ name: 'Nhóm 2: Hậu cần', steps: ['Thuê xe đưa đón'] }] }]);
  });

  it('keeps a whole group when its own name matches', () => {
    expect(shown('khach moi')).toEqual([{ event: 'Hội nghị Hàn Quốc', groups: [{ name: 'Nhóm 1: Khách mời', steps: ['Lập danh sách khách', 'Gửi giấy mời'] }] }]);
  });

  it('finds a step by the name of one of its sub-tasks', () => {
    expect(shown('dai su quan')).toEqual([{ event: 'Hội nghị Hàn Quốc', groups: [{ name: 'Nhóm 1: Khách mời', steps: ['Lập danh sách khách'] }] }]);
  });

  it('lets one query span a group name and a step name', () => {
    expect(shown('hau can dat hoa')).toEqual([{ event: 'Hội nghị Hàn Quốc', groups: [{ name: 'Nhóm 2: Hậu cần', steps: ['Đặt hoa'] }] }]);
  });

  it('drops an event whose groups and steps do not match either', () => {
    expect(search('khong co gi')).toEqual([]);
  });

  it('ANDs the search with the type filter', () => {
    expect(shown('gian hang', { type: 'hoi_nghi' })).toEqual([]);
    expect(shown('gian hang', { type: 'hoi_cho' }).map((v) => v.event)).toEqual(['Hội chợ OCOP']);
  });
});
