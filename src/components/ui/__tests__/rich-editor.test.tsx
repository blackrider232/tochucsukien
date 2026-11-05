import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RichEditor, useRichEditor } from '../rich-editor';
import { renderUi } from './helpers';

const exec = vi.fn(() => true);
const state = vi.fn((_cmd: string) => false);

beforeEach(() => {
  exec.mockClear();
  state.mockReset().mockReturnValue(false);
  Object.assign(document, { execCommand: exec, queryCommandState: state });
});
afterEach(() => {
  delete (document as { execCommand?: unknown }).execCommand;
  delete (document as { queryCommandState?: unknown }).queryCommandState;
});

const page = () => screen.getByRole('textbox', { name: 'Nội dung biểu mẫu' });
const bar = () => screen.getByRole('toolbar', { name: 'Định dạng văn bản' });
const show = (props: Partial<React.ComponentProps<typeof RichEditor>> = {}) =>
  renderUi(<RichEditor label="Nội dung biểu mẫu" initialHtml="<p>Kính gửi</p>" onChange={() => {}} {...props} />);

function InsertTable() {
  const api = useRichEditor();
  return <button type="button" onClick={() => api.insertHtml('<table><tr><td>ô</td></tr></table>' as never)}>Chèn bảng</button>;
}
function InsertTag() {
  const api = useRichEditor();
  return <button type="button" onClick={() => api.insertText('{{eventName}}')}>Chèn thẻ</button>;
}

describe('RichEditor', () => {
  it('shows the sanitized initial document in a labelled multiline textbox', () => {
    show({ initialHtml: '<p onclick="alert(1)">Kính gửi</p><script>window.__pwned=1</script><img src=x onerror="window.__pwned=2">' });
    expect(page()).toHaveAttribute('aria-multiline', 'true');
    expect(page()).toHaveAttribute('contenteditable', 'true');
    expect(page()).toHaveTextContent('Kính gửi');
    expect(page().querySelector('script, img, [onclick], [onerror]')).toBeNull();
  });

  it('has a named toolbar of icon buttons for the text formats, each with an accessible label', () => {
    show();
    const names = within(bar()).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['In đậm', 'In nghiêng', 'Gạch chân', 'Căn trái', 'Căn giữa', 'Căn phải', 'Căn đều hai bên', 'Hoàn tác trong văn bản', 'Làm lại trong văn bản']);
    expect(bar().querySelectorAll('svg')).toHaveLength(names.length);
  });

  it('runs the format on the page and emits sanitized HTML, never what the page holds raw', async () => {
    const onChange = vi.fn();
    const { user } = show({ onChange });
    await user.click(within(bar()).getByRole('button', { name: 'In đậm' }));
    expect(exec).toHaveBeenCalledWith('bold', false, undefined);
    page().innerHTML = '<p onclick="x()">Đã sửa</p><script>window.__pwned=3</script>';
    fireEvent.input(page());
    const html = onChange.mock.lastCall?.[0] as string;
    expect(html).toContain('Đã sửa');
    expect(html).not.toMatch(/onclick|<script/);
  });

  it('marks the formats active at the caret as pressed', () => {
    state.mockImplementation((cmd) => cmd === 'bold');
    show();
    fireEvent(document, new Event('selectionchange'));
    const sel = document.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(page());
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent(document, new Event('selectionchange'));
    expect(within(bar()).getByRole('button', { name: 'In đậm' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(bar()).getByRole('button', { name: 'In nghiêng' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('is one tab stop with arrow keys, Home and End moving along the toolbar', async () => {
    const { user } = show();
    const buttons = within(bar()).getAllByRole('button');
    expect(buttons.map((b) => b.tabIndex)).toEqual([0, ...buttons.slice(1).map(() => -1)]);
    await user.tab();
    expect(buttons[0]).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(buttons[1]).toHaveFocus();
    expect(buttons[1]!.tabIndex).toBe(0);
    expect(buttons[0]!.tabIndex).toBe(-1);
    await user.keyboard('{End}');
    expect(buttons.at(-1)).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(buttons[0]).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(buttons.at(-1)).toHaveFocus();
    await user.keyboard('{Home}');
    expect(buttons[0]).toHaveFocus();
    await user.tab();
    expect(page()).toHaveFocus();
  });

  it('sanitizes pasted HTML before it lands, and pastes plain text as text', () => {
    show();
    const paste = (data: Record<string, string>) => fireEvent.paste(page(), { clipboardData: { getData: (type: string) => data[type] ?? '' } });
    paste({ 'text/html': '<b onclick="x()">đậm</b><script>window.__pwned=4</script>', 'text/plain': 'đậm' });
    const [command, , value] = exec.mock.lastCall as unknown as [string, boolean, string];
    expect(command).toBe('insertHTML');
    expect(value).toContain('đậm');
    expect(value).not.toMatch(/onclick|<script/);
    paste({ 'text/plain': 'chỉ chữ' });
    expect(exec).toHaveBeenLastCalledWith('insertText', false, 'chỉ chữ');
  });

  it('lets the caller add tools and content that insert into the page through the api', async () => {
    const { user } = show({
      toolbarExtras: <InsertTable />,
      children: <InsertTag />,
    });
    await user.click(within(bar()).getByRole('button', { name: 'Chèn bảng' }));
    expect(exec).toHaveBeenLastCalledWith('insertHTML', false, '<table><tr><td>ô</td></tr></table>');
    await user.click(screen.getByRole('button', { name: 'Chèn thẻ' }));
    expect(exec).toHaveBeenLastCalledWith('insertText', false, '{{eventName}}');
  });
});
