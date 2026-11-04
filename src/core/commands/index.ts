// The one write path. Every mutation and every client-initiated query is a
// command: parse input -> gate -> permission -> run -> audit -> result.
// There is exactly one 'use server' file in the app (src/core/commands/dispatch.ts);
// eslint forbids 'use server' anywhere else, so a feature cannot grow a second
// write path that skips permission or audit.
// Feature server code imports this entry at runtime, and dispatch imports every
// feature through the registry, so nothing reachable from here may import
// dispatch, the registry or next/headers. eslint enforces it.

import type { EventId } from '@/core/brand';
import type { RequestContext } from '@/core/auth';
import type { Schema } from '@/core/db';
import type { Permission, ScopedResource } from '@/core/permissions';
import type { FeatureKey } from '@/core/registry';

/**
 * Augmented by each feature's commands file:
 *   declare module '@/core/commands' {
 *     interface CommandMap { 'guests.update': Sig<GuestUpdateInput, Guest> }
 *   }
 * Ids are '<featureKey>.<verb>'; check:contract asserts the prefix.
 */
export interface CommandMap {}
export interface Sig<I, O> {
  input: I;
  output: O;
}
export type CommandId = keyof CommandMap & string;
export type InputOf<K extends CommandId> = CommandMap[K]['input'];
export type OutputOf<K extends CommandId> = CommandMap[K]['output'];

/** A command the client may run later to reverse this one. Re-checked like any command. */
export type Inverse = { [K in CommandId]: { command: K; input: InputOf<K>; label: string } }[CommandId];

export interface AuditEntry {
  /** Upper-case Vietnamese verb phrase, e.g. 'CẬP NHẬT KHÁCH MỜI'. */
  action: string;
  /** Human summary, e.g. 'Cập nhật tiến độ: Hoàn thành bước "…" (…)'. */
  summary: string;
  eventId: EventId | null;
  entity: string | null;
  entityId: string | null;
}

export type Authorize<I> =
  | { perm: Permission; event: (input: I) => EventId }
  | { perm: Permission; global: true }
  /** For profile-scoped checks (users screen). */
  | { perm: Permission; resource: (ctx: CommandContext, input: I) => Promise<ScopedResource> };

export interface CommandContext extends RequestContext {
  /**
   * Ask the owner: run another feature's command in-process, through the same
   * pipeline (its own permission check and audit), as the same actor.
   */
  call<K extends CommandId>(id: K, input: InputOf<K>): Promise<OutputOf<K>>;
}

/**
 * kind 'mutation' must return an audit entry, or 'sql' when the SQL function it
 * called wrote the row itself (core's functions do), so a change logs one row;
 * kind 'query' returns audit: null.
 * One interface (not a union) so run() gets contextual parameter types.
 */
export interface CommandSpec<I, O> {
  kind: 'mutation' | 'query';
  input: Schema<I>;
  authorize: Authorize<I>;
  run(ctx: CommandContext, input: I): Promise<CommandOutcome<O>>;
}
export type CommandOutcome<O> =
  | { value: O; audit: AuditEntry | 'sql'; inverse?: Inverse }
  | { value: O; audit: null };

/** Keys of the record must be the verbs of `${F}.${verb}` ids in CommandMap. */
export type CommandsOf<F extends string> = {
  [K in CommandId as K extends `${F}.${infer Verb}` ? Verb : never]: CommandSpec<InputOf<K>, OutputOf<K>>;
};
export function defineCommands<F extends FeatureKey>(feature: F, specs: NoInfer<CommandsOf<F>>): CommandsOf<F> {
  for (const [verb, spec] of Object.entries(specs as Record<string, Partial<CommandSpec<unknown, unknown>>>)) {
    if (!spec || typeof spec.run !== 'function' || typeof spec.input?.parse !== 'function' || !spec.authorize || !spec.kind) {
      throw new Error(`${feature}.${verb}: a command needs kind, input, authorize and run`);
    }
  }
  return specs;
}

/**
 * Thrown inside run() for business-rule failures; message is user-facing Vietnamese.
 * `audit` records what a partial failure left changed (commands have no transaction): the pipeline
 * writes it under this command's authorize.perm before it returns the failure. Omit it when nothing stuck.
 */
export class CommandError extends Error {
  constructor(
    readonly kind: 'invalid' | 'conflict' | 'not_found' | 'forbidden',
    message: string,
    readonly fieldErrors?: Readonly<Record<string, string>>,
    readonly audit?: AuditEntry,
  ) {
    super(message);
  }
}

export type CommandFailure = {
  ok: false;
  kind: 'invalid' | 'conflict' | 'not_found' | 'forbidden' | 'constraint' | 'unavailable' | 'gate';
  /** Already Vietnamese and plain text. */
  message: string;
  fieldErrors?: Readonly<Record<string, string>>;
};
export type CommandResult<O> = { ok: true; value: O; inverse?: Inverse } | CommandFailure;

export interface RunOptions {
  /** Toast on success. Omit for silent (e.g. checkbox toggles that are visibly applied). */
  success?: string;
  /** Pushes result.inverse on the per-session undo stack (depth 30). Default true for mutations. */
  undoable?: boolean;
}
/**
 * Client hook. Calls dispatch, toasts failures (conflict -> "Dữ liệu đã được
 * người khác cập nhật. Đang tải lại…" + router.refresh()), pushes inverses,
 * refreshes the route on success. Returns the value or undefined on failure.
 */
export { useCommand, useUndo, clearUndo, CommandFeedbackProvider, type CommandFeedback } from './client';

/** Undo/redo stacks of Inverse, per tab session, cleared on sign-out (core §3.6 intended). */
export interface UndoApi {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  undo(): Promise<void>;
  redo(): Promise<void>;
}
