import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { IsoDate } from '@/core/brand';
import { withAppContext } from './helpers';
import { Nd30Header, PrintLink, PrintPage, SignatureBlock, pageCss } from '../print';

const issuerLines = (issuer: 'ubnd' | 'so_tai_chinh' | 'trung_tam') => {
  const { container } = render(withAppContext(<Nd30Header issuer={issuer} />));
  const left = container.querySelector('header > div')!;
  return [...left.querySelectorAll('p')].map((p) => [p.textContent, p.classList.contains('font-bold') ? 'bold' : 'regular']).filter(([t]) => t !== '' && !t!.startsWith('Số'));
};

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
    render(withAppContext(<Nd30Header issuer="trung_tam" documentNumber="Số: 12/KH-SCE" date={'2026-11-04' as IsoDate} />));
    expect(screen.getByText('Cộng hòa xã hội chủ nghĩa Việt Nam')).toBeInTheDocument();
    expect(screen.getByText('Độc lập - Tự do - Hạnh phúc')).toBeInTheDocument();
    expect(screen.getByText('SỞ TÀI CHÍNH HÀ NỘI')).toBeInTheDocument();
    expect(screen.getByText('Số: 12/KH-SCE')).toBeInTheDocument();
    expect(screen.getByText(/Hà Nội, ngày 04 tháng 11 năm 2026/)).toBeInTheDocument();
  });

  it('Nd30Header leaves dotted blanks when number and date are absent', () => {
    render(withAppContext(<Nd30Header issuer="so_tai_chinh" />));
    expect(screen.getByText('Số: ..... /SCE')).toBeInTheDocument();
    expect(screen.getByText(/ngày \.\.\.\.\. tháng \.\.\.\.\. năm \.\.\.\.\./)).toBeInTheDocument();
  });

  it('Nd30Header names each issuer as NĐ30 prints it: parent agency regular, issuing body bold', () => {
    expect(issuerLines('trung_tam')).toEqual([
      ['SỞ TÀI CHÍNH HÀ NỘI', 'regular'],
      ['TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP HÀ NỘI', 'bold'],
    ]);
    expect(issuerLines('so_tai_chinh')).toEqual([
      ['ỦY BAN NHÂN DÂN THÀNH PHỐ HÀ NỘI', 'regular'],
      ['SỞ TÀI CHÍNH HÀ NỘI', 'bold'],
    ]);
    expect(issuerLines('ubnd')).toEqual([
      ['ỦY BAN NHÂN DÂN', 'bold'],
      ['THÀNH PHỐ HÀ NỘI', 'bold'],
    ]);
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

  describe('type="nd30" (Times New Roman, the Word file\'s pt sizes)', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
    const token = (name: string) => css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1];

    it('defines the print face and the pt sizes once, as theme tokens', () => {
      expect(token('font-print')).toBe('"Times New Roman", Times, serif');
      expect([token('text-nd30'), token('text-nd30-header'), token('text-nd30-note'), token('text-nd30-copies')]).toEqual(['14pt', '13pt', '12pt', '11pt']);
    });

    it('the page, letterhead, signer, recipients heading and copies take them, and a plain page does not', () => {
      const { container } = render(withAppContext(
        <PrintPage size="A4" orientation="portrait" margins="nd30" type="nd30">
          <Nd30Header issuer="trung_tam" />
          <SignatureBlock right={{ title: 'GIÁM ĐỐC' }} recipients={['Lưu: VT']} />
        </PrintPage>,
      ));
      const page = container.querySelector('.print-page')!;
      expect(page).toHaveClass('font-print', 'text-nd30');
      expect(container.querySelector('header')).toHaveClass('text-nd30-header');
      expect(container.querySelector('footer')).toHaveClass('text-nd30');
      expect(screen.getByText('Nơi nhận:')).toHaveClass('text-nd30-note');
      expect(container.querySelector('footer ul')).toHaveClass('text-nd30-copies');

      const plain = render(withAppContext(<PrintPage size="A4" orientation="portrait" margins="nd30"><Nd30Header issuer="trung_tam" /></PrintPage>)).container;
      expect(plain.querySelector('.print-page')).not.toHaveClass('font-print');
      expect(plain.querySelector('header')).toHaveClass('text-print-sm');
    });
  });
});
