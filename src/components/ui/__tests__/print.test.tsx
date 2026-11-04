import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppEnvProvider } from '../app-env';
import './helpers';
import { Nd30Header, PrintLink, PrintPage, SignatureBlock, pageCss } from '../print';

vi.mock('@/core/settings', () => ({
  orgIdentity: (s: { parentAgency: string; agencyName: string; agencyShortName: string }) => ({ ...s, city: 'Hà Nội' }),
}));
vi.mock('@/core/dates', () => ({
  formatNd30Date: () => 'ngày 04 tháng 11 năm 2026',
  buildWorkCalendar: () => ({ isWorkday: () => true, coverage: { from: '', to: '' } }),
}));

const settings = { parentAgency: 'SỞ TÀI CHÍNH HÀ NỘI', agencyName: 'TRUNG TÂM XÚC TIẾN ĐẦU TƯ', agencyShortName: 'SCE' } as never;

describe('print primitives', () => {
  it('emits the @page rule for size, orientation and NĐ30 margins', () => {
    expect(pageCss({ size: 'A4', orientation: 'portrait', margins: 'nd30' })).toBe('@page { size: A4 portrait; margin: 20mm 15mm 20mm 30mm; }');
    expect(pageCss({ size: 'A5', orientation: 'landscape', margins: 'none' })).toBe('@page { size: A5 landscape; margin: 0; }');
    const { container } = render(<PrintPage size="A4" orientation="landscape" margins="nd30">x</PrintPage>);
    expect(container.querySelector('style')!.textContent).toContain('@page { size: A4 landscape;');
    expect(container.querySelector('style')!.textContent).toContain('@media print');
    expect(container.querySelector('[data-print-page="A4-landscape"]')).toBeInTheDocument();
  });

  it('the global stylesheet hides the app shell and chrome when printing', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
    const print = css.slice(css.indexOf('@media print'));
    expect(print).toContain('[data-shell]');
    expect(print).toContain('[data-no-print]');
    expect(print).toMatch(/display:\s*none\s*!important/);
  });

  it('Nd30Header prints the national motto, issuer lines, document number and date', () => {
    render(
      <AppEnvProvider settings={settings} holidays={[]}>
        <Nd30Header issuer="trung_tam" documentNumber="Số: 12/KH-SCE" date={'2026-11-04' as never} />
      </AppEnvProvider>,
    );
    expect(screen.getByText('Cộng hòa xã hội chủ nghĩa Việt Nam')).toBeInTheDocument();
    expect(screen.getByText('Độc lập - Tự do - Hạnh phúc')).toBeInTheDocument();
    expect(screen.getByText('SỞ TÀI CHÍNH HÀ NỘI')).toBeInTheDocument();
    expect(screen.getByText('Số: 12/KH-SCE')).toBeInTheDocument();
    expect(screen.getByText(/Hà Nội, ngày 04 tháng 11 năm 2026/)).toBeInTheDocument();
  });

  it('Nd30Header leaves dotted blanks when number and date are absent', () => {
    render(
      <AppEnvProvider settings={settings} holidays={[]}>
        <Nd30Header issuer="so_tai_chinh" />
      </AppEnvProvider>,
    );
    expect(screen.getByText('Số: ..... /SCE')).toBeInTheDocument();
    expect(screen.getByText(/ngày \.\.\.\.\. tháng \.\.\.\.\. năm \.\.\.\.\./)).toBeInTheDocument();
  });

  it('SignatureBlock lists recipients and both signatories', () => {
    render(<SignatureBlock left={{ title: 'Người lập' }} right={{ title: 'Giám đốc', name: 'Nguyễn Văn A' }} recipients={['Như trên', 'Lưu: VT']} />);
    expect(screen.getByText('Người lập')).toBeInTheDocument();
    expect(screen.getByText('Giám đốc')).toBeInTheDocument();
    expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
    expect(screen.getByText('Nơi nhận:')).toBeInTheDocument();
    expect(screen.getByText('- Lưu: VT')).toBeInTheDocument();
  });

  it('PrintLink opens a new tab safely and says so', () => {
    render(<PrintLink href="/events/e1/plan/print" label="In kế hoạch" />);
    const link = screen.getByRole('link', { name: /In kế hoạch/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveAccessibleName('In kế hoạch (mở tab mới)');
  });
});
