import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { IsoDate } from '@/core/brand';
import { renderUi, testAppContext, withAppContext } from '@/components/ui/__tests__/helpers';
import { testActor, PTDN } from '@/core/testing/actors';
import { CHAIR_DEPARTMENTS } from '../domain/schemas';
import { EventForm } from '../components/event-form';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/core/commands/dispatch', () => ({ dispatch: vi.fn() }));

const form = (profile: ReturnType<typeof testActor>['profile']) =>
  renderUi(withAppContext(<EventForm departments={CHAIR_DEPARTMENTS} today={'2026-11-04' as IsoDate} onDone={vi.fn()} onCancel={vi.fn()} />, { ...testAppContext(), profile }));

describe('event wizard default department (m2 §1.7, review finding 4)', () => {
  it('is Phòng Xúc tiến đầu tư for an actor with no department, such as an admin', () => {
    form(testActor('admin', null).profile);
    expect(screen.getByRole('combobox', { name: /Phòng ban chủ trì/ })).toHaveValue('Phòng Xúc tiến đầu tư');
  });

  it("is the actor's own department when they have one", () => {
    form(testActor('user', PTDN).profile);
    expect(screen.getByRole('combobox', { name: /Phòng ban chủ trì/ })).toHaveValue(PTDN);
  });
});
