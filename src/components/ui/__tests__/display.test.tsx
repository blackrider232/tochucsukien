import { screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EnumRegistry } from '@/core/vocab';
import { Badge, StatusBadge } from '../badge';
import { Icon } from '../icons';
import { KpiCard } from '../kpi-card';
import { ProgressBar, progressPercent } from '../progress-bar';
import { LinkTabs, Tabs } from '../tabs';
import { renderUi } from './helpers';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const RSVP = {
  pending: { label: 'Chờ phản hồi', short: 'Chờ', tone: 'amber' },
  confirmed: { label: 'Xác nhận tham dự', short: 'Tham dự', tone: 'emerald' },
} as const satisfies EnumRegistry<'pending' | 'confirmed'>;

describe('tabs', () => {
  const items = [{ id: 'a', label: 'Tất cả', count: 5 }, { id: 'b', label: 'Đã mời' }, { id: 'c', label: 'Từ chối' }];

  it('Tabs follows the tablist pattern with roving focus and arrow keys', async () => {
    function Harness() {
      const [value, setValue] = useState('a');
      return <Tabs items={items} value={value} onChange={setValue} />;
    }
    const { user } = renderUi(<Harness />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('tabindex', '0');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');
    tabs[0]!.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tab')[1]).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getAllByRole('tab')[2]).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getAllByRole('tab')[0]).toHaveFocus();
  });

  it('LinkTabs marks the current page and exposes the count to screen readers', () => {
    renderUi(<LinkTabs items={items.map((i) => ({ ...i, href: `/x/${i.id}` }))} activeId="b" variant="underline" />);
    expect(screen.getByRole('link', { name: 'Đã mời' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Tất cả, 5 mục' })).not.toHaveAttribute('aria-current');
  });
});

describe('badges and progress', () => {
  it('StatusBadge reads label and tone from the registry; unknown values stay readable', () => {
    renderUi(<><StatusBadge registry={RSVP} value="confirmed" /><StatusBadge registry={RSVP} value="pending" size="sm" /><StatusBadge registry={RSVP} value={'legacy' as 'pending'} /></>);
    expect(screen.getByText('Xác nhận tham dự').closest('[data-tone]')).toHaveAttribute('data-tone', 'emerald');
    expect(screen.getByText('Chờ')).toBeInTheDocument();
    expect(screen.getByText('legacy').closest('[data-tone]')).toHaveAttribute('data-tone', 'slate');
  });

  it('Badge shows its text, so meaning never depends on colour', () => {
    renderUi(<Badge tone="rose" icon="alert-triangle">Quá hạn</Badge>);
    expect(screen.getByText('Quá hạn')).toBeInTheDocument();
  });

  it('ProgressBar clamps to 0..100, defaults to emerald at 100%, and is labelled', () => {
    expect(progressPercent(5, 0)).toBe(0);
    expect(progressPercent(-3, 10)).toBe(0);
    expect(progressPercent(15, 10)).toBe(100);
    expect(progressPercent(1, 3)).toBe(33);
    const { container } = renderUi(<ProgressBar value={10} max={10} label="Tiến độ chung" />);
    const bar = screen.getByRole('progressbar', { name: 'Tiến độ chung' });
    expect(bar).toHaveAttribute('aria-valuenow', '10');
    expect(container.querySelector('[data-tone]')).toHaveAttribute('data-tone', 'emerald');
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});

describe('KpiCard', () => {
  it('renders a button for onClick, a link for href, and a plain block otherwise', async () => {
    const onClick = vi.fn();
    const { user } = renderUi(
      <>
        <KpiCard label="Khách mời" value={120} ofTotal={150} icon="users" accent="blue" onClick={onClick} caption="80%" />
        <KpiCard label="Gian hàng" value={8} icon="store" accent="emerald" href="/events/e/booths" />
        <KpiCard label="Sự cố" value={0} icon="alert-triangle" accent="rose" badge={{ text: 'Ổn định', tone: 'emerald' }} />
      </>,
    );
    await user.click(screen.getByRole('button', { name: /Khách mời/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: /Gian hàng/ })).toHaveAttribute('href', '/events/e/booths');
    expect(screen.getByText('/ 150')).toBeInTheDocument();
    expect(screen.getByText('Ổn định')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});

describe('Icon', () => {
  it('is decorative by default and a named image with a label', () => {
    const { container } = renderUi(<><Icon name="star" /><Icon name="siren" label="Khẩn cấp" /></>);
    const [plain, named] = Array.from(container.querySelectorAll('svg'));
    expect(plain).toHaveAttribute('aria-hidden', 'true');
    expect(plain).not.toHaveAttribute('role');
    expect(named).not.toHaveAttribute('aria-hidden');
    expect(screen.getByRole('img', { name: 'Khẩn cấp' })).toBe(named);
  });
});

describe('Badge with long text', () => {
  it('wraps inside its container instead of forcing the page wider', () => {
    renderUi(<Badge tone="blue">Đã xác nhận tham dự, chờ bố trí chỗ ngồi và thẻ đại biểu của đơn vị</Badge>);
    const chip = screen.getByText(/Đã xác nhận tham dự/);
    expect(chip.className).not.toMatch(/whitespace-nowrap/);
    expect(chip.className).toMatch(/max-w-full/);
    expect(chip.className).toMatch(/break-words/);
  });
});
