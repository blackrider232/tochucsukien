import QRCode from 'qrcode';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SanitizedHtml } from '@/core/brand';
import { buildWorkbook, downloadBlob, safeCell, wordHtml, xlsxSheet } from '../files';
import { QrCode, qrPath, qrPngDataUrl } from '../qr';
import { fakeText } from './helpers';

vi.mock('@/core/text', () => import('./helpers').then((m) => m.fakeText));

const PAYLOAD = 'SCE-CHK:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222';

describe('QrCode', () => {
  it('draws the exact module matrix of the payload', () => {
    const { container } = render(<QrCode payload={PAYLOAD} size={160} caption="K7M2QX" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('role', 'img');
    expect(svg).toHaveAttribute('aria-label', 'Mã QR K7M2QX');
    expect(svg.getAttribute('width')).toBe('160');
    const drawn = svg.querySelector('path')!.getAttribute('d');
    expect(drawn).toBe(qrPath(PAYLOAD).path);
    const reference = QRCode.create(PAYLOAD, { errorCorrectionLevel: 'M' }).modules;
    expect(drawn!.split('M').filter(Boolean)).toHaveLength(reference.data.reduce((n, bit) => n + (bit ? 1 : 0), 0));
    expect(container.querySelector('figcaption')).toHaveTextContent('K7M2QX');
  });

  it('draws a different matrix for a different payload', () => {
    expect(qrPath(PAYLOAD).path).not.toBe(qrPath(`${PAYLOAD}x`).path);
  });

  it('qrPngDataUrl resolves a PNG data URL', async () => {
    const url = await qrPngDataUrl(PAYLOAD, 200);
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
  });
});

describe('xlsx', () => {
  it('writes strings as text cells with formula-injection guarded, numbers as numbers', async () => {
    const wb = await buildWorkbook([
      xlsxSheet({
        name: 'Khách/mời:[1]',
        title: { lines: ['=HYPERLINK("http://x")'] },
        columns: [
          { header: 'Họ tên', width: 24, value: (r: { n: string; s: number }) => r.n },
          { header: 'Số ghế', width: 10, value: (r) => r.s, fill: () => '#DBEAFE' },
        ],
        rows: [{ n: '=SUM(A1:A9)', s: 5 }, { n: '+84 912', s: -3 }, { n: '@cmd', s: 0 }, { n: 'Bình thường', s: 1 }],
        freezeHeader: true,
        autoFilter: true,
      }),
    ]);
    const ws = wb.worksheets[0]!;
    expect(ws.name).toBe('Khách mời  1');
    expect(ws.getCell('A1').value).toBe("'=HYPERLINK(\"http://x\")");
    const text = (r: number) => ws.getCell(`A${r}`).value;
    expect([text(3), text(4), text(5), text(6)]).toEqual(["'=SUM(A1:A9)", "'+84 912", "'@cmd", 'Bình thường']);
    expect(typeof ws.getCell('B3').value).toBe('number');
    expect(ws.getCell('B4').value).toBe(-3);
    expect(ws.getCell('A3').type).toBe(3);
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 2 });
  });

  it('safeCell leaves numbers and null alone', () => {
    expect(safeCell(-3)).toBe(-3);
    expect(safeCell(null)).toBeNull();
    expect(safeCell('-1')).toBe("'-1");
  });
});

describe('downloads', () => {
  afterEach(() => vi.useRealTimers());

  it('downloadBlob clicks a link with the file name, then revokes the object URL', () => {
    vi.useFakeTimers();
    const create = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('ds-khach.xlsx');
      expect(revoke).not.toHaveBeenCalled();
    });
    downloadBlob(new Blob(['x']), 'ds-khach.xlsx');
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBeNull();
    vi.advanceTimersByTime(1500);
    expect(revoke).toHaveBeenCalledWith('blob:x');
  });

  it('Word HTML escapes the title and keeps the sanitized body, with NĐ30 page CSS', () => {
    const out = wordHtml({ title: '<script>alert(1)</script> & "Kế hoạch"', body: '<p>Nội dung</p>' as SanitizedHtml, orientation: 'landscape' });
    expect(out).toContain('<title>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Kế hoạch&quot;</title>');
    expect(out).toContain('<div class="WordSection1"><p>Nội dung</p></div>');
    expect(out).toContain('size: 29.7cm 21.0cm');
    expect(out).toContain('margin: 2.0cm 1.5cm 2.0cm 3.0cm');
    expect(fakeText.escapeHtml(0)).toBe('0');
  });
});
