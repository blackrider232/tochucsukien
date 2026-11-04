// Imports legacy appData.events (or appData.programs when events is empty)
// into sce_tcsk_events, sce_tcsk_task_groups and sce_tcsk_steps. Pure and
// deterministic: every id is a uuid v5 of the legacy coordinates, scoped by
// event, because legacy group and template step ids repeat across events (m2 BUG-01).

import { combineVN, parseHHmm, parseInstant, parseIsoDate, todayVN } from '@/core/dates';
import { isDemoLegacyEvent, type ImportIssue, type LegacyImporter } from '@/core/legacy';
import { parseSafeUrl, parseVnd } from '@/core/text';
import { isDepartmentName, type DepartmentName } from '@/core/vocab';
import { CHAIR_DEPARTMENTS, DAY_TYPES, GROUP_PHASES, MAX_GUESTS, MAX_OFFSET_DAYS, STEP_PHASES } from '../domain/schemas';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const oneOf = <T extends string>(values: ReadonlyArray<T>, v: unknown): T | null => (values.includes(v as T) ? (v as T) : null);
const TEMPLATE_KEY = /^[A-Za-z0-9_-]*$/;
const DEFAULT_DEPARTMENT: DepartmentName = 'Phòng Xúc tiến đầu tư';
const DEFAULT_GUESTS = 150;

/** Repeated keys get '#2', '#3' so every row keeps its own deterministic id. */
function uniqueKeys() {
  const seen = new Map<string, number>();
  return (key: string) => {
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n === 1 ? key : `${key}#${n}`;
  };
}

export const legacyImporter: LegacyImporter = {
  feature: 'progress',
  dependsOn: ['core'],
  plan(blob, ctx) {
    const issues: ImportIssue[] = [];
    const events = Array.isArray(blob.events) && blob.events.length > 0 ? blob.events : blob.programs;
    const blobKey = events === blob.events ? 'events' : 'programs';
    if (!Array.isArray(events)) return { batches: [], issues };

    const eventRows: Obj[] = [];
    const groupRows: Obj[] = [];
    const stepRows: Obj[] = [];
    const eventKey = uniqueKeys();
    const issue = (severity: ImportIssue['severity'], legacyId: string | null, message: string) => issues.push({ severity, blobKey, legacyId, message });

    events.forEach((raw: unknown, ei: number) => {
      if (!isObj(raw)) return issue('dropped_invalid', null, `Mục thứ ${ei + 1} không phải một sự kiện.`);
      const rawId = str(raw.id) || `index-${ei + 1}`;
      const name = str(raw.name);
      if (!ctx.includeDemo && isDemoLegacyEvent(raw)) return issue('skipped_demo', rawId, `Sự kiện mẫu "${name}" không được nhập.`);

      const legacyId = eventKey(rawId);
      if (legacyId !== rawId) issue('coerced', rawId, `Mã sự kiện "${rawId}" bị trùng (lỗi tạo mã cũ); sự kiện "${name}" nhận mã ${legacyId}. Dữ liệu khác gắn với mã cũ thuộc về sự kiện đầu tiên.`);
      const eventId = ctx.ids.eventId(legacyId);
      const createdAt = parseInstant(raw.created_at);

      let eventDate = parseIsoDate(raw.eventDate) ?? parseIsoDate(raw.date);
      if (!eventDate && createdAt) {
        eventDate = todayVN(createdAt);
        issue('coerced', legacyId, `Sự kiện "${name}" không có ngày tổ chức; tạm lấy ngày tạo ${eventDate}.`);
      }
      if (!eventDate) return issue('dropped_invalid', legacyId, `Sự kiện "${name}" không có ngày tổ chức hợp lệ.`);

      const department = isDepartmentName(raw.department) && CHAIR_DEPARTMENTS.includes(raw.department) ? raw.department : DEFAULT_DEPARTMENT;
      if (department !== raw.department) issue('coerced', legacyId, `Phòng chủ trì "${str(raw.department)}" không hợp lệ; gán ${DEFAULT_DEPARTMENT}.`);
      const budgetText = str(raw.budget);
      const budget = budgetText ? parseVnd(budgetText) : null;
      if (budgetText && budget === null) issue('coerced', legacyId, `Kinh phí "${budgetText}" không đọc được; để trống.`);
      const guestsText = str(raw.targetGuests ?? raw.expectedDelegates);
      const guests = Number(guestsText);
      const guestsOk = Number.isInteger(guests) && guests >= 1 && guests <= MAX_GUESTS;
      if (guestsText && !guestsOk) issue('coerced', legacyId, `Số khách dự kiến ${guestsText} của "${name}" ngoài khoảng 1 đến ${MAX_GUESTS}; đặt ${DEFAULT_GUESTS}.`);

      eventRows.push({
        id: eventId,
        legacy_id: legacyId,
        name: name || 'Sự Kiện SCE',
        type: raw.type === 'hoi_cho' ? 'hoi_cho' : 'hoi_nghi',
        event_date: eventDate,
        event_time: parseHHmm(raw.eventTime) ?? '08:30',
        location: str(raw.location),
        department,
        // Legacy events were visible to everyone; every other department supports them (design: tradeoffs).
        supporting_departments: CHAIR_DEPARTMENTS.filter((d) => d !== department),
        lead_person: str(raw.leadPerson),
        budget_vnd: budget,
        target_guests: guestsOk ? guests : DEFAULT_GUESTS,
        note: str(raw.note),
        ...(createdAt ? { created_at: createdAt } : {}),
      });

      const groupKey = uniqueKeys();
      (Array.isArray(raw.groups) ? raw.groups : []).forEach((g: unknown, gi: number) => {
        if (!isObj(g)) return issue('dropped_invalid', legacyId, `Nhóm việc thứ ${gi + 1} của "${name}" không hợp lệ.`);
        const gKey = groupKey(str(g.id) || `index-${gi + 1}`);
        const groupId = ctx.ids.idFor('TaskGroup', gKey, legacyId);
        const phase = oneOf(GROUP_PHASES, g.phase) ?? 'phase_prepare';
        if (phase !== g.phase) issue('coerced', gKey, `Nhóm "${str(g.name)}" có giai đoạn "${str(g.phase)}" (không hiển thị ở ứng dụng cũ); đưa vào Giai đoạn I.`);
        groupRows.push({ id: groupId, event_id: eventId, legacy_id: gKey, phase, name: str(g.name) || `Nhóm ${gi + 1}`, lead_person: str(g.leadPerson), note: str(g.note), sort: gi });

        const stepKey = uniqueKeys();
        (Array.isArray(g.steps) ? g.steps : []).forEach((s: unknown, si: number) => {
          if (!isObj(s)) return issue('dropped_invalid', gKey, `Bước thứ ${si + 1} của nhóm "${str(g.name)}" không hợp lệ.`);
          const sKey = stepKey(`${gKey}|${str(s.id) || `index-${si + 1}`}`);
          const stepScope = `${legacyId}|${sKey}`;
          const offset = Number(s.offsetDays);
          if (offset > MAX_OFFSET_DAYS && oneOf(STEP_PHASES, s.targetPhase) !== 'dday') issue('coerced', sKey, `Bước "${str(s.name)}" có số ngày lệch ${offset} vượt ${MAX_OFFSET_DAYS}; đã giảm còn ${MAX_OFFSET_DAYS}.`);
          const phaseOf = oneOf(STEP_PHASES, s.targetPhase) ?? 'before';
          const templateKey = str(s.templateKey);
          if (!TEMPLATE_KEY.test(templateKey)) issue('coerced', sKey, `Mã biểu mẫu "${templateKey}" chứa ký tự không hợp lệ; đã bỏ.`);

          const done = s.completed === true;
          let completedAt = done ? parseInstant(s.completedAt) : null;
          if (done && !completedAt) {
            completedAt = parseInstant(raw.updated_at) ?? createdAt ?? combineVN(eventDate, parseHHmm('00:00')!);
            issue('coerced', sKey, `Bước "${str(s.name)}" đã hoàn thành nhưng thiếu thời điểm; lấy ${completedAt}.`);
          }

          const subKey = uniqueKeys();
          const subTasks = (Array.isArray(s.subTasks) ? s.subTasks : []).flatMap((t: unknown, ti: number) =>
            isObj(t) && str(t.name) ? [{ id: subKey(str(t.id) || String(ti + 1)), name: str(t.name), completed: t.completed === true }] : [],
          );
          const links = (Array.isArray(s.links) ? s.links : []).flatMap((l: unknown, li: number) => {
            const url = isObj(l) ? parseSafeUrl(l.url) : null;
            if (!isObj(l) || !url) {
              issue('dropped_invalid', sKey, `Liên kết "${isObj(l) ? str(l.url) : ''}" không phải http(s); đã bỏ.`);
              return [];
            }
            return [{ id: ctx.ids.idFor('StepLink', String(li), stepScope), name: str(l.name) || url, url }];
          });

          stepRows.push({
            id: ctx.ids.idFor('Step', sKey, legacyId),
            event_id: eventId,
            group_id: groupId,
            legacy_id: sKey,
            name: str(s.name) || `Bước ${si + 1}`,
            requirement: str(s.requirement),
            offset_days: phaseOf === 'dday' ? 0 : Number.isInteger(offset) && offset >= 0 ? Math.min(offset, MAX_OFFSET_DAYS) : 0,
            day_type: oneOf(DAY_TYPES, s.dayType) ?? 'workday',
            target_phase: phaseOf,
            completed_at: completedAt,
            completed_by: done ? str(s.completedBy) || null : null,
            assignee: str(s.assignee),
            template_key: TEMPLATE_KEY.test(templateKey) ? templateKey : '',
            sub_tasks: subTasks,
            links,
            sort: si,
          });
        });
      });
    });

    return {
      batches: [
        { table: 'sce_tcsk_events', rows: eventRows },
        { table: 'sce_tcsk_task_groups', rows: groupRows },
        { table: 'sce_tcsk_steps', rows: stepRows },
      ],
      issues,
    };
  },
};
