import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DailyReportId, HHmm, Instant, UserId } from '@/core/brand';
import { renderUi, withAppContext } from '@/components/ui/__tests__/helpers';
import type { BiddingPackage } from '../contract';
import { BiddingTab } from '../components/bidding-tab';
import { DailyTab } from '../components/daily-tab';
import type { IssuedReport } from '../domain/report';
import type { ReportsScreenData } from '../domain/screen';
import { d, EVENT_ID, pkg } from './fixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => '/' }));
vi.mock('@/core/commands/dispatch', () => ({ dispatch: vi.fn() }));
const downloadXlsx = vi.fn();
const downloadWordHtml = vi.fn();
vi.mock('@/components/ui', async (original) => ({
  ...(await original<typeof import('@/components/ui')>()),
  downloadXlsx: (...a: unknown[]) => downloadXlsx(...a),
  downloadWordHtml: (...a: unknown[]) => downloadWordHtml(...a),
}));

type Spec = { columns: ReadonlyArray<{ header: string; value: (p: BiddingPackage) => unknown }>; footer: { lines: string[] } };

async function exported(packages: ReadonlyArray<BiddingPackage>) {
  downloadXlsx.mockReset();
  const data = {
    event: { id: EVENT_ID, name: 'Hội nghị', eventDate: d('2026-12-15'), eventTime: '08:30' as HHmm, location: '', department: 'Phòng Xúc tiến đầu tư', targetGuests: 10 },
    today: d('2026-12-08'), now: '2026-12-08T01:00:00.000Z' as Instant, packages, can: { write: false, issue: false },
  } as unknown as ReportsScreenData;
  const { user, unmount } = renderUi(withAppContext(<BiddingTab data={data} />));
  await user.click(screen.getByRole('button', { name: 'Xuất Excel' }));
  unmount();
  const spec = (downloadXlsx.mock.calls[0]![1] as ReadonlyArray<{ spec: Spec }>)[0]!.spec;
  const column = spec.columns.find((c) => c.header.startsWith('Tiết kiệm'))!;
  return { cells: packages.map((p) => column.value(p)), header: column.header, footer: spec.footer.lines.join(' ') };
}

describe('the bidding .xlsx export words a saving as the screen does (L10, BUG-35)', () => {
  it('a saving, an overrun and an unawarded package', async () => {
    const r = await exported([pkg(220_000_000, 215_000_000), pkg(160_000_000, 180_000_000), pkg(50_000_000, null)]);
    expect(r.cells).toEqual(['Tiết kiệm 2,27%', 'Vượt 12,50%', 'Chưa có giá trúng']);
    expect(r.footer).toContain('2 gói đã có giá trúng thầu: 395.000.000 đ trên dự toán 380.000.000 đ, vượt dự toán 15.000.000 đ (3,95%).');
    expect(r.footer).not.toMatch(/tiết kiệm -/);
  });

  it('totals that save, and totals with no winning price yet', async () => {
    expect((await exported([pkg(220_000_000, 215_000_000)])).footer).toContain('tiết kiệm 5.000.000 đ (2,27%)');
    const none = await exported([pkg(50_000_000, null)]);
    expect(none.footer).toBe('Tổng dự toán 50.000.000 đ (1 gói). Chưa có gói nào có giá trúng thầu.');
    expect(none.footer).not.toContain('Chưa có.');
  });
});

describe('the Word export of today\'s issued report (BUG-13)', () => {
  it('names the event as it was issued, after a rename', async () => {
    downloadWordHtml.mockReset();
    const issued: IssuedReport = {
      id: 'c3000000-0000-4000-8000-000000000009' as DailyReportId, eventId: EVENT_ID, reportDate: d('2026-12-08'), workdaysToEvent: 5, progressPercent: 29,
      keyHighlight: 'Nổi bật', blockers: '', signatory: 'Trần Văn Bình', signatoryTitle: 'TRƯỞNG PHÒNG XÚC TIẾN ĐẦU TƯ', documentNumber: null, figures: {},
      eventName: 'Hội nghị khi phát hành', eventDate: d('2026-12-15'), issuedAt: '2026-12-08T01:00:00.000Z' as Instant, issuedBy: 'u' as UserId,
    };
    const data = {
      event: { id: EVENT_ID, name: 'Tên đã đổi', eventDate: d('2026-12-22'), eventTime: '08:30' as HHmm, location: '', department: 'Phòng Xúc tiến đầu tư', targetGuests: 10 },
      today: d('2026-12-08'), now: '2026-12-08T01:00:00.000Z' as Instant, state: { kind: 'active', workdays: 5, calendarDays: 7 }, figures: null, missing: [],
      reports: [issued], issuedToday: issued, signatoryTitle: 'TRƯỞNG PHÒNG XÚC TIẾN ĐẦU TƯ', can: { write: true, issue: true },
    } as unknown as ReportsScreenData;
    const { user } = renderUi(withAppContext(<DailyTab data={data} />));
    await user.click(screen.getByRole('button', { name: 'Tải Word (.doc)' }));
    const [{ fileName, title }] = downloadWordHtml.mock.calls[0] as [{ fileName: string; title: string }];
    expect(fileName).toBe('BaoCaoHangNgay_Hoi_nghi_khi_phat_hanh_2026-12-08.doc');
    expect(title).toContain('Hội nghị khi phát hành');
    expect(title).not.toContain('Tên đã đổi');
  });
});
