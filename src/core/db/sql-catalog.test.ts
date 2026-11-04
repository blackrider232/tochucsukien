import { describe, expect, it } from 'vitest';
import { parseCatalog } from './sql-catalog';

describe('parseCatalog foreign keys', () => {
  const sql = `
create table if not exists public.sce_tcsk_parents (id uuid primary key, event_id uuid not null, unique (event_id, id));
create table if not exists public.sce_tcsk_kids (
  id uuid primary key,
  event_id uuid not null references public.sce_tcsk_events(id) on delete cascade deferrable initially immediate,
  parent_id uuid,
  pick_id uuid references public.sce_tcsk_parents(id) on delete set null deferrable initially immediate,
  department text not null references public.sce_tcsk_departments(name) on update cascade,
  owner_id uuid references auth.users(id) on delete cascade,
  foreign key (event_id, parent_id) references public.sce_tcsk_parents(event_id, id) on delete cascade deferrable initially immediate
);
do $$ begin
  alter table public.sce_tcsk_kids add constraint sce_tcsk_kids_pin_fk
    foreign key (parent_id) references public.sce_tcsk_parents(id) on delete restrict;
end $$;`;

  it('reads inline, table and added constraints with their delete action, and skips other schemas', () => {
    const kids = parseCatalog([{ name: '1_x.sql', sql }]).get('sce_tcsk_kids')!;
    expect(kids.foreignKeys).toEqual([
      { name: 'sce_tcsk_kids_event_id_fkey', columns: ['event_id'], table: 'sce_tcsk_events', refColumns: ['id'], onDelete: 'cascade' },
      { name: 'sce_tcsk_kids_pick_id_fkey', columns: ['pick_id'], table: 'sce_tcsk_parents', refColumns: ['id'], onDelete: 'set null' },
      { name: 'sce_tcsk_kids_department_fkey', columns: ['department'], table: 'sce_tcsk_departments', refColumns: ['name'], onDelete: 'no action' },
      { name: 'sce_tcsk_kids_event_id_parent_id_fkey', columns: ['event_id', 'parent_id'], table: 'sce_tcsk_parents', refColumns: ['event_id', 'id'], onDelete: 'cascade' },
      { name: 'sce_tcsk_kids_pin_fk', columns: ['parent_id'], table: 'sce_tcsk_parents', refColumns: ['id'], onDelete: 'restrict' },
    ]);
  });
});
