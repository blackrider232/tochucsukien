import type { EventType } from '@/core/vocab';
import type { DayType, GroupPhase, StepPhase } from '../contract';

/** One value, or one per event type when hội nghị and hội chợ differ. */
export type ByType<T> = T | { readonly hoi_nghi: T; readonly hoi_cho: T };

/** The wizard's lead person, or `lead` (the fallback) when it is empty. */
export type LeadText = string | { readonly lead: string };

/**
 * Text may hold {guestQuotaPercent}, {badgeQuotaPercent}, {dailyReportThresholdDays}
 * and {fieldPresenceHours}; instantiation fills them from system settings (m2 BUG-07).
 */
export interface TemplateStep {
  /** Legacy step id ('step_1a'), stable across events. */
  key: string;
  name: ByType<string>;
  requirement: ByType<string>;
  /** 'dailyReportThresholdDays': the T-N start of the daily-report regime. */
  offsetDays: ByType<number> | 'dailyReportThresholdDays';
  dayType: ByType<DayType>;
  targetPhase: ByType<StepPhase>;
  assignee: LeadText;
  templateKey: ByType<string>;
  subTasks: ByType<ReadonlyArray<string>>;
  onlyFor?: EventType;
}

export interface TemplateGroup {
  key: 'g1' | 'g2' | 'g3' | 'g4' | 'g5' | 'g6' | 'dday';
  phase: GroupPhase;
  name: ByType<string>;
  leadPerson: LeadText;
  note: string;
  steps: ReadonlyArray<TemplateStep>;
}
