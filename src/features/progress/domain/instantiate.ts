// Turns the standard SCE process table into the groups and steps of one event.

import type { GroupId, StepId } from '@/core/brand';
import type { SystemSettings } from '@/core/settings';
import type { EventType } from '@/core/vocab';
import type { GroupInput } from './schemas';
import { STANDARD_TEMPLATE } from './standard-templates';
import type { ByType, LeadText, TemplateGroup } from './template-types';

export interface TemplateIds {
  group(groupKey: TemplateGroup['key']): GroupId;
  step(stepKey: string): StepId;
  subTask(stepKey: string, index: number): string;
}

const pick = <T>(v: ByType<T>, type: EventType): T =>
  typeof v === 'object' && v !== null && 'hoi_nghi' in v && 'hoi_cho' in v ? v[type] : (v as T);

const SETTING_KEYS = ['guestQuotaPercent', 'badgeQuotaPercent', 'dailyReportThresholdDays', 'fieldPresenceHours'] as const;

function fill(text: string, s: SystemSettings): string {
  return SETTING_KEYS.reduce((acc, key) => acc.replaceAll(`{${key}}`, String(s[key])), text);
}

const lead = (t: LeadText, leadPerson: string) => (typeof t === 'string' ? t : leadPerson || t.lead);

/** Groups and steps in template order, nothing completed, no links. Ids come from `ids` so a retry converges. */
export function instantiateTemplate(type: EventType, input: { leadPerson: string; settings: SystemSettings }, ids: TemplateIds): GroupInput[] {
  const { leadPerson, settings } = input;
  return STANDARD_TEMPLATE.map((g, gi) => ({
    id: ids.group(g.key),
    phase: g.phase,
    name: pick(g.name, type),
    leadPerson: lead(g.leadPerson, leadPerson),
    note: fill(g.note, settings),
    sort: gi,
    steps: g.steps
      .filter((s) => !s.onlyFor || s.onlyFor === type)
      .map((s, si) => {
        const phase = pick(s.targetPhase, type);
        const offset = s.offsetDays === 'dailyReportThresholdDays' ? settings.dailyReportThresholdDays : pick(s.offsetDays, type);
        return {
          id: ids.step(s.key),
          name: fill(pick(s.name, type), settings),
          requirement: fill(pick(s.requirement, type), settings),
          targetPhase: phase,
          offsetDays: phase === 'dday' ? 0 : offset,
          dayType: pick(s.dayType, type),
          assignee: lead(s.assignee, leadPerson),
          templateKey: pick(s.templateKey, type),
          subTasks: pick(s.subTasks, type).map((name, i) => ({ id: ids.subTask(s.key, i), name: fill(name, settings), completed: false })),
          links: [],
          sort: si,
          completedAt: null,
          completedBy: null,
        };
      }),
  }));
}

export function templateStepCount(type: EventType): number {
  return STANDARD_TEMPLATE.flatMap((g) => g.steps).filter((s) => !s.onlyFor || s.onlyFor === type).length;
}
