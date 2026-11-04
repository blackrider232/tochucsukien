import { screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { DataTable, sortRows } from '../data-table';
import type { Column } from '../kit.types';
import { renderUi } from './helpers';

interface Guest { id: string; name: string; seats: number }
const GUESTS: Guest[] = [
  { id: 'a', name: 'Đặng Văn B', seats: 3 },
  { id: 'b', name: 'Âu Thị A', seats: 10 },
  { id: 'c', name: 'Bùi Văn C', seats: 2 },
];
const COLUMNS: Column<Guest>[] = [
  { id: 'name', header: 'Họ tên', cell: (g) => g.name, sortValue: (g) => g.name },
  { id: 'seats', header: 'Số ghế', cell: (g) => g.seats, sortValue: (g) => g.seats, align: 'right' },
  { id: 'note', header: 'Ghi chú', cell: () => '-', hideOnMobile: true },
];
const EMPTY = { icon: 'users' as const, title: 'Chưa có khách mời', text: 'Thêm khách để bắt đầu.' };

function names(): string[] {
  return screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0]!.textContent ?? '');
}

describe('DataTable', () => {
  it('shows the empty state instead of rows, keeping the toolbar', () => {
    renderUi(<DataTable rows={[]} columns={COLUMNS} rowKey={(g) => g.id} empty={EMPTY} toolbar={<button>Thêm</button>} />);
    expect(screen.getByRole('heading', { name: 'Chưa có khách mời' })).toBeInTheDocument();
    expect(screen.getByText('Thêm khách để bắt đầu.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('numbers rows and renders every column', () => {
    renderUi(<DataTable rows={GUESTS} columns={COLUMNS} rowKey={(g) => g.id} empty={EMPTY} numbered />);
    expect(screen.getByRole('columnheader', { name: 'STT' })).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });

  it('sorts ascending, descending, then back to the original order, with aria-sort', async () => {
    const { user } = renderUi(<DataTable rows={GUESTS} columns={COLUMNS} rowKey={(g) => g.id} empty={EMPTY} />);
    const header = () => screen.getByRole('columnheader', { name: /Số ghế/ });
    expect(header()).toHaveAttribute('aria-sort', 'none');
    await user.click(within(header()).getByRole('button'));
    expect(header()).toHaveAttribute('aria-sort', 'ascending');
    expect(names().map((n) => n.replace(/^.*?(Đặng|Âu|Bùi)/, '$1').split(' ').slice(0, 1))).toEqual([['Bùi'], ['Đặng'], ['Âu']]);
    await user.click(within(header()).getByRole('button'));
    expect(header()).toHaveAttribute('aria-sort', 'descending');
    await user.click(within(header()).getByRole('button'));
    expect(header()).toHaveAttribute('aria-sort', 'none');
    expect(names()[0]).toContain('Đặng');
  });

  it('sorts Vietnamese text by collation and numbers numerically', () => {
    const byName = sortRows(GUESTS, COLUMNS[0], 'asc').map((g) => g.id);
    expect(byName).toEqual(['b', 'c', 'a']);
    const bySeats = sortRows(GUESTS, COLUMNS[1], 'desc').map((g) => g.id);
    expect(bySeats).toEqual(['b', 'a', 'c']);
  });

  it('selects rows and all rows through the selection prop', async () => {
    function Harness() {
      const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
      return <DataTable rows={GUESTS} columns={COLUMNS} rowKey={(g) => g.id} empty={EMPTY} selection={{ selected, onChange: setSelected }} />;
    }
    const { user } = renderUi(<Harness />);
    await user.click(screen.getByRole('checkbox', { name: 'Chọn dòng 2' }));
    expect(screen.getByText('Đã chọn 1 / 3 dòng')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Chọn tất cả' })).toHaveProperty('indeterminate', true);
    await user.click(screen.getByRole('checkbox', { name: 'Chọn tất cả' }));
    expect(screen.getByText('Đã chọn 3 / 3 dòng')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Chọn tất cả' }));
    expect(screen.queryByText(/Đã chọn/)).not.toBeInTheDocument();
  });
});
