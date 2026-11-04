// The incident log (m5 §3.4, BUG-27, BUG-28). The code is a per-event
// sequence: the next number above the highest, and the unique (event, seq)
// key turns two desks reporting at once into a retry, never a duplicate.

import { z } from 'zod';
import type { EventId, IncidentId } from '@/core/brand';
import { CommandError, type CommandContext } from '@/core/commands';
import { DbError } from '@/core/db';
import { DEFAULT_RESOLUTION_NOTE, INCIDENT_STATUS, INCIDENT_TRANSITIONS, URGENCY, incidentCode, nextIncidentSeq } from '../domain/incidents';
import { INCIDENT_STATUS_VALUES, eventIdSchema, incidentFields, incidentIdSchema, resolutionNoteSchema, versionSchema, type IncidentDraft } from '../domain/schemas';
import { asSchema, audit, clip, inverse, manage, type Spec } from './command-kit';
import { toIncident } from './reads';
import { incidentsTable, type IncidentRow } from './tables';

const MAX_SEQ_ATTEMPTS = 5;

async function incidentOf(ctx: CommandContext, eventId: EventId, id: IncidentId): Promise<IncidentRow> {
  const row = await ctx.db.table(incidentsTable).get(id);
  if (!row || row.eventId !== eventId) throw new DbError('not_found');
  return row;
}
const draftOf = ({ location, urgency, description, assignee }: IncidentRow): IncidentDraft => ({ location, urgency, description, assignee });

/** A retry of the same report (same client id) returns the row it made; a seq taken meanwhile is recomputed. */
async function insertIncident(ctx: CommandContext, eventId: EventId, id: IncidentId, draft: IncidentDraft): Promise<IncidentRow> {
  const table = ctx.db.table(incidentsTable);
  const earlier = await table.get(id);
  if (earlier) {
    if (earlier.eventId !== eventId) throw new DbError('not_found');
    return earlier;
  }
  for (let attempt = 1; ; attempt++) {
    const seq = nextIncidentSeq(await table.list({ eventId }));
    try {
      return await table.insert({ id, eventId, legacyId: null, seq, ...draft, status: 'open', reportedAt: ctx.now, resolvedAt: null, resolutionNote: '' });
    } catch (e) {
      if (attempt >= MAX_SEQ_ATTEMPTS || !(e instanceof DbError) || e.kind !== 'constraint') throw e;
    }
  }
}

export const createIncident: Spec<'live.createIncident'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, id: incidentIdSchema, draft: incidentFields })),
  authorize: manage,
  async run(ctx, { eventId, id, draft }) {
    const row = await insertIncident(ctx, eventId, id, draft);
    const code = incidentCode(row.seq);
    return {
      value: toIncident(row),
      audit: audit('BÁO SỰ CỐ', `Báo sự cố ${code} (${URGENCY[row.urgency].short}) tại ${row.location}: ${clip(row.description)}`, eventId, 'incident', id),
      inverse: inverse('live.deleteIncident', { eventId, id, version: row.version }, `Báo sự cố ${code}`),
    };
  },
};

export const updateIncident: Spec<'live.updateIncident'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, id: incidentIdSchema, version: versionSchema, draft: incidentFields })),
  authorize: manage,
  async run(ctx, { eventId, id, version, draft }) {
    const before = await incidentOf(ctx, eventId, id);
    const after = await ctx.db.table(incidentsTable).update(id, draft, { expectedVersion: version });
    const code = incidentCode(after.seq);
    return {
      value: toIncident(after),
      audit: audit('SỬA SỰ CỐ', `Sửa sự cố ${code}: ${URGENCY[after.urgency].short}, ${after.location}: ${clip(after.description)}`, eventId, 'incident', id),
      inverse: inverse('live.updateIncident', { eventId, id, version: after.version, draft: draftOf(before) }, `Sửa sự cố ${code}`),
    };
  },
};

/** Open, in progress, resolved (with a note), and reopen; any other change is refused. */
export const setIncidentStatus: Spec<'live.setIncidentStatus'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, id: incidentIdSchema, version: versionSchema, status: z.enum(INCIDENT_STATUS_VALUES), note: resolutionNoteSchema })),
  authorize: manage,
  async run(ctx, { eventId, id, version, status, note }) {
    const before = await incidentOf(ctx, eventId, id);
    const code = incidentCode(before.seq);
    if (!INCIDENT_TRANSITIONS[before.status].includes(status)) {
      throw new CommandError('conflict', `Sự cố ${code} đang ở trạng thái "${INCIDENT_STATUS[before.status].label}", không chuyển sang "${INCIDENT_STATUS[status].label}" được. Đang tải lại…`);
    }
    const patch = status === 'resolved'
      ? { status, resolvedAt: ctx.now, resolutionNote: note || DEFAULT_RESOLUTION_NOTE }
      : { status, resolvedAt: null, resolutionNote: before.status === 'resolved' ? '' : before.resolutionNote };
    const after = await ctx.db.table(incidentsTable).update(id, patch, { expectedVersion: version });
    const summary = status === 'resolved'
      ? `Sự cố ${code} đã khắc phục: ${clip(after.resolutionNote)}`
      : `Sự cố ${code}: ${INCIDENT_STATUS[before.status].label} → ${INCIDENT_STATUS[status].label}`;
    return {
      value: toIncident(after),
      audit: audit(status === 'resolved' ? 'XỬ LÝ SỰ CỐ' : 'CẬP NHẬT SỰ CỐ', summary, eventId, 'incident', id),
      inverse: inverse('live.setIncidentStatus', { eventId, id, version: after.version, status: before.status, note: before.resolutionNote }, `Trạng thái sự cố ${code}`),
    };
  },
};

/** Only as the undo of a report nobody has acted on yet: an incident someone worked on stays in the log. */
export const deleteIncident: Spec<'live.deleteIncident'> = {
  kind: 'mutation',
  input: asSchema(z.object({ eventId: eventIdSchema, id: incidentIdSchema, version: versionSchema })),
  authorize: manage,
  async run(ctx, { eventId, id, version }) {
    const row = await incidentOf(ctx, eventId, id);
    const code = incidentCode(row.seq);
    if (row.status !== 'open' || row.version !== version) {
      throw new CommandError('conflict', `Sự cố ${code} đã được cập nhật sau khi báo, nên giữ lại trong sổ. Đang tải lại…`);
    }
    await ctx.db.table(incidentsTable).remove(id, { expectedVersion: version });
    return { value: null, audit: audit('HỦY BÁO SỰ CỐ', `Hủy báo sự cố ${code} tại ${row.location}: ${clip(row.description)}`, eventId, 'incident', id) };
  },
};
