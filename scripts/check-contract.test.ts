import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { augmentationsIn, checkContract, collectSnapshot, type ContractSnapshot } from './check-contract';

let real: ContractSnapshot;
beforeAll(() => {
  real = collectSnapshot(join(import.meta.dirname, '..'));
});

type Mutable<T> = T extends ReadonlyArray<infer U> ? Mutable<U>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;
function broken(mutate: (s: Mutable<ContractSnapshot>) => void): string[] {
  const copy = structuredClone(real) as Mutable<ContractSnapshot>;
  mutate(copy);
  return checkContract(copy);
}
const manifest = (s: Mutable<ContractSnapshot>, key: string) => s.manifests.find((m) => m.key === key)!;

describe('check:contract on the repo', () => {
  it('passes', () => {
    expect(checkContract(real)).toEqual([]);
  });

  it('actually sees what it checks', () => {
    expect(real.featureDirs).toHaveLength(9);
    expect(real.pages).toContain('(app)');
    const keys = real.augmentations.flatMap((a) => a.keys);
    expect(keys).toEqual(expect.arrayContaining(['guests.applyRsvp', 'core.users.create', 'venue.halls.admin', 'live.checkIn']));
    expect(real.commandVerbs.core).toEqual(['users.create']);
    expect(real.migrations.map((m) => m.name)).toContain('0002_domain_tables.sql');
  });
});

describe('each rule fails when broken', () => {
  it('a feature directory missing from a registry, or a registry entry without a directory', () => {
    expect(broken((s) => s.registries.slots.splice(s.registries.slots.indexOf('live'), 1))).toEqual(['src/features/live is missing from the slots registry']);
    expect(broken((s) => s.featureDirs.push('extra'))).toEqual(
      expect.arrayContaining(['src/features/extra is missing from the manifests registry', 'src/features/extra/manifest.ts is missing']),
    );
    expect(broken((s) => s.registries.servers.push('ghost'))).toEqual(['servers registry lists "ghost" but src/features/ghost does not exist']);
    expect(broken((s) => (s.featureFiles.venue = s.featureFiles.venue!.filter((f) => f !== 'slots.tsx')))).toEqual(['src/features/venue/slots.tsx is missing']);
  });

  it('a page no manifest route covers', () => {
    expect(broken((s) => s.pages.push('(app)/admin/secret'))).toEqual(['app/(app)/admin/secret/page.tsx is not covered by any manifest route']);
  });

  it('a page two manifests cover equally', () => {
    const errors = broken((s) => {
      s.pages.push('(app)/events/[eventId]/live');
      manifest(s, 'reports').routes.push('(app)/events/[eventId]/live');
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        'app/(app)/events/[eventId]/live/page.tsx is covered by live ((app)/events/[eventId]/live) and reports ((app)/events/[eventId]/live)',
        'route (app)/events/[eventId]/live is declared by both live and reports',
      ]),
    );
  });

  it('nested route dirs resolve to the most specific owner, and foundation pages stay foundation-owned', () => {
    expect(broken((s) => s.pages.push('(app)/events', '(app)/events/[eventId]/guests/print', '(app)/go/[nav]', '(auth)/login', 'dev/kit'))).toEqual([]);
    expect(broken((s) => s.pages.push('(app)/dev/kit'))).toEqual(['app/(app)/dev/kit/page.tsx is not covered by any manifest route']);
    expect(broken((s) => {
      s.pages.splice(s.pages.indexOf('(app)/events/[eventId]'), 1);
      manifest(s, 'progress').routes.push('(app)/events/[eventId]');
    })).toEqual([]);
    expect(broken((s) => manifest(s, 'progress').routes.push('(app)/events/[eventId]'))).toEqual(['app/(app)/events/[eventId]/page.tsx is foundation-owned but progress declares it']);
  });

  it('a permission key outside its feature prefix', () => {
    expect(broken((s) => manifest(s, 'venue').permissions.push('guests.export'))).toEqual(['permission guests.export in the venue manifest must start with "venue."']);
    expect(broken((s) => manifest(s, 'guests').permissions.push('core.users.read'))).toEqual(
      expect.arrayContaining(['permission core.users.read is declared by both core and guests']),
    );
  });

  it('a command id or permission augmentation outside its feature prefix', () => {
    expect(broken((s) => s.augmentations.push({ feature: 'live', file: 'src/features/live/server/commands.ts', map: 'CommandMap', keys: ['venue.assignSeat2'] }))).toEqual([
      'CommandMap key venue.assignSeat2 in src/features/live/server/commands.ts must start with "live."',
    ]);
    expect(broken((s) => s.augmentations.push({ feature: 'reports', file: 'x.ts', map: 'PermissionMap', keys: ['live.extra'] }))).toEqual([
      'PermissionMap key live.extra in x.ts must start with "reports."',
    ]);
  });

  it('an implemented command that no CommandMap declares', () => {
    expect(broken((s) => s.commandVerbs.live!.push('teleport'))).toEqual(["command live.teleport is implemented but not declared in live's CommandMap"]);
  });

  it('a stale generated permission seed', () => {
    expect(broken((s) => (s.permissionsSql.onDisk = s.permissionsSql.onDisk.replace("('reports.issue', 'user', 'none'", "('reports.issue', 'user', 'department'")))).toEqual([
      'supabase/migrations/0004_permissions_seed.sql is stale: run pnpm tsx scripts/gen-permissions-sql.ts',
    ]);
  });

  it('a manifest table whose owner comment disagrees, or an owned table no manifest lists', () => {
    expect(broken((s) => manifest(s, 'guests').tables.push('sce_tcsk_checkins'))).toEqual(
      expect.arrayContaining(['table sce_tcsk_checkins is listed by both guests and live', 'table sce_tcsk_checkins is listed by guests but its comment says sce:owner=live']),
    );
    expect(broken((s) => manifest(s, 'reports').tables.push('sce_tcsk_ghosts'))).toEqual(['table sce_tcsk_ghosts (manifest reports) has no sce:owner comment in any migration']);
    expect(broken((s) => (manifest(s, 'live').tables = manifest(s, 'live').tables.filter((t) => t !== 'sce_tcsk_incidents')))).toEqual([
      'table sce_tcsk_incidents has sce:owner=live but no manifest lists it',
    ]);
  });

  it('a module migration that touches another owner’s table', () => {
    const errors = broken((s) =>
      s.migrations.push({ name: '202611041200_venue_seat_notes.sql', sql: 'alter table public.sce_tcsk_guests add column if not exists seat_note text;\nupdate public.sce_tcsk_seat_assignments set seat_code = seat_code;' }),
    );
    expect(errors).toEqual(['migration 202611041200_venue_seat_notes.sql (venue) touches sce_tcsk_guests, owned by guests']);
  });

  it('a module migration may change its own tables and add a registered table', () => {
    const sql = `create table if not exists public.sce_tcsk_booth_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.sce_tcsk_events(id) on delete cascade,
  url text not null,
  version integer not null default 1
);
select tcsk.register_table('public.sce_tcsk_booth_photos', 'venue', 'event', 'venue.booths.read', 'venue.booths.write');
alter table public.sce_tcsk_booths add column if not exists photo_count int not null default 0;`;
    expect(
      broken((s) => {
        s.migrations.push({ name: '202611041200_venue_booth_photos.sql', sql });
        manifest(s, 'venue').tables.push('sce_tcsk_booth_photos');
      }),
    ).toEqual([]);
  });

  it('a module migration that creates a table without register_table, or is misnamed', () => {
    expect(
      broken((s) => {
        s.migrations.push({ name: '202611041200_live_notes.sql', sql: "create table if not exists public.sce_tcsk_live_notes (id uuid primary key);\ncomment on table public.sce_tcsk_live_notes is 'sce:owner=live';" });
        manifest(s, 'live').tables.push('sce_tcsk_live_notes');
      }),
    ).toEqual(['migration 202611041200_live_notes.sql creates sce_tcsk_live_notes without calling tcsk.register_table']);
    expect(broken((s) => s.migrations.push({ name: 'add_stuff.sql', sql: '' }))).toEqual(['migration add_stuff.sql must be named <yyyymmddhhmm>_<feature>_<desc>.sql with a known feature']);
    expect(broken((s) => s.migrations.push({ name: '202611041200_nobody_x.sql', sql: '' }))).toEqual([
      'migration 202611041200_nobody_x.sql must be named <yyyymmddhhmm>_<feature>_<desc>.sql with a known feature',
    ]);
  });
});

describe('augmentationsIn', () => {
  it('reads multi-line command signatures', () => {
    const src = `declare module '@/core/commands' {
  interface CommandMap {
    'guests.applyRsvp': Sig<
      { eventId: EventId; id: GuestId },
      { applied: boolean }
    >;
    'guests.markInvited': Sig<{ ids: ReadonlyArray<GuestId> }, null>;
  }
}`;
    expect(augmentationsIn(src)).toEqual([{ map: 'CommandMap', keys: ['guests.applyRsvp', 'guests.markInvited'] }]);
  });
});
