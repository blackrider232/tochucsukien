import { Fragment, type ComponentType, type ReactNode } from 'react';
import { requestContext, type RequestContext } from '@/core/auth';
import type { EventId } from '@/core/brand';
import { can, type Permission } from '@/core/permissions';
import type { Holiday } from '@/core/dates';
import { registry, type FeatureSlots } from '@/core/registry';
import { ROLES } from '@/core/vocab';
import { featureSlots } from '@/features/registry';
import type { ShellSlots } from './app-shell';
import { buildShellModel, visibleActions } from './build-shell';
import type { ShellModel } from './nav-model';

/** Server-only. Everything the (app) layout hands to the client shell, derived from the registry. */
export async function loadShell(): Promise<{
  ctx: RequestContext;
  model: ShellModel;
  slots: ShellSlots;
  holidays: ReadonlyArray<Holiday>;
}> {
  const ctx = await requestContext();
  const allowed = (p: Permission) => can(ctx.actor, p);
  const { profile } = ctx.actor;

  const model = buildShellModel({
    main: registry.navFor('main'),
    admin: registry.navFor('admin'),
    subTabsOf: (id) => registry.subTabsOf(id),
    allowed,
    brand: { title: `SỰ KIỆN ${ctx.settings.agencyShortName}`, subtitle: ctx.settings.agencyName },
    user: { name: profile.fullname, roleLabel: ROLES[profile.role].short, department: profile.department },
  });

  const ownerOf = (navId: string) => registry.manifests.find((m) => m.nav.some((n) => n.id === navId))?.key;
  const navBadges: Record<string, ReactNode> = {};
  const topBarBadges: Record<string, ReactNode> = {};
  const headerActions: Array<{ id: string; order: number; permission: Permission; node: ReactNode }> = [];

  for (const { key, slots } of featureSlots) {
    for (const [navId, Badge] of Object.entries(slots.navBadges ?? {})) {
      if (ownerOf(navId) === key) navBadges[navId] = <Badge eventId={null} />;
    }
    const TopBadge = slots.topBarBadge;
    if (TopBadge) {
      for (const n of registry.manifests.find((m) => m.key === key)?.nav ?? []) topBarBadges[n.id] = <TopBadge eventId={null} />;
    }
    for (const a of slots.headerActions ?? []) {
      const Render = a.render as ComponentType<Record<string, never>>;
      headerActions.push({ id: `${key}:${a.id}`, order: a.order, permission: a.permission, node: <Fragment key={`${key}:${a.id}`}><Render /></Fragment> });
    }
  }

  const slotsOut: ShellSlots = {
    navBadges,
    topBarBadges,
    headerActions: visibleActions(headerActions, allowed).map((a) => a.node),
  };

  // Holidays reach the client through core's AppContext once it ships; until then date fields show no holiday hint.
  return { ctx, model, slots: slotsOut, holidays: [] };
}

type EventAction = NonNullable<FeatureSlots['eventActions']>[number];

/** For the event layout: the features' eventActions the actor may use, rendered for one event. */
export function renderEventActions(ctx: RequestContext, eventId: EventId): ReactNode[] {
  const allowed = (p: Permission) => can(ctx.actor, p);
  const actions = featureSlots.flatMap(({ key, slots }) => (slots.eventActions ?? []).map((a) => ({ ...a, id: `${key}:${a.id}` })));
  return visibleActions<EventAction>(actions, allowed).map((a) => {
    const Render = a.render as ComponentType<{ eventId: EventId }>;
    return <Render key={a.id} eventId={eventId} />;
  });
}

/** For /admin/settings: the features' settings sections the actor may use. */
export function renderSettingsSections(ctx: RequestContext): ReactNode[] {
  const allowed = (p: Permission) => can(ctx.actor, p);
  const sections = featureSlots.flatMap(({ key, slots }) => (slots.settingsSections ?? []).map((s) => ({ ...s, id: `${key}:${s.id}` })));
  return visibleActions(sections, allowed).map((s) => {
    const Render = s.render as ComponentType<Record<string, never>>;
    return <Fragment key={s.id}><Render /></Fragment>;
  });
}
