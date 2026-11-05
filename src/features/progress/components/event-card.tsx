'use client';

import Link from 'next/link';
import { Badge, Button, Checkbox, EmptyState, Icon, IconButton, PrintLink, ProgressBar, StatusBadge, cn } from '@/components/ui';
import { useCalendar, useSettings } from '@/core/auth';
import type { EventId, GroupId } from '@/core/brand';
import { calendarDaysBetween, formatVNDate } from '@/core/dates';
import { departmentByName, EVENT_TYPES, type Tone } from '@/core/vocab';
import { resolveTemplateKey, templateHref } from '@/features/templates';
import type { SceEvent, Step } from '../contract';
import { stepsByDeadline, type PlanGroup, type PlanSummary } from '../domain/dashboard';
import { countdownBadge, deadlineOf, offsetLabel, stepState, stepStateBadge } from '../domain/schedule';
import { usePlan, type PlanScreenData } from './plan-context';

export interface Expansion {
  isOpen(id: string): boolean;
  toggle(id: string): void;
}
export const ALWAYS_OPEN: Expansion = { isOpen: () => true, toggle: () => {} };

/** The step's form in the template library, or null while the key is unknown there or names a template that was deleted. */
const templateLink = (key: string, eventId: EventId, catalog: PlanScreenData['templates']): string | null => templateHref(resolveTemplateKey(key, catalog), eventId);

function cardTone(s: PlanSummary): Tone | undefined {
  if (s.progress.overdue > 0) return 'amber';
  if (s.inDailyWindow) return 'rose';
  if (s.progress.percent === 100) return 'emerald';
  return undefined;
}

export function EventCard({ summary, groups, expansion, standalone }: {
  summary: PlanSummary;
  /** Groups to show (already narrowed by the search). */
  groups: ReadonlyArray<PlanGroup>;
  expansion: Expansion;
  /** The plan page: no collapse, no link to itself. */
  standalone?: boolean;
}) {
  const { permsOf, editEvent, deleteEvent } = usePlan();
  const { event } = summary.plan;
  const perms = permsOf(event.id);
  const open = standalone || expansion.isOpen(event.id);
  const badge = countdownBadge(summary.countdown, summary.inDailyWindow);
  const bodyId = `event-body-${event.id}`;

  return (
    <article id={`event-${event.id}`} tabIndex={-1} aria-label={event.name} data-tone={cardTone(summary)} className={cn('rounded-card border bg-surface shadow-card', cardTone(summary) ? 'border-(--tone-solid)' : 'border-line')}>
      <div className="flex flex-wrap items-start gap-3 p-3 sm:p-4">
        <button
          type="button"
          disabled={standalone}
          aria-expanded={standalone ? undefined : open}
          aria-controls={bodyId}
          onClick={() => expansion.toggle(event.id)}
          className="flex min-w-0 flex-1 basis-72 items-start gap-2 text-left disabled:cursor-default"
        >
          {!standalone && <Icon name="chevron-right" size={18} className={cn('mt-1 shrink-0 text-ink-muted transition-transform', open && 'rotate-90 text-primary')} />}
          <span className="min-w-0 flex-1 space-y-1.5">
            <span className="flex flex-wrap items-center gap-1.5">
              <StatusBadge registry={EVENT_TYPES} value={event.type} size="sm" />
              <Badge tone={badge.tone} pulse={badge.pulse} icon="clock">{badge.text}</Badge>
              {summary.progress.overdue > 0 && <Badge tone="amber" pulse icon="alert-triangle">Có {summary.progress.overdue} việc chậm</Badge>}
              {summary.complete && <Badge tone="emerald" icon="check">Đã hoàn thành</Badge>}
            </span>
            <span className="block truncate text-base font-bold text-ink sm:text-lg" title={event.name}>{event.name}</span>
            <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-muted sm:text-sm">
              <span><strong className="font-semibold text-ink-2">{formatVNDate(event.eventDate, { weekday: true })}</strong> ({event.eventTime})</span>
              <span>{event.location || 'Địa điểm chưa chốt'}</span>
              <span>{departmentByName(event.department).shortName}</span>
              <span>{event.leadPerson || 'Chưa phân công'}</span>
            </span>
          </span>
        </button>
        <div className="flex w-full items-center gap-3 sm:w-auto">
          <div className="min-w-0 flex-1 sm:w-44">
            <ProgressBar value={summary.progress.done} max={summary.progress.total} label={`${summary.progress.done}/${summary.progress.total} việc`} />
          </div>
          <div className="flex shrink-0 items-center">
            {!standalone && <IconButton icon="external-link" label="Mở trang kế hoạch" href={`/events/${event.id}/plan`} />}
            {perms.edit && <IconButton icon="pencil" label="Chỉnh sửa thông tin sự kiện" onClick={() => editEvent(event.id)} />}
            {perms.remove && <IconButton icon="trash" tone="rose" label="Xóa sự kiện" onClick={() => void deleteEvent(event)} />}
          </div>
        </div>
      </div>
      {open && (
        <div id={bodyId} className="space-y-4 border-t border-line p-3 sm:p-4">
          {event.note && (
            <p data-tone="blue" className="rounded-control border border-(--tone-bd) bg-(--tone-bg) px-3 py-2 text-sm text-(--tone-fg)">
              <strong>Chỉ đạo chung của Sự kiện:</strong> {event.note}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <PrintLink href={`/events/${event.id}/plan/print`} label="In kế hoạch A4" />
          </div>
          <EventBody summary={summary} groups={groups} expansion={expansion} />
        </div>
      )}
    </article>
  );
}

function EventBody({ summary, groups, expansion }: { summary: PlanSummary; groups: ReadonlyArray<PlanGroup>; expansion: Expansion }) {
  const { permsOf, applyTemplate, openGroup } = usePlan();
  const settings = useSettings();
  const { event } = summary.plan;
  const perms = permsOf(event.id);

  if (summary.plan.groups.length === 0) {
    return (
      <EmptyState
        icon="calendar-check"
        title="Sự kiện chưa có nhóm công việc"
        text="Áp dụng quy trình chuẩn SCE để có sẵn các nhóm việc và bước chi tiết, hoặc tự thêm nhóm việc."
        action={perms.write ? (
          <div className="flex flex-wrap justify-center gap-2">
            <Button icon="check" onClick={() => void applyTemplate(event)}>Áp dụng quy trình chuẩn SCE</Button>
            <Button variant="secondary" icon="plus" onClick={() => openGroup(event.id, 'phase_prepare')}>Thêm nhóm việc</Button>
          </div>
        ) : undefined}
      />
    );
  }

  const prepare = groups.filter((g) => g.phase === 'phase_prepare');
  const dday = groups.filter((g) => g.phase === 'phase_dday');
  const afterDays = Math.max(0, ...dday.flatMap((g) => g.steps).filter((s) => s.targetPhase === 'after').map((s) => s.offsetDays));
  const ddaySteps = dday.reduce((n, g) => n + g.steps.length, 0);

  return (
    <>
      <PhaseSection event={event} phase="phase_prepare" tone="blue" title="Giai Đoạn I: Chuẩn Bị Trước Sự Kiện" caption={`${prepare.length} nhóm công việc`} groups={prepare} expansion={expansion} />
      <PhaseSection
        event={event} phase="phase_dday" tone="rose" groups={dday} expansion={expansion} caption={`${ddaySteps} bước tác nghiệp`}
        title={`Giai Đoạn II: Tác Nghiệp Hiện Trường Ngày Diễn Ra & Sau Sự Kiện (T0 − ${settings.fieldPresenceHours}h${afterDays > 0 ? ` đến T+${afterDays}` : ''})`}
      />
    </>
  );
}

function PhaseSection({ event, phase, tone, title, caption, groups, expansion }: {
  event: SceEvent; phase: PlanGroup['phase']; tone: 'blue' | 'rose'; title: string; caption: string; groups: ReadonlyArray<PlanGroup>; expansion: Expansion;
}) {
  const { permsOf, openGroup } = usePlan();
  return (
    <section aria-label={title} className="space-y-2">
      <header className="flex flex-wrap items-center gap-2">
        <span data-tone={tone} aria-hidden="true" className="size-2.5 rounded-full bg-(--tone-solid)" />
        <h3 className="min-w-0 flex-1 text-sm font-bold uppercase tracking-wide text-ink-2">{title}</h3>
        <span className="text-xs text-ink-muted">{caption}</span>
        {permsOf(event.id).write && <Button variant="ghost" icon="plus" onClick={() => openGroup(event.id, phase)}>Thêm nhóm việc</Button>}
      </header>
      {groups.map((g) => <GroupSection key={g.id} event={event} group={g} expansion={expansion} />)}
    </section>
  );
}

function GroupSection({ event, group, expansion }: { event: SceEvent; group: PlanGroup; expansion: Expansion }) {
  const { permsOf, today, openNote, openStep, openGroup, deleteGroup, clearNote } = usePlan();
  const cal = useCalendar();
  const perms = permsOf(event.id);
  const open = expansion.isOpen(group.id);
  const states = group.steps.map((s) => stepState(cal, event.eventDate, s, today));
  const done = states.filter((s) => s === 'done').length;
  const late = states.includes('overdue');
  const status = group.steps.length > 0 && done === group.steps.length ? { tone: 'emerald', text: 'Hoàn thành' } : late ? { tone: 'amber', text: 'Có việc chậm' } : { tone: 'blue', text: 'Đang thực hiện' };
  const bodyId = `group-body-${group.id}`;

  return (
    <div className="rounded-control border border-line bg-surface-2">
      <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => expansion.toggle(group.id)}
        className="flex min-h-touch w-full flex-wrap items-center gap-2 px-3 py-2 text-left">
        <Icon name="chevron-right" size={16} className={cn('shrink-0 text-ink-muted transition-transform', open && 'rotate-90 text-primary')} />
        <span className="min-w-0 flex-1 basis-48 text-sm font-semibold text-ink">{group.name}</span>
        {late && <Badge tone="amber">Chậm hạn</Badge>}
        {group.note && <Badge tone="purple">Có ghi chú</Badge>}
        <span className="text-xs tabular-nums text-ink-muted">{done}/{group.steps.length} hoàn thành</span>
        <span data-tone={status.tone} className={cn('size-2.5 rounded-full bg-(--tone-solid)', late && 'animate-pulse-soft')} aria-hidden="true" />
        <span className="sr-only">{status.text}</span>
      </button>
      {open && (
        <div id={bodyId} className="space-y-2 border-t border-line px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 basis-56 text-sm text-ink-2">Phụ trách nhóm: <strong>{group.leadPerson || 'Đội chuyên trách'}</strong></p>
            {perms.write && (
              <>
                {!group.note && <Button variant="ghost" icon="pencil" onClick={() => openNote(event.id, group.id)}>Thêm Ghi chú nhanh</Button>}
                <Button variant="secondary" icon="plus" onClick={() => openStep(event.id, group.id)}>Thêm bước việc</Button>
                <IconButton icon="pencil" label={`Sửa nhóm "${group.name}"`} onClick={() => openGroup(event.id, group.phase, group.id)} />
                <IconButton icon="trash" tone="rose" label={`Xóa nhóm "${group.name}"`} onClick={() => void deleteGroup(event, group)} />
              </>
            )}
          </div>
          {group.note && (
            <div data-tone="amber" className="flex items-start gap-2 rounded-control border border-(--tone-bd) bg-(--tone-bg) px-3 py-2 text-(--tone-fg)">
              <div className="min-w-0 flex-1 text-sm">
                <p className="text-xs font-bold uppercase">Ghi chú &amp; lưu ý đặc biệt của nhóm:</p>
                <p className="whitespace-pre-line">{group.note}</p>
              </div>
              {perms.write && (
                <>
                  <IconButton icon="pencil" label="Sửa ghi chú" onClick={() => openNote(event.id, group.id)} />
                  <IconButton icon="x" label="Xóa ghi chú" onClick={() => void clearNote(event, group)} />
                </>
              )}
            </div>
          )}
          {group.steps.length === 0 ? (
            <p className="py-2 text-sm text-ink-muted">Nhóm chưa có bước việc nào.</p>
          ) : (
            <ul className="space-y-2">
              {stepsByDeadline(cal, event.eventDate, group.steps).map((s) => <StepRow key={s.id} event={event} groupId={group.id} step={s} />)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function StepRow({ event, groupId, step }: { event: SceEvent; groupId: GroupId; step: Step }) {
  const { data, permsOf, today, toggleStep, setSubTask, openStep, openSubTasks, openLinks, deleteStep } = usePlan();
  const cal = useCalendar();
  const perms = permsOf(event.id);
  const deadline = deadlineOf(cal, event.eventDate, step);
  const state = stepState(cal, event.eventDate, step, today);
  const badge = stepStateBadge(state, calendarDaysBetween(today, deadline));
  const done = step.completedAt !== null;
  const href = step.templateKey ? templateLink(step.templateKey, event.id, data.templates) : null;
  const subDone = step.subTasks.filter((t) => t.completed).length;

  return (
    <li id={`step-${step.id}`} tabIndex={-1} data-tone={state === 'overdue' ? 'rose' : undefined}
      className={cn('flex flex-col gap-3 rounded-control border bg-surface p-3 md:flex-row', state === 'overdue' ? 'border-(--tone-bd) bg-(--tone-bg)' : 'border-line')}>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
          <Badge tone={badge.tone} pulse={badge.pulse}>{badge.text}</Badge>
          <Badge tone="slate">{offsetLabel(step)}</Badge>
          <span>Hạn: {formatVNDate(deadline, { weekday: true })}</span>
        </p>
        <h4 className={cn('text-sm font-semibold', done ? 'text-ink-muted line-through' : 'text-ink')}>{step.name}</h4>
        {step.requirement && <p className="rounded-control bg-surface-3 px-2.5 py-1.5 text-xs italic text-ink-2">“{step.requirement}”</p>}
        {step.subTasks.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-ink-muted">Việc nhỏ ({subDone}/{step.subTasks.length}):</p>
            <div className="grid gap-x-3 sm:grid-cols-2">
              {step.subTasks.map((t) => (
                <Checkbox key={t.id} name={`subtask-${t.id}`} checked={t.completed} strike label={t.name} disabled={!perms.write} onChange={(v) => void setSubTask(event.id, step.id, t.id, v)} />
              ))}
            </div>
          </div>
        )}
        {step.links.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {step.links.map((l) => (
              <li key={l.id}>
                <a href={l.url} target="_blank" rel="noopener noreferrer" title={l.url}
                  className="inline-flex max-w-56 items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs font-medium text-link hover:bg-surface-3">
                  <span className="truncate">{l.name}</span>
                  <Icon name="external-link" size={12} className="shrink-0" />
                </a>
              </li>
            ))}
          </ul>
        )}
        {step.templateKey && (
          href ? (
            <Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline">
              <Icon name="file-signature" size={14} /> Xem Biểu Mẫu: <code>{step.templateKey}</code>
            </Link>
          ) : (
            <p className="text-xs text-ink-muted">Biểu mẫu <code>{step.templateKey}</code>: Chưa gắn biểu mẫu</p>
          )
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-1 md:w-52">
        <div data-tone={done ? 'emerald' : 'slate'} className="rounded-control border border-(--tone-bd) bg-(--tone-bg) px-2">
          <Checkbox name={`step-${step.id}`} checked={done} disabled={!perms.write} label={done ? 'Đã Xong' : 'Chưa Xong'} onChange={(v) => void toggleStep(event.id, step, v)} />
        </div>
        <p className="text-xs text-ink-muted">Phụ trách: <span className="text-ink-2">{step.assignee || 'Chuyên viên'}</span></p>
        {done && step.completedBy && <p className="text-xs text-success-ink">Bởi: {step.completedBy}</p>}
        <div className="flex flex-wrap">
          <IconButton icon="check" label={`Quản lý việc nhỏ (${step.subTasks.length})`} onClick={() => openSubTasks(event.id, step.id)} />
          <IconButton icon="file-text" label={`Đính kèm links/tài liệu (${step.links.length})`} onClick={() => openLinks(event.id, step.id)} />
          {perms.write && <IconButton icon="pencil" label="Sửa bước việc" onClick={() => openStep(event.id, groupId, step.id)} />}
          {perms.write && <IconButton icon="trash" tone="rose" label="Xóa bước việc" onClick={() => void deleteStep(event, step)} />}
        </div>
      </div>
    </li>
  );
}
