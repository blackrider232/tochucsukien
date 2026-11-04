import { describe, expect, it } from 'vitest';
import type { GroupId, IsoDate, StepId } from '@/core/brand';
import { buildWorkCalendar } from '@/core/dates';
import { instantiateTemplate, templateStepCount, type TemplateIds } from '../domain/instantiate';
import { deadlineOf } from '../domain/schedule';
import { runLegacyGenerator } from './legacy-generator';
import { SETTINGS } from './harness';

const T0 = '2026-12-15' as IsoDate;
const ids: TemplateIds = {
  group: (key) => `group-${key}` as GroupId,
  step: (key) => key as StepId,
  subTask: (_key, i) => String(i + 1),
};
const legacyCalendar = buildWorkCalendar([]);

describe.each(['hoi_nghi', 'hoi_cho'] as const)('the typed SCE template reproduces legacy generateStandardEventTemplate (%s)', (type) => {
  it.each(['Nguyễn Văn A', ''])('field by field, deadlines included, lead person %j', (lead) => {
    const legacy = runLegacyGenerator(type, T0, lead);
    const ours = instantiateTemplate(type, { leadPerson: lead, settings: SETTINGS }, ids);
    const legacyShape = legacy.map((g) => ({
      phase: g.phase, name: g.name, leadPerson: g.leadPerson, note: g.note,
      steps: g.steps.map((s) => ({
        key: s.id, name: s.name, requirement: s.requirement, offsetDays: s.offsetDays, dayType: s.dayType, targetPhase: s.targetPhase,
        deadline: s.calculatedDeadline, assignee: s.assignee, templateKey: s.templateKey,
        subTasks: s.subTasks.map((t) => ({ id: String(t.id), name: t.name, completed: t.completed })), links: s.links,
      })),
    }));
    const ourShape = ours.map((g) => ({
      phase: g.phase, name: g.name, leadPerson: g.leadPerson, note: g.note,
      steps: g.steps.map((s) => ({
        key: s.id, name: s.name, requirement: s.requirement, offsetDays: s.offsetDays, dayType: s.dayType, targetPhase: s.targetPhase,
        deadline: deadlineOf(legacyCalendar, T0, s), assignee: s.assignee, templateKey: s.templateKey, subTasks: s.subTasks, links: s.links,
      })),
    }));
    expect(ourShape).toEqual(legacyShape);
  });
});

describe('template shape and settings', () => {
  it('has 7 groups, 32 steps for hội nghị and 33 for hội chợ', () => {
    expect(instantiateTemplate('hoi_nghi', { leadPerson: '', settings: SETTINGS }, ids)).toHaveLength(7);
    expect(templateStepCount('hoi_nghi')).toBe(32);
    expect(templateStepCount('hoi_cho')).toBe(33);
  });
  it('fills quotas, the daily-report threshold and field hours from settings (m2 BUG-07)', () => {
    const settings = { ...SETTINGS, guestQuotaPercent: 140, badgeQuotaPercent: 125, dailyReportThresholdDays: 7, fieldPresenceHours: 3 };
    const steps = instantiateTemplate('hoi_nghi', { leadPerson: '', settings }, ids).flatMap((g) => g.steps);
    const byKey = (k: string) => steps.find((s) => s.id === k)!;
    expect(byKey('step_1a').requirement).toContain('140%');
    expect(byKey('step_2b').requirement).toContain('125%');
    expect(byKey('step_6a').offsetDays).toBe(7);
    expect(byKey('step_6a').subTasks[0]!.name).toBe('Khởi động chế độ báo cáo tiến độ hàng ngày (mốc T - 7)');
    expect(byKey('step_dday_1').name).toBe('Kiểm tra trước giờ khai mạc (T0 - 3h)');
    expect(JSON.stringify(steps)).not.toMatch(/\{[a-zA-Z]+\}/);
  });
});
