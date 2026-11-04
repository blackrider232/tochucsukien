import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClippingId, DailyReportId, HHmm, Instant, PressReleaseId, SafeUrl, UserId, Version } from '@/core/brand';
import { renderUi, withAppContext } from '@/components/ui/__tests__/helpers';
import { DEFAULT_SETTINGS, orgIdentity } from '@/core/settings';
import type { MediaClipping, PressRelease } from '../contract';
import { PrintDailyReport } from '../components/print-daily-report';
import { ReportsScreen, type ReportsTab } from '../components/reports-screen';
import { dashboardFigures, encodeFigures } from '../domain/figures';
import { dailyReportDocument, type IssuedReport } from '../domain/report';
import type { ReportsScreenData } from '../domain/screen';
import { dailyReportFileName, dailyReportWordBody } from '../domain/word';
import { d, EVENT_ID, guests, pkg, plan, SETTINGS, step, withHolidays } from './fixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => '/' }));
const dispatch = vi.fn();
vi.mock('@/core/commands/dispatch', () => ({ dispatch: (...a: unknown[]) => dispatch(...a) }));

const XSS = '<img src=x onerror="window.__pwned=1">';
const SCRIPT = '<script>window.__pwned=2</script>';
const AT = '2026-12-08T01:00:00.000Z' as Instant;
const TODAY = d('2026-12-08');

const figures = dashboardFigures(
  { plan: plan([step(20, true), step(10), step(2)], { targetGuests: 10 }), roster: guests(14, 'confirmed'), booths: [], packages: [pkg(100_000_000, 112_500_000, `${XSS}-1`)], clippings: 1 },
  withHolidays, SETTINGS, TODAY,
);
const clipping: MediaClipping = {
  id: 'c1000000-0000-4000-8000-000000000001' as ClippingId, eventId: EVENT_ID, outlet: `${SCRIPT} Báo`, title: `${XSS} Tin bài`, publishedOn: d('2026-12-01'),
  mediaType: 'Truyền hình', url: 'https://example.com/a?b=1' as SafeUrl, author: XSS, version: 1 as Version,
};
const press: PressRelease = { id: 'c2000000-0000-4000-8000-000000000001' as PressReleaseId, eventId: EVENT_ID, title: `${XSS} Thông cáo`, timing: 'after', contact: SCRIPT, content: XSS, version: 1 as Version };
const report: IssuedReport = {
  id: 'c3000000-0000-4000-8000-000000000001' as DailyReportId, eventId: EVENT_ID, reportDate: d('2026-12-07'), workdaysToEvent: 6, progressPercent: 33,
  keyHighlight: `${XSS} Nổi bật`, blockers: `${SCRIPT} Vướng`, signatory: `${XSS} Người ký`, signatoryTitle: 'TRƯỞNG PHÒNG XÚC TIẾN ĐẦU TƯ', documentNumber: '12/BC-SCE',
  figures: encodeFigures(figures), eventName: `${XSS} Hội nghị`, eventDate: d('2026-12-15'), issuedAt: '2026-12-07T02:15:00.000Z' as Instant, issuedBy: 'u' as UserId,
};

function data(over: Partial<ReportsScreenData> = {}): ReportsScreenData {
  return {
    event: { id: EVENT_ID, name: `${XSS} Hội nghị`, eventDate: d('2026-12-15'), eventTime: '08:30' as HHmm, location: SCRIPT, department: 'Phòng Xúc tiến đầu tư', targetGuests: 10 },
    today: TODAY, now: AT, state: { kind: 'active', workdays: 5, calendarDays: 7 }, figures, missing: [],
    groups: [{ id: 'g1', name: `${XSS} Nhóm`, done: 1, total: 3, percent: 33 }],
    clippings: [clipping], packages: [pkg(100_000_000, 112_500_000, `${XSS}-1`)], pressReleases: [press], reports: [report], issuedToday: null,
    signatoryTitle: 'TRƯỞNG PHÒNG XÚC TIẾN ĐẦU TƯ', can: { write: true, issue: true },
    ...over,
  };
}
const show = (dt: ReportsScreenData, tab: ReportsTab) => renderUi(withAppContext(<ReportsScreen data={dt} tab={tab} />));

function expectNoMarkup(root: HTMLElement) {
  expect(root.querySelector('img, script')).toBeNull();
  expect(root.querySelectorAll('[onerror], [onclick]')).toHaveLength(0);
  expect((window as { __pwned?: number }).__pwned).toBeUndefined();
}

describe('report screens render every stored text as text (m6 BUG-25/26)', () => {
  it.each([
    ['daily', `${XSS} Nổi bật`],
    ['media', `${XSS} Tin bài`],
    ['bidding', `${XSS}-1`],
    ['dashboard', `${XSS} Nhóm`],
    ['official', 'Báo cáo nhanh kết quả tổ chức sự kiện'],
  ] as const)('%s', (tab, text) => {
    const { container } = show(data(), tab);
    expectNoMarkup(container);
    expect(screen.getAllByText(text, { exact: false }).length).toBeGreaterThan(0);
  });

  it('a clipping link opens in a new tab without the opener', () => {
    show(data(), 'media');
    const link = screen.getByRole('link', { name: /Xem bài viết/ });
    expect(link).toHaveAttribute('href', 'https://example.com/a?b=1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

describe('headline numbers', () => {
  it('come from the figures, with the signed saving and the quota wording', () => {
    show(data(), 'daily');
    expect(screen.getByText('T-5')).toBeInTheDocument();
    expect(screen.getByText('Trong mốc báo cáo hằng ngày')).toBeInTheDocument();
    expect(screen.getByText('Vượt 12,50%')).toBeInTheDocument();
    expect(screen.getByText('Đạt định mức')).toBeInTheDocument();
    // T-20 done, T-10 late, T-2 (13/12) not yet due: the three parts add up to the 3 steps (BUG-06).
    expect(screen.getByText('Xong: 1/3 • Quá hạn: 1 • Chưa đến hạn: 1')).toBeInTheDocument();
  });

  it('an overrun of 40.000 đ on 1 tỷ is a red \"Vượt\" badge on the card and in the dashboard, not \"Tiết kiệm 0,00%\"', () => {
    const tiny = dashboardFigures({ plan: plan([]), roster: [], booths: [], packages: [pkg(1_000_000_000, 1_000_040_000)], clippings: 0 }, withHolidays, SETTINGS, TODAY);
    const { unmount } = show(data({ figures: tiny }), 'daily');
    expect(screen.getAllByText('Vượt <0,01%').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Tiết kiệm 0,00%/)).toBeNull();
    unmount();
    show(data({ figures: tiny }), 'dashboard');
    expect(screen.getAllByText('Vượt <0,01%').length).toBeGreaterThan(0);
  });

  it('the bidding card compares the winning prices with the dự toán of the same awarded packages (M3)', () => {
    const mixed = dashboardFigures(
      { plan: plan([]), roster: [], booths: [], packages: [pkg(200_000_000, 198_000_000), pkg(40_000_000, null)], clippings: 0 }, withHolidays, SETTINGS, TODAY,
    );
    const { unmount } = show(data({ figures: mixed }), 'daily');
    expect(screen.getByText('Tiết kiệm 1,00%')).toBeInTheDocument();
    expect(screen.getByText('1/2 gói có giá trúng: 198 tr trên dự toán 200 tr')).toBeInTheDocument();
    expect(screen.queryByText(/240 tr/)).toBeNull();
    unmount();
    const none = dashboardFigures({ plan: plan([]), roster: [], booths: [], packages: [pkg(40_000_000, null)], clippings: 0 }, withHolidays, SETTINGS, TODAY);
    show(data({ figures: none }), 'daily');
    expect(screen.getByText('Tổng dự toán 40 tr • Chưa có giá trúng thầu')).toBeInTheDocument();
  });

  it('an upstream that is not ready reads "chưa sẵn sàng", never zero', () => {
    show(data({ figures: null, missing: ['Khách mời'] }), 'daily');
    expect(screen.getByText('Số liệu tổng hợp chưa sẵn sàng')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Phát hành báo cáo' })).toBeNull();
    expect(screen.queryByText('0%')).toBeNull();
  });

  it('the official templates open with this event', () => {
    show(data(), 'official');
    const links = screen.getAllByRole('link', { name: 'Mở soạn thảo' });
    expect(links).toHaveLength(3);
    for (const l of links) expect(l.getAttribute('href')).toContain(EVENT_ID);
  });
});

describe('issuing from the daily tab', () => {
  it('asks first, then sends only the narrative and the signer; a declined confirm sends nothing', async () => {
    dispatch.mockReset();
    const { user } = show(data(), 'daily');
    await user.type(screen.getByLabelText(/Tình hình triển khai nổi bật/), 'Đã chốt kịch bản.');
    await user.type(screen.getByLabelText(/Người ký/), 'Trần Văn Bình');
    await user.click(screen.getByRole('button', { name: 'Phát hành báo cáo' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/không sửa được sau đó/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Hủy' }));
    expect(dispatch).not.toHaveBeenCalled();

    dispatch.mockResolvedValueOnce({ ok: true, value: { already: false, report } });
    await user.click(screen.getByRole('button', { name: 'Phát hành báo cáo' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Phát hành' }));
    expect(dispatch).toHaveBeenCalledWith('reports.issueDailyReport', {
      eventId: EVENT_ID, id: expect.any(String), draft: { keyHighlight: 'Đã chốt kịch bản.', blockers: '', signatory: 'Trần Văn Bình', documentNumber: null },
    });
  });

  it('a chuyên viên gets the preview link and no issue form', () => {
    show(data({ can: { write: true, issue: false } }), 'daily');
    expect(screen.queryByRole('button', { name: 'Phát hành báo cáo' })).toBeNull();
    expect(screen.getByText('Chỉ Trưởng phòng chủ trì sự kiện trở lên phát hành báo cáo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Xem bản in trước/ })).toHaveAttribute('href', `/events/${EVENT_ID}/reports/print`);
  });

  it('once issued today, the tab shows the report instead of the form', () => {
    show(data({ issuedToday: { ...report, reportDate: TODAY } }), 'daily');
    expect(screen.queryByRole('button', { name: 'Phát hành báo cáo' })).toBeNull();
    expect(screen.getByRole('link', { name: /Xem bản in A4/ })).toHaveAttribute('href', `/events/${EVENT_ID}/reports/print?report=${report.id}`);
  });

  it('hides every edit for a reader without reports.write', () => {
    for (const tab of ['media', 'bidding'] as const) {
      const { unmount } = show(data({ can: { write: false, issue: false } }), tab);
      for (const name of ['Thêm tin bài', 'Soạn thông cáo', 'Thêm gói thầu']) expect(screen.queryByRole('button', { name })).toBeNull();
      expect(screen.queryByRole('button', { name: /Thao tác với/ })).toBeNull();
      unmount();
    }
  });
});

describe('the NĐ30 document (BUG-07/08/16/17/19)', () => {
  const org = orgIdentity({ ...DEFAULT_SETTINGS, version: 1 as Version });

  it('prints the snapshot: zero-padded NĐ30 date, the department head, the computed sentences and no invented figure', () => {
    const { container } = renderUi(withAppContext(<PrintDailyReport report={report} preview={false} />));
    expectNoMarkup(container);
    expect(container.querySelector('[data-print-page="A4-portrait"]')).not.toBeNull();
    expect(screen.getByText(/ngày 07 tháng 12 năm 2026/)).toBeInTheDocument();
    expect(screen.getByText('Số: 12/BC-SCE')).toBeInTheDocument();
    expect(screen.getByText('TRƯỞNG PHÒNG XÚC TIẾN ĐẦU TƯ')).toBeInTheDocument();
    expect(screen.getByText(`${XSS} Người ký`)).toBeInTheDocument();
    expect(screen.getByText('(Mốc T-6: còn 6 ngày làm việc trước ngày khai mạc (15/12/2026))')).toBeInTheDocument();
    expect(screen.getByText(/đã hoàn thành 1\/3 bước công việc theo kế hoạch \(33%\); 1 bước quá hạn/)).toBeInTheDocument();
    expect(screen.getByText(/Số thư mời đã lập: 14 \(định mức 13 thư mời.*đã đủ định mức/)).toBeInTheDocument();
    expect(screen.getByText(/vượt dự toán 12,50%/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/86%|465\.000\.000|JETRO|\$\\ge|48\/KH-UBND|Nguyễn Hoàng Long/);
    expect(screen.queryByText(/BẢN XEM TRƯỚC/)).toBeNull();
  });

  it('a preview says so on the sheet', () => {
    renderUi(withAppContext(<PrintDailyReport report={report} preview />));
    expect(screen.getByText(/BẢN XEM TRƯỚC: CHƯA PHÁT HÀNH/)).toBeInTheDocument();
  });

  it('words a missed quota as missed, not as exceeded (BUG-08)', () => {
    const short = encodeFigures({ ...figures, guestsInvited: 9, quotaReached: false });
    const doc = dailyReportDocument({ ...report, figures: short }, org);
    expect(doc.sections[1]!.paragraphs[0]).toBe('- Số thư mời đã lập: 9 (định mức 13 thư mời, tức 130% của 10 đại biểu dự kiến); đạt 69% định mức, còn thiếu 4 thư mời.');
  });

  it('the printed and Word text word a 40.000 đ overrun on 1 tỷ as an overrun', () => {
    const tiny = dashboardFigures({ plan: plan([]), roster: [], booths: [], packages: [pkg(1_000_000_000, 1_000_040_000)], clippings: 0 }, withHolidays, SETTINGS, TODAY);
    const doc = dailyReportDocument({ ...report, figures: encodeFigures(tiny) }, org);
    expect(doc.sections.flatMap((x) => x.paragraphs).join('\n')).toContain('vượt dự toán <0,01%');
    expect(doc.sections.flatMap((x) => x.paragraphs).join('\n')).not.toContain('tiết kiệm');
  });

  it('names the quota percent the report was issued under, not quota ÷ target (L9)', () => {
    const seven = dashboardFigures({ plan: plan([], { targetGuests: 7 }), roster: guests(10), booths: [], packages: [], clippings: 0 }, withHolidays, SETTINGS, TODAY);
    const line = (f: typeof seven) => dailyReportDocument({ ...report, figures: encodeFigures(f) }, org).sections[1]!.paragraphs[0];
    // ceil(7 × 130%) = 10; 10 / 7 would print 143%.
    expect(line(seven)).toBe('- Số thư mời đã lập: 10 (định mức 10 thư mời, tức 130% của 7 đại biểu dự kiến); đạt 100% định mức, đã đủ định mức.');
    const atHundredFifty = dashboardFigures({ plan: plan([], { targetGuests: 10 }), roster: guests(3), booths: [], packages: [], clippings: 0 }, withHolidays, { ...SETTINGS, guestQuotaPercent: 150 }, TODAY);
    expect(line(atHundredFifty)).toBe('- Số thư mời đã lập: 3 (định mức 15 thư mời, tức 150% của 10 đại biểu dự kiến); đạt 20% định mức, còn thiếu 12 thư mời.');
  });

  it('an event without a target has no quota to reach (L9)', () => {
    const none = dashboardFigures({ plan: plan([], { targetGuests: 0 }), roster: guests(3), booths: [], packages: [], clippings: 0 }, withHolidays, SETTINGS, TODAY);
    const doc = dailyReportDocument({ ...report, figures: encodeFigures(none) }, org);
    expect(doc.sections[1]!.paragraphs[0]).toBe('- Số thư mời đã lập: 3; sự kiện chưa đặt số đại biểu dự kiến nên chưa có định mức thư mời.');
  });

  it('the sheet and the Word file set the body in Times New Roman at the same 14 pt (L8)', () => {
    const { container } = renderUi(withAppContext(<PrintDailyReport report={report} preview={false} />));
    expect([...container.querySelectorAll('style')].map((el) => el.textContent).join('\n')).toMatch(/\.nd30-report \{ font-family: "Times New Roman", Times, serif; font-size: 14pt;/);
    const body = dailyReportWordBody(dailyReportDocument(report, org), org);
    expect(body.startsWith('<div style="font-family:\'Times New Roman\',Times,serif;font-size:14pt;">')).toBe(true);
  });

  it('the header, the signature, the signer and the copies have the same pt size on the sheet and in the Word file', () => {
    const SIZES = { body: 14, header: 13, signer: 14, recipientsHeading: 12, copies: 11 };
    // The kit's own sizes (src/app/globals.css), which the header and the footer carry as classes; the sheet must beat them.
    const kit = document.head.appendChild(document.createElement('style'));
    kit.textContent = '.text-print-sm { font-size: 13px; } .text-print-xs { font-size: 12px; } .text-print-base { font-size: 14px; }';
    const { container } = renderUi(withAppContext(<PrintDailyReport report={report} preview={false} />));
    // jsdom reports a pt size in px (1 pt = 4/3 px).
    const pt = (el: Element | null) => {
      const px = el ? getComputedStyle(el).fontSize : '';
      return px.endsWith('px') ? Math.round(parseFloat(px) * 0.75 * 100) / 100 : null;
    };
    const printed = {
      body: pt(container.querySelector('.nd30-report')),
      header: pt(container.querySelector('.nd30-report header')),
      signer: pt(container.querySelector('.nd30-report footer')),
      recipientsHeading: pt([...container.querySelectorAll('.nd30-report footer p')].find((p) => p.textContent === 'Nơi nhận:') ?? null),
      copies: pt(container.querySelector('.nd30-report footer ul')),
    };
    kit.remove();
    expect(printed).toEqual(SIZES);
    // The kit's 11 pt wrapper had no effect once the footer set its own size, so it is gone.
    expect(container.querySelector('.nd30-small')).toBeNull();

    const word = new DOMParser().parseFromString(dailyReportWordBody(dailyReportDocument(report, org), org), 'text/html');
    const [headerTable, signatureTable] = [...word.querySelectorAll('table')];
    const inline = (el: Element | null | undefined) => Number(el?.closest('[style*="font-size"]')?.getAttribute('style')?.match(/font-size:\s*(\d+)pt/)?.[1]);
    const [, signerCell] = [...signatureTable!.querySelectorAll('td')];
    const [copiesCell] = [...signatureTable!.querySelectorAll('td')];
    const wordSizes = {
      body: inline(word.body.firstElementChild),
      header: inline(headerTable!.querySelector('td')),
      signer: inline(signerCell!.querySelector('p')),
      recipientsHeading: inline(copiesCell!.querySelector('p')),
      copies: inline([...copiesCell!.querySelectorAll('p')][1]),
    };
    expect(wordSizes).toEqual(SIZES);
  });

  it('the Word body is tables with escaped text, and the file name keeps the letters', () => {
    const body = dailyReportWordBody(dailyReportDocument(report, org), org);
    expect(body).toContain('<table');
    expect(body).toContain('<u>Độc lập - Tự do - Hạnh phúc</u>');
    expect(body).toContain('&lt;img src=x onerror=&quot;window.__pwned=1&quot;&gt; Nổi bật');
    expect(body).not.toContain('<img');
    expect(body).not.toContain('<script');
    expect(dailyReportFileName('Hội nghị Xúc tiến Đầu tư 2026', '2026-12-08')).toBe('BaoCaoHangNgay_Hoi_nghi_Xuc_tien_Dau_tu_2026_2026-12-08.doc');
  });
});
