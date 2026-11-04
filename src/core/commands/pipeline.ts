// The command pipeline: parse -> gate -> authorize -> run -> audit -> result.
// The audit row is written as the caller under the command's permission, so the
// database refuses a row the caller could not have earned.
// dispatch() feeds it the request context; tests feed it a memoryDb context.
// ctx.call() re-enters it, so a command that asks another owner gets that
// owner's permission check and audit too.

import { z } from 'zod';
import type { EventId, Instant, UserId, Version } from '@/core/brand';
import { gateFor, type Gate, type RequestContext } from '@/core/auth';
import { DbError, defineTable, type BaseRow, type DbErrorKind } from '@/core/db';
import { can, type ScopedResource } from '@/core/permissions';
import type { DepartmentName } from '@/core/vocab';
import { CommandError, type AuditEntry, type CommandContext, type CommandFailure, type CommandResult, type CommandSpec } from './index';

export type AnyCommandSpec = CommandSpec<unknown, unknown>;
export type CommandLookup = (id: string) => AnyCommandSpec | undefined;

const MAX_DEPTH = 8;

/** '<feature>.<verb>' -> that feature's spec. Own properties only, so 'core.constructor' finds nothing. */
export function commandLookup(servers: Readonly<Record<string, { commands: object }>>): CommandLookup {
  return (id) => {
    const dot = id.indexOf('.');
    if (dot <= 0) return undefined;
    const [feature, verb] = [id.slice(0, dot), id.slice(dot + 1)];
    if (!Object.hasOwn(servers, feature)) return undefined;
    const commands = servers[feature]!.commands as Record<string, AnyCommandSpec | undefined>;
    return Object.hasOwn(commands, verb) ? commands[verb] : undefined;
  };
}

export const MESSAGES = {
  unknownCommand: 'Chức năng này chưa sẵn sàng.',
  invalid: 'Dữ liệu nhập chưa hợp lệ. Vui lòng kiểm tra lại.',
  eventNotFound: 'Không tìm thấy sự kiện, hoặc bạn không có quyền truy cập sự kiện này.',
  internal: 'Đã xảy ra lỗi khi xử lý. Vui lòng thử lại.',
  db: {
    conflict: 'Dữ liệu đã được người khác cập nhật. Đang tải lại…',
    not_found: 'Không tìm thấy dữ liệu, hoặc bạn không có quyền xem.',
    forbidden: 'Bạn không có quyền thực hiện thao tác này.',
    constraint: 'Dữ liệu bị trùng hoặc không hợp lệ.',
    unavailable: 'Không kết nối được máy chủ. Vui lòng thử lại.',
  } satisfies Record<DbErrorKind, string>,
  constraints: {
    last_admin: 'Hệ thống phải còn ít nhất một quản trị viên đang hoạt động.',
    cannot_lock_self: 'Không thể tự khóa tài khoản của chính mình.',
    email_exists: 'Email này đã có tài khoản.',
  } as Readonly<Record<string, string>>,
  gate: {
    login: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    pending: 'Tài khoản đang chờ quản trị viên phê duyệt.',
    locked: 'Tài khoản đã bị khóa.',
    mfa_enroll: 'Cần thiết lập xác thực hai lớp (TOTP) trước khi tiếp tục.',
    mfa_challenge: 'Cần nhập mã xác thực hai lớp (TOTP) để tiếp tục.',
  } satisfies Record<Exclude<Gate['kind'], 'ok'>, string>,
};

interface EventScope extends BaseRow {
  id: EventId;
  department: DepartmentName;
  supportingDepartments: DepartmentName[];
}
/** Only what authorization needs; RLS still decides whether the actor sees the event at all. */
const eventScopeTable = defineTable<EventScope>({
  name: 'sce_tcsk_events',
  owner: 'progress',
  eventScoped: false,
  row: z.object({
    id: z.string().transform((v) => v as EventId),
    department: z.string().transform((v) => v as DepartmentName),
    supportingDepartments: z.array(z.string()).transform((v) => v as DepartmentName[]),
    version: z.number().transform((v) => v as Version),
    createdAt: z.string().transform((v) => v as Instant),
    createdBy: z.string().nullable().transform((v) => v as UserId | null),
    updatedAt: z.string().transform((v) => v as Instant),
    updatedBy: z.string().nullable().transform((v) => v as UserId | null),
  }),
});

/** A nested ctx.call failed: unwind to the outermost command and return its failure unchanged. */
class NestedFailure extends Error {
  constructor(readonly failure: CommandFailure) {
    super(failure.message);
  }
}

const failure = (kind: CommandFailure['kind'], message: string, fieldErrors?: Readonly<Record<string, string>>): CommandFailure =>
  fieldErrors ? { ok: false, kind, message, fieldErrors } : { ok: false, kind, message };

function parseInput(spec: AnyCommandSpec, raw: unknown): { ok: true; value: unknown } | CommandFailure {
  try {
    return { ok: true, value: spec.input.parse(raw) };
  } catch (e) {
    const issues = (e as { issues?: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }> }).issues;
    if (!issues) throw e;
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) fieldErrors[issue.path.map(String).join('.') || '_'] ??= issue.message;
    return failure('invalid', MESSAGES.invalid, fieldErrors);
  }
}

async function authorize(ctx: CommandContext, spec: AnyCommandSpec, input: unknown): Promise<CommandFailure | null> {
  const rule = spec.authorize;
  let resource: ScopedResource | undefined;
  if ('event' in rule) {
    const event = await ctx.db.table(eventScopeTable).get(rule.event(input));
    if (!event) return failure('not_found', MESSAGES.eventNotFound);
    resource = { departments: [event.department, ...event.supportingDepartments] };
  } else if ('resource' in rule) {
    resource = await rule.resource(ctx, input);
  }
  return can(ctx.actor, rule.perm, resource) ? null : failure('forbidden', MESSAGES.db.forbidden);
}

/** The partial-failure row of a CommandError. Its change already stuck, so a refused row is logged, never thrown. */
async function auditPartialFailure(ctx: RequestContext, id: string, spec: AnyCommandSpec, entry: AuditEntry): Promise<void> {
  try {
    await ctx.db.rpc('sce_tcsk_audit_command', { ...entry, perm: spec.authorize.perm });
  } catch (e) {
    console.error(`command ${id}: partial-failure audit row not written`, entry, e);
  }
}

function failureFromError(e: unknown, id: string): CommandFailure {
  if (e instanceof NestedFailure) return e.failure;
  if (e instanceof CommandError) return failure(e.kind, e.message, e.fieldErrors);
  if (e instanceof DbError) {
    const named = e.detail?.constraint ? MESSAGES.constraints[e.detail.constraint] : undefined;
    return failure(e.kind, named ?? MESSAGES.db[e.kind]);
  }
  console.error(`command ${id} failed`, e);
  return failure('unavailable', MESSAGES.internal);
}

export async function runCommand(ctx: RequestContext, lookup: CommandLookup, id: string, rawInput: unknown, depth = 0): Promise<CommandResult<unknown>> {
  const spec = lookup(id);
  if (!spec) return failure('unavailable', MESSAGES.unknownCommand);

  const { actor } = ctx;
  const gate = gateFor({ hasSession: true, profile: actor.profile, aal: actor.aal, hasVerifiedTotp: actor.hasVerifiedTotp });
  if (gate.kind !== 'ok') return failure('gate', MESSAGES.gate[gate.kind]);

  const parsed = parseInput(spec, rawInput);
  if (!parsed.ok) return parsed;

  const cmdCtx: CommandContext = {
    ...ctx,
    async call(nextId, nextInput) {
      if (depth + 1 > MAX_DEPTH) throw new Error(`command nesting deeper than ${MAX_DEPTH} at ${String(nextId)}`);
      const result = await runCommand(ctx, lookup, nextId, nextInput, depth + 1);
      if (!result.ok) throw new NestedFailure(result);
      return result.value as never;
    },
  };

  let ran = false;
  try {
    const denied = await authorize(cmdCtx, spec, parsed.value);
    if (denied) return denied;
    ran = true;
    const outcome = await spec.run(cmdCtx, parsed.value);
    if (outcome.audit && outcome.audit !== 'sql') {
      await ctx.db.rpc('sce_tcsk_audit_command', { ...outcome.audit, perm: spec.authorize.perm });
    } else if (!outcome.audit && spec.kind === 'mutation') {
      throw new Error(`mutation ${id} returned no audit entry`);
    }
    return 'inverse' in outcome && outcome.inverse ? { ok: true, value: outcome.value, inverse: outcome.inverse } : { ok: true, value: outcome.value };
  } catch (e) {
    if (ran && e instanceof CommandError && e.audit) await auditPartialFailure(ctx, id, spec, e.audit);
    return failureFromError(e, id);
  }
}
