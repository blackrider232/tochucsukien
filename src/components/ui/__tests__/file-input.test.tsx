import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { FileInput } from '../file-input';
import { Form, FormField, useZodForm } from '../form';
import { renderUi } from './helpers';

const csv = (name = 'khach.csv', size = 20) => new File(['a'.repeat(size)], name, { type: 'text/csv' });
const input = () => screen.getByLabelText('Tệp CSV') as HTMLInputElement;

function Standalone(props: Partial<React.ComponentProps<typeof FileInput>> & { onChange: (f: File | null) => void }) {
  return <FileInput name="file" label="Tệp CSV" accept=".csv,text/csv" {...props} />;
}

describe('FileInput', () => {
  it('hands over the chosen file, shows its name and size, and clears on request', async () => {
    const onChange = vi.fn();
    const { user } = renderUi(<Standalone onChange={onChange} />);
    expect(input()).toHaveAttribute('type', 'file');
    expect(input()).toHaveAttribute('accept', '.csv,text/csv');
    expect(screen.getByText('Chưa chọn tệp')).toBeInTheDocument();
    const file = csv('khach.csv', 2048);
    await user.upload(input(), file);
    expect(onChange).toHaveBeenLastCalledWith(file);
    expect(screen.getByText('khach.csv')).toBeInTheDocument();
    expect(screen.getByText('2 KB')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Xóa tệp đã chọn' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByText('Chưa chọn tệp')).toBeInTheDocument();
    expect(input().value).toBe('');
    expect(screen.queryByRole('button', { name: 'Xóa tệp đã chọn' })).toBeNull();
  });

  it('refuses a file over maxBytes with a message, and hands over null', () => {
    const onChange = vi.fn();
    renderUi(<Standalone onChange={onChange} maxBytes={1024 * 1024} />);
    fireEvent.change(input(), { target: { files: [csv('lon.csv', 3 * 1024 * 1024)] } });
    expect(screen.getByRole('alert')).toHaveTextContent('Tệp lớn hơn 1 MB. Chọn tệp nhỏ hơn.');
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText('lon.csv')).toBeNull();
    expect(input()).toHaveAccessibleDescription(/Tệp lớn hơn 1 MB/);
    expect(input()).toBeInvalid();
  });

  it('refuses a type outside accept, by extension or MIME type, and takes a match', () => {
    const onChange = vi.fn();
    renderUi(<Standalone onChange={onChange} />);
    fireEvent.change(input(), { target: { files: [new File(['x'], 'anh.png', { type: 'image/png' })] } });
    expect(screen.getByRole('alert')).toHaveTextContent('Chỉ nhận tệp .csv, text/csv.');
    expect(onChange).toHaveBeenLastCalledWith(null);
    fireEvent.change(input(), { target: { files: [new File(['x'], 'XUAT.CSV', { type: 'application/vnd.ms-excel' })] } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onChange.mock.lastCall?.[0]).toBeInstanceOf(File);
  });

  it('takes the keyboard: the input itself is the tab stop, and Clear is the next one', async () => {
    const { user } = renderUi(<Standalone onChange={() => {}} />);
    await user.tab();
    expect(input()).toHaveFocus();
    await user.upload(input(), csv());
    await user.tab();
    expect(screen.getByRole('button', { name: 'Xóa tệp đã chọn' })).toHaveFocus();
  });

  it('sets the form value, and the form error names the control', async () => {
    const schema = z.object({ file: z.instanceof(File, { error: 'Cần chọn một tệp' }) });
    function Sample() {
      const form = useZodForm(schema);
      return (
        <Form form={form} onSubmit={() => {}}>
          <FormField label="Tệp danh sách" name="file" hint="Tối đa 1 MB"><FileInput name="file" accept=".csv" maxBytes={1024 * 1024} onChange={() => {}} /></FormField>
          <button type="submit">Gửi</button>
        </Form>
      );
    }
    const { user } = renderUi(<Sample />);
    await user.click(screen.getByRole('button', { name: 'Gửi' }));
    const control = screen.getByLabelText('Tệp danh sách');
    expect(await screen.findByText('Cần chọn một tệp')).toBeInTheDocument();
    expect(control).toBeInvalid();
    await user.upload(control, csv());
    expect(await screen.findByText('khach.csv')).toBeInTheDocument();
    expect(screen.queryByText('Cần chọn một tệp')).toBeNull();
  });
});
