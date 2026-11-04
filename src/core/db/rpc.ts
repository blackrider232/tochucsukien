// The allowlist of SQL functions (RpcMap) with their argument and result
// mapping. A name missing here cannot be called, whatever the caller casts.

import type { RpcMap } from './index';

interface RpcSpec<K extends keyof RpcMap> {
  args(a: RpcMap[K]['args']): Record<string, unknown>;
  result(data: unknown): RpcMap[K]['result'];
}

const none = () => undefined;

export const RPC_ALLOWLIST: { readonly [K in keyof RpcMap]: RpcSpec<K> } = {
  sce_tcsk_write_audit: {
    args: (a) => ({ action: a.action, summary: a.summary, event_id: a.eventId, entity: a.entity, entity_id: a.entityId }),
    result: none,
  },
  sce_tcsk_create_backup: { args: (a) => ({ note: a.note, kind: a.kind }), result: (d) => ({ id: Number(d) }) },
  sce_tcsk_restore_backup: { args: (a) => ({ id: a.id }), result: none },
  sce_tcsk_set_profile_role: { args: (a) => ({ id: a.id, role: a.role }), result: none },
  sce_tcsk_set_profile_department: { args: (a) => ({ id: a.id, department: a.department }), result: none },
  sce_tcsk_set_profile_status: { args: (a) => ({ ids: a.ids, status: a.status }), result: (d) => Number(d) },
  sce_tcsk_ensure_profile: { args: () => ({}), result: none },
};
