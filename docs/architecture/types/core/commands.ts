// The one write path. Every mutation and every client-initiated query is a
// command: parse input -> gate -> permission -> run -> audit -> result.
// There is exactly one 'use server' file in the app (src/core/commands/dispatch.ts);
// eslint forbids 'use server' anywhere else, so a feature cannot grow a second
// write path that skips permission or audit.

import type { EventId } from './brand';
import type { RequestContext } from './auth';
import type { Schema } from './db';
import type { Permission, ScopedResource } from './permissions';
import type { FeatureKey } from './registry';

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
 * kind 'mutation' must return an audit entry; kind 'query' returns audit: null.
 * One interface (not a union) so run() gets contextual parameter types.
 */
export interface CommandSpec<I, O> {
  kind: 'mutation' | 'query';
  input: Schema<I>;
  authorize: Authorize<I>;
  run(ctx: CommandContext, input: I): Promise<CommandOutcome<O>>;
}
export type CommandOutcome<O> =
  | { value: O; audit: AuditEntry; inverse?: Inverse }
  | { value: O; audit: null };

/** Keys of the record must be the verbs of `${F}.${verb}` ids in CommandMap. */
export type CommandsOf<F extends string> = {
  [K in CommandId as K extends `${F}.${infer Verb}` ? Verb : never]: CommandSpec<InputOf<K>, OutputOf<K>>;
};
export function defineCommands<F extends FeatureKey>(feature: F, specs: NoInfer<CommandsOf<F>>): CommandsOf<F> {
  throw new Error('not implemented');
}

/** Thrown inside run() for business-rule failures; message is user-facing Vietnamese. */
export class CommandError extends Error {
  constructor(
    readonly kind: 'invalid' | 'conflict' | 'not_found' | 'forbidden',
    message: string,
    readonly fieldErrors?: Readonly<Record<string, string>>,
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

/** The single server action. */
export function dispatch<K extends CommandId>(id: K, input: InputOf<K>): Promise<CommandResult<OutputOf<K>>> {
  throw new Error('not implemented');
}

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
export function useCommand(): <K extends CommandId>(
  id: K,
  input: InputOf<K>,
  opts?: RunOptions,
) => Promise<OutputOf<K> | undefined> {
  throw new Error('not implemented');
}

/** Undo/redo stacks of Inverse, per tab session, cleared on sign-out (core §3.6 intended). */
export interface UndoApi {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  undo(): Promise<void>;
  redo(): Promise<void>;
}
export function useUndo(): UndoApi {
  throw new Error('not implemented');
}
