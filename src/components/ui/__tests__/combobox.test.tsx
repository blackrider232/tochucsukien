import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Combobox } from '../combobox';
import { matchesQuery } from '@/core/text';
import { renderUi } from './helpers';

interface Contact { id: string; name: string }
const CONTACTS: Contact[] = [
  { id: '1', name: 'Nguyễn Văn An' },
  { id: '2', name: 'Trần Thị Bình' },
  { id: '3', name: 'Lê Văn Anh' },
];

function setup() {
  const search = vi.fn(async (q: string) => CONTACTS.filter((c) => matchesQuery(q, c.name)));
  const onPick = vi.fn();
  const view = renderUi(
    <label>
      Danh bạ
      <Combobox name="contact" search={search} itemKey={(c) => c.id} itemLabel={(c) => c.name} onPick={onPick} />
    </label>,
  );
  return { ...view, search, onPick, input: () => screen.getByRole('combobox') };
}

describe('Combobox', () => {
  it('searches as you type and lists matching options, ignoring Vietnamese tone marks', async () => {
    const { user, search, input } = setup();
    await user.type(input(), 'van a');
    expect(await screen.findAllByRole('option')).toHaveLength(2);
    expect(search).toHaveBeenLastCalledWith('van a');
    expect(input()).toHaveAttribute('aria-expanded', 'true');
  });

  it('moves with the arrow keys, wraps, and picks with Enter', async () => {
    const { user, onPick, input } = setup();
    await user.type(input(), 'van');
    const options = await screen.findAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(input()).toHaveAttribute('aria-activedescendant', options[0]!.id);
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowUp}');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Enter}');
    expect(onPick).toHaveBeenCalledWith(CONTACTS[2]);
    expect(input()).toHaveValue('Lê Văn Anh');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes the list on Escape without picking, then clears on a second Escape', async () => {
    const { user, onPick, input } = setup();
    await user.type(input(), 'binh');
    await screen.findByRole('option');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input()).toHaveValue('binh');
    await user.keyboard('{Escape}');
    expect(input()).toHaveValue('');
    expect(onPick).not.toHaveBeenCalled();
  });

  it('says so when nothing matches, and shows a failure instead of crashing', async () => {
    const { user, input } = setup();
    await user.type(input(), 'zzz');
    expect(await screen.findByText('Không tìm thấy kết quả.')).toBeInTheDocument();

    const failing = renderUi(<Combobox name="x" search={async () => { throw new Error('offline'); }} itemKey={(c: Contact) => c.id} itemLabel={(c: Contact) => c.name} onPick={() => {}} />);
    await failing.user.type(failing.getAllByRole('combobox')[1]!, 'a');
    await waitFor(() => expect(screen.getByText('Không tìm được. Thử lại sau.')).toBeInTheDocument());
  });

  it('ignores a slow earlier response that arrives after a newer one', async () => {
    let releaseSlow: (v: Contact[]) => void = () => {};
    const search = vi.fn((q: string) =>
      q === 'v' ? new Promise<Contact[]>((r) => { releaseSlow = r; }) : Promise.resolve(CONTACTS.filter((c) => matchesQuery(q, c.name))),
    );
    const { user } = renderUi(<Combobox name="c" search={search} itemKey={(c) => c.id} itemLabel={(c) => c.name} onPick={() => {}} />);
    const box = screen.getByRole('combobox');
    await user.type(box, 'v');
    await waitFor(() => expect(search).toHaveBeenCalledWith('v'));
    await user.type(box, 'an');
    await screen.findAllByRole('option');
    releaseSlow(CONTACTS);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });
});
