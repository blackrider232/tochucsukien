import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EventId, GroupId, Instant, IsoDate, SafeUrl, StepId, Version } from '@/core/brand';
import { renderUi, withAppContext } from '@/components/ui/__tests__/helpers';
import type { EventPlan } from '../contract';
import { PlanView } from '../components/plan-view';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
const dispatch = vi.fn();
vi.mock('@/core/commands/dispatch', () => ({ dispatch: (...a: unknown[]) => dispatch(...a) }));

const XSS = '<img src=x onerror="window.__pwned=1">';
const E = 'e0000000-0000-4000-8000-000000000001' as EventId;
const G = 'b0000000-0000-4000-8000-000000000001' as GroupId;
const at = '2026-11-01T00:00:00.000Z' as Instant;

const plan: EventPlan = {
  event: {
    id: E, name: `${XSS} Hội nghị`, type: 'hoi_nghi', eventDate: '2026-12-15' as IsoDate, eventTime: '08:30' as EventPlan['event']['eventTime'],
    location: XSS, department: 'Phòng Xúc tiến đầu tư', supportingDepartments: [], leadPerson: XSS, budget: null, targetGuests: 150,
    status: 'preparing', note: `<script>window.__pwned=1</script>`, deletedAt: null, version: 1 as Version, createdAt: at, createdBy: null, updatedAt: at,
  },
  groups: [{
    id: G, eventId: E, phase: 'phase_prepare', name: `${XSS} Nhóm`, leadPerson: '', note: XSS, sort: 0, version: 1 as Version,
    steps: [{
      id: 'a0000000-0000-4000-8000-000000000001' as StepId, eventId: E, groupId: G, name: `${XSS} Bước`, requirement: XSS, offsetDays: 3,
      dayType: 'workday', targetPhase: 'before', completedAt: null, completedBy: null, assignee: XSS, templateKey: "x');alert(1);//",
      subTasks: [{ id: '1', name: XSS, completed: false }], links: [{ id: 'l', name: XSS, url: 'https://drive.google.com/x' as SafeUrl }], sort: 0, version: 1 as Version,
    }],
  }],
};

describe('plan rendering (m2 BUG-18, design: HTML injection)', () => {
  it('renders every user-entered field as text, never as markup', () => {
    renderUi(withAppContext(<PlanView data={{ plans: [plan], perms: { [E]: { write: true, edit: true, remove: true } }, today: '2026-11-04' as IsoDate, createDepartments: [] }} />));
    const card = screen.getByRole('article', { name: `${XSS} Hội nghị` });
    expect(card.querySelector('img, script')).toBeNull();
    expect(within(card).getByText(`${XSS} Bước`)).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: XSS })).toHaveAttribute('href', 'https://drive.google.com/x');
    expect(within(card).getByText("x');alert(1);//")).toBeInTheDocument();
    expect(card.querySelectorAll('[onerror], [onclick]')).toHaveLength(0);
    expect((window as { __pwned?: number }).__pwned).toBeUndefined();
  });
});
