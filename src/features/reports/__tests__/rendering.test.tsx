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
    expect(screen.getByText(/Xong: 1\/3 • Quá hạn: 1 • Chưa xong: 2/)).toBeInTheDocument();
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
