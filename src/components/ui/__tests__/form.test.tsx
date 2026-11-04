import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Checkbox, DateInput, MoneyInput, NumberInput, Select, TextInput } from '../controls';
import { Form, FormField, useZodForm } from '../form';
import type { IsoDate } from '@/core/brand';
import { renderUi, testAppContext, withAppContext } from './helpers';

const schema = z.object({
  name: z.string().min(1, 'Nhập họ tên'),
  email: z.string().email('Email không hợp lệ'),
  budget: z.number({ error: 'Nhập số tiền' }).int().min(1000, 'Tối thiểu 1.000 đ'),
  group: z.enum(['VIP', 'DoanhNghiep']),
  agree: z.literal(true, { error: 'Cần đồng ý' }),
});

function Sample({ onValid }: { onValid: (v: unknown) => void }) {
  const form = useZodForm(schema, { defaultValues: { name: '', email: '', group: 'VIP' } });
  return (
    <Form form={form} onSubmit={onValid}>
      <FormField label="Họ tên" name="name" required hint="Như trên giấy mời"><TextInput name="name" /></FormField>
      <FormField label="Email" name="email"><TextInput name="email" type="email" /></FormField>
      <FormField label="Ngân sách" name="budget" suffix="VND"><MoneyInput name="budget" /></FormField>
      <FormField label="Nhóm" name="group"><Select name="group" options={[{ value: 'VIP', label: 'Khách VIP' }, { value: 'DoanhNghiep', label: 'Doanh nghiệp' }]} /></FormField>
      <Checkbox name="agree" label="Đồng ý điều khoản" description="Bắt buộc" />
      <button type="submit">Lưu</button>
    </Form>
  );
}

describe('forms', () => {
  it('binds label, hint and error to the control through ARIA', async () => {
    const onValid = vi.fn();
    const { user } = renderUi(<Sample onValid={onValid} />);
    const name = screen.getByLabelText(/Họ tên/);
    expect(name).toHaveAccessibleDescription('Như trên giấy mời');
    expect(name).toHaveAttribute('aria-required', 'true');
    expect(name).not.toHaveAttribute('aria-invalid');

    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(name).toHaveAttribute('aria-invalid', 'true'));
    expect(name).toHaveAccessibleDescription('Như trên giấy mời Nhập họ tên');
    expect(screen.getByText('Nhập họ tên')).toHaveAttribute('role', 'alert');
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Email không hợp lệ');
    expect(screen.getByRole('checkbox', { name: /Đồng ý điều khoản/ })).toHaveAccessibleDescription('Bắt buộc Cần đồng ý');
    expect(onValid).not.toHaveBeenCalled();
    expect(name).toHaveFocus();
  });

  it('clears an error once the value is fixed and submits parsed values', async () => {
    const onValid = vi.fn();
    const { user } = renderUi(<Sample onValid={onValid} />);
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    await screen.findByText('Nhập họ tên');
    await user.type(screen.getByLabelText(/Họ tên/), 'Nguyễn Văn A');
    await waitFor(() => expect(screen.queryByText('Nhập họ tên')).not.toBeInTheDocument());
    await user.type(screen.getByLabelText('Email'), 'a@sce.vn');
    await user.type(screen.getByLabelText('Ngân sách'), '1500000');
    expect(screen.getByLabelText('Ngân sách')).toHaveValue('1.500.000');
    await user.selectOptions(screen.getByLabelText('Nhóm'), 'DoanhNghiep');
    await user.click(screen.getByRole('checkbox', { name: /Đồng ý điều khoản/ }));
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(onValid).toHaveBeenCalled());
    expect(onValid.mock.calls[0]![0]).toMatchObject({ name: 'Nguyễn Văn A', email: 'a@sce.vn', budget: 1500000, group: 'DoanhNghiep', agree: true });
  });

  it('money input ignores letters and keeps whole dong only', async () => {
    const { user } = renderUi(<Sample onValid={() => {}} />);
    const money = screen.getByLabelText('Ngân sách');
    await user.type(money, '12ab3,4');
    expect(money).toHaveValue('1.234');
  });

  it('number input yields undefined when empty and a number otherwise', async () => {
    const onValid = vi.fn();
    function NumberForm() {
      const form = useZodForm(z.object({ days: z.number().min(1, 'Tối thiểu 1') }), {});
      return (
        <Form form={form} onSubmit={onValid}>
          <FormField label="Số ngày" name="days" suffix="ngày"><NumberInput name="days" min={1} /></FormField>
          <button type="submit">Lưu</button>
        </Form>
      );
    }
    const { user } = renderUi(<NumberForm />);
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Số ngày'), '5');
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(onValid).toHaveBeenCalled());
    expect(onValid.mock.calls[0]![0]).toEqual({ days: 5 });
  });

  it('date input names the holiday under the field', async () => {
    function DateForm() {
      const form = useZodForm(z.object({ day: z.string() }), { defaultValues: { day: '2026-09-02' } });
      return (
        <Form form={form} onSubmit={() => {}}>
          <FormField label="Ngày" name="day"><DateInput name="day" showHolidays /></FormField>
        </Form>
      );
    }
    renderUi(withAppContext(<DateForm />, testAppContext([{ date: '2026-09-02' as IsoDate, name: 'Quốc khánh', kind: 'holiday' }])));
    expect(await screen.findByText('Ngày nghỉ lễ: Quốc khánh')).toBeInTheDocument();
  });
});
